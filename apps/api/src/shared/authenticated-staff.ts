import type { StaffRole } from '../modules/staff/staff.roles.js';
import type { Actor } from './actor.js';

export interface AuthenticatedStaff extends Actor {
  username: string;
  role: StaffRole;
}
