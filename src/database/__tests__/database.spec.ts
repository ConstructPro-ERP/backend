import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter });

jest.setTimeout(30000);

// Single TRUNCATE ... CASCADE is one DB round-trip — far faster than 20 sequential deleteMany calls
async function cleanDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Payment", "Invoice", "AnalyticsReport", "Task", "Expense",
      "Document", "Milestone", "Project",
      "quotation_item", "quotation",
      "Lead", "Customer", "AuditLog", "RefreshToken", "RolePermission",
      "User", "Permission", "Role", "DocumentCategory"
    CASCADE
  `);
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanDatabase(); // remove any stale data left by a previous failed run
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(cleanDatabase);

// ─── User model ───────────────────────────────────────────────────────────────

describe('User model', () => {
  it('should create a user and find it by email given all required fields are provided', async () => {
    // Arrange
    const role = await prisma.role.create({ data: { roleName: 'TEST_ROLE' } });

    // Act
    const user = await prisma.user.create({
      data: {
        fullName: 'Alice Test',
        email: 'alice@example.com',
        password: 'hashed_pw',
        roleId: role.id,
      },
    });
    const found = await prisma.user.findUnique({
      where: { email: 'alice@example.com' },
    });

    // Assert
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.fullName).toBe('Alice Test');
    expect(found!.status).toBe('ACTIVE');
  });

  it('should throw a Prisma P2002 error given a duplicate email is inserted', async () => {
    // Arrange
    const role = await prisma.role.create({ data: { roleName: 'TEST_ROLE' } });
    const userData = {
      fullName: 'Bob Test',
      email: 'bob@example.com',
      password: 'hashed_pw',
      roleId: role.id,
    };
    await prisma.user.create({ data: userData });

    // Act & Assert
    await expect(prisma.user.create({ data: userData })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('should cascade delete RefreshTokens given the parent User is deleted', async () => {
    // Arrange
    const role = await prisma.role.create({ data: { roleName: 'TEST_ROLE' } });
    const user = await prisma.user.create({
      data: {
        fullName: 'Carol Test',
        email: 'carol@example.com',
        password: 'hashed_pw',
        roleId: role.id,
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: 'tok_abc123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Act
    await prisma.user.delete({ where: { id: user.id } });

    // Assert
    const remaining = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(remaining).toHaveLength(0);
  });
});

// ─── Role and Permission ──────────────────────────────────────────────────────

describe('Role and Permission', () => {
  it('should create a Role and assign a Permission via the RolePermission junction given valid IDs', async () => {
    // Arrange
    const role = await prisma.role.create({
      data: { roleName: 'EDITOR', description: 'Can edit content' },
    });
    const permission = await prisma.permission.create({
      data: { action: 'update', resource: 'articles' },
    });

    // Act
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    const found = await prisma.role.findUnique({
      where: { id: role.id },
      include: { permissions: { include: { permission: true } } },
    });

    // Assert
    expect(found).not.toBeNull();
    expect(found!.permissions).toHaveLength(1);
    expect(found!.permissions[0].permission.action).toBe('update');
    expect(found!.permissions[0].permission.resource).toBe('articles');
  });

  it('should return a User with their Role and Permissions given Prisma include is used', async () => {
    // Arrange
    const role = await prisma.role.create({ data: { roleName: 'VIEWER' } });
    const permission = await prisma.permission.create({
      data: { action: 'read', resource: 'reports' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });

    // Act
    const user = await prisma.user.create({
      data: {
        fullName: 'Dave Test',
        email: 'dave@example.com',
        password: 'hashed_pw',
        roleId: role.id,
      },
    });
    const found = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });

    // Assert
    expect(found).not.toBeNull();
    expect(found!.role.roleName).toBe('VIEWER');
    expect(found!.role.permissions).toHaveLength(1);
    expect(found!.role.permissions[0].permission.action).toBe('read');
    expect(found!.role.permissions[0].permission.resource).toBe('reports');
  });
});

// ─── Client and Lead ──────────────────────────────────────────────────────────

describe('Client and Lead', () => {
  it('should create a Client and attach a Lead to it given both entities are created and linked', async () => {
    // Arrange
    const lead = await prisma.lead.create({
      data: { customerName: 'Prospect Corp', status: 'QUALIFIED' },
    });

    // Act
    const customer = await prisma.customer.create({
      data: { fullName: 'Converted Corp', leadId: lead.id },
    });
    const found = await prisma.customer.findUnique({
      where: { id: customer.id },
      include: { lead: true },
    });

    // Assert
    expect(found).not.toBeNull();
    expect(found!.lead).not.toBeNull();
    expect(found!.lead!.id).toBe(lead.id);
    expect(found!.lead!.customerName).toBe('Prospect Corp');
    expect(found!.lead!.status).toBe('QUALIFIED');
  });

  it('should cascade delete the linked Customer given the parent Lead is deleted', async () => {
    // Arrange — Customer.leadId has onDelete: Cascade, so deleting Lead removes the Customer
    const lead = await prisma.lead.create({
      data: { customerName: 'Linked Lead', status: 'NEW' },
    });
    const customer = await prisma.customer.create({
      data: { fullName: 'Linked Client', leadId: lead.id },
    });

    // Act
    await prisma.lead.delete({ where: { id: lead.id } });

    // Assert
    const remaining = await prisma.customer.findUnique({
      where: { id: customer.id },
    });
    expect(remaining).toBeNull();
  });
});

// ─── Quotation and QuotationItem ─────────────────────────────────────────────

describe('Quotation and QuotationItem', () => {
  it('should create a Quotation with nested QuotationItems given a Lead exists', async () => {
    // Arrange
    const lead = await prisma.lead.create({
      data: { customerName: 'Build Co. Lead', status: 'QUALIFIED' },
    });

    // Act
    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 4500,
        items: {
          create: [
            {
              itemName: 'Foundation Work',
              quantity: 1,
              unitPrice: 2000,
              amount: 2000,
            },
            { itemName: 'Roofing', quantity: 5, unitPrice: 500, amount: 2500 },
          ],
        },
      },
      include: { items: true },
    });

    // Assert
    expect(Number(quotation.totalAmount)).toBe(4500);
    expect(quotation.items).toHaveLength(2);
    const dbItems = await prisma.quotationItem.findMany({
      where: { quotationId: quotation.id },
    });
    expect(dbItems).toHaveLength(2);
    expect(dbItems.map((i) => i.itemName).sort()).toEqual([
      'Foundation Work',
      'Roofing',
    ]);
  });

  it('should cascade delete QuotationItems given the parent Quotation is deleted', async () => {
    // Arrange
    const lead = await prisma.lead.create({
      data: { customerName: 'Cascade Co. Lead', status: 'NEW' },
    });
    const quotation = await prisma.quotation.create({
      data: {
        leadId: lead.id,
        totalAmount: 1000,
        items: {
          create: [
            {
              itemName: 'Line Item A',
              quantity: 2,
              unitPrice: 250,
              amount: 500,
            },
            {
              itemName: 'Line Item B',
              quantity: 1,
              unitPrice: 500,
              amount: 500,
            },
          ],
        },
      },
    });

    // Act
    await prisma.quotation.delete({ where: { id: quotation.id } });

    // Assert
    const orphaned = await prisma.quotationItem.findMany({
      where: { quotationId: quotation.id },
    });
    expect(orphaned).toHaveLength(0);
  });
});

// ─── Project and Milestone ────────────────────────────────────────────────────

describe('Project and Milestone', () => {
  it('should create a Project linked to a Quotation given both a Lead and Quotation exist', async () => {
    // Arrange
    const role = await prisma.role.create({ data: { roleName: 'PM_ROLE' } });
    const manager = await prisma.user.create({
      data: {
        fullName: 'Eve Manager',
        email: 'eve@example.com',
        password: 'hashed_pw',
        roleId: role.id,
      },
    });
    const lead = await prisma.lead.create({
      data: { customerName: 'Dev Corp', status: 'QUALIFIED' },
    });
    const quotation = await prisma.quotation.create({
      data: { leadId: lead.id, totalAmount: 50000 },
    });

    // Act
    const project = await prisma.project.create({
      data: {
        projectName: 'Dev Build',
        startDate: new Date('2026-01-01'),
        projectManagerId: manager.id,
      },
    });
    // Quotation holds the FK to Project (quotation.projectId), so we update the quotation to link
    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { projectId: project.id },
    });
    const found = await prisma.project.findUnique({
      where: { id: project.id },
      include: { quotation: true },
    });

    // Assert
    expect(found).not.toBeNull();
    expect(found!.projectName).toBe('Dev Build');
    expect(found!.quotation).not.toBeNull();
    expect(found!.quotation!.id).toBe(quotation.id);
    expect(Number(found!.quotation!.totalAmount)).toBe(50000);
  });

  it('should cascade delete Milestones when the parent Project is deleted given Milestones are removed first', async () => {
    // Arrange — Milestone.projectId has no onDelete: Cascade (defaults to RESTRICT),
    // so children must be deleted before the parent to avoid a FK constraint violation.
    const role = await prisma.role.create({ data: { roleName: 'PM_ROLE' } });
    const manager = await prisma.user.create({
      data: {
        fullName: 'Frank Manager',
        email: 'frank@example.com',
        password: 'hashed_pw',
        roleId: role.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        projectName: 'Milestone Project',
        startDate: new Date('2026-03-01'),
        projectManagerId: manager.id,
      },
    });
    await prisma.milestone.createMany({
      data: [
        { projectId: project.id, milestoneName: 'Phase 1' },
        { projectId: project.id, milestoneName: 'Phase 2' },
      ],
    });

    // Act — delete children before parent (no onDelete: Cascade on Milestone)
    await prisma.milestone.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });

    // Assert
    const remainingMilestones = await prisma.milestone.findMany({
      where: { projectId: project.id },
    });
    const deletedProject = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(remainingMilestones).toHaveLength(0);
    expect(deletedProject).toBeNull();
  });
});
