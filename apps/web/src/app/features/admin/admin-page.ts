import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StaffSessionService } from '../../core/staff-session.service';
import type { StaffUser } from '../../core/staff.models';
import { StaffLogin } from '../../shared/staff-login/staff-login';
import { LotsPanel } from './lots-panel';
import { StaffPanel } from './staff-panel';

type ViewState = 'checking' | 'login' | 'forbidden' | 'ready';
type AdminTab = 'lots' | 'staff';

@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StaffLogin, LotsPanel, StaffPanel],
  templateUrl: './admin-page.html',
  styleUrls: ['../../shared/staff-ui.css', './admin-page.css'],
})
export class AdminPage {
  private readonly session = inject(StaffSessionService);

  readonly state = signal<ViewState>('checking');
  readonly activeTab = signal<AdminTab>('lots');
  readonly user = this.session.user;
  readonly notice = signal<string | null>(null);

  constructor() {
    void this.initialize();
  }

  onLoggedIn(): void {
    this.notice.set(null);
    this.applyUser(this.session.user());
  }

  selectTab(tab: AdminTab): void {
    this.activeTab.set(tab);
  }

  async logout(): Promise<void> {
    await this.session.logout();
    this.state.set('login');
    this.notice.set(null);
  }

  onSessionExpired(): void {
    this.session.clear();
    this.state.set('login');
    this.notice.set('Tu sesión venció. Ingresá nuevamente.');
  }

  private async initialize(): Promise<void> {
    const user = await this.session.ensure();
    this.applyUser(user);
  }

  private applyUser(user: StaffUser | null): void {
    if (user === null) {
      this.state.set('login');
      return;
    }

    if (user.role !== 'admin') {
      this.state.set('forbidden');
      return;
    }

    this.state.set('ready');
  }
}
