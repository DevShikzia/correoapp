export const STAFF_ROLES = ['admin', 'guard'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
