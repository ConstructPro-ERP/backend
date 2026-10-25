export const PAYMENT_PATTERNS = {
  FIND_ALL: 'payment.find_all',
  FIND_BY_ID: 'payment.find_by_id',
  CREATE: 'payment.create',
  HISTORY_BY_INVOICE: 'payment.history_by_invoice',
  CREATE_INVOICE: 'payment.create_invoice',
  LIST_INVOICES: 'payment.list_invoices',
  FIND_INVOICE: 'payment.find_invoice',
  UPDATE_INVOICE: 'payment.update_invoice',
  CANCEL_INVOICE: 'payment.cancel_invoice',
  UPDATE_STATUS: 'payment.update_status',
} as const;
