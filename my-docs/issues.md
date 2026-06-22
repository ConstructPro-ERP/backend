# Person 4 Sprint 6 Backend Issues

Source scope: ConstructPro Sprint 6 Backend Feature Development Plan  
Assignee: `@Rami2212`  
Repository: `backend`  
Sprint: Sprint 6 - Weeks 5 to 8

---

# [DDP-23] feat(finance): implement invoice CRUD and project invoice generation

Labels: epic:finance  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 5  
Estimate: 8 hours

## User Story

As a finance team member, I want to create and manage invoices for construction projects so that client billing can be tracked accurately inside the ConstructPro backend.

## Background / Context

- SRS Reference: FR-006 Invoice and Payment Tracking, NFR-11 Maintainability, NFR-12 Reliability
- SDS Reference: Backend Architecture, Finance Module, Database Design

The ConstructPro backend must support invoice creation for approved construction projects. Each invoice should be linked to a valid project and client so that payment status, outstanding balances, and finance summaries can be calculated later.

This issue is limited to invoice CRUD and project invoice generation only.

This issue does not include payment recording, finance reports, KPI dashboard APIs, AI prediction, frontend implementation, repository creation, epic creation, or deployment work.

## Acceptance Criteria

### AC1: Invoice Module Created

Given the backend repository already exists  
When the invoice feature is implemented  
Then an invoice module, controller, service, DTOs, and database model/entity should exist.

### AC2: Invoice Create API Implemented

Given an authenticated finance/admin user provides valid invoice details  
When the create invoice endpoint is called  
Then a new invoice should be created and linked to the correct project and client.

### AC3: Invoice List API Implemented

Given invoices exist in the system  
When an authenticated user requests the invoice list  
Then the API should return invoices with pagination, filtering, and sorting support.

### AC4: Invoice Detail API Implemented

Given a valid invoice ID is provided  
When the invoice detail endpoint is called  
Then the API should return invoice details, project information, client information, invoice total, paid amount, outstanding amount, and status.

### AC5: Invoice Update API Implemented

Given an invoice is still editable  
When valid update details are submitted  
Then the invoice should be updated without breaking project or client relationships.

### AC6: Invoice Cancel Logic Implemented

Given an invoice should no longer be active  
When the cancel endpoint is called  
Then the invoice should be marked as `CANCELLED`.

### AC7: Invoice Status Initialized Correctly

Given a new invoice is created  
When the invoice is saved  
Then the invoice status should be initialized as `DRAFT` or `ISSUED` according to the request.

## Scope Control

This issue does not include:

- Payment recording
- Payment status auto-update logic
- Invoice PDF generation
- Finance summary reports
- KPI dashboard APIs
- AI prediction logic
- Frontend UI implementation
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Use NestJS controller, service, DTO, and repository/data-access structure.
- Use the existing database ORM selected by the backend team.
- Use JWT authentication.
- Apply role-based guards for Admin, Management, and Finance users.
- Validate all request bodies using the agreed DTO/Zod validation approach.
- Invoice should be linked to existing project and client records.
- Suggested invoice statuses:
  - `DRAFT`
  - `ISSUED`
  - `PARTIALLY_PAID`
  - `PAID`
  - `OVERDUE`
  - `CANCELLED`
- Store `createdAt`, `updatedAt`, `createdBy`, and `updatedBy` where applicable.
- Do not expose confidential fields in API responses.

## Verification Requirements

- [ ] Invoice module exists
- [ ] Invoice controller exists
- [ ] Invoice service exists
- [ ] Invoice DTOs exist
- [ ] Invoice database model/entity exists
- [ ] Create invoice endpoint works
- [ ] List invoice endpoint works with pagination
- [ ] Invoice detail endpoint works
- [ ] Update invoice endpoint works
- [ ] Cancel invoice logic works
- [ ] Invoice is linked to project
- [ ] Invoice is linked to client
- [ ] Invalid project/client IDs are rejected
- [ ] Unauthorized users cannot manage invoices
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 8 hours

## Dependencies

Blocked by: Project and client records from Person 2 and Person 3

---

# [DDP-24] feat(finance): implement payment tracking and automatic invoice status updates

Labels: epic:finance  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 5  
Estimate: 7 hours

## User Story

