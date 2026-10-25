import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-portal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Portal del propietario</h1>
    <p>El acceso con número de lote y PIN se habilita en la Fase 5.</p>
  `,
})
export class PortalPage {}
