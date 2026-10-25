import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  readonly showAdmin = computed(() => this.session.user()?.role !== 'guard');

  constructor() {
    void this.session.ensure();
  }
}