As a finance team member, I want to record payments against invoices so that paid amounts, outstanding amounts, and invoice statuses are updated correctly.

## Background / Context

- SRS Reference: FR-006 Invoice and Payment Tracking, NFR-12 Reliability
- SDS Reference: Finance Module, Payment Tracking, Backend Database Design

ConstructPro must allow finance users to record payments for issued invoices. The backend should prevent invalid payments and automatically update the invoice status based on the total paid amount.

This issue is limited to payment tracking and invoice status updates only.

This issue does not include invoice CRUD creation, invoice PDF generation, KPI dashboard reports, AI prediction, frontend screens, deployment, repository creation, or epic creation.

## Acceptance Criteria

### AC1: Payment Module Created

Given the backend repository already exists  
When payment tracking is implemented  
Then a payment module, controller, service, DTOs, and database model/entity should exist.

### AC2: Payment Create API Implemented

Given an issued invoice exists  
When a finance/admin user records a valid payment  
Then the payment should be saved and linked to the correct invoice.

### AC3: Payment Validation Added

Given payment data is submitted  
When the payment amount is zero, negative, or greater than the outstanding balance  
Then the API should reject the request with a clear validation error.

### AC4: Invoice Paid Amount Updated

Given a payment is successfully recorded  
When the payment transaction completes  
Then the related invoice paid amount should be updated correctly.

### AC5: Outstanding Amount Updated

Given invoice total and paid amount exist  
When a payment is added  
Then the outstanding amount should be recalculated correctly.

### AC6: Invoice Status Updated Automatically

Given a payment is recorded  
When the invoice is partly or fully paid  
Then the invoice status should automatically change to `PARTIALLY_PAID` or `PAID`.

### AC7: Payment History API Implemented

Given an invoice has one or more payments  
When the payment history endpoint is called  
Then the API should return all payments related to that invoice.

## Scope Control

This issue does not include:

- Invoice CRUD implementation
- Invoice PDF generation
- Finance summary reports
- KPI dashboard APIs
- AI forecasting
- Frontend payment UI
- Repository creation
- Epic creation
- Deployment work

## Technical Notes

- Use a database transaction when recording a payment and updating invoice totals.
- Reject payments for cancelled invoices.
- Reject payments for fully paid invoices.
- Store payment reference number, payment date, payment method, amount, and notes if required.
- Payment status updates must be reliable and consistent.
- Use JWT authentication and role-based authorization.
- Use clear HTTP status codes for validation and business-rule errors.
- Add Swagger/OpenAPI examples for successful and failed payment requests.

## Verification Requirements

- [ ] Payment module exists
- [ ] Payment controller exists
- [ ] Payment service exists
- [ ] Payment DTOs exist
- [ ] Payment database model/entity exists
- [ ] Payment create endpoint works
- [ ] Payment history endpoint works
- [ ] Zero payments are rejected
- [ ] Negative payments are rejected
- [ ] Excessive payments are rejected
- [ ] Invoice paid amount updates correctly
- [ ] Invoice outstanding amount updates correctly
- [ ] Invoice status changes to `PARTIALLY_PAID`
- [ ] Invoice status changes to `PAID`
- [ ] Unauthorized users cannot record payments
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 7 hours

## Dependencies

Blocked by: DDP-23

---

# [DDP-25] feat(finance): implement finance summaries and outstanding balance reports

Labels: epic:finance  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 6  
Estimate: 7 hours

## User Story

As a finance team member, I want to view finance summaries for clients and projects so that I can understand revenue, expenses, paid amounts, and outstanding balances.

## Background / Context

- SRS Reference: FR-006 Invoice and Payment Tracking, FR-007 KPI Dashboard and Reporting APIs
- SDS Reference: Finance Module, Reporting Module, Backend Database Design

ConstructPro must provide backend finance summary APIs that calculate project revenue, payment totals, outstanding balances, expenses, and estimated profit. These summaries will later support dashboards and management reports.

This issue is limited to backend finance summary and outstanding-balance APIs only.

This issue does not include invoice CRUD, payment recording, invoice PDF generation, AI prediction, frontend dashboard screens, deployment, repository creation, or epic creation.

## Acceptance Criteria

### AC1: Finance Summary Service Created

