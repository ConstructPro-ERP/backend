# ConstructPro Backend

[![CI](https://github.com/ConstructPro-ERP/backend/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/ConstructPro-ERP/backend/actions/workflows/ci.yml) [![Backend unit line coverage](https://img.shields.io/badge/unit%20line%20coverage-76.4%25-yellow)](https://github.com/ConstructPro-ERP/documents/blob/develop/testing/coverage-sprint8.pdf)

**Live application:** https://construct-pro-teal.vercel.app/  
**API documentation (Swagger):** https://construct-pro-api-gateway.vercel.app/api/docs  
**Project organization:** https://github.com/ConstructPro-ERP  
**Project board:** https://github.com/orgs/ConstructPro-ERP/projects/2

## Overview

ConstructPro Backend provides the NestJS API gateway and independent domain applications for ConstructPro ERP, a cloud-based construction business management system developed for **Ishara Homes Pvt. Ltd.** The system supports the lead-to-cash workflow: leads, quotations, construction projects, milestones, tasks, expenses, invoices, payments, project documents, analytics, calendar integrations and AI-based project risk prediction.

The backend is built with **NestJS v11** and consists of **14 independently deployable applications: 1 API Gateway and 13 domain services** in a single monorepo. The deployment selects an application using `DEPLOY_APP` in `server.ts`. All applications share the Prisma 7 data model on Neon PostgreSQL.

### Deployed backend applications

| Application       | Responsibility                                                     | Local port |
| ----------------- | ------------------------------------------------------------------ | ---------: |
| API Gateway       | Public REST interface, authentication/role checks and forwarding   |       4000 |
| Auth Service      | Password and Google OAuth login, refresh tokens and sessions       |       3333 |
| User Service      | Accounts, roles and user management                                |       3334 |
| Project Service   | Project lifecycle, milestones and expenses                         |       3003 |
| Task Service      | Project tasks and assignments                                      |       3004 |
| Payment Service   | Payments and invoice balance updates                               |       3005 |
| Document Service  | Project file metadata, signed uploads/downloads and reconciliation |       3006 |
| Quotation Service | Quotation workflow, PDFs and project conversion                    |       4009 |
| Invoice Service   | Invoices, PDF generation and invoice reporting                     |       4010 |
| Analytics Service | Business KPIs and reporting                                        |       4011 |
| AI Service        | Project risk predictions and RAG with rule-based fallback          |       4012 |
| Calendar Service  | Individual Google Calendar connections and events                  |       4013 |
| Lead Service      | Lead records, CRM workflow and searches                            |       4020 |
| Client Service    | Clients and ownership-filtered client portal reads                 |       4021 |

**Scope:** Client portal access covers owned projects, milestones, quotations and documents; client-facing invoice/payment browsing is not yet available. The AI service uses direct **OpenRouter** calls with PostgreSQL/pgvector retrieval and a rule-based fallback, not LangChain.

## Demonstration Accounts

Evaluators can open the **live application landing page** above and sign in using the following role-specific accounts.

| Role               | Email                       | Password             |
| ------------------ | --------------------------- | -------------------- |
| Administrator      | `admin.demo@example.com`    | `DemoAdministrator`  |
| Sales Manager      | `sales.demo@example.com`    | `DemoSalesManager`   |
| Project Manager    | `projects.demo@example.com` | `DemoProjectManager` |
| Accountant         | `accounts.demo@example.com` | `DemoAccountant`     |
| Client Portal User | `client.demo@example.com`   | `DemoClient`         |

Available modules and operations depend on each account's assigned role and permissions.

## Repository Purpose

The repository implements the backend REST APIs and coordinates the ERP's business workflows. The API gateway is the public entry point, while individual applications handle domain-specific operations. Persistent data is accessed with Prisma through a shared Neon PostgreSQL database. The frontend application is maintained separately.

## Technology Stack

| Area              | Technology                                                           |
| ----------------- | -------------------------------------------------------------------- |
| Framework         | NestJS 11, Node.js 22+ (CI uses Node.js 24), TypeScript              |
| Database          | Neon PostgreSQL, Prisma 7 with `@prisma/adapter-neon`, pgvector      |
| Authentication    | JWT, Google OAuth 2.0, bcrypt, role-based access control             |
| Object storage    | Cloudinary authenticated assets and signed upload/download flows     |
| API documentation | OpenAPI / `@nestjs/swagger`                                          |
| AI                | OpenRouter and retrieval from pgvector with safe rule-based fallback |
| Calendar          | Google Calendar API                                                  |
| Tests             | Jest unit, HTTP integration and database tests                       |
| CI/CD and hosting | Reusable GitHub Actions workflows and Vercel                         |

## Prerequisites

- Node.js **22 or newer** and npm; CI uses Node.js 24.
- Git.
- Access to a Neon PostgreSQL database suitable for development and a **separate** database for integration tests.
- Appropriate credentials for optional Cloudinary, Google Calendar and AI integrations.

Verify installation:

```bash
node -v
npm -v
git --version
```

## Installation

```bash
git clone https://github.com/ConstructPro-ERP/backend.git
cd backend
npm ci
```

## Environment Variable Configuration

Copy the provided `.env.example` to `.env`, then update the required settings.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Linux Bash:**

```bash
cp .env.example .env
```

Essential settings include:

```env
# Runtime database connection
DATABASE_URL=postgresql://username:password@host/database?sslmode=require

# Prisma CLI / explicit database targets
DIRECT_URL_TEST=postgresql://username:password@host/test_database?sslmode=require

JWT_SECRET=replace-with-a-long-random-secret
JWT_REFRESH_SECRET=replace-with-a-long-random-refresh-secret

# The gateway reads PORT (not API_GATEWAY_PORT)
PORT=4000
FRONTEND_URL=http://localhost:3000
DEPLOY_APP=api-gateway

# Domain service listeners and destinations; see the service table below
AUTH_SERVICE_PORT=3333
AUTH_SERVICE_URL=http://localhost:3333
CALENDAR_SERVICE_PORT=4013
CALENDAR_SERVICE_URL=http://localhost:4013
LEAD_SERVICE_PORT=4020
LEAD_SERVICE_URL=http://localhost:4020
CLIENT_SERVICE_PORT=4021
CLIENT_SERVICE_URL=http://localhost:4021

CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

The checked-in example defines most service URLs and ports but does not contain every newer lead, client and calendar variable. Add missing variables as required by the services you run. In particular, the Calendar Service may otherwise inherit the shared `PORT`. The Calendar Service source directory is spelled `apps/calender-service`.

The runtime uses `DATABASE_URL`; Prisma CLI configuration prefers `DIRECT_URL_TEST` over `DIRECT_URL`. Check the target before applying migrations or resetting test data.

## Database Configuration

ConstructPro uses PostgreSQL on Neon with a versioned Prisma schema. Generate the Prisma client:

```bash
npx prisma generate
```

Generating the client does not initialize tables. For an existing development database, apply committed migrations with:

```bash
npx prisma migrate deploy
```

For schema changes, follow the project's migration workflow rather than automatically modifying a shared database: [Prisma workflow](docs/prisma-workflow.md), [migration guide](docs/data-layer/migration-guide.md), and [database test setup](docs/data-layer/database-tests.md).

The project includes seed commands and dataset tooling; confirm their behavior and target database before running them.

## Running the Backend

The API gateway does **not** start its upstream services. Run each needed application in a separate terminal from the backend root.

```bash
npm run dev:api-gateway
```

The gateway is then available at `http://localhost:4000` when `PORT=4000` is configured. Run its upstream applications separately:

| Command                         | Port |
| ------------------------------- | ---: |
| `npm run dev:auth-service`      | 3333 |
| `npm run dev:user-service`      | 3334 |
| `npm run dev:project-service`   | 3003 |
| `npm run dev:task-service`      | 3004 |
| `npm run dev:payment-service`   | 3005 |
| `npm run dev:document-service`  | 3006 |
| `npm run dev:quotation-service` | 4009 |
| `npm run dev:invoice-service`   | 4010 |
| `npm run dev:analytics-service` | 4011 |
| `npm run dev:ai-service`        | 4012 |
| `npm run dev:calendar-service`  | 4013 |
| `npm run dev:lead-service`      | 4020 |
| `npm run dev:client-service`    | 4021 |

Set the matching `<SERVICE>_URL` for every service the gateway must reach. You do not have to start all services when developing one isolated module, but its dependencies must be running.

## Building the Backend

Build the API Gateway NestJS application:

```bash
npm run build
```

Build all deployable applications:

```bash
npm run build:all
```

The Vercel build runs `npm run vercel-build`, which generates Prisma and compiles the application tree.

## Running the Production Build

To start the compiled API Gateway locally:

```bash
npm run start:api-gateway
```

To start a compiled domain service, use its corresponding `start:<service>` command. For example:

```bash
npm run start:auth-service
npm run start:project-service
```

The `npm run start` command executes `dist/server.js`, which serves as the shared entry point for Vercel deployments. It uses the `DEPLOY_APP` environment variable to select which backend application to bootstrap.

For local development and testing, use the individual `start:<service>` commands to run the required compiled applications.

## Code Quality Commands

| Command                                            | Purpose                                          |
| -------------------------------------------------- | ------------------------------------------------ |
| `npm run format:check`                             | Check formatting                                 |
| `npm run lint`                                     | Run ESLint **with `--fix`** (modifies files)     |
| `npx eslint "{src,apps,libs,test}/**/*.ts" "*.ts"` | Lint check without changing files, as used in CI |
| `npm run build:all`                                | Compile all backend applications                 |
| `npm audit --audit-level=high`                     | Audit the dependency tree                        |

## API Documentation

With the gateway running on port 4000, Swagger is at [http://localhost:4000/api/docs](http://localhost:4000/api/docs). The frontend API base is `http://localhost:4000/api`. Public backend routes are grouped under the `/api` prefix.

## Test Commands and Coverage

| Command                          | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| `npm run test:unit`              | Dedicated Jest unit suite                   |
| `npm run test:e2e`               | Backend HTTP and database integration suite |
| `npm run test:quotation-quality` | Quotation tests with targeted coverage      |
| `npm run test:coverage:unit`     | Unit coverage report                        |
| `npm run test:coverage:e2e`      | Backend integration coverage                |
| `npm run test:coverage:merge`    | Merge coverage results                      |
| `npm run test:coverage`          | Generate unit, E2E and merged coverage      |
| `npm run test:cloudinary-live`   | Live Cloudinary integration tests           |
| `npm run test:db:reset`          | Reset the **test** database                 |

### Recorded test results (Final Development Report, October 2026)

| Evidence                        | Reported result                                  |
| ------------------------------- | ------------------------------------------------ |
| Backend unit tests              | **1,535 passed**, 84 suites                      |
| Backend integration tests       | **546 passed, 2 skipped**, 27 suites (548 total) |
| Backend **unit** line coverage  | **76.4%**                                        |
| Backend unit statement coverage | 76.3%                                            |
| Backend unit branch coverage    | 71.5%                                            |
| Backend unit function coverage  | 71.6%                                            |

These are recorded measurements, **not a claim of 76.4% combined coverage** or a live measurement on every CI run. Important unit line coverage figures by application include quotation 99.7%, documents 93.4%, analytics 93.0%, AI 92.7%, invoices 92.0%, client 91.2%, tasks 89.6%, payments 85.9%, projects 83.2%, users 67.3%, calendar 60.8%, gateway 53.1%, leads 43.2%, and auth 35.7%.

Source: [Sprint 8 coverage evidence](https://github.com/ConstructPro-ERP/documents/blob/develop/testing/coverage-sprint8.pdf) and the Final Development Report, Chapter 5. Backend database suites require a separate Neon test database. Cross-repository browser tests live in the [tests repository](https://github.com/ConstructPro-ERP/tests).

### Finance, analytics and AI verification

Run `npm run test:finance-quality` for deterministic business-service tests, `npm run test:quality-routes` for HTTP validation and authorization checks, and `npm run test:finance-workflow` for persisted workflow tests using an isolated database configured via `DATABASE_URL_TEST`.

For the affected test scope, use `npm run test:quality:typecheck` and `npm run test:quality:lint`. Results, coverage boundaries and verification prerequisites are detailed in the [finance, analytics and AI verification register](docs/testing/finance-analytics-ai-verification.md).

## CI/CD

The [backend caller workflow](.github/workflows/ci.yml) invokes `ConstructPro-ERP/infra/.github/workflows/backend-ci.yml@v3` and runs with a shared test-database concurrency group (`backend-neon-test-database`, non-cancelling).

The reusable backend workflow uses Node.js 24 and runs `npm ci`, formatting verification, Prisma generation, non-mutating lint, unit tests, integration tests, `npm run build:all` and a blocking `npm audit --audit-level=high`. On pushes, an additional Cloudinary integration job runs after backend validation.

The currently invoked workflow runs unit tests **without** a coverage flag; coverage artifacts/thresholds are not automatically enforced by that CI job. Coverage-publishing instructions exist in the infrastructure repository but are not active in the workflow. Deployment is performed through Vercel, with `server.ts` choosing the service based on `DEPLOY_APP`.

## Contribution Workflow

- `develop` is the primary development integration branch; `main` is also maintained.
- Use `feature/<ticket-id>-<slug>` and `fix/<ticket-id>-<slug>` branches.
- Open pull requests against `develop`, require passing checks and peer review, and avoid direct changes to `main`.

## Source Layout and Developer References

| Path               | Responsibility                                                 |
| ------------------ | -------------------------------------------------------------- |
| `apps/`            | API gateway and service application entry points               |
| `libs/`, `shared/` | Shared authentication, configuration, errors and contracts     |
| `prisma/`          | Schema, migrations and seeding                                 |
| `test/`            | Unit, gateway and database integration suites                  |
| `docs/`            | Backend decisions, feature notes, Prisma and Cloudinary guides |

Further documentation: [backend architecture](docs/backend-architecture.md), [Cloudinary setup](docs/cloudinary-setup-guide.md), [Prisma workflow](docs/prisma-workflow.md), and [migration guide](docs/data-layer/migration-guide.md).

The checked-in Docker Compose setup covers only a subset of services; it is not required to run the complete multi-application stack locally.

## Related Repositories

| Repository                                                  | Purpose                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| [Frontend](https://github.com/ConstructPro-ERP/frontend)    | Next.js application and frontend tests                  |
| [Backend](https://github.com/ConstructPro-ERP/backend)      | NestJS gateway, domain services and database            |
| [Tests](https://github.com/ConstructPro-ERP/tests)          | Playwright API and browser E2E suites                   |
| [Infrastructure](https://github.com/ConstructPro-ERP/infra) | Shared GitHub Actions workflows and performance tooling |
| [Documents](https://github.com/ConstructPro-ERP/documents)  | Requirements, design and verification evidence          |

## Project Evidence

- [Software Requirements Specification](https://github.com/ConstructPro-ERP/documents/blob/develop/srs/srs-final.pdf)
- [Software Design Specification](https://github.com/ConstructPro-ERP/documents/blob/develop/sds/sds-final.pdf)
- [Test case register](https://github.com/ConstructPro-ERP/documents/blob/develop/testing/test-register.pdf)
- [Sprint 8 coverage report](https://github.com/ConstructPro-ERP/documents/blob/develop/testing/coverage-sprint8.pdf)
- [Performance results](https://github.com/ConstructPro-ERP/documents/blob/develop/testing/performance-report.pdf)

## Academic Project

Developed as part of **SENG 34213 – System Development Project**, Bachelor of Science (Hons.) in Software Engineering, University of Kelaniya.
