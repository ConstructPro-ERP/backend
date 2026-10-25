import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL ?? '',
});
const prisma = new PrismaClient({ adapter });

export async function seedQuotationDemo() {
  console.log(
    'Seeding Sprint 7 Demo Data for Quotations & Project Conversion...',
  );

  // 1. Ensure Manager User & Role exist
  await prisma.role.upsert({
    where: { roleName: 'SALES_MANAGER' },
    update: {},
    create: {
      roleName: 'SALES_MANAGER',
      description: 'Sales & Estimations Manager',
    },
  });

  const projectManagerRole = await prisma.role.upsert({
    where: { roleName: 'PROJECT_MANAGER' },
    update: {},
    create: { roleName: 'PROJECT_MANAGER', description: 'Project Manager' },
  });

  const pmUser = await prisma.user.upsert({
    where: { email: 'pm.demo@constructpro.com' },
    update: {},
    create: {
      fullName: 'David Miller (Project Manager)',
      email: 'pm.demo@constructpro.com',
      password: 'hashedpassword',
      roleId: projectManagerRole.id,
      status: 'ACTIVE',
    },
  });

  // 2. Demo Leads
  const skylineLead = await prisma.lead.upsert({
    where: { id: '00000000-0000-4000-a000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000001',
      customerName: 'Skyline Heights Commercial Towers',
      email: 'info@skylineheights.com',
      phone: '+94 11 234 5678',
      status: 'QUALIFIED',
    },
  });

  const lotusLead = await prisma.lead.upsert({
    where: { id: '00000000-0000-4000-a000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000002',
      customerName: 'Lotus Villa Residential Sanctuary',
      email: 'contact@lotusvilla.lk',
      phone: '+94 77 987 6543',
      status: 'CONTACTED',
    },
  });

  const oceanLead = await prisma.lead.upsert({
    where: { id: '00000000-0000-4000-a000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000003',
      customerName: 'Ocean Breeze Resort & Spa',
      email: 'gm@oceanbreeze.lk',
      phone: '+94 91 555 4321',
      status: 'QUALIFIED',
    },
  });

  // 3. Demo Quotations
  // A. PENDING_APPROVAL quotation (Ready for live Approval / Rejection demo)
  await prisma.quotation.upsert({
    where: { id: '00000000-0000-4000-b000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-b000-000000000001',
      leadId: skylineLead.id,
      status: 'PENDING_APPROVAL',
      notes:
        'Initial quotation submitted for site excavation, piling, and structural reinforcement.',
      totalAmount: 4850000.0,
      items: {
        create: [
          {
            itemName: 'Site Survey & Subsoil Geotechnical Investigation',
            quantity: 1,
            unitPrice: 350000.0,
            amount: 350000.0,
          },
          {
            itemName: 'Deep Piling & Reinforced Concrete Foundation',
            quantity: 300,
            unitPrice: 10000.0,
            amount: 3000000.0,
          },
          {
            itemName: 'Heavy Structural Steel Framing (Tons)',
            quantity: 10,
            unitPrice: 150000.0,
            amount: 1500000.0,
          },
        ],
      },
    },
  });

  // B. APPROVED quotation (Ready for live Project Conversion demo)
  await prisma.quotation.upsert({
    where: { id: '00000000-0000-4000-b000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-b000-000000000002',
      leadId: lotusLead.id,
      status: 'APPROVED',
      notes:
        'Approved by management. Client confirmed scope and advance payment terms.',
      totalAmount: 2200000.0,
      items: {
        create: [
          {
            itemName: 'Architectural Design & Engineering Blueprint Approval',
            quantity: 1,
            unitPrice: 700000.0,
            amount: 700000.0,
          },
          {
            itemName: 'Brickwork Masonry & Smooth Plastering',
            quantity: 150,
            unitPrice: 10000.0,
            amount: 1500000.0,
          },
        ],
      },
    },
  });

  // C. REJECTED quotation (Ready for live Revision demo)
  await prisma.quotation.upsert({
    where: { id: '00000000-0000-4000-b000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-4000-b000-000000000003',
      leadId: oceanLead.id,
      status: 'REJECTED',
      notes:
        'Initial quotation submitted.\n[Rejection Reason]: Budget exceeds client threshold by 15%. Revise material specs.',
      totalAmount: 960000.0,
      items: {
        create: [
          {
            itemName: 'Interior Finishing (Imported Italian Marble & Paint)',
            quantity: 1,
            unitPrice: 960000.0,
            amount: 960000.0,
          },
        ],
      },
    },
  });

  // D. CONVERTED quotation (Already linked to a project)
  const demoProject = await prisma.project.upsert({
    where: { id: '00000000-0000-4000-c000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-c000-000000000001',
      projectName: 'Skyline Heights Phase 1 Development',
      startDate: new Date(),
      budget: 5000000.0,
      projectManagerId: pmUser.id,
      status: 'ACTIVE',
    },
  });

  await prisma.quotation.upsert({
    where: { id: '00000000-0000-4000-b000-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-4000-b000-000000000004',
      leadId: skylineLead.id,
      status: 'CONVERTED',
      projectId: demoProject.id,
      notes: 'Converted to project on approval.',
      totalAmount: 3500000.0,
      items: {
        create: [
          {
            itemName: 'Civil Engineering Earthworks & Leveling',
            quantity: 1,
            unitPrice: 3500000.0,
            amount: 3500000.0,
          },
        ],
      },
    },
  });

  console.log('Sprint 7 Demo Data successfully seeded!');
}

if (require.main === module) {
  void seedQuotationDemo()
    .catch((err: unknown) => {
      console.error('Seed failed:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
