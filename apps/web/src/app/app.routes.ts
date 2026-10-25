import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'portal' },
  {
    path: 'portal',
    title: 'Portal del propietario',
    loadComponent: () => import('./features/portal/portal-page').then((page) => page.PortalPage),
  },
  {
    path: 'staff',
    title: 'Vigilancia',
    loadComponent: () => import('./features/staff/staff-page').then((page) => page.StaffPage),
  },
  {
    path: 'admin',
    title: 'Administración',
    loadComponent: () => import('./features/admin/admin-page').then((page) => page.AdminPage),
  },
  { path: '**', redirectTo: 'portal' },
];
