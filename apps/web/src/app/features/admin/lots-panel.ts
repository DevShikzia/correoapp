import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type FormArray,
  type FormControl,
  type FormGroup,
  type ValidationErrors,
} from '@angular/forms';
import { StaffApiService } from '../../core/staff-api.service';
import { isUnauthorized, staffErrorMessage } from '../../core/staff-errors';
import type { Lot, LotContact } from '../../core/staff.models';

const PAGE_SIZE = 20;
const LOT_NUMBER_PATTERN = /^[0-9]{1,6}$/;
const PIN_PATTERN = /^[0-9]{4,8}$/;
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const OWNER_NAME_MAX_LENGTH = 120;
const CONTACT_NAME_MAX_LENGTH = 80;
const MAX_OWNERS = 10;
const MAX_CONTACTS = 5;

type ContactGroup = FormGroup<{
  name: FormControl<string>;
  phone: FormControl<string>;
}>;

function parseOwnerNames(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function ownerNamesValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  const names = parseOwnerNames(value);

  if (names.length === 0) {
    return { required: true };
  }

  if (
    names.length > MAX_OWNERS ||
    names.some((name) => name.length < 2 || name.length > OWNER_NAME_MAX_LENGTH)
  ) {
    return { ownerNames: true };
  }

  return null;
}

