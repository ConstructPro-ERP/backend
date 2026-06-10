import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL_TEST!,
});
const prisma = new PrismaClient({ adapter } as any);

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  // Delete in reverse FK dependency order to avoid constraint violations
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.analyticsReport.deleteMany();
  await prisma.task.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.document.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.project.deleteMany();
  await prisma.quotationItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.lead.deleteMany();     // Customer.leadId is nullable — SET NULL clears the FK
  await prisma.customer.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.user.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.documentCategory.deleteMany();
});

// ─── User model ───────────────────────────────────────────────────────────────

describe('User model', () => {
  it('creates a user with required fields', async () => {
    const role = await prisma.role.create({
      data: { roleName: 'TEST_ROLE' },
    });

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

    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
    expect(found!.fullName).toBe('Alice Test');
    expect(found!.status).toBe('ACTIVE');
  });

  it('throws on duplicate email', async () => {
    const role = await prisma.role.create({
      data: { roleName: 'TEST_ROLE' },
    });
    const userData = {
      fullName: 'Bob Test',
      email: 'bob@example.com',
      password: 'hashed_pw',
      roleId: role.id,
    };

    await prisma.user.create({ data: userData });

    await expect(prisma.user.create({ data: userData })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  // Requires onDelete: Cascade on RefreshToken.userId in schema.prisma
  it('cascade deletes refresh tokens when user deleted', async () => {
    const role = await prisma.role.create({
      data: { roleName: 'TEST_ROLE' },
    });
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

    await prisma.user.delete({ where: { id: user.id } });

    const remaining = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(remaining).toHaveLength(0);
  });
});

// ─── Role and Permission ──────────────────────────────────────────────────────

describe('Role and Permission', () => {
  it('creates a role and assigns a permission via RolePermission junction', async () => {
    const role = await prisma.role.create({
      data: { roleName: 'EDITOR', description: 'Can edit content' },
    });
    const permission = await prisma.permission.create({
      data: { action: 'update', resource: 'articles' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });

    const found = await prisma.role.findUnique({
      where: { id: role.id },
      include: { permissions: { include: { permission: true } } },
    });

    expect(found).not.toBeNull();
    expect(found!.permissions).toHaveLength(1);
    expect(found!.permissions[0].permission.action).toBe('update');
    expect(found!.permissions[0].permission.resource).toBe('articles');
  });

  it('queries user with role and permissions using include', async () => {
    const role = await prisma.role.create({
      data: { roleName: 'VIEWER' },
    });
    const permission = await prisma.permission.create({
      data: { action: 'read', resource: 'reports' },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
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
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    expect(found).not.toBeNull();
    expect(found!.role.roleName).toBe('VIEWER');
    expect(found!.role.permissions).toHaveLength(1);
    expect(found!.role.permissions[0].permission.action).toBe('read');
    expect(found!.role.permissions[0].permission.resource).toBe('reports');
  });
});

// ─── Client (Customer) and Lead ───────────────────────────────────────────────

describe('Client and Lead', () => {
  it('creates client and attaches leads', async () => {
    const lead = await prisma.lead.create({
      data: { customerName: 'Prospect Corp', status: 'QUALIFIED' },
    });
    const customer = await prisma.customer.create({
      data: { fullName: 'Converted Corp', leadId: lead.id },
    });

    const found = await prisma.customer.findUnique({
      where: { id: customer.id },
      include: { lead: true },
    });

    expect(found).not.toBeNull();
    expect(found!.lead).not.toBeNull();
    expect(found!.lead!.id).toBe(lead.id);
    expect(found!.lead!.customerName).toBe('Prospect Corp');
    expect(found!.lead!.status).toBe('QUALIFIED');
  });

  // Customer.leadId FK has onDelete: Cascade — deleting the parent Lead cascades to Customer
  it('cascade deletes client when parent lead is deleted', async () => {
    const lead = await prisma.lead.create({
      data: { customerName: 'Linked Lead', status: 'NEW' },
    });
    const customer = await prisma.customer.create({
      data: { fullName: 'Linked Client', leadId: lead.id },
    });

    await prisma.lead.delete({ where: { id: lead.id } });

    const remaining = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(remaining).toBeNull();
  });
});

// ─── Quotation and QuotationItems ─────────────────────────────────────────────

describe('Quotation and QuotationItems', () => {
  it('creates quotation with items', async () => {
    const customer = await prisma.customer.create({
      data: { fullName: 'Build Co.' },
    });

    const quotation = await prisma.quotation.create({
      data: {
        customerId: customer.id,
        quotationDate: new Date('2025-01-10'),
        totalAmount: 4500,
        items: {
          create: [
            { itemName: 'Foundation Work', quantity: 1, unitPrice: 2000, amount: 2000 },
            { itemName: 'Roofing', quantity: 5, unitPrice: 500, amount: 2500 },
          ],
        },
      },
      include: { items: true },
    });

    expect(quotation.totalAmount).toBe(4500);
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

  // Requires onDelete: Cascade on QuotationItem.quotationId in schema.prisma
  it('cascade deletes items when quotation deleted', async () => {
    const customer = await prisma.customer.create({
      data: { fullName: 'Cascade Co.' },
    });
    const quotation = await prisma.quotation.create({
      data: {
        customerId: customer.id,
        quotationDate: new Date('2025-02-15'),
        totalAmount: 1000,
        items: {
          create: [
            { itemName: 'Line Item A', quantity: 2, unitPrice: 250, amount: 500 },
            { itemName: 'Line Item B', quantity: 1, unitPrice: 500, amount: 500 },
          ],
        },
      },
    });

    await prisma.quotation.delete({ where: { id: quotation.id } });

    const orphaned = await prisma.quotationItem.findMany({
      where: { quotationId: quotation.id },
    });
    expect(orphaned).toHaveLength(0);
  });
});
