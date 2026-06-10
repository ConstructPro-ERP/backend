export interface RegisterPayload {
  fullName: string;
  email: string;
  roleId: string;
}

export interface LoginPayload {
  email: string;
  token: string;
}

export interface AuthTokensPayload {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

export interface ValidateTokenPayload {
  token: string;
}

export interface RequestResetPayload {
  email: string;
}

export interface ConfirmResetPayload {
  token: string;
  newValue: string;
}
