import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { CreateExpenseDto } from '../../../project-service/src/dto/create-expense.dto';
import { ExpenseQueryDto } from '../../../project-service/src/dto/expense-query.dto';
import { UpdateExpenseDto } from '../../../project-service/src/dto/update-expense.dto';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

const EXPENSE_READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'PROJECT_MANAGER'];
const EXPENSE_WRITE_ROLES = ['ADMIN', 'ACCOUNTANT'];

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

interface DownstreamError {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: DownstreamError;
  };
}

@ApiTags('Expenses')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Invalid expense request' })
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Insufficient expense permissions' })
@ApiNotFoundResponse({ description: 'Project or expense not found' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...EXPENSE_READ_ROLES)
@Controller()
export class ExpensesGatewayController {
  constructor(private readonly httpService: HttpService) {}

  @Post('projects/:projectId/expenses')
  @Roles(...EXPENSE_WRITE_ROLES)
  @ApiOperation({ summary: 'Record a project expense' })
  @ApiCreatedResponse({ description: 'Expense created successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateExpenseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.post(this.url(`/projects/${projectId}/expenses`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Get('projects/:projectId/expenses')
  @ApiOperation({ summary: 'List and filter project expenses' })
  @ApiOkResponse({ description: 'Paginated project expenses' })
  findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ExpenseQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/projects/${projectId}/expenses`), {
        headers: this.forwardHeaders(req),
        params: query,
      }),
    );
  }

  @Get('projects/:projectId/expenses/summary')
  @ApiOperation({ summary: 'Get project expense totals by category' })
  @ApiOkResponse({ description: 'Project expense summary' })
  summary(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(
        this.url(`/projects/${projectId}/expenses/summary`),
        { headers: this.forwardHeaders(req) },
      ),
    );
  }

  @Get('expenses/:id')
  @ApiOperation({ summary: 'Get an expense by ID' })
  @ApiOkResponse({ description: 'Expense details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.get(this.url(`/expenses/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Patch('expenses/:id')
  @Roles(...EXPENSE_WRITE_ROLES)
  @ApiOperation({ summary: 'Update an expense' })
  @ApiOkResponse({ description: 'Expense updated successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateExpenseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.patch(this.url(`/expenses/${id}`), body, {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  @Delete('expenses/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Delete a project expense' })
  @ApiOkResponse({ description: 'Expense deleted successfully' })
  @ApiConflictResponse({
    description: 'Expense modification is not allowed',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.forward(() =>
      this.httpService.delete(this.url(`/expenses/${id}`), {
        headers: this.forwardHeaders(req),
      }),
    );
  }

  private url(path: string): string {
    const base = process.env.PROJECT_SERVICE_URL ?? 'http://localhost:3003';

    return `${base.replace(/\/$/, '')}${path}`;
  }

  private forwardHeaders(req: AuthenticatedRequest) {
    // Ignore client-supplied x-user-id; use the verified identity.
    const actorId = req.user?.id ?? req.user?.sub;

    return {
      authorization: req.headers.authorization,
      ...(actorId ? { 'x-user-id': actorId } : {}),
    };
  }

  private async forward(
    call: () => Observable<AxiosResponse<unknown>>,
  ): Promise<unknown> {
    try {
      return (await firstValueFrom(call())).data;
    } catch (error: unknown) {
      const downstream =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as AxiosErrorShape).response
          : undefined;

      if (downstream?.status && downstream.data) {
        throw new HttpException(downstream.data, downstream.status);
      }

      throw new HttpException(
        {
          code: 'PROJECT_SERVICE_UNAVAILABLE',
          message: 'Project service is unreachable.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
