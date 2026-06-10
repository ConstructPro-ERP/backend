# ConstructPro Backend

![CI Status](https://img.shields.io/badge/CI-Passing-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-TBD-success)
<!-- ![Coverage](https://img.shields.io/badge/Coverage-80%25+-success) -->


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

| Software | Version |
|-----------|-----------|
| Node.js | 20+ |
| pnpm | Latest |
| Git | Latest |
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
npm install
```

---

## Environment Variable Configuration

Create a `.env` file in the project root.

Example:

```env
# Application
PORT=3000

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
npm start:dev
```

Default local URL:

```text
http://localhost:3000
```

---

## Building the Backend

Build the application:

```bash
npm build
```

---

## Running the Production Build

Start the compiled production application:

```bash
npm start:prod
```

---

## Code Quality Commands

### Lint

```bash
npm lint
```

### Format Check

```bash
npm format:check
```

### Dependency Security Scan

```bash
pm audit --audit-level=high
```

---

<!-- ## API Documentation

If Swagger is configured, API documentation can be accessed at:

```text
http://localhost:3000/api/docs
```

If Swagger is not currently enabled, this section should be updated once API documentation becomes available.

--- -->

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

| Repository | Purpose |
|------------|----------|
| frontend | Next.js frontend application |
| backend | NestJS backend API |
| infra | Infrastructure and CI/CD configuration |
| documents | SRS, SDS, ADRs, and project documentation |
| test | Integration and end-to-end testing |

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

---

## License

Developed as part of:

**SENG 34213 – System Development Project**  
**Bachelor of Science (Hons.) in Software Engineering**  
**University of Kelaniya**
