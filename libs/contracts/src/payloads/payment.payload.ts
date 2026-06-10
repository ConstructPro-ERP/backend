export interface CreateInvoicePayload {
  projectId: string;
  customerId: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
}

export interface CreatePaymentPayload {
  invoiceId?: string;
  customerId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE';
}

export interface UpdateInvoiceStatusPayload {
  id: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
}
