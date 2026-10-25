import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import bcrypt from 'bcrypt';
import ws from 'ws';

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const RESOURCES = [
  'users',
  'leads',
  'quotations',
  'projects',
  'finance',
  'documents',
] as const;

const ACTIONS = ['create', 'read', 'update', 'delete'] as const;

type Resource = (typeof RESOURCES)[number];
type Action = (typeof ACTIONS)[number];

const perms = (actions: Action[], resource: Resource) =>
  actions.map((action) => ({ action, resource }));

const ROLE_PERMISSIONS: Record<
  string,
  { action: Action; resource: Resource }[]
> = {
  ADMIN: ACTIONS.flatMap((action) =>
    RESOURCES.map((resource) => ({ action, resource })),
  ),
  SALES_MANAGER: [
    ...perms(['create', 'read', 'update', 'delete'], 'leads'),
    ...perms(['create', 'read', 'update', 'delete'], 'quotations'),
    ...perms(['read'], 'projects'),
  ],
  PROJECT_MANAGER: [
    ...perms(['create', 'read', 'update', 'delete'], 'projects'),
    ...perms(['create', 'read', 'update', 'delete'], 'documents'),
    ...perms(['read'], 'quotations'),
    ...perms(['read'], 'finance'),
  ],
  ACCOUNTANT: [
    ...perms(['create', 'read', 'update', 'delete'], 'finance'),
    ...perms(['read'], 'quotations'),
    ...perms(['read'], 'projects'),
  ],
  CLIENT_PORTAL_USER: [
    ...perms(['read'], 'quotations'),
    ...perms(['read'], 'projects'),
    ...perms(['read'], 'documents'),
  ],
};

async function main() {
  try {
    // ─── Step 1: Permissions ──────────────────────────────────────────────────
    await Promise.all(
      RESOURCES.flatMap((resource) =>
        ACTIONS.map((action) =>
          prisma.permission.upsert({
            where: { action_resource: { action, resource } },
            update: {},
            create: { action, resource },
          }),
        ),
      ),
    );
    console.log('Seeded permissions:', RESOURCES.length * ACTIONS.length);

    // ─── Step 2: Roles ────────────────────────────────────────────────────────
    const roleNames = [
      'ADMIN',
      'SALES_MANAGER',
      'PROJECT_MANAGER',
      'ACCOUNTANT',
      'CLIENT_PORTAL_USER',
    ] as const;

    for (const roleName of roleNames) {
      await prisma.role.upsert({
        where: { roleName },
        update: {},
        create: { roleName },
      });
    }
    console.log('Seeded roles:', roleNames.length);

    // ─── Step 3: Role-Permission Assignments ──────────────────────────────────
    const allPermissions = await prisma.permission.findMany();
    const permMap = new Map(
      allPermissions.map((p) => [`${p.action}:${p.resource}`, p.id]),
    );

    const allRoles = await prisma.role.findMany();
    const roleMap = new Map(allRoles.map((r) => [r.roleName, r.id]));

    for (const [roleName, permList] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap.get(roleName);
      if (!roleId) continue;

      const data = permList
        .map(({ action, resource }) => {
          const permissionId = permMap.get(`${action}:${resource}`);
          return permissionId ? { roleId, permissionId } : null;
        })
        .filter(
          (d): d is { roleId: string; permissionId: string } => d !== null,
        );

      await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    }
    const assignmentCount = await prisma.rolePermission.count();
    console.log('Seeded role-permission assignments:', assignmentCount);

    // ─── Step 4: Admin User ───────────────────────────────────────────────────
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { roleName: 'ADMIN' },
      select: { id: true },
    });

    const passwordHash = await bcrypt.hash('Admin@1234!', 12);

    await prisma.user.upsert({
      where: { email: 'admin@constructpro.com' },
      update: {},
      create: {
        fullName: 'Admin User',
        email: 'admin@constructpro.com',
        password: passwordHash,
        status: 'ACTIVE',
        role: { connect: { id: adminRole.id } },
      },
    });
    console.log('Seeded admin user: admin@constructpro.com');
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
