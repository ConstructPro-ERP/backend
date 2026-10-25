import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DocumentStorageStatus,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ClientPortalAccessService } from '../../apps/client-service/src/client-portal-access.service';
import { ClientPortalReadService } from '../../apps/client-service/src/client-portal-read.service';
import { DocumentService } from '../../apps/document-service/src/document.service';
import { DocumentRepository } from '../../apps/document-service/src/repositories/document.repository';
import { CloudinaryService } from '../../libs/common/src/cloudinary/cloudinary.service';
import { PrismaService } from '../../prisma/prisma.service';

jest.setTimeout(120000);

describe('Client Portal — Neon ownership isolation', () => {
  let prisma: PrismaService;
  let access: ClientPortalAccessService;
  let portal: ClientPortalReadService;
  let documents: DocumentService;

  const runId = randomUUID();
  const signedUrl = 'https://example.test/signed-client-document';

  const signing = {
    createAuthenticatedDownloadUrl: jest.fn(),
  };

  const created = {
    users: [] as string[],
    leads: [] as string[],
    customers: [] as string[],
    projects: [] as string[],
    quotations: [] as string[],
    milestones: [] as string[],
    documents: [] as string[],
    categories: [] as string[],
  };

  let actors: {
    manager: string;
    a: string;
    b: string;
    unlinked: string;
    inactive: string;
  };

  let projects: {
    a: string;
    b: string;
    mixed: string;
    empty: string;
  };

  let documentIds: {
    a: string;
    b: string;
    mixed: string;
    pending: string;
    deleted: string;
  };

  let quotationIds: {
    a: string;
    b: string;
    mixedA: string;
    mixedB: string;
  };

  let milestoneIds: {
    a: string;
    b: string;
  };

  async function remember<T extends { id: string }>(
    promise: Promise<T>,
    ids: string[],
  ): Promise<T> {
    const record = await promise;
    ids.push(record.id);
    return record;
  }

  async function createUser(
    label: string,
    roleId: string,
    status: UserStatus = UserStatus.ACTIVE,
  ) {
    const user = await remember(
      prisma.user.create({
        data: {
          fullName: `Portal Test ${label}`,
          email: `portal-${runId}-${label}@example.test`,
          password: 'test-password-hash',
          roleId,
          status,
        },
      }),
      created.users,
    );

    return user.id;
  }

  async function createLead(label: string) {
    const lead = await remember(
      prisma.lead.create({
        data: {
          customerName: `Portal Test ${runId} ${label}`,
        },
      }),
      created.leads,
    );

    return lead.id;
  }

  async function createProject(
    label: string,
    managerId: string,
    progressPercentage = 0,
  ) {
    const project = await remember(
      prisma.project.create({
        data: {
          projectName: `Portal Test ${runId} ${label}`,
          projectManagerId: managerId,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          status: ProjectStatus.ACTIVE,
          progressPercentage,
          budget: 500000,
        },
      }),
      created.projects,
    );

    return project.id;
  }

  async function createQuotation(leadId: string, projectId: string) {
    const quotation = await remember(
      prisma.quotation.create({
        data: {
          leadId,
          projectId,
          totalAmount: 125000,
          notes: 'Internal quotation notes',
        },
      }),
      created.quotations,
    );

    return quotation.id;
  }

  async function createDocument(
    projectId: string,
    categoryId: string,
    label: string,
    storageStatus: DocumentStorageStatus = DocumentStorageStatus.ACTIVE,
    deletedAt: Date | null = null,
  ) {
    const document = await remember(
      prisma.document.create({
        data: {
          projectId,
          categoryId,
          originalName: `${label}.pdf`,
          fileName: `${label}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 100,
          cloudinaryPublicId: `portal-tests/${runId}/${label}`,
          cloudinaryResourceType: 'raw',
          storageStatus,
          deletedAt,
        },
      }),
      created.documents,
    );

    return document.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    access = new ClientPortalAccessService(prisma);
    portal = new ClientPortalReadService(prisma, access);

    documents = new DocumentService(
      new DocumentRepository(prisma),
      signing as unknown as CloudinaryService,
    );

    const [clientRole, managerRole] = await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'CLIENT_PORTAL_USER' },
      }),
      prisma.role.findUniqueOrThrow({
        where: { roleName: 'PROJECT_MANAGER' },
      }),
    ]);

    actors = {
      manager: await createUser('manager', managerRole.id),
      a: await createUser('client-a', clientRole.id),
      b: await createUser('client-b', clientRole.id),
      unlinked: await createUser('unlinked', clientRole.id),
      inactive: await createUser(
        'inactive',
        clientRole.id,
        UserStatus.INACTIVE,
      ),
    };

    const leadA = await createLead('A');
    const leadB = await createLead('B');

    await remember(
      prisma.customer.create({
        data: {
          fullName: 'Portal Customer A',
          leadId: leadA,
          userId: actors.a,
        },
      }),
      created.customers,
    );

    await remember(
      prisma.customer.create({
        data: {
          fullName: 'Portal Customer B',
          leadId: leadB,
          userId: actors.b,
        },
      }),
      created.customers,
    );

    projects = {
      a: await createProject('A', actors.manager, 37),
      b: await createProject('B', actors.manager, 65),
      mixed: await createProject('Mixed', actors.manager),
      empty: await createProject('Empty', actors.manager),
    };

    quotationIds = {
      a: await createQuotation(leadA, projects.a),
      b: await createQuotation(leadB, projects.b),
      mixedA: await createQuotation(leadA, projects.mixed),
      mixedB: await createQuotation(leadB, projects.mixed),
    };

    const milestoneA = await remember(
      prisma.milestone.create({
        data: {
          projectId: projects.a,
          milestoneName: 'Client A Milestone',
          weight: 100,
          progressPercentage: 37,
        },
      }),
      created.milestones,
    );

    const milestoneB = await remember(
      prisma.milestone.create({
        data: {
          projectId: projects.b,
          milestoneName: 'Client B Milestone',
          weight: 100,
        },
      }),
      created.milestones,
    );

    milestoneIds = {
      a: milestoneA.id,
      b: milestoneB.id,
    };

    const category = await remember(
      prisma.documentCategory.create({
        data: {
          categoryName: `Portal Test Category ${runId}`,
        },
      }),
      created.categories,
    );

    documentIds = {
      a: await createDocument(projects.a, category.id, 'a'),
      b: await createDocument(projects.b, category.id, 'b'),
      mixed: await createDocument(projects.mixed, category.id, 'mixed'),
      pending: await createDocument(
        projects.a,
        category.id,
        'pending',
        DocumentStorageStatus.PENDING,
      ),
      deleted: await createDocument(
        projects.a,
        category.id,
        'deleted',
        DocumentStorageStatus.DELETED,
        new Date(),
      ),
    };
  });

  beforeEach(() => {
    signing.createAuthenticatedDownloadUrl.mockReset();
    signing.createAuthenticatedDownloadUrl.mockReturnValue(signedUrl);
  });

  afterAll(async () => {
    if (!prisma) return;

    try {
      await prisma.document.deleteMany({
        where: { id: { in: created.documents } },
      });
      await prisma.milestone.deleteMany({
        where: { id: { in: created.milestones } },
      });
      await prisma.quotation.deleteMany({
        where: { id: { in: created.quotations } },
      });
      await prisma.project.deleteMany({
        where: { id: { in: created.projects } },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: created.customers } },
      });
      await prisma.lead.deleteMany({
        where: { id: { in: created.leads } },
      });
      await prisma.documentCategory.deleteMany({
        where: { id: { in: created.categories } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: created.users } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('isolates project lists for both clients', async () => {
    const a = await portal.findProjects(actors.a, {});
    const b = await portal.findProjects(actors.b, {});

    expect(a.items.map((project) => project.id)).toEqual([projects.a]);
    expect(b.items.map((project) => project.id)).toEqual([projects.b]);

    expect(a.total).toBe(1);
    expect(b.total).toBe(1);
  });

  it('returns safe project progress without internal budgets', async () => {
    const project = await portal.findProject(actors.a, projects.a);

    expect(project.progressPercentage).toBe(37);
    expect(project).not.toHaveProperty('budget');
    expect(project).not.toHaveProperty('projectManagerId');
  });

  it('hides foreign, mixed, and quotation-free projects', async () => {
    for (const id of [projects.b, projects.mixed, projects.empty]) {
      await expect(portal.findProject(actors.a, id)).rejects.toThrow(
        NotFoundException,
      );
    }

    await expect(portal.findProject(actors.b, projects.mixed)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('isolates milestones by project ownership', async () => {
    const milestones = await portal.findMilestones(actors.a, projects.a);

    expect(milestones.map((milestone) => milestone.id)).toEqual([
      milestoneIds.a,
    ]);
    expect(milestones.map((milestone) => milestone.id)).not.toContain(
      milestoneIds.b,
    );

    await expect(portal.findMilestones(actors.a, projects.b)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('shows only active documents from an owned project', async () => {
    const result = await portal.findDocuments(actors.a, projects.a, {});

    expect(result.items.map((document) => document.id)).toEqual([
      documentIds.a,
    ]);

    expect(result.total).toBe(1);
    expect(result.items[0]).not.toHaveProperty('cloudinaryPublicId');
    expect(result.items[0]).not.toHaveProperty('fileUrl');
    expect(result.items[0]).not.toHaveProperty('uploadedById');
  });

  it('hides foreign and mixed-customer document lists', async () => {
    await expect(
      portal.findDocuments(actors.a, projects.b, {}),
    ).rejects.toThrow(NotFoundException);

    await expect(
      portal.findDocuments(actors.a, projects.mixed, {}),
    ).rejects.toThrow(NotFoundException);
  });

  it('isolates quotations by their linked customer', async () => {
    const a = await portal.findQuotations(actors.a, {});
    const b = await portal.findQuotations(actors.b, {});

    expect(a.items.map((quotation) => quotation.id).sort()).toEqual(
      [quotationIds.a, quotationIds.mixedA].sort(),
    );

    expect(b.items.map((quotation) => quotation.id).sort()).toEqual(
      [quotationIds.b, quotationIds.mixedB].sort(),
    );

    expect(a.items[0]).not.toHaveProperty('notes');
    expect(a.items[0]).not.toHaveProperty('pdfUrl');
  });

  it('signs downloads only for exclusively owned documents', async () => {
    await expect(
      documents.downloadForClient(documentIds.a, actors.a),
    ).resolves.toEqual({
      downloadUrl: signedUrl,
      expiresInSeconds: 300,
    });

    expect(signing.createAuthenticatedDownloadUrl).toHaveBeenCalledTimes(1);

    for (const id of [documentIds.b, documentIds.mixed]) {
      await expect(documents.downloadForClient(id, actors.a)).rejects.toThrow(
        NotFoundException,
      );
    }

    expect(signing.createAuthenticatedDownloadUrl).toHaveBeenCalledTimes(1);
  });

  it('rejects pending and deleted document downloads', async () => {
    for (const id of [documentIds.pending, documentIds.deleted]) {
      await expect(documents.downloadForClient(id, actors.a)).rejects.toThrow(
        NotFoundException,
      );
    }

    expect(signing.createAuthenticatedDownloadUrl).not.toHaveBeenCalled();
  });

  it('rejects missing, unlinked, inactive, and incorrect-role users', async () => {
    await expect(access.resolveClient()).rejects.toThrow(UnauthorizedException);

    await expect(access.resolveClient(actors.unlinked)).rejects.toThrow(
      ForbiddenException,
    );

    await expect(access.resolveClient(actors.inactive)).rejects.toThrow(
      ForbiddenException,
    );

    await expect(access.resolveClient(actors.manager)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