Given invoice, payment, project, and expense data exist  
When the finance summary feature is implemented  
Then a dedicated finance/reporting service should calculate finance totals.

### AC2: Client Finance Summary API Implemented

Given a valid client ID is provided  
When the client finance summary endpoint is called  
Then the API should return total invoiced amount, total paid amount, and outstanding balance for that client.

### AC3: Project Finance Summary API Implemented

Given a valid project ID is provided  
When the project finance summary endpoint is called  
Then the API should return project revenue, paid amount, outstanding amount, project expenses, and estimated profit.

### AC4: Outstanding Invoice Report Implemented

Given one or more unpaid or partly paid invoices exist  
When the outstanding invoice report endpoint is called  
Then the API should return invoices with outstanding balances.

### AC5: Date Range Filtering Added

Given a start date and end date are provided  
When finance report endpoints are called  
Then the API should calculate summaries only for the selected date range.

### AC6: Role-Based Access Applied

Given a user without finance/reporting permission calls the API  
When the request is processed  
Then the request should be rejected.

## Scope Control

This issue does not include:

- Invoice CRUD implementation
- Payment recording implementation
- Invoice PDF generation
- KPI visual dashboard frontend
- AI forecasting
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Use aggregation queries through the selected ORM.
- Keep calculations inside a dedicated service layer.
- Apply pagination for list-style reports.
- Apply date range filtering for reports where needed.
- Return numeric values consistently.
- Avoid exposing internal database fields.
- Add Swagger/OpenAPI examples for each finance summary endpoint.
- Ensure calculations are based on stored invoice, payment, project, and expense data.

## Verification Requirements

- [ ] Finance summary service exists
- [ ] Client finance summary endpoint works
- [ ] Project finance summary endpoint works
- [ ] Outstanding invoice report endpoint works
- [ ] Date range filtering works
- [ ] Revenue total is calculated correctly
- [ ] Paid amount is calculated correctly
- [ ] Outstanding amount is calculated correctly
- [ ] Expense total is calculated correctly
- [ ] Estimated profit is calculated correctly
- [ ] Unauthorized users cannot access finance summaries
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 7 hours

## Dependencies

Blocked by: DDP-23, DDP-24, project expenses from Person 3

---

# [DDP-26] feat(finance): generate invoice numbers and invoice PDF documents

Labels: epic:finance  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 6  
Estimate: 6 hours

## User Story

As a finance team member, I want invoices to have official invoice numbers and downloadable PDF files so that client billing documents can be shared professionally.

## Background / Context

- SRS Reference: FR-006 Invoice and Payment Tracking, NFR-11 Maintainability
- SDS Reference: Finance Module, Document Generation, Backend Architecture

ConstructPro should generate invoice numbers and invoice PDF documents using stored invoice, client, project, and payment details. The generated PDF metadata should be stored so that invoices can be accessed later.

This issue is limited to invoice numbering and invoice PDF generation only.

This issue does not include invoice CRUD, payment recording, KPI dashboard APIs, AI prediction, frontend PDF preview screens, repository creation, epic creation, or deployment work.

## Acceptance Criteria

### AC1: Invoice Number Generation Implemented

Given a new invoice is issued  
When the invoice is finalized  
Then the backend should generate a unique invoice number.

### AC2: Invoice Number Format Applied

Given an invoice number is generated  
When it is stored  
Then it should follow the agreed ConstructPro invoice numbering format.

### AC3: Invoice PDF Generation Service Created

Given a valid invoice exists  
When the invoice PDF generation endpoint is called  
Then the backend should generate a PDF document for that invoice.

### AC4: PDF Content Includes Required Details

Given the invoice PDF is generated  
When the PDF is opened  
Then it should include client details, project details, invoice items/amounts, paid amount, outstanding amount, status, invoice number, and invoice date.

### AC5: PDF Metadata Stored

Given an invoice PDF is generated  
When the file is saved  
Then the backend should store the PDF URL/path, generated date, and related invoice ID.

### AC6: Invalid Invoice Requests Are Rejected

Given an invalid or missing invoice ID is provided  
When PDF generation is requested  
Then the API should reject the request with a clear error response.

## Scope Control

This issue does not include:

