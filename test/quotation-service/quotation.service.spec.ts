import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  QuotationService,
  round2,
} from '../../apps/quotation-service/src/quotation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentClient } from '../../apps/quotation-service/src/document.client';
import { ProjectClient } from '../../apps/quotation-service/src/project.client';
import { NotificationClient } from '../../apps/quotation-service/src/notification.client';

const mockPrisma = {
  lead: { findUnique: jest.fn() },
  quotation: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  quotationItem: {
    deleteMany: jest.fn(),
  },
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
      status: 'ACTIVE',
    });
    mockNotificationClient.notifyProjectCreated.mockResolvedValue(undefined);

    // Act
    const result = await service.approveAndConvert('quot-1', {
      projectName: 'House Construction Project',
      location: 'Colombo',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2027-04-30T00:00:00.000Z',
      projectManagerId: 'manager-uuid-1',
      budget: 5000000,
    });

    // Assert — ProjectClient called with quotation and project data
    expect(mockProjectClient.createFromQuotation).toHaveBeenCalledWith({
      quotationId: 'quot-1',
      leadId: 'lead-uuid-1',
      projectName: 'House Construction Project',
      location: 'Colombo',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2027-04-30T00:00:00.000Z',
      projectManagerId: 'manager-uuid-1',
      budget: 5000000,
    });

    // second prisma update must flip to CONVERTED and store projectId
    expect(mockPrisma.quotation.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: { status: 'CONVERTED', projectId: 'proj-abc' },
      }),
    );

    // returned projectId must match the one from ProjectClient
    expect(result.projectId).toBe('proj-abc');
    expect(result.projectStatus).toBe('ACTIVE');

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
    await expect(
      service.approveAndConvert('quot-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(service.approveAndConvert('quot-1', {})).rejects.toMatchObject(
      {
        response: { code: 'ALREADY_CONVERTED' },
      },
    );

    expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when quotation does not exist', async () => {
    // Given — quotation lookup returns nothing
    mockPrisma.quotation.findUnique.mockResolvedValue(null);

    // When / Then
    await expect(
      service.approveAndConvert('missing-quot', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should continue conversion when an APPROVED quotation already has a projectId', async () => {
    // Arrange — quotation was linked before a previous conversion attempt stopped
    const approvedQuotation = {
      ...pendingQuotation,
      status: 'APPROVED',
      projectId: 'existing-proj',
    };

    mockPrisma.quotation.findUnique.mockResolvedValue(approvedQuotation);
    mockProjectClient.createFromQuotation.mockResolvedValue({
      projectId: 'existing-proj',
      status: 'ACTIVE',
    });
    mockPrisma.quotation.update.mockResolvedValue({
      ...approvedQuotation,
      status: 'CONVERTED',
    });
    mockNotificationClient.notifyProjectCreated.mockResolvedValue(undefined);

    // Act
    const result = await service.approveAndConvert('quot-1', {});

    // Assert — existing project must be reused
    expect(mockProjectClient.createFromQuotation).toHaveBeenCalledWith({
      quotationId: 'quot-1',
      leadId: 'lead-uuid-1',
      targetProjectId: 'existing-proj',
    });

    expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.quotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'CONVERTED',
          projectId: 'existing-proj',
        },
      }),
    );

    expect(result.projectId).toBe('existing-proj');
    expect(result.projectStatus).toBe('ACTIVE');
  });

  it('should throw ConflictException when quotation is already linked to a different project', async () => {
    // Arrange
    mockPrisma.quotation.findUnique.mockResolvedValue({
      ...pendingQuotation,
      status: 'APPROVED',
      projectId: 'project-1',
    });

    // Act / Assert
    await expect(
      service.approveAndConvert('quot-1', {
        targetProjectId: 'project-2',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'QUOTATION_PROJECT_MISMATCH',
      },
    });

    expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when quotation status is REJECTED', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      ...pendingQuotation,
      status: 'REJECTED',
    });

    await expect(
      service.approveAndConvert('quot-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.approveAndConvert('quot-1', {})).rejects.toMatchObject(
      {
        response: { code: 'QUOTATION_REJECTED' },
      },
    );

    expect(mockProjectClient.createFromQuotation).not.toHaveBeenCalled();
  });

  it('should throw BadRequestException when creating a new project without required project details', async () => {
    // Arrange — quotation has no existing project
    mockPrisma.quotation.findUnique.mockResolvedValue(pendingQuotation);

    // Act / Assert
    await expect(
      service.approveAndConvert('quot-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.approveAndConvert('quot-1', {})).rejects.toMatchObject(
      {
        response: { code: 'PROJECT_DETAILS_REQUIRED' },
      },
    );

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
      status: 'ACTIVE',
    });
    mockNotificationClient.notifyProjectCreated.mockRejectedValue(
      new Error('notification service down'),
    );

    // Act
    const result = await service.approveAndConvert('quot-1', {
      projectName: 'House Construction Project',
      startDate: '2026-10-01T00:00:00.000Z',
      projectManagerId: 'manager-uuid-1',
      budget: 5000000,
    });

    // Assert — conversion succeeds despite notification failure
    expect(result.projectId).toBe('proj-abc');
    expect(result.projectStatus).toBe('ACTIVE');
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
    await expect(
      service.approveAndConvert('quot-1', {
        projectName: 'House Construction Project',
        startDate: '2026-10-01T00:00:00.000Z',
        projectManagerId: 'manager-uuid-1',
        budget: 5000000,
      }),
    ).rejects.toThrow('project service down');

    // second update (CONVERTED + projectId) must NOT have been called
    expect(mockPrisma.quotation.update).toHaveBeenCalledTimes(1);
    expect(mockNotificationClient.notifyProjectCreated).not.toHaveBeenCalled();
  });
});

