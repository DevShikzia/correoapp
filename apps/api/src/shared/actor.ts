import type { StaffRole } from '../modules/staff/staff.roles.js';

export interface Actor {
  id: string;
  role: StaffRole;
}
