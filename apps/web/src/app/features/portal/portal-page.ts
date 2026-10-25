import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { OwnerApiService } from './owner-api.service';
import { isUnauthorized, ownerErrorMessage } from './owner-errors';
import type { OwnerMailItem } from './portal.models';

const PAGE_SIZE = 10;
const LOT_NUMBER_PATTERN = /^[0-9]{1,6}$/;
const PIN_PATTERN = /^[0-9]{4,8}$/;

type ViewState = 'checking' | 'access' | 'mail';

@Component({
  selector: 'app-portal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './portal-page.html',
  styleUrl: './portal-page.css',
})
export class PortalPage {
  private readonly api = inject(OwnerApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  private readonly timeFormatter = new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' });

  readonly state = signal<ViewState>('checking');
  readonly lotNumber = signal<string | null>(null);
  readonly items = signal<OwnerMailItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly showPin = signal(false);
  readonly expandedId = signal<string | null>(null);
  readonly updatedAt = signal<Date | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hasNextPage = computed(() => this.page() < this.totalPages());
  readonly itemsLabel = computed(() =>
    this.total() === 1 ? 'envío registrado' : 'envíos registrados',
  );

  readonly form = this.formBuilder.nonNullable.group({
    lotNumber: ['', [Validators.required, Validators.pattern(LOT_NUMBER_PATTERN)]],
    pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN)]],
  });

  constructor() {
    void this.checkSession();
  }

  async checkSession(): Promise<void> {
    this.state.set('checking');
    this.errorMessage.set(null);

    try {
      const session = await this.api.me();
      this.lotNumber.set(session.lotNumber);
      await this.loadMail(1);
    } catch (error) {
      this.state.set('access');

      if (!isUnauthorized(error)) {
        this.errorMessage.set(ownerErrorMessage(error, 'session'));
      }
    }
  }

  async submitAccess(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { lotNumber, pin } = this.form.getRawValue();
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const session = await this.api.access(lotNumber, pin);
      this.lotNumber.set(session.lotNumber);
      this.form.reset({ lotNumber: '', pin: '' });
      this.showPin.set(false);
      await this.loadMail(1);
    } catch (error) {
      this.errorMessage.set(ownerErrorMessage(error, 'access'));
    } finally {
      this.loading.set(false);
    }
  }

  async loadMail(page: number): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const result = await this.api.listMail(page, PAGE_SIZE);
      this.items.set(result.items);
      this.page.set(result.meta.page);
      this.total.set(result.meta.total);
      this.updatedAt.set(new Date());
      this.state.set('mail');
    } catch (error) {
      if (isUnauthorized(error)) {
        this.resetToAccess(ownerErrorMessage(error, 'list'));
        return;
      }

      this.errorMessage.set(ownerErrorMessage(error, 'list'));
      this.state.set('mail');
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.loading()) {
      return;
    }

    await this.loadMail(this.page());
  }

  async goToPage(page: number): Promise<void> {
    if (this.loading() || page < 1 || page > this.totalPages()) {
      return;
    }

    this.expandedId.set(null);
    await this.loadMail(page);
  }

  async logout(): Promise<void> {
    this.loading.set(true);
    let failureMessage: string | null = null;

    try {
      await this.api.logout();
    } catch (error) {
      failureMessage = ownerErrorMessage(error, 'session');
    } finally {
      this.resetToAccess(failureMessage);
      this.loading.set(false);
    }
  }

  togglePin(): void {
    this.showPin.update((visible) => !visible);
  }

  toggleDetails(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  formatDate(value: string): string {
    return this.formatWith(this.dateFormatter, value);
  }

  formatTime(value: Date): string {
    return this.timeFormatter.format(value);
  }

  statusLabel(item: OwnerMailItem): string {
    return item.status === 'delivered' ? 'Entregada' : 'Pendiente';
  }

  private formatWith(formatter: Intl.DateTimeFormat, value: string): string {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : formatter.format(date);
  }

  private resetToAccess(message: string | null): void {
    this.state.set('access');
    this.lotNumber.set(null);
    this.items.set([]);
    this.page.set(1);
    this.total.set(0);
    this.errorMessage.set(message);
    this.expandedId.set(null);
    this.updatedAt.set(null);
    this.showPin.set(false);
    this.form.reset({ lotNumber: '', pin: '' });
  }
}
