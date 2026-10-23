# ConstructPro Backend



## Overview

ConstructPro Backend is the centralized NestJS API application for the ConstructPro ERP system.

The backend is responsible for:

- Authentication and authorization
- Role-Based Access Control (RBAC)
- Lead and CRM management
- Quotation management
- Project management
- Invoice and payment processing
- Reporting services
- Document management
- External service integrations

This repository contains only the backend implementation and is intended for developers, reviewers, and maintainers working on the ConstructPro ERP platform.

---

## Repository Purpose

The purpose of this repository is to provide the server-side functionality required by ConstructPro.

The backend exposes REST APIs consumed by the frontend application and coordinates business workflows across the ERP platform.

---

## Technology Stack

### Frameworks

- NestJS
- TypeScript
- Node.js

### Database

- PostgreSQL
- Neon PostgreSQL

### Authentication & Security

- JWT Authentication
- Role-Based Access Control (RBAC)
- bcrypt Password Hashing

### Storage

- Cloudinary

### DevOps

- GitHub Actions
- Vercel

---

## Prerequisites

Before running the backend locally, ensure the following software is installed:

| Software   | Version                |
| ---------- | ---------------------- |
| Node.js    | 22+                    |
| npm        | Latest                 |
| Git        | Latest                 |
| PostgreSQL | 16+ (or Neon Database) |

### Verify Installation

```bash
node -v
npm -v
git --version
```

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd backend
```

Install dependencies:

```bash
npm ci
```

---

## Environment Variable Configuration

Create a `.env` file in the project root.

Example:

```env
# Application
PORT=4000

# Database
DATABASE_URL=postgresql://username:password@host/database

# JWT
JWT_SECRET=replace-with-secure-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Frontend
FRONTEND_URL=http://localhost:3000

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

> Never commit `.env` files to source control.

---

## Database Configuration

ConstructPro uses PostgreSQL hosted on Neon.

Configure the database connection using the `DATABASE_URL` environment variable.

Example:

```env
DATABASE_URL=postgresql://username:password@host/database
```

---

## Running the Backend

Start the development server:

```bash
npm run dev:api-gateway
```

Default local URL:

```text
http://localhost:4000
```

---

## Building the Backend

Build the application:

```bash
npm run build
```

---

## Running the Production Build

Start the compiled production application:

```bash
npm run start:prod
```

---

## Code Quality Commands

### Lint

```bash
npm run lint
```

### Format Check

```bash
npm run format:check
```

### Dependency Security Scan

```bash
npm audit --audit-level=high
```

---

## API Documentation

