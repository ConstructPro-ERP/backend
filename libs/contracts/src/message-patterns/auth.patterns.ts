export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  REFRESH_TOKEN: 'auth.refresh_token',
  VALIDATE_TOKEN: 'auth.validate_token',
  REQUEST_RESET: 'auth.request_reset',
  CONFIRM_RESET: 'auth.confirm_reset',
} as const;
