import { UserStatus } from '@prisma/client';

export interface ProjectManagerCandidate {
  id: string;
  status: UserStatus;
  role: {
    roleName: string;
  } | null;
}
