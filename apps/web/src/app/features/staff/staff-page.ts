import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-staff-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Vigilancia</h1>
    <p>El registro de correspondencia se habilita en la Fase 4.</p>
  `,
})
export class StaffPage {}
