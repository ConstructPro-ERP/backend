export interface CreateMaterialPayload {
  name: string;
  unit: string;
  unitCost: number;
  stockQty?: number;
  supplierId?: string;
}

export interface UpdateMaterialPayload {
  id: string;
  name?: string;
  unitCost?: number;
}

export interface UpdateStockPayload {
  id: string;
  quantity: number;
}

export interface CreateSupplierPayload {
  name: string;
  email?: string;
  phone?: string;
}
