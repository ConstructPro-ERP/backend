# ConstructPro ERP — Backend Architecture

**Version:** 1.0  
**Stack:** NestJS 11 · Prisma v5 · PostgreSQL 18 (NeonDB serverless) · TypeScript  
**Pattern:** Microservices over TCP · Shared library monorepo  

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack & Versions](#2-tech-stack--versions)
3. [Environment Variables](#3-environment-variables)
4. [Database Layer](#4-database-layer)
   - [4.1 Neon Connection Setup](#41-neon-connection-setup)
   - [4.2 Migration History](#42-migration-history)
   - [4.3 Full Schema Summary](#43-full-schema-summary)
5. [Shared Libraries](#5-shared-libraries)
   - [5.1 libs/database](#51-libsdatabase)
   - [5.2 libs/config](#52-libsconfig)
   - [5.3 libs/common](#53-libscommon)
   - [5.4 libs/contracts](#54-libscontracts)
   - [5.5 libs/auth](#55-libsauth)
6. [Microservices](#6-microservices)
7. [Getting Started](#7-getting-started)
8. [Migration Commands](#8-migration-commands)

---

## 1. Project Structure

```
backend/
├── apps/
│   ├── api-gateway/          # HTTP entry point (port 3000)
│   ├── auth-service/         # JWT auth, token management (port 3001)
│   ├── user-service/         # User CRUD, role management (port 3002)
│   ├── project-service/      # Projects, milestones (port 3003)
│   ├── task-service/         # Tasks, assignments (port 3004)
│   ├── payment-service/      # Invoices, payments (port 3005)
│   ├── contractor-service/   # Contractor registry (port 3006)
│   ├── material-service/     # Materials, suppliers (port 3007)
│   └── notification-service/ # Email/SMS notifications (port 3008)
│
├── libs/
│   ├── database/             # PrismaService, DatabaseModule, singleton client
│   ├── config/               # Joi env validation, typed configuration factory
│   ├── common/               # Enums, interfaces, decorators, filters, interceptors
│   ├── contracts/            # Shared message patterns + payload interfaces
│   ├── auth/                 # PasswordService (bcrypt), JwtTokenService
│   └── logger/               # AppLoggerService
│
├── prisma/
│   ├── schema.prisma         # Full 17-model schema (3 migrations)
│   └── migrations/           # SQL migration history
│
└── docs/
    ├── database-model-review.md   # ER diagram analysis from SDS
    └── backend-architecture.md    # This file
```

---

## 2. Tech Stack & Versions

| Dependency | Version | Purpose |
|---|---|---|
| `@nestjs/core` | ^11 | NestJS framework |
| `@nestjs/microservices` | ^11 | TCP transport between services |
| `@nestjs/jwt` | ^11 | JWT signing / verification |
| `@nestjs/passport` | ^11 | Strategy-based auth guards |
| `@nestjs/config` | ^4 | Typed env configuration |
| `prisma` | 5.22.0 | ORM & migration runner |
| `@prisma/client` | 5.22.0 | Generated type-safe query client |
| `@prisma/adapter-neon` | 5.22.0 | Neon serverless driver adapter |
| `@neondatabase/serverless` | latest | HTTP driver for Neon Postgres |
| `ws` | latest | WebSocket constructor for Neon Pool |
| `bcrypt` | latest | Password hashing (12 salt rounds) |
| `class-validator` | latest | DTO validation decorators |
| `class-transformer` | latest | DTO transformation (plainToInstance) |
| `joi` | latest | Environment variable schema validation |
| `passport-jwt` | latest | JWT extraction & verification strategy |

---

## 3. Environment Variables

Copy `.env.example` to `.env` and fill in all values.

```dotenv
# ── Database ─────────────────────────────────────────────────────────────────
# Application URL — used by NestJS via @neondatabase/serverless HTTP adapter
DATABASE_URL=postgresql://user:pass@ep-xxx.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Direct URL — used by Prisma CLI (migrate dev, studio) — needs TCP port 5432
# Get from: Neon Console → Connection details → "Connection pooler" tab
DIRECT_URL=postgresql://user:pass@ep-xxx-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true

# ── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET=<minimum 32 characters, random>
JWT_EXPIRY=15m
JWT_REFRESH_SECRET=<minimum 32 characters, different from JWT_SECRET>
JWT_REFRESH_EXPIRY=7d

# ── Service Ports ─────────────────────────────────────────────────────────────
API_GATEWAY_PORT=3000
AUTH_SERVICE_PORT=3001
USER_SERVICE_PORT=3002
PROJECT_SERVICE_PORT=3003
TASK_SERVICE_PORT=3004
PAYMENT_SERVICE_PORT=3005
CONTRACTOR_SERVICE_PORT=3006
MATERIAL_SERVICE_PORT=3007
NOTIFICATION_SERVICE_PORT=3008

# ── Testing (fill in Week 4) ──────────────────────────────────────────────────
DATABASE_URL_TEST=
NODE_ENV=development
```

> **Why two database URLs?**  
> `DATABASE_URL` routes through Neon's HTTP proxy — no raw TCP needed, ideal for serverless.  
> `DIRECT_URL` routes through Neon's PgBouncer pooler — speaks the PostgreSQL wire protocol, required by Prisma CLI binaries (`migrate dev`, `studio`).

---

## 4. Database Layer

### 4.1 Neon Connection Setup

Prisma v5 with the `driverAdapters` preview feature is used so the application never opens a TCP connection to Postgres — it goes through Neon's HTTP endpoint instead.

```
PrismaService
  └─ new PrismaNeon(new Pool({ connectionString: DATABASE_URL }))
       └─ @neondatabase/serverless  →  Neon HTTP API  →  PostgreSQL 18
```

**`libs/database/src/prisma.service.ts`** — NestJS injectable service:
- Extends `PrismaClient` with the Neon adapter injected via `super({ adapter })`
- `onModuleInit` / `onModuleDestroy` manage connection lifecycle
- Pool is closed cleanly on shutdown to avoid dangling WebSocket connections

**`libs/database/src/prisma-client.ts`** — singleton for scripts / seeding:
- Uses `globalThis` caching to prevent multiple clients in dev hot-reload

### 4.2 Migration History

| # | Name | Models added |
|---|------|-------------|
| 1 | `add-auth-models` | `Role`, `User`, `RefreshToken`, `AuditLog` |
| 2 | `add-crm-finance-models` | `Lead`, `Customer`, `Quotation`, `QuotationItem` |
| 3 | `add-document-analytics-models` | `Project`, `Milestone`, `Task`, `Expense`, `Invoice`, `Payment`, `DocumentCategory`, `Document`, `AnalyticsReport` |

Migration 3 was deferred until after Migration 2 because `Invoice` and `AnalyticsReport` carry a non-nullable FK to `Project`. All three migrations must be applied in order.

### 4.3 Full Schema Summary

**17 tables · 8 enums · all UUIDs · camelCase fields · audit timestamps on every row**

```
Auth domain
  Role ──< User ──< RefreshToken
                └─< AuditLog

CRM domain
  User ──< Lead ──1:1── Customer ──< Quotation ──< QuotationItem
                                              └──1:1── Project

Operations domain
  Project ──< Milestone ──< Task
         ──< Task (direct, milestone optional)
         ──< Expense

Finance domain
  Customer ──< Invoice ──< Payment
  Project  ──< Invoice

Documents domain
  Project ──< Document ──> DocumentCategory
  User    ──< Document (uploader)

Analytics domain
  Project ──< AnalyticsReport
```

**Enums**

| Enum | Values |
|------|--------|
| `UserStatus` | `ACTIVE`, `INACTIVE` |
| `LeadStatus` | `NEW`, `CONTACTED`, `QUALIFIED`, `CONVERTED`, `LOST` |
| `QuotationStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED` |
| `ProjectStatus` | `PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED` |
| `MilestoneStatus` | `PENDING`, `IN_PROGRESS`, `COMPLETED` |
| `TaskStatus` | `TODO`, `IN_PROGRESS`, `COMPLETED`, `BLOCKED` |
| `InvoiceStatus` | `DRAFT`, `SENT`, `PAID`, `OVERDUE`, `CANCELLED` |
| `PaymentMethod` | `CASH`, `BANK_TRANSFER`, `CHEQUE`, `ONLINE` |

---

## 5. Shared Libraries

All shared code lives under `libs/`. Each library is imported by the apps that need it. None of the libraries start their own HTTP or TCP server.

### 5.1 libs/database

| File | Purpose |
|------|---------|
| `prisma.service.ts` | NestJS injectable Prisma client using Neon adapter |
| `prisma-client.ts` | Singleton for use outside NestJS DI (scripts, seeds) |
| `database.module.ts` | `@Global()` NestJS module — import once in root, available everywhere |
| `index.ts` | Barrel export |

**Usage in any service:**

```typescript
import { DatabaseModule } from '@database';
// or inject directly:
constructor(private readonly prisma: PrismaService) {}
```

### 5.2 libs/config

| File | Purpose |
|------|---------|
| `env.validation.ts` | Joi schema — validates all required env vars at startup |
| `configuration.ts` | Factory that maps `process.env` to a typed config object |
| `config.module.ts` | Wraps `@nestjs/config` `ConfigModule.forRoot()` — import in AppModule |

**Access typed config anywhere:**

```typescript
constructor(private readonly config: ConfigService) {}
const secret = this.config.get<string>('jwt.secret');
const port   = this.config.get<number>('services.auth.port');
```

### 5.3 libs/common

**Enums** (mirror Prisma enums, usable without importing Prisma):

| File | Exports |
|------|---------|
| `enums/user-role.enum.ts` | `UserRole` |
| `enums/project-status.enum.ts` | `ProjectStatus` |
| `enums/task-status.enum.ts` | `TaskStatus` |
| `enums/payment-status.enum.ts` | `PaymentMethod`, `InvoiceStatus` |

**Interfaces:**

| File | Exports |
|------|---------|
| `interfaces/jwt-payload.interface.ts` | `JwtPayload` — `{ sub, email, roleId, roleName }` |
| `interfaces/service-response.interface.ts` | `ServiceResponse<T>` — standard microservice reply envelope |
| `interfaces/pagination.interface.ts` | `PaginationQuery`, `PaginatedResult<T>` |

**Decorators:**

| Decorator | Usage |
|-----------|-------|
| `@CurrentUser()` | Param decorator — extracts `JwtPayload` from request |
| `@Public()` | Marks a route as unauthenticated |
| `@Roles(...roles)` | Marks required roles for RBAC guard |

**Exceptions:**

| Class | HTTP Status |
|-------|-------------|
| `AppException` | 500 (base, configurable) |
| `ValidationException` | 422 Unprocessable Entity |

**Filters & Interceptors:**

| Class | Purpose |
|-------|---------|
| `AllRpcExceptionFilter` | Catches `RpcException` from microservice calls |
| `LoggingInterceptor` | Logs method + URL + response time |
| `TransformResponseInterceptor` | Wraps all responses: `{ success, data, timestamp }` |

### 5.4 libs/contracts

The single source of truth for inter-service communication. Both the API Gateway and the downstream service import from here — no string magic.

**Message patterns** — one constant object per service:

```typescript
import { AUTH_PATTERNS } from '@contracts';

// Gateway → Auth Service
this.client.send(AUTH_PATTERNS.LOGIN, payload)

// Pattern values:
// AUTH_PATTERNS.REGISTER        → 'auth.register'
// AUTH_PATTERNS.LOGIN           → 'auth.login'
// AUTH_PATTERNS.LOGOUT          → 'auth.logout'
// AUTH_PATTERNS.REFRESH_TOKEN   → 'auth.refresh_token'
// AUTH_PATTERNS.VALIDATE_TOKEN  → 'auth.validate_token'
// AUTH_PATTERNS.REQUEST_RESET   → 'auth.request_reset'
// AUTH_PATTERNS.CONFIRM_RESET   → 'auth.confirm_reset'
```

Similar constant objects exist for: `USER_PATTERNS`, `PROJECT_PATTERNS`, `TASK_PATTERNS`, `PAYMENT_PATTERNS`, `CONTRACTOR_PATTERNS`, `MATERIAL_PATTERNS`, `NOTIFICATION_PATTERNS`.

**Payload interfaces** — typed message bodies, one file per service:

```typescript
import type { LoginPayload, AuthTokensPayload } from '@contracts';
```

### 5.5 libs/auth

| File | Purpose |
|------|---------|
| `password.service.ts` | `hash(plain)` / `verify(plain, hashed)` — bcrypt, 12 salt rounds |
| `jwt.service.ts` | `signAccess(payload)`, `signRefresh(payload)`, `verifyAccess(token)`, `verifyRefresh(token)` |
| `auth-shared.module.ts` | NestJS module — import in `AuthService` module |

Both tokens use separate secrets from `ConfigService`:
- Access token: `JWT_SECRET` / `JWT_EXPIRY` (default 15 min)
- Refresh token: `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRY` (default 7 days)

---

## 6. Microservices

All services communicate over **NestJS TCP transport**. The API Gateway is the only service that exposes HTTP. Every other service is a pure TCP microservice.

```
Client (browser / mobile)
    │  HTTP
    ▼
api-gateway :3000
    │  NestJS TCP
    ├──► auth-service        :3001
    ├──► user-service        :3002
    ├──► project-service     :3003
    ├──► task-service        :3004
    ├──► payment-service     :3005
    ├──► contractor-service  :3006
    ├──► material-service    :3007
    └──► notification-service :3008
```

Each microservice:
1. Imports `DatabaseModule` from `libs/database`
2. Imports `AppConfigModule` from `libs/config`
3. Imports `AuthSharedModule` from `libs/auth` (if it handles authenticated requests)
4. Listens on its own TCP port
5. Responds to message patterns defined in `libs/contracts`

---

## 7. Getting Started

### Prerequisites
- Node.js ≥ 20
- A Neon project (get connection strings from the Neon Console)

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env — fill in DATABASE_URL, DIRECT_URL, JWT_SECRET, JWT_REFRESH_SECRET
```

### Apply database schema

```bash
# Run all three migrations in order
npx prisma migrate dev --name add-auth-models
npx prisma migrate dev --name add-crm-finance-models
npx prisma migrate dev --name add-document-analytics-models

# Generate the Prisma client
npx prisma generate

# Inspect the database visually
npx prisma studio
```

> `migrate dev` and `studio` use `DIRECT_URL` (PgBouncer TCP). The application itself uses `DATABASE_URL` (Neon HTTP adapter).

### Start the API Gateway (development)

```bash
npm run start:dev:api-gateway
```

---

## 8. Migration Commands

```bash
# Apply a specific migration
npx prisma migrate dev --name <migration-name>

# Regenerate the Prisma client after schema changes
npx prisma generate

# Inspect data in the browser
npx prisma studio

# Check migration status
npx prisma migrate status

# Reset the database (DEV ONLY — destroys all data)
npx prisma migrate reset

# Validate schema without connecting
npx prisma validate
```

---

*End of document*
