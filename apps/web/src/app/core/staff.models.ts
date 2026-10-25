export type StaffRole = 'admin' | 'guard';

export interface StaffUser {
  id: string;
  username: string;
  role: StaffRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffSession {
  user: StaffUser;
  expiresAt?: string;
}

export interface LotContact {
  name: string;
  phone: string;
}

export interface Lot {
  id: string;
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MailStatus = 'pending' | 'delivered';

export interface StaffMailItem {
  id: string;
  lotId: string;
  lotNumber: string;
  description: string | null;
  receivedAt: string;
  receivedBy: string;
  status: MailStatus;
  deliveredAt: string | null;
  deliveredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface CreateMailInput {
  lotNumber: string;
  description?: string;
}

export interface CreateLotInput {
  lotNumber: string;
  ownerNames: string[];
  contacts: LotContact[];
  pin: string;
}

export interface UpdateLotInput {
  ownerNames?: string[];
  contacts?: LotContact[];
  active?: boolean;
}

export interface CreateStaffInput {
  username: string;
  password: string;
  role: StaffRole;
}

export interface UpdateStaffInput {
  role?: StaffRole;
  active?: boolean;
}