With the gateway on port 4000, Swagger is available at
[http://localhost:4000/api/docs](http://localhost:4000/api/docs).
The frontend API base is `http://localhost:4000/api`.

## Contribution workflow

### Main Branches

- `main`
- `develop`

### Feature Branches

```text
feature/<ticket-id>-<slug>
```

Example:

```text
feature/54-user-authentication
```

### Bug Fix Branches

```text
fix/<ticket-id>-<slug>
```

### Pull Requests

- Open pull requests against `develop`
- Ensure CI checks pass
- Complete peer review before merging
- Do not commit directly to `main`

---

## Related Repositories

| Repository | Purpose                                   |
| ---------- | ----------------------------------------- |
| frontend   | Next.js frontend application              |
| backend    | NestJS backend API                        |
| infra      | Infrastructure and CI/CD configuration    |
| documents  | SRS, SDS, ADRs, and project documentation |
| test       | Integration and end-to-end testing        |

---

## CI/CD

GitHub Actions is used to automate:

- Lint checks
- Build verification
- Security scanning
- Deployment validation

All pull requests must pass CI before merging.

---

## Additional Notes

This README is intended to support developer onboarding, repository maintenance, and project review activities.

Feature implementation details, API specifications, database schema documentation, and testing documentation are maintained separately within project documentation repositories.

## Finance, analytics and AI verification

Run `npm run test:finance-quality` for deterministic unit tests and business-service coverage,
`npm run test:quality-routes` for HTTP validation and authorization tests, and
`npm run test:finance-workflow` for persisted workflows against an isolated,
migrated database configured through `DATABASE_URL_TEST`.

Run `npm run test:quality:typecheck` and `npm run test:quality:lint` for the affected
test scope. Results, coverage boundaries, environment prerequisites, and open
verification blockers are recorded in [the finance, analytics and AI verification register](docs/testing/finance-analytics-ai-verification.md).

---

## License

Developed as part of:

**SENG 34213 – System Development Project**  
**Bachelor of Science (Hons.) in Software Engineering**  
**University of Kelaniya**

## Multi-service setup

This is a NestJS multi-application repository. The gateway does not start its
upstream services. Run each required `dev:<service>` command in a separate
terminal from the repository root.

Copy `.env.example` to `.env` only if no local file exists (PowerShell:
`Copy-Item .env.example .env`), then replace placeholders. Set `PORT=4000` for the
gateway to avoid the frontend's port 3000. The gateway reads `PORT`, not
`API_GATEWAY_PORT`. Set `FRONTEND_URL=http://localhost:3000` for local redirects.

| Command | Local port to configure |
| --- | --- |
| `npm run dev:api-gateway` | 4000 |
| `npm run dev:auth-service` | 3333 |
| `npm run dev:user-service` | 3334 |
| `npm run dev:project-service` | 3003 |
| `npm run dev:task-service` | 3004 |
| `npm run dev:payment-service` | 3005 |
| `npm run dev:document-service` | 3006 |
| `npm run dev:quotation-service` | 4009 |
| `npm run dev:invoice-service` | 4010 |
| `npm run dev:analytics-service` | 4011 |
| `npm run dev:ai-service` | 4012 |
| `npm run dev:calendar-service` | 4013 |
| `npm run dev:lead-service` | 4020 |
| `npm run dev:client-service` | 4021 |

Match `<SERVICE>_URL` values to the corresponding service listeners. Add missing
lead, client, and calendar variables as needed. Explicitly set
`CALENDAR_SERVICE_PORT=4013`: calendar falls back to the shared `PORT` otherwise.
The calendar source directory is spelled `apps/calender-service`.

Runtime database access uses `DATABASE_URL` with the Neon adapter. Prisma CLI
configuration uses `DIRECT_URL_TEST` in preference to `DIRECT_URL`; check the
target before applying schema changes. Configure `JWT_REFRESH_SECRET` as well as
`JWT_SECRET`. Document uploads require the Cloudinary variables above.

```bash
npx prisma generate
```

Client generation does not provision tables or seed accounts. Follow the
[Prisma workflow](docs/prisma-workflow.md) and
[migration guide](docs/data-layer/migration-guide.md) to initialize a development
database. See [Cloudinary setup](docs/cloudinary-setup-guide.md) for storage.

`npm run build:all` compiles the multi-application tree. Then use
`npm run start:prod` for the gateway and `start:<service>` for domain services.
`npm start` runs `dist/server.js` with `DEPLOY_APP` selecting the application.
`npm run vercel-build` generates Prisma and compiles all applications.
The current Docker Compose file includes only gateway, auth, and quotation
services, with separate port mappings; it is not the full ERP stack.

## Test commands and source layout

| Command | Purpose |
| --- | --- |
| `npm run test:unit` | Dedicated Jest unit suite |
| `npm run test:e2e` | Backend end-to-end suite |
| `npm run test:quotation-quality` | Quotation tests with coverage |
| `npm run test:coverage` | Unit/E2E coverage and merged report |
| `npm run test:cloudinary-live` | Live Cloudinary integration tests |

Database suites require an isolated test database. See
[database test setup](docs/data-layer/database-tests.md) before running them.
`npm run test:db:reset` resets test data. `npm run lint` also modifies files
because its ESLint invocation includes `--fix`.

Services live in `apps/`, shared code in `libs/` and `shared/`, database schema
and seeds in `prisma/`, and tests in `test/`. See
[backend architecture](docs/backend-architecture.md) for service boundaries.

[Backend CI](.github/workflows/ci.yml) runs a quotation quality job using Node.js
24 and delegates broader checks to
`ConstructPro-ERP/infra/.github/workflows/backend-ci.yml@v2.0.0`.
