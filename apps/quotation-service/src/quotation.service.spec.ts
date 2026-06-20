import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from './quotation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentClient } from './document.client';
import { ProjectClient } from './project.client';
import { NotificationClient } from './notification.client';

const mockPrisma = {
  lead: { findUnique: jest.fn() },
  quotation: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(),
};

const mockDocumentClient = {
  generatePdf: jest.fn(),
};

const mockProjectClient = {
  createFromQuotation: jest.fn(),
};

const mockNotificationClient = {
  notifyProjectCreated: jest.fn(),
};

describe('QuotationService', () => {
  let service: QuotationService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentClient, useValue: mockDocumentClient },
        { provide: ProjectClient, useValue: mockProjectClient },
        { provide: NotificationClient, useValue: mockNotificationClient },
      ],
    }).compile();

    service = module.get<QuotationService>(QuotationService);
  });

  describe('create()', () => {
    const validDto = {
      leadId: 'lead-uuid-1',
      items: [
        { itemName: 'Concrete', quantity: 3, unitPrice: 100 },
        { itemName: 'Steel', quantity: 2, unitPrice: 250 },
      ],
    };

    it('throws 404 LEAD_NOT_FOUND when lead does not exist', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.create(validDto)).rejects.toMatchObject({
        response: { code: 'LEAD_NOT_FOUND' },
      });
    });

    it('computes item amounts and totalAmount server-side', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
      mockDocumentClient.generatePdf.mockResolvedValue(null);

      const savedQuotation = {
        id: 'quot-1',
        leadId: 'lead-uuid-1',
        totalAmount: 800,
        pdfUrl: null,
        items: [],
      };

      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      );
      mockPrisma.quotation.create.mockResolvedValue(savedQuotation);

      await service.create(validDto);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockPrisma.quotation.create.mock.calls[0][0] as {
        data: {
          totalAmount: number;
          items: { create: Array<{ amount: number }> };
        };
      };

      // server-computed: 3*100 + 2*250 = 800
      expect(createCall.data.totalAmount).toBe(800);

      const items = createCall.data.items.create;
      expect(items[0].amount).toBe(300); // 3 * 100
      expect(items[1].amount).toBe(500); // 2 * 250
    });

    it('ignores any total sent by the client — always recomputes', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
      mockDocumentClient.generatePdf.mockResolvedValue(null);
      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      );
      mockPrisma.quotation.create.mockResolvedValue({
        id: 'quot-1',
        leadId: 'lead-uuid-1',
        totalAmount: 300,
        pdfUrl: null,
        items: [],
      });

      // Client sends no totalAmount — service must compute it
      await service.create({
        leadId: 'lead-uuid-1',
        items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockPrisma.quotation.create.mock.calls[0][0] as {
        data: { totalAmount: number };
      };
      expect(createCall.data.totalAmount).toBe(300); // 3 * 100
    });

    it('attaches pdfUrl when document client succeeds', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
      mockDocumentClient.generatePdf.mockResolvedValue(
        'https://cdn.example.com/q1.pdf',
      );

      const savedQuotation = {
        id: 'quot-1',
        leadId: 'lead-uuid-1',
        totalAmount: 300,
        pdfUrl: null,
        items: [],
      };
      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      );
      mockPrisma.quotation.create.mockResolvedValue(savedQuotation);
      mockPrisma.quotation.update.mockResolvedValue({
        ...savedQuotation,
        pdfUrl: 'https://cdn.example.com/q1.pdf',
      });

      const result = await service.create({
        leadId: 'lead-uuid-1',
        items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
      });

      expect(mockPrisma.quotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { pdfUrl: 'https://cdn.example.com/q1.pdf' },
        }),
      );
      expect(result.pdfUrl).toBe('https://cdn.example.com/q1.pdf');
    });

    it('returns quotation with null pdfUrl when document client fails', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
      mockDocumentClient.generatePdf.mockResolvedValue(null);

      const savedQuotation = {
        id: 'quot-1',
        leadId: 'lead-uuid-1',
        totalAmount: 300,
        pdfUrl: null,
        items: [],
      };
      mockPrisma.$transaction.mockImplementation(
        (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      );
      mockPrisma.quotation.create.mockResolvedValue(savedQuotation);

      const result = await service.create({
        leadId: 'lead-uuid-1',
        items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
      });

      expect(mockPrisma.quotation.update).not.toHaveBeenCalled();
      expect(result.pdfUrl).toBeNull();
    });
  });

  describe('findOne()', () => {
    it('returns quotation with items', async () => {
      const quotation = {
        id: 'quot-1',
        leadId: 'lead-uuid-1',
        totalAmount: 500,
        items: [
          {
            id: 'item-1',
            itemName: 'Steel',
            quantity: 2,
            unitPrice: 250,
            amount: 500,
          },
        ],
      };
      mockPrisma.quotation.findUnique.mockResolvedValue(quotation);

      const result = await service.findOne('quot-1');

      expect(result).toEqual(quotation);
      expect(mockPrisma.quotation.findUnique).toHaveBeenCalledWith({
        where: { id: 'quot-1' },
        include: { items: true },
      });
    });

    it('throws 404 QUOTATION_NOT_FOUND when not found', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne('nonexistent')).rejects.toMatchObject({
        response: { code: 'QUOTATION_NOT_FOUND' },
      });
    });
  });

  describe('approveAndConvert()', () => {
    const baseQuotation = {
      id: 'quot-1',
      leadId: 'lead-uuid-1',
      totalAmount: 5000,
      status: 'PENDING_APPROVAL',
      projectId: null,
      items: [{ id: 'item-1', itemName: 'Concrete', quantity: 5, unitPrice: 1000, amount: 5000 }],
    };

    const convertedQuotation = {
      ...baseQuotation,
      status: 'CONVERTED',
      projectId: 'proj-abc',
    };

    it('happy path: approves, calls project service, stores projectId, notifies', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(baseQuotation);
      mockPrisma.quotation.update
        .mockResolvedValueOnce({ ...baseQuotation, status: 'APPROVED' }) // first update: APPROVED
        .mockResolvedValueOnce(convertedQuotation); // second update: CONVERTED
      mockProjectClient.createFromQuotation.mockResolvedValue({
        projectId: 'proj-abc',
        status: 'PLANNING',
      });
      mockNotificationClient.notifyProjectCreated.mockResolvedValue(undefined);

      const result = await service.approveAndConvert('quot-1');

      // project service called with correct args
      expect(mockProjectClient.createFromQuotation).toHaveBeenCalledWith(
        'quot-1',
        'lead-uuid-1',
        5000,
      );

      // second update stores CONVERTED + projectId
      expect(mockPrisma.quotation.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { status: 'CONVERTED', projectId: 'proj-abc' },
        }),
      );

      // notification sent
      expect(mockNotificationClient.notifyProjectCreated).toHaveBeenCalledWith(
        'quot-1',
        'proj-abc',
      );

      expect(result).toEqual({ quotation: convertedQuotation, projectId: 'proj-abc' });
    });

    it('throws 409 ALREADY_CONVERTED when status is CONVERTED and does NOT call project service', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        ...baseQuotation,
        status: 'CONVERTED',
        projectId: 'existing-proj',
      });

      await expect(service.approveAndConvert('quot-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(service.approveAndConvert('quot-1')).rejects.toMatchObject({
        response: { code: 'ALREADY_CONVERTED' },
      });

      expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
    });

    it('throws 409 ALREADY_CONVERTED when projectId is set (even if status differs) and does NOT call project service', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        ...baseQuotation,
        status: 'APPROVED',
        projectId: 'existing-proj',
      });

      await expect(service.approveAndConvert('quot-1')).rejects.toMatchObject({
        response: { code: 'ALREADY_CONVERTED' },
      });

      expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
    });

    it('throws 400 QUOTATION_REJECTED when status is REJECTED', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        ...baseQuotation,
        status: 'REJECTED',
      });

      await expect(service.approveAndConvert('quot-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.approveAndConvert('quot-1')).rejects.toMatchObject({
        response: { code: 'QUOTATION_REJECTED' },
      });

      expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
    });

    it('throws 404 QUOTATION_NOT_FOUND when quotation does not exist', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(null);

      await expect(service.approveAndConvert('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('notify failure does NOT fail the conversion — result is still returned', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(baseQuotation);
      mockPrisma.quotation.update
        .mockResolvedValueOnce({ ...baseQuotation, status: 'APPROVED' })
        .mockResolvedValueOnce(convertedQuotation);
      mockProjectClient.createFromQuotation.mockResolvedValue({
        projectId: 'proj-abc',
        status: 'PLANNING',
      });
      mockNotificationClient.notifyProjectCreated.mockRejectedValue(
        new Error('notification service down'),
      );

      const result = await service.approveAndConvert('quot-1');

      // conversion still succeeds despite notification error
      expect(result.projectId).toBe('proj-abc');
      expect(result.quotation.status).toBe('CONVERTED');
    });

    it('notify failure with non-Error thrown still completes conversion', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(baseQuotation);
      mockPrisma.quotation.update
        .mockResolvedValueOnce({ ...baseQuotation, status: 'APPROVED' })
        .mockResolvedValueOnce(convertedQuotation);
      mockProjectClient.createFromQuotation.mockResolvedValue({
        projectId: 'proj-abc',
        status: 'PLANNING',
      });
      // Throw a non-Error value (exercises the String(err) branch at line 142)
      mockNotificationClient.notifyProjectCreated.mockRejectedValue('timeout');

      const result = await service.approveAndConvert('quot-1');

      expect(result.projectId).toBe('proj-abc');
    });

    it('propagates project service error as-is (502) without marking quotation CONVERTED', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue(baseQuotation);
      mockPrisma.quotation.update.mockResolvedValueOnce({
        ...baseQuotation,
        status: 'APPROVED',
      });
      mockProjectClient.createFromQuotation.mockRejectedValue(
        new Error('project service down'),
      );

      await expect(service.approveAndConvert('quot-1')).rejects.toThrow(
        'project service down',
      );

      // second update (CONVERTED + projectId) must NOT have been called
      expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(1);
      expect(mockNotificationClient.notifyProjectCreated).not.toHaveBeenCalled();
    });
  });
});
