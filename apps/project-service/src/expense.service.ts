import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, ProjectStatus } from '@prisma/client';
import { ErrorCode } from '../../../shared/error-codes';
import {
  MAX_TRANSACTION_ATTEMPTS,
  TRANSACTION_RETRY_DELAY_OPTIONS,
  isRetryableTransactionError,
  waitBeforeTransactionRetry,
} from '../../../shared/utils/transaction-error.util';
import type { TransactionRetryDelayOptions } from '../../../shared/utils/transaction-error.util';
import {
  CreateExpenseDto,
  EXPENSE_AMOUNT_PATTERN,
} from './dto/create-expense.dto';
import {
  ExpenseQueryDto,
  ExpenseSortField,
  ExpenseSortOrder,
} from './dto/expense-query.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import type { ProjectAccessActor } from './interfaces/project-access.interface';
import { ProjectAccessService } from './project-access.service';
import { ExpenseRepository } from './repositories/expense.repository';
import type { ProjectTransaction } from './repositories/project.repository';

type ExpenseProject = NonNullable<
  Awaited<ReturnType<ExpenseRepository['findProject']>>
>;

@Injectable()
export class ExpenseService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly projectAccess: ProjectAccessService,
    @Optional()
    @Inject(TRANSACTION_RETRY_DELAY_OPTIONS)
    private readonly retryDelayOptions?: TransactionRetryDelayOptions,
  ) {}

  async create(projectId: string, dto: CreateExpenseDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    this.assertCanWrite(actor);

    const amount = this.parseAmount(dto.amount);
    const expenseDate = this.parseDate(dto.expenseDate);

    const expense = await this.withLockedProject(
      projectId,
      async (tx, project) => {
        this.assertExpenseDateWithinProject(expenseDate, project);

        return this.expenses.createInTransaction(tx, {
          projectId,
          recordedById: actor.id,
          amount,
          category: dto.category ?? null,
          description: dto.description ?? null,
          expenseDate,
        });
      },
    );

    return this.serializeExpense(expense);
  }

  async findAll(projectId: string, query: ExpenseQueryDto, actorId?: string) {
    await this.assertCanReadProject(projectId, actorId);

    const fromDate = query.fromDate
      ? this.parseDate(query.fromDate)
      : undefined;
    const toDate = query.toDate
      ? this.endOfRequestedDay(query.toDate)
      : undefined;

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException({
        code: ErrorCode.EXPENSE_INVALID_DATE_RANGE,
        message: 'fromDate must not be after toDate.',
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? ExpenseSortField.EXPENSE_DATE;
    const sortOrder = query.sortOrder ?? ExpenseSortOrder.DESC;

    const [rows, total] = await this.expenses.findManyAndCount({
      projectId,
      category: query.category,
      fromDate,
      toDate,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
    });

    return {
      data: rows.map((row) => this.serializeExpense(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const expense = await this.getExpenseOrThrow(id);

    this.projectAccess.assertCanReadProject(actor, expense.project);

    return this.serializeExpense(expense);
  }

  async update(id: string, dto: UpdateExpenseDto, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    this.assertCanWrite(actor);

    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'At least one expense field must be provided.',
      });
    }

    const existing = await this.getExpenseOrThrow(id);
    const amount =
      dto.amount === undefined ? undefined : this.parseAmount(dto.amount);
    const expenseDate =
      dto.expenseDate === undefined
        ? undefined
        : this.parseDate(dto.expenseDate);

    const updated = await this.withLockedProject(
      existing.projectId,
      async (tx, project) => {
        const current = await this.expenses.findByIdInTransaction(tx, id);

        if (!current || current.projectId !== project.id) {
          this.throwExpenseNotFound();
        }

        if (expenseDate) {
          this.assertExpenseDateWithinProject(expenseDate, project);
        }

        return this.expenses.updateInTransaction(tx, id, project.id, {
          amount,
          category: dto.category,
          description: dto.description,
          expenseDate,
        });
      },
    );

    return this.serializeExpense(updated);
  }

  async remove(id: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);

    if (actor.role !== 'ADMIN') {
      this.throwExpenseAccessDenied('Only administrators can delete expenses.');
    }

    const existing = await this.getExpenseOrThrow(id);

    return this.withLockedProject(existing.projectId, async (tx, project) => {
      const current = await this.expenses.findByIdInTransaction(tx, id);

      if (!current || current.projectId !== project.id) {
        this.throwExpenseNotFound();
      }

      await this.expenses.deleteInTransaction(tx, id, project.id);

      return { message: 'Expense deleted successfully' };
    });
  }

  async summary(projectId: string, actorId?: string) {
    await this.assertCanReadProject(projectId, actorId);

    const groups = await this.expenses.groupByCategory(projectId);
    const total = groups.reduce(
      (sum, group) => sum.plus(group._sum.amount ?? 0),
      new Prisma.Decimal(0),
    );

    return {
      total: total.toFixed(2),
      byCategory: groups.map((group) => ({
        category: group.category,
        amount: new Prisma.Decimal(group._sum.amount ?? 0).toFixed(2),
      })),
    };
  }

  private async assertCanReadProject(projectId: string, actorId?: string) {
    const actor = await this.projectAccess.resolveActor(actorId);
    const project = await this.expenses.findProject(projectId);

    if (!project) {
      this.throwProjectNotFound();
    }

    this.projectAccess.assertCanReadProject(actor, project);
  }

  private assertCanWrite(actor: ProjectAccessActor): void {
    if (actor.role !== 'ADMIN' && actor.role !== 'ACCOUNTANT') {
      this.throwExpenseAccessDenied(
        'Only administrators and accountants can modify expenses.',
      );
    }
  }

  private async withLockedProject<T>(
    projectId: string,
    work: (tx: ProjectTransaction, project: ExpenseProject) => Promise<T>,
  ): Promise<T> {
    return this.withTransactionRetry(async (tx) => {
      const locked = await this.expenses.lockProject(tx, projectId);

      if (locked.length === 0) {
        this.throwProjectNotFound();
      }

      const project = await this.expenses.findProjectInTransaction(
        tx,
        projectId,
      );

      if (!project) {
        this.throwProjectNotFound();
      }

      if (
        project.status === ProjectStatus.COMPLETED ||
        project.status === ProjectStatus.CANCELLED
      ) {
        throw new ConflictException({
          code: ErrorCode.EXPENSE_MODIFICATION_NOT_ALLOWED,
          message:
            'Expenses cannot be modified in completed or cancelled projects.',
        });
      }

      return work(tx, project);
    });
  }

  private assertExpenseDateWithinProject(
    date: Date,
    project: ExpenseProject,
  ): void {
    const day = date.toISOString().slice(0, 10);
    const firstDay = project.startDate.toISOString().slice(0, 10);
    const lastDay = project.endDate?.toISOString().slice(0, 10);

    if (day < firstDay || (lastDay && day > lastDay)) {
      throw new BadRequestException({
        code: ErrorCode.EXPENSE_INVALID_DATE_RANGE,
        message: 'Expense date must be within the project date range.',
      });
    }
  }

  private parseAmount(amount: string): Prisma.Decimal {
    if (!EXPENSE_AMOUNT_PATTERN.test(amount)) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_EXPENSE_AMOUNT,
        message:
          'Expense amount must be positive with at most two decimal places.',
      });
    }

    return new Prisma.Decimal(amount);
  }

  private parseDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: ErrorCode.EXPENSE_INVALID_DATE_RANGE,
        message: 'Invalid expense date.',
      });
    }

    return date;
  }

  private endOfRequestedDay(value: string): Date {
    return this.parseDate(
      /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value,
    );
  }

  private async getExpenseOrThrow(id: string) {
    const expense = await this.expenses.findById(id);

    if (!expense) {
      this.throwExpenseNotFound();
    }

    return expense;
  }

  private serializeExpense<T extends { amount: Prisma.Decimal }>(expense: T) {
    return {
      ...expense,
      amount: expense.amount.toFixed(2),
    };
  }

  private throwExpenseNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.EXPENSE_NOT_FOUND,
      message: 'Expense not found.',
    });
  }

  private throwProjectNotFound(): never {
    throw new NotFoundException({
      code: ErrorCode.PROJECT_NOT_FOUND,
      message: 'Project not found.',
    });
  }

  private throwExpenseAccessDenied(message: string): never {
    throw new ForbiddenException({
      code: ErrorCode.EXPENSE_ACCESS_DENIED,
      message,
    });
  }

  private async withTransactionRetry<T>(
    work: (tx: ProjectTransaction) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.expenses.transaction(work);
      } catch (error: unknown) {
        if (!isRetryableTransactionError(error)) {
          throw error;
        }

        if (attempt === MAX_TRANSACTION_ATTEMPTS) {
          throw new ConflictException({
            code: ErrorCode.EXPENSE_CONCURRENCY_CONFLICT,
            message: 'Expense data changed concurrently. Try again.',
          });
        }

        await waitBeforeTransactionRetry(attempt, this.retryDelayOptions);
      }
    }

    throw new ConflictException({
      code: ErrorCode.EXPENSE_CONCURRENCY_CONFLICT,
      message: 'Expense data changed concurrently. Try again.',
    });
  }
}