// ─── findAll ─────────────────────────────────────────────────────────────────

describe('QuotationService.findAll', () => {
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

  it('returns paginated quotations with default page and limit', async () => {
    const quotations = [
      { id: 'q-1', leadId: 'lead-1', totalAmount: 1000, items: [] },
      { id: 'q-2', leadId: 'lead-2', totalAmount: 2000, items: [] },
    ];
    mockPrisma.quotation.count.mockResolvedValue(2);
    mockPrisma.quotation.findMany.mockResolvedValue(quotations);

    const result = await service.findAll();

    expect(result.items).toEqual(quotations);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(mockPrisma.quotation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('filters by leadId and status when provided', async () => {
    mockPrisma.quotation.count.mockResolvedValue(1);
    mockPrisma.quotation.findMany.mockResolvedValue([
      { id: 'q-1', status: 'PENDING_APPROVAL' },
    ]);

    await service.findAll({
      leadId: 'lead-uuid-1',
      status: 'PENDING_APPROVAL',
      page: 2,
      limit: 10,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const findManyArg = mockPrisma.quotation.findMany.mock.calls[0][0] as {
      skip: number;
      take: number;
      where: { leadId?: string; status?: string };
    };
    expect(findManyArg.skip).toBe(10);
    expect(findManyArg.take).toBe(10);
    expect(findManyArg.where.leadId).toBe('lead-uuid-1');
    expect(findManyArg.where.status).toBe('PENDING_APPROVAL');
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('QuotationService.update', () => {
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

  it('updates notes and recalculates line items using round2', async () => {
    const existing = {
      id: 'q-1',
      status: 'PENDING_APPROVAL',
      notes: 'Initial notes',
      totalAmount: 100,
      items: [],
    };
    mockPrisma.quotation.findUnique.mockResolvedValue(existing);
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
    );
    mockPrisma.quotationItem.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.quotation.update.mockResolvedValue({
      id: 'q-1',
      status: 'PENDING_APPROVAL',
      notes: 'Updated notes',
      totalAmount: 750,
      items: [{ itemName: 'Item 1', quantity: 3, unitPrice: 250, amount: 750 }],
    });

    const result = await service.update('q-1', {
      notes: 'Updated notes',
      items: [{ itemName: 'Item 1', quantity: 3, unitPrice: 250 }],
    });

    expect(result.totalAmount).toBe(750);
    expect(mockPrisma.quotationItem.deleteMany).toHaveBeenCalledWith({
      where: { quotationId: 'q-1' },
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const updateArg = mockPrisma.quotation.update.mock.calls[0][0] as {
      where: { id: string };
      data: { notes: string; totalAmount: number };
    };
    expect(updateArg.where.id).toBe('q-1');
    expect(updateArg.data.notes).toBe('Updated notes');
    expect(updateArg.data.totalAmount).toBe(750);
  });

  it('throws NotFoundException when quotation does not exist', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue(null);

    await expect(
      service.update('non-existent', { notes: 'test' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException with QUOTATION_LOCKED when status is APPROVED or CONVERTED', async () => {
    mockPrisma.quotation.findUnique.mockResolvedValue({
      id: 'q-1',
      status: 'APPROVED',
    });

    await expect(
      service.update('q-1', { notes: 'test' }),
    ).rejects.toMatchObject({
      response: { code: 'QUOTATION_LOCKED' },
    });
  });
});

// ─── round2 calculation utility ──────────────────────────────────────────────

describe('round2 precision calculation', () => {
  it('correctly rounds to 2 decimal places without floating point drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10.555)).toBe(10.56);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(3 * 33.33)).toBe(99.99);
  });
});
