export interface CreateProjectPayload {
  projectName: string;
  location?: string;
  startDate: string;
  endDate?: string;
  budget?: number;
  projectManagerId: string;
}

export interface CreateProjectFromQuotationPayload {
  quotationId: string;
  leadId: string;
  targetProjectId?: string;
  projectName?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  projectManagerId?: string;
  budget?: number;
}

export interface CreateProjectFromQuotationResponse {
  projectId: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
}

export interface UpdateProjectPayload {
  id: string;
  projectName?: string;
  location?: string;
  endDate?: string;
  budget?: number;
}

export interface UpdateProjectStatusPayload {
  id: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
}

export interface AssignContractorPayload {
  projectId: string;
  contractorId: string;
}
