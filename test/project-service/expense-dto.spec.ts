import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateExpenseDto } from '../../apps/project-service/src/dto/create-expense.dto';
import {
  ExpenseQueryDto,
  ExpenseSortField,
  ExpenseSortOrder,
} from '../../apps/project-service/src/dto/expense-query.dto';
import { UpdateExpenseDto } from '../../apps/project-service/src/dto/update-expense.dto';

function validateDto<T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): string[] {
  const dto = plainToInstance(dtoClass, payload);

  return validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((error) => error.property);
}

describe('Expense DTO validation', () => {
  const validCreate = {
    amount: '12500.75',
    expenseDate: '2026-10-10T00:00:00.000Z',
  };

  describe('CreateExpenseDto', () => {
    it('accepts valid required fields', () => {
      expect(validateDto(CreateExpenseDto, validCreate)).toEqual([]);
    });

    it('accepts valid optional fields', () => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          category: 'MATERIAL',
          description: 'Foundation materials',
        }),
      ).toEqual([]);
    });

    it('allows null optional fields', () => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          category: null,
          description: null,
        }),
      ).toEqual([]);
    });

    it.each(['0.01', '0.10', '1', '1.2', '9999999999.99'])(
      'accepts valid expense amount %s',
      (amount) => {
        expect(
          validateDto(CreateExpenseDto, {
            ...validCreate,
            amount,
          }),
        ).toEqual([]);
      },
    );

    it.each([
      '0',
      '0.00',
      '-10.00',
      '12.345',
      '10000000000.00',
      '01.20',
      '1e3',
      'NaN',
      '',
      125.5,
      null,
    ])('rejects invalid amount %s', (amount) => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          amount,
        }),
      ).toContain('amount');
    });

    it('rejects missing required fields', () => {
      expect(validateDto(CreateExpenseDto, {})).toEqual(
        expect.arrayContaining(['amount', 'expenseDate']),
      );
    });

    it.each(['invalid-date', '2026-02-30T00:00:00.000Z', null])(
      'rejects invalid expense date %s',
      (expenseDate) => {
        expect(
          validateDto(CreateExpenseDto, {
            ...validCreate,
            expenseDate,
          }),
        ).toContain('expenseDate');
      },
    );

    it('rejects blank category and description', () => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          category: '   ',
          description: '  ',
        }),
      ).toEqual(expect.arrayContaining(['category', 'description']));
    });

    it('rejects excessively long optional fields', () => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          category: 'A'.repeat(101),
          description: 'B'.repeat(1001),
        }),
      ).toEqual(expect.arrayContaining(['category', 'description']));
    });

    it('rejects system-managed and project-scoped fields', () => {
      expect(
        validateDto(CreateExpenseDto, {
          ...validCreate,
          projectId: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
          recordedById: 'f5ff5c48-922c-4f43-b49b-9330f422d041',
          createdAt: '2026-10-10T00:00:00.000Z',
        }),
      ).toEqual(
        expect.arrayContaining(['projectId', 'recordedById', 'createdAt']),
      );
    });
  });

  describe('UpdateExpenseDto', () => {
    it('accepts valid partial updates', () => {
      expect(
        validateDto(UpdateExpenseDto, {
          amount: '15000.50',
          category: 'LABOUR',
        }),
      ).toEqual([]);
    });

    it('accepts an empty partial update at DTO level', () => {
      expect(validateDto(UpdateExpenseDto, {})).toEqual([]);
    });

    it('allows clearing optional metadata', () => {
      expect(
        validateDto(UpdateExpenseDto, {
          category: null,
          description: null,
        }),
      ).toEqual([]);
    });

    it.each(['0', '-1', '12.345', null])(
      'rejects invalid updated amount %s',
      (amount) => {
        expect(validateDto(UpdateExpenseDto, { amount })).toContain('amount');
      },
    );

    it('rejects invalid updated expense dates', () => {
      expect(
        validateDto(UpdateExpenseDto, {
          expenseDate: 'not-a-date',
        }),
      ).toContain('expenseDate');

      expect(
        validateDto(UpdateExpenseDto, {
          expenseDate: null,
        }),
      ).toContain('expenseDate');
    });

    it('rejects modifying protected fields', () => {
      expect(
        validateDto(UpdateExpenseDto, {
          projectId: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
          recordedById: 'f5ff5c48-922c-4f43-b49b-9330f422d041',
          id: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
        }),
      ).toEqual(expect.arrayContaining(['projectId', 'recordedById', 'id']));
    });
  });

  describe('ExpenseQueryDto', () => {
    it('accepts filters, sorting, and pagination', () => {
      expect(
        validateDto(ExpenseQueryDto, {
          category: 'MATERIAL',
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          page: '2',
          limit: '20',
          sortBy: ExpenseSortField.AMOUNT,
          sortOrder: ExpenseSortOrder.ASC,
        }),
      ).toEqual([]);
    });

    it('uses the expected query defaults', () => {
      const dto = plainToInstance(ExpenseQueryDto, {});

      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(10);
      expect(dto.sortBy).toBe(ExpenseSortField.EXPENSE_DATE);
      expect(dto.sortOrder).toBe(ExpenseSortOrder.DESC);
    });

    it.each([0, -1, 1.5, 'invalid'])('rejects invalid page %s', (page) => {
      expect(validateDto(ExpenseQueryDto, { page })).toContain('page');
    });

    it.each([0, -1, 101, 2.5, 'invalid'])(
      'rejects invalid limit %s',
      (limit) => {
        expect(validateDto(ExpenseQueryDto, { limit })).toContain('limit');
      },
    );

    it('rejects invalid filters and sorting', () => {
      expect(
        validateDto(ExpenseQueryDto, {
          category: '   ',
          fromDate: 'invalid-date',
          toDate: '2026-13-01',
          sortBy: 'unknown',
          sortOrder: 'up',
        }),
      ).toEqual(
        expect.arrayContaining([
          'category',
          'fromDate',
          'toDate',
          'sortBy',
          'sortOrder',
        ]),
      );
    });

    it('rejects project identifiers in query parameters', () => {
      expect(
        validateDto(ExpenseQueryDto, {
          projectId: 'b390c2c8-86f5-484f-ad9f-170bca22703d',
        }),
      ).toContain('projectId');
    });
  });
});
