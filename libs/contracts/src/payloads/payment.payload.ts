export interface CreateInvoicePayload {
  projectId: string;
  customerId: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
}

export interface CreatePaymentPayload {
  invoiceId: string;
  referenceNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';
  notes?: string;
}

export interface UpdateInvoiceStatusPayload {
  id: string;
  status:
    | 'DRAFT'
    | 'ISSUED'
    | 'PARTIALLY_PAID'
    | 'PAID'
    | 'OVERDUE'
    | 'CANCELLED';
}
