import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { QuotationService } from '../../apps/quotation-service/src/quotation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

describe('Quotation update and conversion edge cases', () => {
  let service: QuotationService;
  const prisma = {
    quotation: { findUnique: jest.fn(), update: jest.fn() },
    quotationItem: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const project = { createFromQuotation: jest.fn() };
  const notification = { notifyProjectCreated: jest.fn() };
  const quotation = {
    id: 'q-1',
    leadId: 'l-1',
    status: 'APPROVED',
    projectId: null,
    totalAmount: 150,
    notes: 'Keep original notes',
    items: [],
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: prisma },
        { provide: DocumentClient, useValue: {} },
        { provide: ProjectClient, useValue: project },
        { provide: NotificationClient, useValue: notification },
      ],
    }).compile();
    service = module.get(QuotationService);
    prisma.quotation.findUnique.mockResolvedValue(quotation);
    prisma.quotation.update.mockResolvedValue({
      ...quotation,
      status: 'CONVERTED',
      projectId: 'p-1',
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    project.createFromQuotation.mockResolvedValue({
      projectId: 'p-1',
      status: 'ACTIVE',
    });
  });

  it('leaves an editable quotation unchanged for an empty update', async () => {
    const draft = { ...quotation, status: 'DRAFT' };
    prisma.quotation.findUnique.mockResolvedValue(draft);
    await expect(service.update('q-1', {})).resolves.toEqual(draft);
    expect(prisma.quotation.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preserves notes when replacing only line items and invalidates the cached PDF', async () => {
    prisma.quotation.findUnique.mockResolvedValue({
      ...quotation,
      status: 'DRAFT',
    });
    await service.update('q-1', {
      items: [{ itemName: 'Steel', quantity: 2, unitPrice: 25 }],
    });
    expect(prisma.quotationItem.deleteMany).toHaveBeenCalledWith({
      where: { quotationId: 'q-1' },
    });
    expect(prisma.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          notes: quotation.notes,
          totalAmount: 50,
          pdfUrl: null,
          items: {
            create: [
              { itemName: 'Steel', quantity: 2, unitPrice: 25, amount: 50 },
            ],
          },
        },
      }),
    );
  });

  it.each([null, 'p-linked'])(
    'approves without converting when directApproveOnly is set (project %s)',
    async (projectId) => {
      prisma.quotation.findUnique.mockResolvedValue({
        ...quotation,
        projectId,
      });
      await expect(
        service.approveAndConvert('q-1', { directApproveOnly: true }),
      ).resolves.toEqual({
        quotation: { ...quotation, projectId },
        projectId,
        projectStatus: 'ACTIVE',
      });
      expect(project.createFromQuotation).not.toHaveBeenCalled();
      expect(prisma.quotation.update).not.toHaveBeenCalled();
      expect(notification.notifyProjectCreated).not.toHaveBeenCalled();
    },
  );

  it('uses the existing project link without requiring project creation details', async () => {
    prisma.quotation.findUnique.mockResolvedValue({
      ...quotation,
      projectId: 'p-linked',
    });
    await service.approveAndConvert('q-1', {});
    expect(project.createFromQuotation).toHaveBeenCalledWith({
      quotationId: 'q-1',
      leadId: 'l-1',
      targetProjectId: 'p-linked',
    });
  });

  it.each([undefined, 0])(
    'uses the quotation amount only when budget is absent (%s)',
    async (budget) => {
      await service.approveAndConvert('q-1', {
        projectName: 'Build',
        startDate: '2026-10-12',
        projectManagerId: 'manager',
        budget,
      });
      expect(project.createFromQuotation).toHaveBeenCalledWith(
        expect.objectContaining({ budget: budget ?? 150 }),
      );
    },
  );

  it.each([new Error('offline'), 'notification unavailable'])(
    'keeps conversion successful when notification throws %s',
    async (error) => {
      const logger = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        notification.notifyProjectCreated.mockRejectedValue(error);
        await expect(
          service.approveAndConvert('q-1', { targetProjectId: 'p-1' }),
        ).resolves.toMatchObject({
          projectId: 'p-1',
          quotation: { status: 'CONVERTED' },
        });
        expect(logger).toHaveBeenCalledWith(
          `Notification error after converting quotation q-1: ${error instanceof Error ? error.message : error}`,
        );
      } finally {
        logger.mockRestore();
      }
    },
  );
});