- Invoice CRUD implementation
- Payment recording
- Finance summary reports
- KPI dashboard APIs
- AI forecasting
- Frontend PDF rendering
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Use the PDF generation library already selected by the backend team.
- Use invoice, client, project, and payment data from the database.
- Store PDF metadata in the database.
- Store file URL/path according to the agreed backend storage approach.
- Avoid regenerating duplicate PDF files unless regeneration is explicitly requested.
- Apply role-based access controls.
- Add Swagger/OpenAPI documentation for PDF generation endpoints.

## Verification Requirements

- [ ] Invoice number generation works
- [ ] Invoice numbers are unique
- [ ] Invoice number format is consistent
- [ ] Invoice PDF generation endpoint works
- [ ] PDF includes client details
- [ ] PDF includes project details
- [ ] PDF includes invoice amount details
- [ ] PDF includes paid and outstanding amount
- [ ] PDF metadata is stored
- [ ] Invalid invoice IDs are rejected
- [ ] Unauthorized users cannot generate invoice PDFs
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 6 hours

## Dependencies

Blocked by: DDP-23, DDP-24

---

# [DDP-27] feat(analytics): implement KPI dashboard aggregation APIs

Labels: epic:analytics  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 7  
Estimate: 8 hours

## User Story

As a management user, I want KPI dashboard APIs so that I can view important business metrics such as revenue, payments, projects, invoices, quotations, and lead conversion.

## Background / Context

- SRS Reference: FR-007 KPI Dashboard and Reporting APIs
- SDS Reference: Analytics Module, Reporting Module, Backend Architecture

ConstructPro must provide dashboard aggregation APIs for management users. These APIs should combine data from finance, projects, leads, quotations, payments, and expenses to support the management dashboard.

This issue is limited to KPI aggregation backend APIs only.

This issue does not include frontend dashboard UI, chart rendering, AI prediction, invoice PDF generation, repository creation, epic creation, or deployment work.

## Acceptance Criteria

### AC1: Analytics Module Created

Given the backend repository already exists  
When KPI dashboard APIs are implemented  
Then an analytics module, controller, service, and DTOs should exist.

### AC2: Revenue KPI Endpoint Implemented

Given invoice and payment data exist  
When the revenue KPI endpoint is called  
Then the API should return total revenue, paid amount, and outstanding balance.

### AC3: Project KPI Endpoint Implemented

Given project data exists  
When the project KPI endpoint is called  
Then the API should return active project count, completed project count, overdue project count, and project completion statistics.

### AC4: Invoice KPI Endpoint Implemented

Given invoice data exists  
When the invoice KPI endpoint is called  
Then the API should return issued, partially paid, paid, overdue, and cancelled invoice counts.

### AC5: Lead and Quotation KPI Endpoint Implemented

Given lead and quotation data exist  
When the sales KPI endpoint is called  
Then the API should return lead conversion rate, quotation approval count, rejected quotation count, and converted quotation count.

### AC6: Date Range Filtering Added

Given a date range is provided  
When KPI endpoints are called  
Then the API should return dashboard metrics for the selected period.

### AC7: Management Access Control Applied

Given a user without management/reporting permission calls the KPI endpoint  
When the request is processed  
Then the API should reject the request.

## Scope Control

This issue does not include:

- Frontend dashboard implementation
- Chart or graph rendering
- AI forecasting
- Invoice PDF generation
- Payment recording
- Project CRUD
- Lead CRUD
- Quotation CRUD
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Use optimized aggregation queries.
- Avoid loading unnecessary full entity lists for summary totals.
- Keep KPI calculation logic inside the analytics service.
- Use query parameters for date ranges and optional filters.
- Apply JWT authentication and role-based guards.
- Add Swagger/OpenAPI examples for each KPI endpoint.
- Return consistent response formats for dashboard cards.

## Verification Requirements

- [ ] Analytics module exists
- [ ] Analytics controller exists
- [ ] Analytics service exists
- [ ] Revenue KPI endpoint works
- [ ] Project KPI endpoint works
- [ ] Invoice KPI endpoint works
- [ ] Lead/quotation KPI endpoint works
- [ ] Date range filtering works
- [ ] Role-based access control works
- [ ] Aggregation values are calculated correctly
- [ ] Empty data responses are handled safely
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 8 hours

## Dependencies

