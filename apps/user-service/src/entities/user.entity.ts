import { UserStatus, type Prisma } from '@prisma/client';

/** Prisma user row with role — password excluded at query level where possible */
export const USER_WITH_ROLE_INCLUDE = {
  role: { select: { id: true, roleName: true } },
} satisfies Prisma.UserInclude;

export type UserWithRole = Prisma.UserGetPayload<{
  include: typeof USER_WITH_ROLE_INCLUDE;
}>;

/** Public user shape returned by API (never includes password) */
export type SafeUser = {
  id: string;
  fullName: string;
  email: string;
  roleId: string | null;
  status: UserStatus;

  role: { id: string; roleName: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toSafeUser(user: UserWithRole): SafeUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roleId: user.roleId,
    status: user.status,
    role: user.role ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function toSafeUsers(users: UserWithRole[]): SafeUser[] {
  return users.map(toSafeUser);
}
