export interface CreateTaskPayload {
  projectId: string;
  milestoneId?: string;
  taskName: string;
  assignedToId?: string;
}

export interface UpdateTaskPayload {
  id: string;
  taskName?: string;
  milestoneId?: string;
}

export interface UpdateTaskStatusPayload {
  id: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
}

export interface AssignTaskPayload {
  id: string;
  assignedToId: string;
}