Blocked by: Person 1 lead/client APIs, Person 2 quotation/project conversion APIs, Person 3 project/milestone/expense APIs, DDP-23, DDP-24, DDP-25

---

# [DDP-28] feat(analytics): implement recent activity and operational reporting APIs

Labels: epic:analytics  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 7  
Estimate: 6 hours

## User Story

As a management user, I want recent activity and operational reporting APIs so that I can monitor important business events and project progress from the backend.

## Background / Context

- SRS Reference: FR-007 KPI Dashboard and Reporting APIs
- SDS Reference: Analytics Module, Auditability, Backend Architecture

ConstructPro should provide backend reporting APIs for recent activity and operational progress. These APIs should support management dashboards by exposing recent finance, project, quotation, lead, and document activities in a controlled format.

This issue is limited to recent activity and operational reporting APIs only.

This issue does not include KPI card aggregation, frontend dashboard UI, AI prediction, invoice PDF generation, repository creation, epic creation, or deployment work.

## Acceptance Criteria

### AC1: Recent Activity Endpoint Implemented

Given activity data exists in the backend  
When the recent activity endpoint is called  
Then the API should return recent important events from invoices, payments, projects, leads, quotations, documents, and milestones.

### AC2: Project Completion Report Implemented

Given project and milestone data exist  
When the project completion report endpoint is called  
Then the API should return project progress, milestone status, and completion percentage.

### AC3: Expense Report Implemented

Given project expense data exists  
When the expense report endpoint is called  
Then the API should return project-wise and date-range-based expense totals.

### AC4: Overdue Invoice Report Implemented

Given overdue invoices exist  
When the overdue invoice report endpoint is called  
Then the API should return overdue invoices with client, project, due date, and outstanding amount.

### AC5: Filtering and Pagination Added

Given report data contains many records  
When reporting endpoints are called  
Then the API should support filtering, sorting, and pagination where applicable.

### AC6: Empty Data Handling Added

Given no data exists for a selected report  
When the report endpoint is called  
Then the API should return an empty result safely without server errors.

## Scope Control

This issue does not include:

- KPI dashboard card aggregation
- Frontend dashboard screens
- AI forecasting
- Invoice PDF generation
- Invoice CRUD
- Payment CRUD
- Project CRUD
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Use existing module data from invoices, payments, projects, milestones, leads, quotations, documents, and expenses.
- Apply role-based access control.
- Use pagination for list-based reports.
- Use date filters where needed.
- Keep reporting logic in analytics/reporting service.
- Add Swagger/OpenAPI examples.
- Avoid exposing confidential internal fields.

## Verification Requirements

- [ ] Recent activity endpoint works
- [ ] Project completion report endpoint works
- [ ] Expense report endpoint works
- [ ] Overdue invoice report endpoint works
- [ ] Filtering works
- [ ] Sorting works
- [ ] Pagination works
- [ ] Empty data is handled safely
- [ ] Unauthorized users cannot access reports
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 6 hours

## Dependencies

Blocked by: Person 1 lead/client APIs, Person 2 quotation APIs, Person 3 project/milestone/document/expense APIs, DDP-23, DDP-24

---

# [DDP-29] feat(ai): implement AI risk prediction and forecasting boundary

Labels: epic:ai  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 8  
Estimate: 8 hours

## User Story

As a management user, I want AI-based risk and trend predictions so that project delays, payment delays, milestone risks, and revenue trends can be identified early.

## Background / Context

- SRS Reference: FR-010 AI Risk Prediction, FR-007 KPI Dashboard and Reporting APIs
- SDS Reference: AI Forecasting Module, Analytics Module, Backend Architecture

ConstructPro must provide an AI forecasting boundary that collects project, milestone, invoice, payment, and expense history and produces risk/trend predictions. The initial backend implementation should safely handle insufficient data and return understandable prediction outputs.

This issue is limited to backend AI forecasting boundary and prediction API implementation only.

This issue does not include training a custom AI model, frontend AI dashboard UI, external paid AI setup unless separately approved, repository creation, epic creation, or deployment configuration.

## Acceptance Criteria

### AC1: AI Forecasting Module Created

Given the backend repository already exists  
When AI forecasting is implemented  
Then an AI forecasting module, controller, service, and DTOs should exist.

### AC2: Prediction Input Data Collection Implemented

