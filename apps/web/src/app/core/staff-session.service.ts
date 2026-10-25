import { Injectable, computed, inject, signal } from '@angular/core';
import { StaffApiService } from './staff-api.service';
import type { StaffUser } from './staff.models';

@Injectable({ providedIn: 'root' })
export class StaffSessionService {
  private readonly api = inject(StaffApiService);
  private readonly userState = signal<StaffUser | null>(null);
  private readonly checkedState = signal(false);
  private pendingCheck: Promise<StaffUser | null> | null = null;

  readonly user = this.userState.asReadonly();
  readonly checked = this.checkedState.asReadonly();
  readonly isAdmin = computed(() => this.userState()?.role === 'admin');

  async ensure(): Promise<StaffUser | null> {
    if (this.checkedState()) {
      return this.userState();
    }

    if (this.pendingCheck !== null) {
      return this.pendingCheck;
    }

    this.pendingCheck = this.refresh().finally(() => {
      this.pendingCheck = null;
    });

    return this.pendingCheck;
  }

  async refresh(): Promise<StaffUser | null> {
    try {
      const user = await this.api.me();
      this.userState.set(user);
      return user;
    } catch {
      this.userState.set(null);
      return null;
    } finally {
      this.checkedState.set(true);
    }
  }

  async login(username: string, password: string): Promise<StaffUser> {
    const session = await this.api.login(username, password);
    this.userState.set(session.user);
    this.checkedState.set(true);

    return session.user;
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout();
    } catch {
      // La sesión local se cierra aunque el servidor no responda.
    } finally {
      this.clear();
    }
  }

  clear(): void {
    this.userState.set(null);
    this.checkedState.set(true);
  }
}
