export type OwnerMailStatus = 'pending' | 'delivered';

export interface OwnerMailItem {
  id: string;
  description: string | null;
  receivedAt: string;
  status: OwnerMailStatus;
  deliveredAt: string | null;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface OwnerMailPage {
  items: OwnerMailItem[];
  meta: PageMeta;
}

export interface OwnerSession {
  lotNumber: string;
  expiresAt?: string;
}