Given project, milestone, invoice, payment, and expense data exist  
When the prediction service runs  
Then it should collect the required historical data for risk analysis.

### AC3: RAG Context Preparation Added

Given historical project and finance data is collected  
When the AI service prepares context  
Then the backend should create a structured context suitable for AI risk prediction.

### AC4: Risk Prediction Endpoint Implemented

Given a valid project ID is provided  
When the risk prediction endpoint is called  
Then the API should return project risk level, milestone-delay risk, payment-delay risk, revenue trend, explanation, and recommended action.

### AC5: Insufficient Data Handling Added

Given there is not enough historical data  
When prediction is requested  
Then the API should return a safe insufficient-data response instead of failing.

### AC6: Prediction Response Format Standardized

Given an AI prediction result is generated  
When the API returns the response  
Then the response should follow a consistent DTO with clear fields.

### AC7: Access Control Applied

Given a user without management/reporting permission calls the prediction endpoint  
When the request is processed  
Then the API should reject the request.

## Scope Control

This issue does not include:

- Training a custom AI model
- Full ML pipeline implementation
- Frontend AI dashboard UI
- KPI dashboard UI
- Invoice PDF generation
- Repository creation
- Epic creation
- Deployment configuration

## Technical Notes

- Keep AI logic behind a clear service boundary.
- Do not hard-code secrets or API keys.
- Use environment variables for any AI provider configuration.
- Support a safe fallback response when AI provider/configuration is unavailable.
- Use project, milestone, invoice, payment, and expense history as the prediction context.
- AI output fields should include:
  - Project risk level
  - Payment-delay risk
  - Milestone-delay risk
  - Revenue trend
  - Plain-language explanation
  - Recommended action
- Add Swagger/OpenAPI request and response examples.

## Verification Requirements

- [ ] AI forecasting module exists
- [ ] AI forecasting controller exists
- [ ] AI forecasting service exists
- [ ] Prediction DTOs exist
- [ ] Historical data collection works
- [ ] RAG context preparation works
- [ ] Risk prediction endpoint works
- [ ] Insufficient data response works
- [ ] Prediction response format is consistent
- [ ] Unauthorized users cannot access AI predictions
- [ ] AI provider failure is handled safely
- [ ] Swagger/OpenAPI documentation is updated

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 8 hours

## Dependencies

Blocked by: Person 3 project/milestone/expense data, DDP-23, DDP-24, DDP-25, DDP-27

---

# [DDP-30] chore(common): add centralized exception handling and backend logging

Labels: epic:backend-quality  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 8  
Estimate: 5 hours

## User Story

As a backend developer, I want centralized exception handling and logging so that backend errors are consistent, traceable, and easier to debug.

## Background / Context

- SRS Reference: NFR-11 Maintainability, NFR-12 Reliability, NFR-14 Security
- SDS Reference: Backend Architecture, Logging, Error Handling

ConstructPro backend services should return consistent error responses and record important backend events. Centralized exception handling helps avoid duplicated error logic across modules and improves maintainability.

This issue is limited to shared exception handling and backend logging only.

This issue does not include feature APIs, authentication redesign, deployment monitoring, external observability platforms, repository creation, epic creation, or frontend error handling.

## Acceptance Criteria

### AC1: Global Exception Filter Added

Given the backend application is running  
When an exception occurs  
Then the global exception filter should format the error response consistently.

### AC2: Validation Error Format Standardized

Given request validation fails  
When the API returns a validation error  
Then the response should include a clear and consistent validation message format.

### AC3: Production Error Message Safety Added

Given the backend runs in production mode  
When an unexpected server error occurs  
Then internal stack traces and confidential details should not be exposed to the client.

### AC4: Logging Service Added

Given important backend events happen  
When the logging service is used  
Then logs should include meaningful information for debugging and auditability.

### AC5: Security and Business Events Logged

Given significant actions occur  
When users create invoices, record payments, access reports, or request predictions  
Then the backend should log those important events.

### AC6: Error Responses Documented

Given Swagger/OpenAPI documentation is viewed  
When an endpoint has error responses  
Then common error response examples should be documented.

## Scope Control

This issue does not include:

- Feature endpoint implementation
- Authentication redesign
- External logging platform setup
- Frontend error display
- Deployment monitoring
- Repository creation
- Epic creation

