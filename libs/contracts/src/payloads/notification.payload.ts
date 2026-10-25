export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface SendSmsPayload {
  to: string;
  message: string;
}

export interface CreateNotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: string;
}
