# Invoice creation choices

`GET /api/invoices/creation-options` returns a standard API response whose `data` contains:

```json
{
  "projects": [
    { "id": "project-uuid", "projectName": "Construction Site", "customerIds": ["customer-uuid"] }
  ],
  "customers": [
    { "id": "customer-uuid", "fullName": "Customer Name" }
  ]
}
```

The gateway enforces authentication and the invoice roles (`ADMIN`, `MANAGEMENT`, `FINANCE`, `ACCOUNTANT`). It forwards the request to the invoice service using `INVOICE_SERVICE_URL`, along with the authorization and actor headers. Deploy the invoice service and gateway before enabling the frontend creation form.

Project and customer names are sorted alphabetically. Customer IDs for each project are deduplicated from the customers linked to its quotations. An empty association list permits any existing customer under the current invoice rules; multiple different associations indicate conflicting ownership. No contact details, billing totals, or project management fields are returned.

`POST /api/invoices` and `POST /api/projects/:projectId/invoices` continue to validate the existing customer, project and their relationship at submission time. Choices are advisory; stale or manipulated inputs cannot bypass the existing validation. A missing project/customer or mismatched owner returns the existing service error for the frontend to display.
