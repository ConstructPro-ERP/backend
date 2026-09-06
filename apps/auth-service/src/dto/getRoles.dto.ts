export interface RoleDto {
  id: string;
  roleName: string;
  description: string | null;
}

export type Role = RoleDto;