@Component({
  selector: 'app-lots-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './lots-panel.html',
  styleUrls: ['../../shared/staff-ui.css', './lots-panel.css'],
})
export class LotsPanel {
  private readonly api = inject(StaffApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' });

  readonly sessionExpired = output<void>();
  readonly maxContacts = MAX_CONTACTS;

  readonly lots = signal<Lot[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly listError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly creating = signal(false);
  readonly savingEdit = signal(false);
  readonly savingPin = signal(false);
  readonly changingStatusId = signal<string | null>(null);
  readonly editingLot = signal<Lot | null>(null);
  readonly pinLot = signal<Lot | null>(null);
  readonly pendingStatusLotId = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hasNextPage = computed(() => this.page() < this.totalPages());

  readonly searchForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(80)]],
  });

  readonly contacts = this.formBuilder.array<ContactGroup>([]);
  readonly createForm = this.formBuilder.nonNullable.group({
    lotNumber: ['', [Validators.required, Validators.pattern(LOT_NUMBER_PATTERN)]],
    ownerNames: ['', [Validators.required, ownerNamesValidator]],
    pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN)]],
    contacts: this.contacts,
  });

  readonly editContacts = this.formBuilder.array<ContactGroup>([]);
  readonly editForm = this.formBuilder.nonNullable.group({
    ownerNames: ['', [Validators.required, ownerNamesValidator]],
    contacts: this.editContacts,
  });

  readonly pinForm = this.formBuilder.nonNullable.group({
    pin: ['', [Validators.required, Validators.pattern(PIN_PATTERN)]],
  });

  constructor() {
    void this.load(1);
  }

  async submitSearch(): Promise<void> {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }

    await this.load(1);
  }

  async clearSearch(): Promise<void> {
    this.searchForm.reset({ search: '' });
    await this.load(1);
  }

  addContact(): void {
    if (this.contacts.length >= MAX_CONTACTS) {
      return;
    }

    this.contacts.push(this.createContactGroup());
  }

  removeContact(index: number): void {
    this.contacts.removeAt(index);
  }

  addEditContact(): void {
    if (this.editContacts.length >= MAX_CONTACTS) {
      return;
    }

    this.editContacts.push(this.createContactGroup());
  }

  removeEditContact(index: number): void {
    this.editContacts.removeAt(index);
  }

  async submitCreate(): Promise<void> {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const raw = this.createForm.getRawValue();
    const ownerNames = parseOwnerNames(raw.ownerNames);

    this.clearMessages();
    this.creating.set(true);

    try {
      const lot = await this.api.createLot({
        lotNumber: raw.lotNumber,
        ownerNames,
        contacts: this.readContacts(this.contacts),
        pin: raw.pin,
      });

      this.createForm.reset({ lotNumber: '', ownerNames: '', pin: '' });
      this.contacts.clear();
      this.successMessage.set(`Lote ${lot.lotNumber} creado.`);
      await this.load(1);
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.creating.set(false);
    }
  }

  startEdit(lot: Lot): void {
    this.clearMessages();
    this.editingLot.set(lot);
    this.editForm.controls.ownerNames.setValue(lot.ownerNames.join(', '));
    this.editContacts.clear();

    for (const contact of lot.contacts) {
      this.editContacts.push(this.createContactGroup(contact));
    }
  }

  cancelEdit(): void {
    this.editingLot.set(null);
    this.editForm.reset({ ownerNames: '' });
    this.editContacts.clear();
  }

  async saveEdit(): Promise<void> {
    const lot = this.editingLot();

    if (lot === null) {
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const raw = this.editForm.getRawValue();

    this.clearMessages();
    this.savingEdit.set(true);

    try {
      const updated = await this.api.updateLot(lot.id, {
        ownerNames: parseOwnerNames(raw.ownerNames),
        contacts: this.readContacts(this.editContacts),
      });

      this.editingLot.set(null);
      this.editForm.reset({ ownerNames: '' });
      this.editContacts.clear();
      this.successMessage.set(`Lote ${updated.lotNumber} actualizado.`);
      await this.load(this.page());
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.savingEdit.set(false);
    }
  }

  requestStatusChange(lot: Lot): void {
    this.clearMessages();
    this.pendingStatusLotId.set(lot.id);
  }

  cancelStatusChange(): void {
    this.pendingStatusLotId.set(null);
  }

  async confirmStatusChange(lot: Lot): Promise<void> {
    if (this.pendingStatusLotId() !== lot.id || this.changingStatusId() !== null) {
      return;
    }

    this.clearMessages();
    this.changingStatusId.set(lot.id);

    try {
      const updated = await this.api.updateLot(lot.id, { active: !lot.active });
      this.pendingStatusLotId.set(null);
      this.successMessage.set(
        updated.active
          ? `Lote ${updated.lotNumber} activado.`
          : `Lote ${updated.lotNumber} desactivado. Se cerraron las sesiones de propietario.`,
      );
      await this.load(this.page());
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.changingStatusId.set(null);
    }
  }

  startPin(lot: Lot): void {
    this.clearMessages();
    this.pinLot.set(lot);
    this.pinForm.reset({ pin: '' });
  }

  cancelPin(): void {
    this.pinLot.set(null);
    this.pinForm.reset({ pin: '' });
  }

  async submitPin(): Promise<void> {
    const lot = this.pinLot();

    if (lot === null) {
      return;
    }

    if (this.pinForm.invalid) {
      this.pinForm.markAllAsTouched();
      return;
    }

    this.clearMessages();
    this.savingPin.set(true);

    try {
      await this.api.resetPin(lot.id, this.pinForm.getRawValue().pin);
      this.pinLot.set(null);
      this.pinForm.reset({ pin: '' });
      this.successMessage.set(
        `PIN del lote ${lot.lotNumber} actualizado. Se cerraron las sesiones de propietario.`,
      );
    } catch (error) {
      if (!this.handleExpiredSession(error)) {
        this.actionError.set(staffErrorMessage(error, 'action'));
      }
    } finally {
      this.savingPin.set(false);
    }
  }

  async goToPage(page: number): Promise<void> {
    if (this.loading() || page < 1 || page > this.totalPages()) {
      return;
    }

    await this.load(page);
  }

  formatDate(value: string): string {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? '' : this.dateFormatter.format(date);
  }

  private async load(page: number): Promise<void> {
    if (page < 1) {
      return;
    }

    this.loading.set(true);
    this.listError.set(null);

    try {
      const search = this.searchForm.controls.search.value.trim();
      const result = await this.api.listLots(
        page,
        PAGE_SIZE,
        search.length > 0 ? search : undefined,
      );
      this.lots.set(result.items);
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

  private createContactGroup(contact?: LotContact): ContactGroup {
    return this.formBuilder.nonNullable.group({
      name: [
        contact?.name ?? '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(CONTACT_NAME_MAX_LENGTH),
        ],
      ],
      phone: [contact?.phone ?? '', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    });
  }

  private readContacts(array: FormArray<ContactGroup>): LotContact[] {
    return array.getRawValue();
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
