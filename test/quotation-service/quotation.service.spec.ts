import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuotationService } from '../../apps/quotation-service/src/quotation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

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

// ─── UC-03: create ──────────────────────────────────────────────────────────

describe('QuotationService.create — UC-03', () => {
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

  it('should compute total server-side and save with PENDING_APPROVAL status', async () => {
    // Arrange
    const dto = {
      leadId: 'lead-uuid-1',
      items: [
        { itemName: 'Concrete', quantity: 3, unitPrice: 100 },
        { itemName: 'Steel', quantity: 2, unitPrice: 250 },
      ],
    };
    const savedQuotation = {
      id: 'quot-1',
      leadId: 'lead-uuid-1',
      totalAmount: 800,
      status: 'PENDING_APPROVAL',
      pdfUrl: null,
      items: [],
    };
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.quotation.create.mockResolvedValue(savedQuotation);
    mockDocumentClient.generatePdf.mockResolvedValue(null);

    // Act
    await service.create(dto);

    // Assert — totalAmount must equal sum of (quantity * unitPrice): 3*100 + 2*250 = 800
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const createArg = mockPrisma.quotation.create.mock.calls[0][0] as {
      data: {
        totalAmount: number;
        items: { create: Array<{ amount: number }> };
      };
    };
    expect(createArg.data.totalAmount).toBe(800);
    expect(createArg.data.items.create[0].amount).toBe(300); // 3 * 100
    expect(createArg.data.items.create[1].amount).toBe(500); // 2 * 250
    expect(mockPrisma.quotation.create).toHaveBeenCalledTimes(1);
  });

  it('should throw NotFoundException when leadId does not exist', async () => {
    // Given — lead lookup returns nothing
    mockPrisma.lead.findUnique.mockResolvedValue(null);

    // When / Then
    await expect(
      service.create({
        leadId: 'nonexistent-lead',
        items: [{ itemName: 'Item', quantity: 1, unitPrice: 50 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.create({
        leadId: 'nonexistent-lead',
        items: [{ itemName: 'Item', quantity: 1, unitPrice: 50 }],
      }),
    ).rejects.toMatchObject({ response: { code: 'LEAD_NOT_FOUND' } });

    expect(mockPrisma.quotation.create).not.toHaveBeenCalled();
  });

  it('should call DocumentClient after saving to trigger PDF generation', async () => {
    // Arrange — all deps return valid values
    const savedQuotation = {
      id: 'quot-42',
      leadId: 'lead-uuid-1',
      totalAmount: 300,
      status: 'PENDING_APPROVAL',
      pdfUrl: null,
      items: [],
    };
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.quotation.create.mockResolvedValue(savedQuotation);
    mockDocumentClient.generatePdf.mockResolvedValue(
      'https://cdn.example.com/q42.pdf',
    );
    mockPrisma.quotation.update.mockResolvedValue({
      ...savedQuotation,
      pdfUrl: 'https://cdn.example.com/q42.pdf',
    });

    // Act
    await service.create({
      leadId: 'lead-uuid-1',
      items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
    });

    // Assert — DocumentClient must be called with the persisted quotation id
    expect(mockDocumentClient.generatePdf).toHaveBeenCalledWith('quot-42');
  });

  it('attaches pdfUrl when document client succeeds', async () => {
    // Arrange
    const savedQuotation = {
      id: 'quot-1',
      leadId: 'lead-uuid-1',
      totalAmount: 300,
      pdfUrl: null,
      status: 'PENDING_APPROVAL',
      items: [],
    };
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.quotation.create.mockResolvedValue(savedQuotation);
    mockDocumentClient.generatePdf.mockResolvedValue(
      'https://cdn.example.com/q1.pdf',
    );
    mockPrisma.quotation.update.mockResolvedValue({
      ...savedQuotation,
      pdfUrl: 'https://cdn.example.com/q1.pdf',
    });

    // Act
    const result = await service.create({
      leadId: 'lead-uuid-1',
      items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
    });

    // Assert
    expect(mockPrisma.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pdfUrl: 'https://cdn.example.com/q1.pdf' },
      }),
    );
    expect(result.pdfUrl).toBe('https://cdn.example.com/q1.pdf');
  });

  it('returns quotation without calling update when document client returns null', async () => {
    // Arrange
    const savedQuotation = {
      id: 'quot-1',
      leadId: 'lead-uuid-1',
      totalAmount: 300,
      pdfUrl: null,
      status: 'PENDING_APPROVAL',
      items: [],
    };
    mockPrisma.lead.findUnique.mockResolvedValue({ id: 'lead-uuid-1' });
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.quotation.create.mockResolvedValue(savedQuotation);
    mockDocumentClient.generatePdf.mockResolvedValue(null);

    // Act
    const result = await service.create({
      leadId: 'lead-uuid-1',
      items: [{ itemName: 'Concrete', quantity: 3, unitPrice: 100 }],
    });

    // Assert
    expect(mockPrisma.quotation.update).not.toHaveBeenCalled();
    expect(result.pdfUrl).toBeNull();
  });
});

// ─── findOne ─────────────────────────────────────────────────────────────────

describe('QuotationService.findOne', () => {
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

  it('returns quotation with items when found', async () => {
    // Arrange
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

    // Act
    const result = await service.findOne('quot-1');

    // Assert
    expect(result).toEqual(quotation);
    expect(mockPrisma.quotation.findUnique).toHaveBeenCalledWith({
      where: { id: 'quot-1' },
      include: { items: true },
    });
  });

  it('throws NotFoundException with code QUOTATION_NOT_FOUND when not found', async () => {
    // Given — quotation lookup returns nothing
    mockPrisma.quotation.findUnique.mockResolvedValue(null);

    // When / Then
    await expect(service.findOne('nonexistent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findOne('nonexistent')).rejects.toMatchObject({
      response: { code: 'QUOTATION_NOT_FOUND' },
    });
  });
});

// ─── UC-04: approveAndConvert ─────────────────────────────────────────────────

describe('QuotationService.approveAndConvert — UC-04, CRITICAL 90% coverage', () => {
  let service: QuotationService;

  const pendingQuotation = {
    id: 'quot-1',
    leadId: 'lead-uuid-1',
    totalAmount: 5000,
    status: 'PENDING_APPROVAL',
    projectId: null,
    items: [
      {
        id: 'item-1',
        itemName: 'Concrete',
        quantity: 5,
        unitPrice: 1000,
        amount: 5000,
      },
    ],
  };

  const convertedQuotation = {
    ...pendingQuotation,
    status: 'CONVERTED',
    projectId: 'proj-abc',
  };

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

  it('should approve quotation, call ProjectClient, flip to CONVERTED, and notify', async () => {
    // Arrange — quotation in PENDING_APPROVAL with no projectId
    mockPrisma.quotation.findUnique.mockResolvedValue(pendingQuotation);
    mockPrisma.quotation.update
      .mockResolvedValueOnce({ ...pendingQuotation, status: 'APPROVED' })
      .mockResolvedValueOnce(convertedQuotation);
    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: 'proj-abc',
      status: 'PLANNING',
    });
    mockNotificationClient.notifyProjectCreated.mockResolvedValue(undefined);

    // Act
    const result = await service.approveAndConvert('quot-1');

    // Assert — ProjectClient called with quotation's own data
    expect(mockProjectClient.createFromQuotation).toHaveBeenCalledWith(
      'quot-1',
      'lead-uuid-1',
      5000,
    );

    // second prisma update must flip to CONVERTED and store projectId
    expect(mockPrisma.quotation.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: { status: 'CONVERTED', projectId: 'proj-abc' },
      }),
    );

    // returned projectId must match the one from ProjectClient
    expect(result.projectId).toBe('proj-abc');

    // notification sent with quotation id and project id
    expect(mockNotificationClient.notifyProjectCreated).toHaveBeenCalledWith(
      'quot-1',
      'proj-abc',
    );
  });

  it('should throw ConflictException when quotation is already CONVERTED (BR-10.2 idempotency)', async () => {
    // Given — quotation already has status CONVERTED and a projectId
    mockPrisma.quotation.findUnique.mockResolvedValue({
      ...pendingQuotation,
      status: 'CONVERTED',
      projectId: 'existing-proj',
    });

    // When / Then
    await expect(service.approveAndConvert('quot-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    await expect(service.approveAndConvert('quot-1')).rejects.toMatchObject({
      response: { code: 'ALREADY_CONVERTED' },
    });

    expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when quotation does not exist', async () => {
    // Given — quotation lookup returns nothing
    mockPrisma.quotation.findUnique.mockResolvedValue(null);

    // When / Then
    await expect(
      service.approveAndConvert('missing-quot'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should throw ConflictException when projectId is already set even if status differs (BR-10.2)', async () => {
    // Given — projectId is set but status is still APPROVED (partial state)
    mockPrisma.quotation.findUnique.mockResolvedValue({
      ...pendingQuotation,
      status: 'APPROVED',
      projectId: 'existing-proj',
    });

    await expect(service.approveAndConvert('quot-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when quotation status is REJECTED', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      ...pendingQuotation,
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

  it('notify failure does NOT fail the conversion — result is still returned', async () => {
    // Arrange
    mockPrisma.quotation.findUnique.mockResolvedValue(pendingQuotation);
    mockPrisma.quotation.update
      .mockResolvedValueOnce({ ...pendingQuotation, status: 'APPROVED' })
      .mockResolvedValueOnce(convertedQuotation);
    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: 'proj-abc',
      status: 'PLANNING',
    });
    mockNotificationClient.notifyProjectCreated.mockRejectedValue(
      new Error('notification service down'),
    );

    // Act
    const result = await service.approveAndConvert('quot-1');

    // Assert — conversion succeeds despite notification failure
    expect(result.projectId).toBe('proj-abc');
    expect(result.quotation.status).toBe('CONVERTED');
  });

  it('propagates project service error without marking quotation CONVERTED', async () => {
    // Arrange
    mockPrisma.quotation.findUnique.mockResolvedValue(pendingQuotation);
    mockPrisma.quotation.update.mockResolvedValueOnce({
      ...pendingQuotation,
      status: 'APPROVED',
    });
    mockProjectClient.createFromQuotation.mockRejectedValue(
      new Error('project service down'),
    );

    // Act / Assert
    await expect(service.approveAndConvert('quot-1')).rejects.toThrow(
      'project service down',
    );

    // second update (CONVERTED + projectId) must NOT have been called
    expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(1);
    expect(mockNotificationClient.notifyProjectCreated).not.toHaveBeenCalled();
  });
});
