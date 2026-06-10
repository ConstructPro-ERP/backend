export interface CreateUserPayload {
  fullName: string;
  email: string;
  hashedCredential: string;
  roleId: string;
}

export interface UpdateProfilePayload {
  id: string;
  fullName?: string;
  email?: string;
}

export interface UpdateStatusPayload {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
}
