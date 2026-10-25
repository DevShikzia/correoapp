import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Administración</h1>
    <p>La gestión de lotes y vigiladores se habilita en la Fase 2.</p>
  `,
})
export class AdminPage {}
