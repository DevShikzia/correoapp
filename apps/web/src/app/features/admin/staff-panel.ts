import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StaffApiService } from '../../core/staff-api.service';
import { isUnauthorized, staffErrorMessage } from '../../core/staff-errors';
import { StaffSessionService } from '../../core/staff-session.service';
import type { StaffRole, StaffUser } from '../../core/staff.models';

const PAGE_SIZE = 20;
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,30}[a-zA-Z0-9]$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

@Component({
  selector: 'app-staff-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './staff-panel.html',
  styleUrls: ['../../shared/staff-ui.css', './staff-panel.css'],
})
export class StaffPanel {
  private readonly api = inject(StaffApiService);
  private readonly session = inject(StaffSessionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  readonly sessionExpired = output<void>();
  readonly passwordMinLength = PASSWORD_MIN_LENGTH;

  readonly users = signal<StaffUser[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly creating = signal(false);
  readonly changingId = signal<string | null>(null);
  readonly pendingStatusUserId = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hasNextPage = computed(() => this.page() < this.totalPages());

  readonly form = this.formBuilder.nonNullable.group({
    username: [
      '',
      [
        Validators.required,
        Validators.pattern(USERNAME_PATTERN),
        Validators.minLength(3),
        Validators.maxLength(32),
      ],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
      ],
    ],
    role: ['guard' as StaffRole, [Validators.required]],
  });

  constructor() {
    void this.load(1);
  }

  async submitCreate(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    this.clearMessages();
    this.creating.set(true);

    try {
      const user = await this.api.createStaff({
        username: raw.username,
        password: raw.password,
        role: raw.role,
      });

      this.form.reset({ username: '', password: '', role: 'guard' });
      this.successMessage.set(`Usuario ${user.username} creado.`);
      await this.load(1);
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.creating.set(false);
    }
  }

  async changeRole(user: StaffUser, role: string): Promise<void> {
    if ((role !== 'admin' && role !== 'guard') || role === user.role || this.isCurrentUser(user)) {
      return;
    }

    await this.update(user, { role });
  }

  requestStatusChange(user: StaffUser): void {
    if (this.isCurrentUser(user)) {
      return;
    }

    this.clearMessages();
    this.pendingStatusUserId.set(user.id);
  }

  cancelStatusChange(): void {
    this.pendingStatusUserId.set(null);
  }

  async confirmStatusChange(user: StaffUser): Promise<void> {
    if (
      this.pendingStatusUserId() !== user.id ||
      this.changingId() !== null ||
      this.isCurrentUser(user)
    ) {
      return;
    }

    await this.update(user, { active: !user.active });
  }

  async goToPage(page: number): Promise<void> {
    if (this.loading() || page < 1 || page > this.totalPages()) {
      return;
    }

    await this.load(page);
  }

  isCurrentUser(user: StaffUser): boolean {
    return this.session.user()?.id === user.id;
  }

  roleLabel(role: StaffRole): string {
    return role === 'admin' ? 'Administrador' : 'Vigilador';
  }

  formatDate(value: string | null): string {
    if (value === null) {
      return 'Nunca';
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : this.dateFormatter.format(date);
  }

  private async update(
    user: StaffUser,
    changes: { role?: StaffRole; active?: boolean },
  ): Promise<void> {
    this.clearMessages();
    this.changingId.set(user.id);

    try {
      const updated = await this.api.updateStaff(user.id, changes);

      this.pendingStatusUserId.set(null);
      this.successMessage.set(
        changes.active === undefined
          ? `Rol de ${updated.username} actualizado a ${this.roleLabel(updated.role)}.`
          : updated.active
            ? `Usuario ${updated.username} activado.`
            : `Usuario ${updated.username} desactivado. Sus sesiones se cerraron.`,
      );
      await this.load(this.page());
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
        await this.load(this.page());
      }
    } finally {
      this.changingId.set(null);
    }
  }

  private async load(page: number): Promise<void> {
    if (page < 1) {
      return;
    }

    this.loading.set(true);
    this.listError.set(null);

    try {
      const result = await this.api.listStaff(page, PAGE_SIZE);
      this.users.set(result.items);
      this.page.set(result.meta.page);
      this.total.set(result.meta.total);
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.listError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private handleExpiredSession(error: unknown): boolean {
    if (!isUnauthorized(error)) {
      return false;
    }

    this.sessionExpired.emit();

    return true;
  }

  private clearMessages(): void {
    this.actionError.set(null);
    this.successMessage.set(null);
  }
}
