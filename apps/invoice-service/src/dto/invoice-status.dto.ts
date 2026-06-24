export enum InvoiceStatusDto {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum EditableInvoiceStatusDto {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
}
