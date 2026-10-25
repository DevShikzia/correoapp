import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StaffApiService } from '../../core/staff-api.service';
import { isUnauthorized, staffErrorMessage } from '../../core/staff-errors';
import { StaffSessionService } from '../../core/staff-session.service';
import type { StaffMailItem } from '../../core/staff.models';
import { StaffLogin } from '../../shared/staff-login/staff-login';

const PAGE_SIZE = 20;
const LOT_NUMBER_PATTERN = /^[0-9]{1,6}$/;
const DESCRIPTION_MAX_LENGTH = 200;

type ViewState = 'checking' | 'login' | 'ready';

@Component({
  selector: 'app-staff-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, StaffLogin],
  templateUrl: './staff-page.html',
  styleUrls: ['../../shared/staff-ui.css', './staff-page.css'],
})
export class StaffPage {
  private readonly api = inject(StaffApiService);
  private readonly session = inject(StaffSessionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  readonly state = signal<ViewState>('checking');
  readonly user = this.session.user;
  readonly pending = signal<StaffMailItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly listLoading = signal(false);
  readonly registering = signal(false);
  readonly deliveringId = signal<string | null>(null);
  readonly pendingDeliveryId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionSuccess = signal<string | null>(null);
  readonly listError = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hasNextPage = computed(() => this.page() < this.totalPages());

  readonly form = this.formBuilder.nonNullable.group({
    lotNumber: ['', [Validators.required, Validators.pattern(LOT_NUMBER_PATTERN)]],
    description: ['', [Validators.maxLength(DESCRIPTION_MAX_LENGTH)]],
  });

  constructor() {
    void this.initialize();
  }

  async submitRegister(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { lotNumber, description } = this.form.getRawValue();
    const trimmedDescription = description.trim();

    this.registering.set(true);
    this.actionError.set(null);
    this.actionSuccess.set(null);

    try {
      await this.api.registerMail({
        lotNumber,
        ...(trimmedDescription.length > 0 ? { description: trimmedDescription } : {}),
      });
      this.form.reset({ lotNumber: '', description: '' });
      this.actionSuccess.set('Correspondencia registrada.');
      await this.loadPending(1);
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.registering.set(false);
    }
  }

  requestDelivery(id: string): void {
    this.pendingDeliveryId.set(id);
    this.actionError.set(null);
    this.actionSuccess.set(null);
  }

  cancelDelivery(): void {
    this.pendingDeliveryId.set(null);
  }

  async confirmDelivery(item: StaffMailItem): Promise<void> {
    if (this.pendingDeliveryId() !== item.id || this.deliveringId() !== null) {
      return;
    }

    this.deliveringId.set(item.id);
    this.actionError.set(null);
    this.actionSuccess.set(null);

    try {
      await this.api.deliverMail(item.id);
      this.pendingDeliveryId.set(null);
      this.actionSuccess.set(`Entrega registrada para el lote ${item.lotNumber}.`);
      await this.loadPending(this.page());
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
        await this.loadPending(this.page());
      }
    } finally {
      this.deliveringId.set(null);
    }
  }

  async goToPage(page: number): Promise<void> {
    if (this.listLoading() || page < 1 || page > this.totalPages()) {
      return;
    }

    await this.loadPending(page);
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
    } finally {
      this.resetData();
      this.state.set('login');
    }
  }

  onLoggedIn(): void {
    this.actionError.set(null);
    this.actionSuccess.set(null);
    this.state.set('ready');
    void this.loadPending(1);
  }

  formatDate(value: string): string {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : this.dateFormatter.format(date);
  }

  private async initialize(): Promise<void> {
    const user = await this.session.ensure();

    if (user === null) {
      this.state.set('login');
      return;
    }

    this.state.set('ready');
    await this.loadPending(1);
  }

  private async loadPending(page: number): Promise<void> {
    if (page < 1) {
      return;
    }

    this.listLoading.set(true);
    this.listError.set(null);

    try {
      const result = await this.api.listPending(page, PAGE_SIZE);
      this.pending.set(result.items);
      this.page.set(result.meta.page);
      this.total.set(result.meta.total);
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.listError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.listLoading.set(false);
    }
  }

  private handleExpiredSession(error: unknown): boolean {
    if (!isUnauthorized(error)) {
      return false;
    }

    this.session.clear();
    this.resetData();
    this.state.set('login');
    this.actionError.set(staffErrorMessage(error, 'session'));

    return true;
  }

  private resetData(): void {
    this.pending.set([]);
    this.page.set(1);
    this.total.set(0);
    this.listError.set(null);
    this.pendingDeliveryId.set(null);
    this.deliveringId.set(null);
  }
}
