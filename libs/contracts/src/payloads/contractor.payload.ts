export interface CreateContractorPayload {
  name: string;
  email?: string;
  phone?: string;
  specialty?: string;
}

export interface UpdateContractorPayload {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  specialty?: string;
}

export interface VerifyContractorPayload {
  id: string;
  verified: boolean;
}