## Technical Notes

- Implement a global exception filter if not already available.
- Standardize error response fields such as status code, message, timestamp, path, and request ID if supported.
- Use the existing NestJS logging approach or approved logging library.
- Avoid logging secrets, passwords, tokens, or confidential client data.
- Keep production error messages generic.
- Add useful comments in shared exception/logging files where needed.

## Verification Requirements

- [ ] Global exception filter exists
- [ ] Validation errors follow a consistent response format
- [ ] Unexpected errors follow a consistent response format
- [ ] Production errors do not expose stack traces
- [ ] Logging service exists
- [ ] Finance events are logged
- [ ] Analytics events are logged
- [ ] AI prediction events are logged
- [ ] No secrets are written to logs
- [ ] Swagger/OpenAPI common error responses are documented

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 5 hours

## Dependencies

Blocked by: None

---

# [DDP-31] chore(common): add health checks and backend rate limiting

Labels: epic:backend-quality  
Assignee: @Rami2212  
Sprint: Sprint 6 - Week 8  
Estimate: 5 hours

## User Story

As a backend developer, I want health checks and rate limiting so that the backend can be monitored safely and protected from excessive requests.

## Background / Context

- SRS Reference: NFR-09 Scalability, NFR-12 Reliability, NFR-14 Security
- SDS Reference: Backend Architecture, Deployment Readiness, Security Design

ConstructPro backend should expose health check endpoints for system visibility and apply rate limiting to reduce abuse and accidental request overload. These shared services support production readiness without adding deployment logic.

This issue is limited to health checks and backend rate limiting only.

This issue does not include deployment setup, external monitoring dashboards, authentication redesign, business feature endpoints, repository creation, epic creation, or frontend work.

## Acceptance Criteria

### AC1: Health Module Created

Given the backend repository already exists  
When health checks are implemented  
Then a health module or health controller should exist.

### AC2: Basic Health Endpoint Implemented

Given the backend server is running  
When `/health` or the agreed health endpoint is called  
Then the API should return backend service status.

### AC3: Database Health Check Added

Given the backend depends on PostgreSQL  
When the health endpoint is called  
Then the API should include database connectivity status if supported by the selected backend approach.

### AC4: Rate Limiting Configured

Given clients send repeated requests  
When the request count exceeds the configured limit  
Then the backend should reject excessive requests with the correct HTTP response.

### AC5: Sensitive Routes Protected

Given authentication, finance, analytics, and AI endpoints exist  
When rate limiting is applied  
Then sensitive routes should receive appropriate protection.

### AC6: Environment-Based Configuration Added

Given different environments have different needs  
When rate limiting settings are configured  
Then limits should be adjustable using environment variables or backend configuration.

## Scope Control

This issue does not include:

- Deployment pipeline setup
- External monitoring dashboard setup
- Business feature endpoint implementation
- Authentication redesign
- Frontend work
- Repository creation
- Epic creation

## Technical Notes

- Use the NestJS health check and throttling approach approved by the backend team.
- Keep rate limit values configurable.
- Do not expose secrets in health check responses.
- Health checks should be safe for deployment platforms and reviewers.
- Add Swagger/OpenAPI documentation for health endpoint if appropriate.
- Keep shared-service configuration clean and reusable.

## Verification Requirements

- [ ] Health endpoint exists
- [ ] Health endpoint returns backend status
- [ ] Database connectivity check works if supported
- [ ] Rate limiting is configured
- [ ] Excessive requests are rejected
- [ ] Sensitive routes are protected
- [ ] Rate limit values are configurable
- [ ] No secrets are exposed in health responses
- [ ] Swagger/OpenAPI documentation is updated where appropriate
- [ ] Backend build passes

## Definition of Done

- [ ] Work completed in a short-lived feature branch
- [ ] Pull request raised against `develop`
- [ ] At least one peer review completed
- [ ] All review comments resolved
- [ ] No new linting errors introduced
- [ ] Backend build passes
- [ ] Assigned backend logic is tested
- [ ] Swagger/OpenAPI documentation completed
- [ ] Issue linked in the commit message
- [ ] Issue moved to `Done`

## Estimate

Estimated: 5 hours

## Dependencies

Blocked by: None
