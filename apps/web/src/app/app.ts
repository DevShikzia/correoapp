import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { StaffSessionService } from './core/staff-session.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly session = inject(StaffSessionService);
  private readonly router = inject(Router);

  // El portal del propietario es una vista pública e independiente: no comparte
  // la barra de navegación interna para no exponer Vigilancia ni Administración.
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly isPortal = computed(() => this.currentUrl().startsWith('/portal'));
  readonly showAdmin = computed(() => this.session.user()?.role !== 'guard');

  constructor() {
    void this.session.ensure();
  }
}
