import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateInvoiceDto,
  CreateProjectInvoiceDto,
} from '../../apps/invoice-service/src/dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../../apps/invoice-service/src/dto/update-invoice.dto';
import { ListInvoicesQueryDto } from '../../apps/invoice-service/src/dto/list-invoices-query.dto';
import { OutstandingInvoiceReportQueryDto } from '../../apps/invoice-service/src/dto/finance-report-query.dto';
import { GenerateInvoicePdfDto } from '../../apps/invoice-service/src/dto/generate-invoice-pdf.dto';
import { CreatePaymentDto } from '../../apps/payment-service/src/dto/create-payment.dto';
import {
  RecentActivityQueryDto,
  ProjectCompletionReportQueryDto,
  ExpenseReportQueryDto,
  OverdueInvoiceReportQueryDto,
  MilestoneStatusFilterDto,
} from '../../apps/analytics-service/src/dto/reporting-query.dto';
import { RagRetrieveQueryDto } from '../../apps/ai-service/src/dto/rag.dto';
import {
  AiProviderPredictionRequestDto,
  AiProviderPredictionChunkDto,
} from '../../apps/ai-service/src/dto/ai-forecasting.dto';

const id = '00000000-0000-4000-8000-000000000001';
const invoice = {
  projectId: id,
  customerId: id,
  invoiceDate: '2026-10-01',
  totalAmount: '123.45',
};

describe('Finance and AI request validation', () => {
  it.each([CreateInvoiceDto, CreateProjectInvoiceDto])(
    '%s accepts numeric amounts from forms and rejects invalid invoices',
    (Dto) => {
      const valid = plainToInstance(Dto, invoice);
      expect(valid.totalAmount).toBe(123.45);
      expect(validateSync(valid)).toEqual([]);
      const invalid = plainToInstance(Dto, {
        ...invoice,
        customerId: 'invalid',
        invoiceDate: 'yesterday',
        totalAmount: '0',
        notes: 'x'.repeat(2001),
        status: 'PAID',
      });
      const errors = validateSync(invalid).map((error) => error.property);
      expect(errors).toEqual(
        expect.arrayContaining([
          'customerId',
          'invoiceDate',
          'totalAmount',
          'notes',
          'status',
        ]),
      );
    },
  );

  it('allows partial invoice updates and rejects excess amount precision', () => {
    expect(validateSync(new UpdateInvoiceDto())).toEqual([]);
    const valid = plainToInstance(UpdateInvoiceDto, {
      totalAmount: '12.34',
      status: 'ISSUED',
    });
    expect(valid.totalAmount).toBe(12.34);
    expect(validateSync(valid)).toEqual([]);
    expect(
      validateSync(
        plainToInstance(UpdateInvoiceDto, { totalAmount: '12.345' }),
      ).map((error) => error.property),
    ).toContain('totalAmount');
  });

  it.each([
    ListInvoicesQueryDto,
    OutstandingInvoiceReportQueryDto,
    RecentActivityQueryDto,
    ProjectCompletionReportQueryDto,
    ExpenseReportQueryDto,
    OverdueInvoiceReportQueryDto,
  ])(
    '%s transforms pagination strings and enforces limits/date/sort validation',
    (Dto) => {
      const valid = plainToInstance<{ page: number; limit: number }, object>(
        Dto,
        { page: '2', limit: '10' },
      );
      expect(valid).toMatchObject({ page: 2, limit: 10 });
      expect(validateSync(valid)).toEqual([]);
      const invalid = plainToInstance<object, object>(Dto, {
        page: '0',
        limit: '101',
        fromDate: 'invalid',
        sortBy: 'unsafe',
      });
      expect(validateSync(invalid).map((error) => error.property)).toEqual(
        expect.arrayContaining(['page', 'limit', 'fromDate']),
      );
    },
  );

  it('validates activity categories and milestone status filters', () => {
    expect(
      validateSync(
        plainToInstance(RecentActivityQueryDto, {
          activityTypes: ['invoice', 'payment'],
        }),
      ),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(RecentActivityQueryDto, { activityTypes: ['unknown'] }),
      ).map((error) => error.property),
    ).toContain('activityTypes');
    expect(
      validateSync(
        plainToInstance(MilestoneStatusFilterDto, { status: 'COMPLETED' }),
      ),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(MilestoneStatusFilterDto, { status: 'unknown' }),
      ).map((error) => error.property),
    ).toContain('status');
  });

  it('accepts valid payment form data and rejects invalid payment fields', () => {
    const values = {
      invoiceId: id,
      referenceNumber: 'PAY1',
      paymentDate: '2026-10-01',
      amount: '12.34',
      paymentMethod: 'CASH',
    };
    const valid = plainToInstance(CreatePaymentDto, values);
    expect(valid.amount).toBe(12.34);
    expect(validateSync(valid)).toEqual([]);
    const invalid = plainToInstance(CreatePaymentDto, {
      ...values,
      invoiceId: 'invalid',
      referenceNumber: '',
      paymentDate: 'invalid',
      amount: '-1',
      paymentMethod: 'invalid',
    });
    expect(validateSync(invalid).map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'invoiceId',
        'referenceNumber',
        'paymentDate',
        'amount',
        'paymentMethod',
      ]),
    );
  });

  it('requires a boolean PDF regeneration option', () => {
    expect(
      validateSync(
        plainToInstance(GenerateInvoicePdfDto, { forceRegenerate: true }),
      ),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(GenerateInvoicePdfDto, { forceRegenerate: 'false' }),
      ).map((error) => error.property),
    ).toContain('forceRegenerate');
  });

  it('transforms RAG topK and bounds retrieval size', () => {
    const valid = plainToInstance(RagRetrieveQueryDto, {
      topK: '3',
      query: 'invoice delays',
    });
    expect(valid.topK).toBe(3);
    expect(validateSync(valid)).toEqual([]);
    for (const topK of ['0', '21', 'not-a-number']) {
      expect(
        validateSync(plainToInstance(RagRetrieveQueryDto, { topK })).map(
          (error) => error.property,
        ),
      ).toContain('topK');
    }
  });

  it('transforms nested prediction chunks and rejects oversized context', () => {
    const chunk = {
      sourceType: 'invoice',
      sourceId: 'i1',
      summary: 'invoice is overdue',
    };
    const valid = plainToInstance(AiProviderPredictionRequestDto, {
      projectId: id,
      projectName: 'Tower',
      chunks: [chunk],
    });
    expect(valid.chunks[0]).toBeInstanceOf(AiProviderPredictionChunkDto);
    expect(validateSync(valid, { forbidUnknownValues: false })).toEqual([]);
    const invalid = plainToInstance(AiProviderPredictionRequestDto, {
      projectId: 'invalid',
      projectName: 3,
      chunks: new Array(11).fill(chunk),
    });
    expect(
      validateSync(invalid, { forbidUnknownValues: false }).map(
        (error) => error.property,
      ),
    ).toEqual(expect.arrayContaining(['projectId', 'projectName', 'chunks']));
  });
});
