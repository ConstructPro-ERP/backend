export interface ProjectAccessActor {
  id: string;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'ACCOUNTANT';
}

export interface ProjectAccessResource {
  id: string;
  projectManagerId: string;
}
