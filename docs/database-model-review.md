# ConstructPro ERP — Database Model Review

**Version:** 1.0  
**Based on:** ConstructPro Software Design Specification (SDS) v1.0  
**Prisma Version:** v5  
**Database:** PostgreSQL (NeonDB)  
**Standard:** 3NF Normalisation · SENG 34213 Data Layer Standards

> **Note on source fidelity:** The SDS ER diagram (Figure 2) is embedded as an image and cannot be extracted as text. Field definitions for Role, User, Lead, Customer, QuotationItem, Task, and Expense are sourced verbatim from the explicit normalization tables (Tables 1–14 in §2.2). Fields for Project and Quotation are sourced from those tables plus the textual ER description (§2.1.1). Fields for Milestone, Invoice, Payment, Document, DocumentCategory, and AnalyticsReport are derived from the §2.1.1 entity description, as no normalization tables were provided for those entities in the SDS text.

---

## Table of Contents

1. [Enum Definitions](#1-enum-definitions)
2. [Model Definitions](#2-model-definitions)
   - [2.1 Role](#21-role)
   - [2.2 User](#22-user)
   - [2.3 Lead](#23-lead)
   - [2.4 Customer](#24-customer)
   - [2.5 Quotation](#25-quotation)
   - [2.6 QuotationItem](#26-quotationitem)
   - [2.7 Project](#27-project)
   - [2.8 Milestone](#28-milestone)
   - [2.9 Task](#29-task)
   - [2.10 Expense](#210-expense)
   - [2.11 Invoice](#211-invoice)
   - [2.12 Payment](#212-payment)
   - [2.13 DocumentCategory](#213-documentcategory)
   - [2.14 Document](#214-document)
   - [2.15 AnalyticsReport](#215-analyticsreport)
3. [Relationships](#3-relationships)
   - [3.1 One-to-Many Relationships](#31-one-to-many-relationships)
   - [3.2 One-to-One Relationships](#32-one-to-one-relationships)
   - [3.3 Relationship Decorator Reference](#33-relationship-decorator-reference)
4. [Additional Models Not in SDS ER Diagram](#4-additional-models-not-in-sds-er-diagram)
   - [4.1 RefreshToken](#41-refreshtoken)
   - [4.2 AuditLog](#42-auditlog)
5. [Deviations from ER Diagram](#5-deviations-from-er-diagram)

---

## 1. Enum Definitions

All enums are derived from entity status descriptions in the SDS. `UserStatus` is defined
explicitly in §2.1.1 ("active or inactive"). All other enums model lifecycle states that
are inherent to the described business processes.

```prisma
enum UserStatus {
  ACTIVE
  INACTIVE
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  CONVERTED
  LOST
}

enum QuotationStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  REJECTED
}

enum ProjectStatus {
  PLANNING
  ACTIVE
  ON_HOLD
  COMPLETED
  CANCELLED
}

enum MilestoneStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  COMPLETED
  BLOCKED
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  OVERDUE
  CANCELLED
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  CHEQUE
  ONLINE
}
```

---

## 2. Model Definitions

All models apply the following conventions:

- Primary key: `id  String  @id @default(uuid())`
- Audit timestamps: `createdAt  DateTime @default(now())` and `updatedAt  DateTime @updatedAt`
- Nullable fields are marked with `?` in Prisma syntax.
- Field names use **camelCase** (Prisma convention). SDS uses snake_case — see deviation §5 item 10.

---

### 2.1 Role

**Source:** SDS Table 1 (§2.2.1) and Table 8 (§2.2.3)

| Field       | Prisma Type | Nullable | Unique | Description                        |
|-------------|-------------|----------|--------|------------------------------------|
| id          | String      | No       | Yes    | PK, UUID                          |
| roleName    | String      | No       | Yes    | Maps to `role_name` (Tables 1, 8) |
| description | String      | Yes      | No     | Maps to `description` (Table 1)   |
| createdAt   | DateTime    | No       | No     | Auto-set on insert                |
| updatedAt   | DateTime    | No       | No     | Auto-updated on every write       |

```prisma
model Role {
  id          String   @id @default(uuid())
  roleName    String   @unique
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users User[]
}
```

---

### 2.2 User

**Source:** SDS Table 2 (§2.2.1) and Table 7 (§2.2.3); `password` from Class Diagram §3.1

| Field     | Prisma Type | Nullable | Unique | Description                                                  |
|-----------|-------------|----------|--------|--------------------------------------------------------------|
| id        | String      | No       | Yes    | PK, UUID                                                    |
| fullName  | String      | No       | No     | Maps to `full_name` (Tables 2, 7)                           |
| email     | String      | No       | Yes    | Maps to `email` (Table 2)                                   |
| password  | String      | No       | No     | Bcrypt-hashed credential; from Class Diagram §3.1           |
| roleId    | String      | No       | No     | FK → Role.id; maps to `role_id` (Tables 2, 7)              |
| status    | UserStatus  | No       | No     | Enum: ACTIVE \| INACTIVE; maps to `status` (Table 2)       |
| createdAt | DateTime    | No       | No     | Auto-set on insert                                          |
| updatedAt | DateTime    | No       | No     | Auto-updated on every write                                 |

```prisma
model User {
  id        String     @id @default(uuid())
  fullName  String
  email     String     @unique
  password  String
  roleId    String
  status    UserStatus @default(ACTIVE)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  role             Role          @relation(fields: [roleId], references: [id])
  assignedLeads    Lead[]        @relation("AssignedLeads")
  managedProjects  Project[]     @relation("ProjectManager")
  assignedTasks    Task[]        @relation("AssignedTasks")
  recordedExpenses Expense[]     @relation("RecordedBy")
  uploadedDocuments Document[]   @relation("UploadedDocuments")
  refreshTokens    RefreshToken[]
  auditLogs        AuditLog[]
}
```

---

### 2.3 Lead

**Source:** SDS Table 3 (§2.2.1) and Table 9 (§2.2.3)

| Field        | Prisma Type | Nullable | Unique | Description                                                        |
|--------------|-------------|----------|--------|--------------------------------------------------------------------|
| id           | String      | No       | Yes    | PK, UUID                                                          |
| customerName | String      | No       | No     | Maps to `customer_name` (Tables 3, 9)                             |
| phone        | String      | Yes      | No     | Maps to `phone` (Tables 3, 9)                                     |
| email        | String      | Yes      | No     | Maps to `email` (Table 3)                                         |
| assignedToId | String      | Yes      | No     | FK → User.id; maps to `assigned_to` (Table 3)                    |
| status       | LeadStatus  | No       | No     | Enum: lead lifecycle; implied by CRM described in §2.1.1          |
| createdAt    | DateTime    | No       | No     | Auto-set on insert                                                |
| updatedAt    | DateTime    | No       | No     | Auto-updated on every write                                       |

```prisma
model Lead {
  id           String     @id @default(uuid())
  customerName String
  phone        String?
  email        String?
  assignedToId String?
  status       LeadStatus @default(NEW)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  assignedTo User?     @relation("AssignedLeads", fields: [assignedToId], references: [id])
  customer   Customer?
}
```

---

### 2.4 Customer

**Source:** SDS Table 10 (§2.2.3)

| Field     | Prisma Type | Nullable | Unique | Description                                              |
|-----------|-------------|----------|--------|----------------------------------------------------------|
| id        | String      | No       | Yes    | PK, UUID                                                |
| leadId    | String      | Yes      | Yes    | FK → Lead.id; maps to `lead_id` (Table 10); one-to-one  |
| fullName  | String      | No       | No     | Maps to `full_name` (Table 10)                          |
| createdAt | DateTime    | No       | No     | Auto-set on insert                                      |
| updatedAt | DateTime    | No       | No     | Auto-updated on every write                             |

```prisma
model Customer {
  id        String   @id @default(uuid())
  leadId    String?  @unique
  fullName  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  lead       Lead?       @relation(fields: [leadId], references: [id])
  quotations Quotation[]
  invoices   Invoice[]
  payments   Payment[]
}
```

---

### 2.5 Quotation

**Source:** SDS Table 12 (§2.2.3); `customerId` and `status` inferred from ER description §2.1.1 ("detailed pricing information for services or products offered to the client")

| Field         | Prisma Type     | Nullable | Unique | Description                                            |
|---------------|-----------------|----------|--------|--------------------------------------------------------|
| id            | String          | No       | Yes    | PK, UUID                                              |
| customerId    | String          | No       | No     | FK → Customer.id; implied by §2.1.1                  |
| quotationDate | DateTime        | No       | No     | Maps to `quotation_date` (Table 12)                   |
| totalAmount   | Float           | No       | No     | Maps to `total_amount` (Table 12)                     |
| status        | QuotationStatus | No       | No     | Enum: approval workflow; implied by §2.1.1            |
| createdAt     | DateTime        | No       | No     | Auto-set on insert                                    |
| updatedAt     | DateTime        | No       | No     | Auto-updated on every write                           |

```prisma
model Quotation {
  id            String          @id @default(uuid())
  customerId    String
  quotationDate DateTime
  totalAmount   Float
  status        QuotationStatus @default(DRAFT)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  customer Customer       @relation(fields: [customerId], references: [id])
  items    QuotationItem[]
  project  Project?
}
```

---

### 2.6 QuotationItem

**Source:** SDS Table 4 (§2.2.2)

| Field       | Prisma Type | Nullable | Unique | Description                                         |
|-------------|-------------|----------|--------|-----------------------------------------------------|
| id          | String      | No       | Yes    | PK, UUID                                           |
| quotationId | String      | No       | No     | FK → Quotation.id; maps to `quotation_id` (Table 4)|
| itemName    | String      | No       | No     | Maps to `item_name` (Table 4)                      |
| quantity    | Int         | No       | No     | Maps to `quantity` (Table 4)                       |
| unitPrice   | Float       | No       | No     | Maps to `unit_price` (Table 4)                     |
| amount      | Float       | No       | No     | Maps to `amount` (Table 4); qty × unitPrice        |
| createdAt   | DateTime    | No       | No     | Auto-set on insert                                 |
| updatedAt   | DateTime    | No       | No     | Auto-updated on every write                        |

```prisma
model QuotationItem {
  id          String   @id @default(uuid())
  quotationId String
  itemName    String
  quantity    Int
  unitPrice   Float
  amount      Float
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  quotation Quotation @relation(fields: [quotationId], references: [id])
}
```

---

### 2.7 Project

**Source:** SDS Table 11 (§2.2.3); `projectName`, `location`, `startDate`, `endDate`, `budget`, `projectManagerId`, `status` from ER description §2.1.1 ("Projects store details such as project name, location, start date, end date, and budget information" and "managed by a Project Manager, who is a user in the system")

| Field            | Prisma Type   | Nullable | Unique | Description                                                |
|------------------|---------------|----------|--------|------------------------------------------------------------|
| id               | String        | No       | Yes    | PK, UUID                                                  |
| projectName      | String        | No       | No     | From ER description §2.1.1                               |
| location         | String        | Yes      | No     | From ER description §2.1.1                               |
| startDate        | DateTime      | No       | No     | From ER description §2.1.1                               |
| endDate          | DateTime      | Yes      | No     | From ER description §2.1.1; nullable until finalised      |
| budget           | Float         | Yes      | No     | From ER description §2.1.1                               |
| quotationId      | String        | Yes      | Yes    | FK → Quotation.id; maps to `quotation_id` (Table 11)     |
| projectManagerId | String        | No       | No     | FK → User.id; from ER description §2.1.1                 |
| status           | ProjectStatus | No       | No     | Enum: project lifecycle; implied by §2.1.1               |
| createdAt        | DateTime      | No       | No     | Auto-set on insert                                        |
| updatedAt        | DateTime      | No       | No     | Auto-updated on every write                              |

```prisma
model Project {
  id               String        @id @default(uuid())
  projectName      String
  location         String?
  startDate        DateTime
  endDate          DateTime?
  budget           Float?
  quotationId      String?       @unique
  projectManagerId String
  status           ProjectStatus @default(PLANNING)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  quotation      Quotation?      @relation(fields: [quotationId], references: [id])
  projectManager User            @relation("ProjectManager", fields: [projectManagerId], references: [id])
  milestones     Milestone[]
  tasks          Task[]
  expenses       Expense[]
  documents      Document[]
  invoices       Invoice[]
  reports        AnalyticsReport[]
}
```

---

### 2.8 Milestone

**Source:** SDS Table 13 (§2.2.3); `milestoneName`, `dueDate`, `status` from ER description §2.1.1 ("Each project can have several Milestones to track the progress of the work")

> **Note:** Table 13 is an abbreviated normalization example showing only `milestone_id` and `project_id`. A functional milestone entity requires a name, target date, and status as described in §2.1.1.

| Field         | Prisma Type     | Nullable | Unique | Description                                          |
|---------------|-----------------|----------|--------|------------------------------------------------------|
| id            | String          | No       | Yes    | PK, UUID                                            |
| projectId     | String          | No       | No     | FK → Project.id; maps to `project_id` (Table 13)   |
| milestoneName | String          | No       | No     | From ER description §2.1.1; progress tracking label |
| dueDate       | DateTime        | Yes      | No     | Target completion date                              |
| status        | MilestoneStatus | No       | No     | Enum: PENDING \| IN_PROGRESS \| COMPLETED           |
| createdAt     | DateTime        | No       | No     | Auto-set on insert                                  |
| updatedAt     | DateTime        | No       | No     | Auto-updated on every write                         |

```prisma
model Milestone {
  id            String          @id @default(uuid())
  projectId     String
  milestoneName String
  dueDate       DateTime?
  status        MilestoneStatus @default(PENDING)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  project Project @relation(fields: [projectId], references: [id])
  tasks   Task[]
}
```

---

### 2.9 Task

**Source:** SDS Table 5 (§2.2.2) and Table 14 (§2.2.3)

| Field        | Prisma Type | Nullable | Unique | Description                                                    |
|--------------|-------------|----------|--------|----------------------------------------------------------------|
| id           | String      | No       | Yes    | PK, UUID                                                      |
| projectId    | String      | No       | No     | FK → Project.id; maps to `project_id` (Table 5)              |
| milestoneId  | String      | Yes      | No     | FK → Milestone.id; maps to `milestone_id` (Tables 5, 14)     |
| assignedToId | String      | Yes      | No     | FK → User.id; maps to `assigned_to` (Table 5)                |
| taskName     | String      | No       | No     | Maps to `task_name` (Table 5)                                 |
| status       | TaskStatus  | No       | No     | Enum: task lifecycle; implied by project management described in §2.1.1 |
| createdAt    | DateTime    | No       | No     | Auto-set on insert                                            |
| updatedAt    | DateTime    | No       | No     | Auto-updated on every write                                   |

```prisma
model Task {
  id           String     @id @default(uuid())
  projectId    String
  milestoneId  String?
  assignedToId String?
  taskName     String
  status       TaskStatus @default(TODO)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  project   Project    @relation(fields: [projectId], references: [id])
  milestone Milestone? @relation(fields: [milestoneId], references: [id])
  assignedTo User?     @relation("AssignedTasks", fields: [assignedToId], references: [id])
}
```

---

### 2.10 Expense

**Source:** SDS Table 6 (§2.2.2)

| Field        | Prisma Type | Nullable | Unique | Description                                                   |
|--------------|-------------|----------|--------|---------------------------------------------------------------|
| id           | String      | No       | Yes    | PK, UUID                                                     |
| projectId    | String      | No       | No     | FK → Project.id; maps to `project_id` (Table 6)             |
| recordedById | String      | No       | No     | FK → User.id; maps to `recorded_by` (Table 6)               |
| amount       | Float       | No       | No     | Maps to `amount` (Table 6)                                   |
| createdAt    | DateTime    | No       | No     | Auto-set on insert                                           |
| updatedAt    | DateTime    | No       | No     | Auto-updated on every write                                  |

```prisma
model Expense {
  id           String   @id @default(uuid())
  projectId    String
  recordedById String
  amount       Float
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  project    Project @relation(fields: [projectId], references: [id])
  recordedBy User    @relation("RecordedBy", fields: [recordedById], references: [id])
}
```

---

### 2.11 Invoice

**Source:** ER description §2.1.1 — "the system generates Invoices for clients based on project progress"

> **Note:** No normalization table was provided for Invoice in the SDS text. All fields are derived from the ER entity description.

| Field       | Prisma Type   | Nullable | Unique | Description                              |
|-------------|---------------|----------|--------|------------------------------------------|
| id          | String        | No       | Yes    | PK, UUID                                |
| projectId   | String        | No       | No     | FK → Project.id; based on project progress |
| customerId  | String        | No       | No     | FK → Customer.id; invoice is for client  |
| invoiceDate | DateTime      | No       | No     | Date invoice was generated              |
| dueDate     | DateTime      | Yes      | No     | Payment due date                        |
| totalAmount | Float         | No       | No     | Total amount billed                     |
| status      | InvoiceStatus | No       | No     | Enum: billing lifecycle                 |
| createdAt   | DateTime      | No       | No     | Auto-set on insert                      |
| updatedAt   | DateTime      | No       | No     | Auto-updated on every write             |

```prisma
model Invoice {
  id          String        @id @default(uuid())
  projectId   String
  customerId  String
  invoiceDate DateTime
  dueDate     DateTime?
  totalAmount Float
  status      InvoiceStatus @default(DRAFT)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  project  Project   @relation(fields: [projectId], references: [id])
  customer Customer  @relation(fields: [customerId], references: [id])
  payments Payment[]
}
```

---

### 2.12 Payment

**Source:** ER description §2.1.1 — "Clients can make Project Payments, which may be associated with specific invoices"

> **Note:** No normalization table was provided for Payment in the SDS text. All fields are derived from the ER entity description.

| Field         | Prisma Type   | Nullable | Unique | Description                                               |
|---------------|---------------|----------|--------|-----------------------------------------------------------|
| id            | String        | No       | Yes    | PK, UUID                                                 |
| invoiceId     | String        | Yes      | No     | FK → Invoice.id; nullable ("may be associated")          |
| customerId    | String        | No       | No     | FK → Customer.id; client making the payment              |
| paymentDate   | DateTime      | No       | No     | Date payment was recorded                                |
| amount        | Float         | No       | No     | Amount paid                                              |
| paymentMethod | PaymentMethod | No       | No     | Enum: method of payment                                  |
| createdAt     | DateTime      | No       | No     | Auto-set on insert                                       |
| updatedAt     | DateTime      | No       | No     | Auto-updated on every write                              |

```prisma
model Payment {
  id            String        @id @default(uuid())
  invoiceId     String?
  customerId    String
  paymentDate   DateTime
  amount        Float
  paymentMethod PaymentMethod
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  invoice  Invoice?  @relation(fields: [invoiceId], references: [id])
  customer Customer  @relation(fields: [customerId], references: [id])
}
```

---

### 2.13 DocumentCategory

**Source:** ER description §2.1.1 — "Documents are categorized using Document Categories to maintain organization and easy retrieval"

> **Note:** No normalization table was provided for DocumentCategory in the SDS text. Fields are derived from the ER entity description.

| Field        | Prisma Type | Nullable | Unique | Description                     |
|--------------|-------------|----------|--------|---------------------------------|
| id           | String      | No       | Yes    | PK, UUID                       |
| categoryName | String      | No       | Yes    | Category label; must be unique  |
| description  | String      | Yes      | No     | Optional detail                 |
| createdAt    | DateTime    | No       | No     | Auto-set on insert             |
| updatedAt    | DateTime    | No       | No     | Auto-updated on every write    |

```prisma
model DocumentCategory {
  id           String   @id @default(uuid())
  categoryName String   @unique
  description  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  documents Document[]
}
```

---

### 2.14 Document

**Source:** ER description §2.1.1 — "files related to projects are stored. Documents are categorized using Document Categories"

> **Note:** No normalization table was provided for Document in the SDS text. Fields are derived from the ER entity description.

| Field        | Prisma Type | Nullable | Unique | Description                                   |
|--------------|-------------|----------|--------|-----------------------------------------------|
| id           | String      | No       | Yes    | PK, UUID                                     |
| projectId    | String      | No       | No     | FK → Project.id; file belongs to a project   |
| categoryId   | String      | No       | No     | FK → DocumentCategory.id                     |
| fileName     | String      | No       | No     | Original file name                           |
| fileUrl      | String      | No       | No     | Cloud storage URL                            |
| uploadedById | String      | Yes      | No     | FK → User.id; uploader; nullable if system   |
| createdAt    | DateTime    | No       | No     | Auto-set on insert                           |
| updatedAt    | DateTime    | No       | No     | Auto-updated on every write                  |

```prisma
model Document {
  id           String   @id @default(uuid())
  projectId    String
  categoryId   String
  fileName     String
  fileUrl      String
  uploadedById String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  project    Project          @relation(fields: [projectId], references: [id])
  category   DocumentCategory @relation(fields: [categoryId], references: [id])
  uploadedBy User?            @relation("UploadedDocuments", fields: [uploadedById], references: [id])
}
```

---

### 2.15 AnalyticsReport

**Source:** ER description §2.1.1 — "analytical insights through Analytics Reports, which summarize project performance metrics such as total revenue, expenses, profit, and completion percentage"

> **Note:** No normalization table was provided for AnalyticsReport in the SDS text. The four metric fields (`totalRevenue`, `expenses`, `profit`, `completionPercentage`) are named verbatim in §2.1.1.

| Field                | Prisma Type | Nullable | Unique | Description                                         |
|----------------------|-------------|----------|--------|-----------------------------------------------------|
| id                   | String      | No       | Yes    | PK, UUID                                           |
| projectId            | String      | No       | No     | FK → Project.id                                    |
| totalRevenue         | Float       | No       | No     | Named verbatim in §2.1.1                           |
| expenses             | Float       | No       | No     | Named verbatim in §2.1.1                           |
| profit               | Float       | No       | No     | Named verbatim in §2.1.1                           |
| completionPercentage | Float       | No       | No     | Named verbatim in §2.1.1; range 0.0–100.0          |
| reportDate           | DateTime    | No       | No     | Report generation date                             |
| createdAt            | DateTime    | No       | No     | Auto-set on insert                                 |
| updatedAt            | DateTime    | No       | No     | Auto-updated on every write                        |

```prisma
model AnalyticsReport {
  id                   String   @id @default(uuid())
  projectId            String
  totalRevenue         Float
  expenses             Float
  profit               Float
  completionPercentage Float
  reportDate           DateTime
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id])
}
```

---

## 3. Relationships

### 3.1 One-to-Many Relationships

| Parent           | Child           | FK in Child                   | @relation Name        | Cardinality |
|------------------|-----------------|-------------------------------|-----------------------|-------------|
| Role             | User            | User.roleId                   | *(default)*           | 1 : N       |
| User             | Lead            | Lead.assignedToId             | `"AssignedLeads"`     | 1 : N       |
| User             | Project         | Project.projectManagerId      | `"ProjectManager"`    | 1 : N       |
| User             | Task            | Task.assignedToId             | `"AssignedTasks"`     | 1 : N       |
| User             | Expense         | Expense.recordedById          | `"RecordedBy"`        | 1 : N       |
| User             | Document        | Document.uploadedById         | `"UploadedDocuments"` | 1 : N       |
| User             | RefreshToken    | RefreshToken.userId           | *(default)*           | 1 : N       |
| User             | AuditLog        | AuditLog.userId               | *(default)*           | 1 : N       |
| Customer         | Quotation       | Quotation.customerId          | *(default)*           | 1 : N       |
| Customer         | Invoice         | Invoice.customerId            | *(default)*           | 1 : N       |
| Customer         | Payment         | Payment.customerId            | *(default)*           | 1 : N       |
| Quotation        | QuotationItem   | QuotationItem.quotationId     | *(default)*           | 1 : N       |
| Project          | Milestone       | Milestone.projectId           | *(default)*           | 1 : N       |
| Project          | Task            | Task.projectId                | *(default)*           | 1 : N       |
| Project          | Expense         | Expense.projectId             | *(default)*           | 1 : N       |
| Project          | Invoice         | Invoice.projectId             | *(default)*           | 1 : N       |
| Project          | Document        | Document.projectId            | *(default)*           | 1 : N       |
| Project          | AnalyticsReport | AnalyticsReport.projectId     | *(default)*           | 1 : N       |
| Milestone        | Task            | Task.milestoneId              | *(default)*           | 1 : N       |
| Invoice          | Payment         | Payment.invoiceId             | *(default)*           | 1 : N       |
| DocumentCategory | Document        | Document.categoryId           | *(default)*           | 1 : N       |

### 3.2 One-to-One Relationships

| Parent    | Child    | FK in Child        | Constraint    | Notes                                           |
|-----------|----------|--------------------|---------------|-------------------------------------------------|
| Lead      | Customer | Customer.leadId    | `@unique`     | A lead is converted into exactly one Customer  |
| Quotation | Project  | Project.quotationId | `@unique`    | An approved Quotation becomes exactly one Project |

> **No many-to-many junction tables** exist in the SDS ER diagram. All inter-entity relationships are one-to-many or one-to-one.

### 3.3 Relationship Decorator Reference

Complete `@relation` decorator syntax for every relationship:

```prisma
// ── Role ↔ User ─────────────────────────────────────────────────────────────
model Role   { users User[] }
model User   { role   Role   @relation(fields: [roleId],   references: [id])
               roleId String }

// ── User ↔ Lead (assigned sales rep) ────────────────────────────────────────
model User   { assignedLeads Lead[] @relation("AssignedLeads") }
model Lead   { assignedTo   User?  @relation("AssignedLeads", fields: [assignedToId], references: [id])
               assignedToId String? }

// ── Lead ↔ Customer (lead-conversion, 1:1) ──────────────────────────────────
model Lead     { customer Customer? }
model Customer { lead   Lead?   @relation(fields: [leadId], references: [id])
                 leadId String? @unique }

// ── Customer ↔ Quotation ─────────────────────────────────────────────────────
model Customer  { quotations Quotation[] }
model Quotation { customer   Customer @relation(fields: [customerId], references: [id])
                  customerId String }

// ── Quotation ↔ QuotationItem ────────────────────────────────────────────────
model Quotation     { items QuotationItem[] }
model QuotationItem { quotation   Quotation @relation(fields: [quotationId], references: [id])
                      quotationId String }

// ── Quotation ↔ Project (approval-to-project, 1:1) ──────────────────────────
model Quotation { project Project? }
model Project   { quotation   Quotation? @relation(fields: [quotationId], references: [id])
                  quotationId String?    @unique }

// ── User ↔ Project (project manager) ────────────────────────────────────────
model User    { managedProjects Project[] @relation("ProjectManager") }
model Project { projectManager   User   @relation("ProjectManager", fields: [projectManagerId], references: [id])
                projectManagerId String }

// ── Project ↔ Milestone ──────────────────────────────────────────────────────
model Project   { milestones Milestone[] }
model Milestone { project   Project @relation(fields: [projectId], references: [id])
                  projectId String }

// ── Project ↔ Task ───────────────────────────────────────────────────────────
model Project { tasks Task[] }
model Task    { project   Project @relation(fields: [projectId], references: [id])
                projectId String }

// ── Milestone ↔ Task (optional grouping) ─────────────────────────────────────
model Milestone { tasks Task[] }
model Task      { milestone   Milestone? @relation(fields: [milestoneId], references: [id])
                  milestoneId String? }

// ── User ↔ Task (assignee) ───────────────────────────────────────────────────
model User { assignedTasks Task[] @relation("AssignedTasks") }
model Task { assignedTo   User?  @relation("AssignedTasks", fields: [assignedToId], references: [id])
             assignedToId String? }

// ── Project ↔ Expense ────────────────────────────────────────────────────────
model Project { expenses Expense[] }
model Expense { project   Project @relation(fields: [projectId], references: [id])
                projectId String }

// ── User ↔ Expense (recorder) ────────────────────────────────────────────────
model User    { recordedExpenses Expense[] @relation("RecordedBy") }
model Expense { recordedBy   User   @relation("RecordedBy", fields: [recordedById], references: [id])
                recordedById String }

// ── Project ↔ Invoice ────────────────────────────────────────────────────────
model Project { invoices Invoice[] }
model Invoice { project   Project @relation(fields: [projectId], references: [id])
                projectId String }

// ── Customer ↔ Invoice ───────────────────────────────────────────────────────
model Customer { invoices Invoice[] }
model Invoice  { customer   Customer @relation(fields: [customerId], references: [id])
                 customerId String }

// ── Invoice ↔ Payment (optional link) ───────────────────────────────────────
model Invoice { payments Payment[] }
model Payment { invoice   Invoice? @relation(fields: [invoiceId], references: [id])
                invoiceId String? }

// ── Customer ↔ Payment ───────────────────────────────────────────────────────
model Customer { payments Payment[] }
model Payment  { customer   Customer @relation(fields: [customerId], references: [id])
                 customerId String }

// ── Project ↔ Document ───────────────────────────────────────────────────────
model Project  { documents Document[] }
model Document { project   Project @relation(fields: [projectId], references: [id])
                 projectId String }

// ── DocumentCategory ↔ Document ─────────────────────────────────────────────
model DocumentCategory { documents Document[] }
model Document         { category   DocumentCategory @relation(fields: [categoryId], references: [id])
                         categoryId String }

// ── User ↔ Document (uploader) ──────────────────────────────────────────────
model User     { uploadedDocuments Document[] @relation("UploadedDocuments") }
model Document { uploadedBy   User?   @relation("UploadedDocuments", fields: [uploadedById], references: [id])
                 uploadedById String? }

// ── Project ↔ AnalyticsReport ────────────────────────────────────────────────
model Project        { reports AnalyticsReport[] }
model AnalyticsReport { project   Project @relation(fields: [projectId], references: [id])
                        projectId String }

// ── User ↔ RefreshToken ──────────────────────────────────────────────────────
model User         { refreshTokens RefreshToken[] }
model RefreshToken { user   User   @relation(fields: [userId], references: [id])
                     userId String }

// ── User ↔ AuditLog ──────────────────────────────────────────────────────────
model User     { auditLogs AuditLog[] }
model AuditLog { user   User?   @relation(fields: [userId], references: [id])
                 userId String? }
```

---

## 4. Additional Models Not in SDS ER Diagram

The following two models are **required for a production system** but are **absent from the SDS ER diagram**. They address gaps in the authentication and security design described in SDS §6.1–§6.3.

---

### 4.1 RefreshToken

**Reason:** SDS §6.1 specifies JWT-based authentication. Secure JWT implementations require server-side refresh token storage to enable token rotation and explicit token revocation on logout. Without this model, compromised refresh tokens cannot be invalidated and re-login cannot be forced when a user's account is deactivated.

| Field     | Prisma Type | Nullable | Unique | Description                            |
|-----------|-------------|----------|--------|----------------------------------------|
| id        | String      | No       | Yes    | PK, UUID                              |
| userId    | String      | No       | No     | FK → User.id                          |
| token     | String      | No       | Yes    | SHA-256 hashed refresh token          |
| expiresAt | DateTime    | No       | No     | Token expiry timestamp                |
| createdAt | DateTime    | No       | No     | Auto-set on insert                    |
| updatedAt | DateTime    | No       | No     | Auto-updated on every write           |

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])
}
```

---

### 4.2 AuditLog

**Reason:** SDS §6.2 defines Role-Based Access Control (RBAC) and §6.3 describes a data protection approach. An AuditLog table records who performed which action on which record, with before/after snapshots. This is required for security incident investigation, compliance, and the SENG 34213 data layer standards. It also supports the Analytics & AI Risk Prediction module described in §5.1.7 by providing a traceable history of data changes.

| Field     | Prisma Type | Nullable | Unique | Description                                          |
|-----------|-------------|----------|--------|------------------------------------------------------|
| id        | String      | No       | Yes    | PK, UUID                                            |
| userId    | String      | Yes      | No     | FK → User.id; nullable if action was system-triggered|
| action    | String      | No       | No     | e.g. `CREATE`, `UPDATE`, `DELETE`                   |
| entity    | String      | No       | No     | Prisma model name, e.g. `"Project"`                 |
| entityId  | String      | No       | No     | UUID of the affected record                         |
| oldValues | String      | Yes      | No     | JSON string: field snapshot before mutation         |
| newValues | String      | Yes      | No     | JSON string: field snapshot after mutation          |
| ipAddress | String      | Yes      | No     | Request originating IP address                      |
| createdAt | DateTime    | No       | No     | Auto-set on insert                                  |
| updatedAt | DateTime    | No       | No     | Auto-updated on every write                         |

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  action    String
  entity    String
  entityId  String
  oldValues String?
  newValues String?
  ipAddress String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User? @relation(fields: [userId], references: [id])
}
```

---

## 5. Deviations from ER Diagram

| # | Area                                           | Deviation                                                                                                     | Justification                                                                                                                          |
|---|------------------------------------------------|---------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| 1 | **User.password**                              | Added `password` field to User model                                                                          | Not present in normalization tables (Tables 2/7) but explicitly defined in Class Diagram §3.1 as "Authentication credential." Required for JWT auth described in §6.1. |
| 2 | **User.status — Enum instead of plain value**  | `status` typed as `UserStatus` enum (`ACTIVE` \| `INACTIVE`) rather than a plain String                      | SDS §2.1.1 defines exactly two states: "active or inactive." Using an enum enforces valid values at the database constraint level.     |
| 3 | **Lead.status — new enum field**               | Added `status` (LeadStatus enum) to Lead                                                                      | CRM lead lifecycle tracking is central to the system described in §2.1.1. The normalization tables are abbreviated examples; the SDS ER diagram figure (not extractable as text) likely includes this field. |
| 4 | **Project — additional fields beyond Table 11**| Added `projectName`, `location`, `startDate`, `endDate`, `budget`, `projectManagerId`, `status`               | SDS §2.1.1 explicitly states: "Projects store details such as project name, location, start date, end date, and budget information" and "managed by a Project Manager, who is a user in the system." Table 11 is an abbreviated normalization example. |
| 5 | **Milestone — additional fields beyond Table 13** | Added `milestoneName`, `dueDate`, `status`                                                                 | SDS Table 13 shows only `milestone_id` and `project_id` as a normalization illustration. A functional milestone entity needs a name and status to "track the progress of the work" as stated in §2.1.1. |
| 6 | **Quotation.customerId — new FK**              | Added `customerId` FK to Quotation                                                                            | §2.1.1 states quotations contain "pricing information for services or products offered to the client." A client (Customer) reference is logically necessary to satisfy 3NF without duplicating customer data. |
| 7 | **Invoice, Payment, Document, DocumentCategory, AnalyticsReport — inferred fields** | All fields for these five models are inferred from the §2.1.1 textual description | No normalization tables were provided for these models in the SDS text. The ER diagram figure (Figure 2) contains their definitions but cannot be extracted as text from the PDF. The four AnalyticsReport metric fields (`totalRevenue`, `expenses`, `profit`, `completionPercentage`) are named verbatim in §2.1.1. |
| 8 | **RefreshToken — new model**                   | New model not present in SDS ER diagram                                                                       | Required for secure JWT refresh token rotation and revocation as described in §6.1. See §4.1 for full justification. |
| 9 | **AuditLog — new model**                       | New model not present in SDS ER diagram                                                                       | Required for security auditing aligned with the RBAC and data protection design described in §6.2–§6.3. See §4.2 for full justification. |
| 10 | **camelCase field names**                     | SDS uses `snake_case` column names (e.g. `role_name`, `full_name`) but Prisma models use `camelCase` (e.g. `roleName`, `fullName`) | Prisma convention mandates camelCase model field names. Add `@map("snake_case_name")` decorators and `@@map("table_name")` at the model level if the PostgreSQL schema must match the SDS naming exactly. The semantic meaning of every field is preserved. |

---

*End of Document*
