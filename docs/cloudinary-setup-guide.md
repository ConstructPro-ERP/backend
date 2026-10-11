# ConstructPro ERP — Cloudinary Setup & Integration Guide

## 1. Overview & SDS Architecture Alignment

As specified in the **ConstructPro System Design Specification (SDS - Figure 25: Hosting Plan, Page 39)**:
> *"Uploaded files and generated assets will be stored in Cloudinary, which provides uploaded APIs, storage, transformation, and delivery capabilities for media and raw files. This is suitable for quotation of PDFs, invoice documents, project attachments, and client-uploaded files."*

This guide outlines the step-by-step procedure to configure Cloudinary credentials, share environment variables across the team, and implement a reusable Cloudinary upload service in the NestJS backend.

---

## 2. Step 1: Locating Cloudinary Credentials

1. Log in to [Cloudinary Console](https://cloudinary.com) using the project account (`constructpro@gmail.com`).
2. Navigate to the **Dashboard** / **Programmable Media** section.
3. Locate the **Product Environment Credentials** card:
   * **Cloud Name:** (e.g., `constructpro` or generated alphanumeric ID)
   * **API Key:** (e.g., `819283746192837`)
   * **API Secret:** (Click the eye/copy icon to view the secret key)

---

## 3. Step 2: Environment Variable Configuration

Add the following environment variables to your local `.env` file located in the root of the backend repository:

```env
# ─── Cloudinary Configuration ────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_actual_cloud_name
CLOUDINARY_API_KEY=your_actual_api_key
CLOUDINARY_API_SECRET=your_actual_api_secret
```

> [!WARNING]
> **Security Notice:** Never commit `.env` files or API secrets to GitHub. Distribute these credentials to your teammates through private channels (WhatsApp, Slack, Discord).

---

## 4. Step 3: Package Installation

Install the official Cloudinary Node.js SDK in the backend root directory:

```bash
npm install cloudinary
```

---

## 5. Step 4: Reusable NestJS Cloudinary Service

Create a shared module and service so all backend services can upload buffers (PDFs, images, documents) with consistent error handling and Cloudinary folder naming conventions.

### File: `libs/common/src/cloudinary/cloudinary.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  /**
   * Upload a Buffer to Cloudinary
   * @param buffer In-memory file data buffer
   * @param folder Destination folder within ConstructPro (e.g., 'quotations', 'invoices', 'projects')
   * @param filename Target public ID / file name
   * @param resourceType 'raw' for PDFs and docs, 'image' for photos, or 'auto'
   * @returns HTTPS secure URL from Cloudinary CDN
   */
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    filename: string,
    resourceType: 'raw' | 'image' | 'auto' = 'raw',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `constructpro/${folder}`,
          public_id: filename,
          resource_type: resourceType,
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failure:', error);
            return reject(error);
          }
          resolve(result.secure_url);
        },
      );

      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      stream.pipe(uploadStream);
    });
  }
}
```

---

## 6. Team Ownership & Integration Points

| Team Member | Service | Asset / File Type | Upload Target & Usage |
| :--- | :--- | :--- | :--- |
| **Person 2 (You)** | **Quotation Service** | **Quotation PDFs** | Upload quotation PDF buffer to `constructpro/quotations` &rarr; store HTTPS URL in `Quotation.pdfUrl` |
| **Person 4** | **Invoice Service** | **Invoice PDFs** | Upload invoice PDF buffer to `constructpro/invoices` &rarr; store HTTPS URL in `Invoice.pdfUrl` |
| **Person 3** | **Project Service** | **Project Attachments** | Upload uploaded project media/documents to `constructpro/projects` &rarr; store HTTPS URL in `Document.fileUrl` |
| **Person 1** | **Client Service** | **Client Documents** | Upload customer documentation &rarr; store in client record / `Document.fileUrl` |

---

## 7. Implementation Examples by Service

### 1. Quotation Service (Person 2 - You)

```typescript
// When quotation PDF is generated:
const pdfUrl = await this.cloudinaryService.uploadBuffer(
  pdfBuffer,
  'quotations',
  `quotation-${quotation.id}`,
  'raw'
);

await this.prisma.quotation.update({
  where: { id: quotation.id },
  data: { pdfUrl },
});
```

### 2. Invoice Service (Person 4)

```typescript
// When invoice PDF is generated:
const pdfUrl = await this.cloudinaryService.uploadBuffer(
  pdfBuffer,
  'invoices',
  `invoice-${invoice.invoiceNumber}`,
  'raw'
);

await this.prisma.invoice.update({
  where: { id: invoice.id },
  data: { pdfUrl },
});
```

### 3. Project / Client Attachments (Person 3 & Person 1)

```typescript
// When file attachment is received via multipart form:
const fileUrl = await this.cloudinaryService.uploadBuffer(
  file.buffer,
  'projects',
  `${Date.now()}-${file.originalname}`,
  'auto'
);

await this.prisma.document.create({
  data: {
    projectId,
    categoryId,
    fileName: file.originalname,
    fileUrl,
    uploadedById: userId,
  },
});
```

---

## 8. Setup Verification Checklist

- [ ] Cloudinary account created with project email.
- [ ] Credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) copied from Cloudinary dashboard.
- [ ] Credentials distributed securely to all 4 team members for their local `.env`.
- [ ] `cloudinary` npm dependency installed via `npm install cloudinary`.
- [ ] `CloudinaryService` registered and tested with a test buffer upload.
- [ ] Verified that returned `https://res.cloudinary.com/...` URL opens the uploaded asset in a browser.
