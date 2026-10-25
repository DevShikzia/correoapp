import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Lot } from '../../core/staff.models';
import { LotsPanel } from './lots-panel';

const LOT: Lot = {
  id: 'lot-1',
  lotNumber: '101',
  ownerNames: ['Familia Uno'],
  contacts: [],
  active: true,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

async function settle(fixture: ComponentFixture<LotsPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<LotsPanel>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttonByText(
  fixture: ComponentFixture<LotsPanel>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

describe('LotsPanel', () => {
  let fixture: ComponentFixture<LotsPanel>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LotsPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LotsPanel);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function loadLots(items: Lot[] = [LOT]): Promise<void> {
    httpMock
      .expectOne('/api/lots?page=1&limit=20')
      .flush({ data: items, meta: { page: 1, limit: 20, total: items.length } });
    await settle(fixture);
  }

  it('crea un lote con contactos', async () => {
    await loadLots([]);

    buttonByText(fixture, 'Agregar contacto')?.click();
    await settle(fixture);

    fixture.componentInstance.createForm.patchValue({
      lotNumber: '102',
      ownerNames: 'Familia Dos, Familia Tres',
      pin: '2222',
    });
    fixture.componentInstance.contacts.at(0).setValue({
      name: 'Contacto Dos',
      phone: '+5491100000002',
    });

    void fixture.componentInstance.submitCreate();
    await settle(fixture);

    const request = httpMock.expectOne('/api/lots');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      lotNumber: '102',
      ownerNames: ['Familia Dos', 'Familia Tres'],
      contacts: [{ name: 'Contacto Dos', phone: '+5491100000002' }],
      pin: '2222',
    });
    expect(request.request.withCredentials).toBe(true);
    request.flush(
      { data: { ...LOT, id: 'lot-2', lotNumber: '102' } },
      { status: 201, statusText: 'Created' },
    );

    await settle(fixture);
    await loadLots([LOT, { ...LOT, id: 'lot-2', lotNumber: '102' }]);

    expect(textOf(fixture)).toContain('Lote 102 creado.');
  });

  it('no envía el alta si los propietarios están vacíos', async () => {
    await loadLots([]);

    fixture.componentInstance.createForm.patchValue({
      lotNumber: '102',
      ownerNames: '',
      pin: '2222',
    });
    void fixture.componentInstance.submitCreate();
    await settle(fixture);

    httpMock.expectNone('/api/lots');
    expect(textOf(fixture)).toContain('Ingresá entre 1 y 10 nombres');
  });

  it('cambia el PIN de un lote', async () => {
    await loadLots();

    buttonByText(fixture, 'Cambiar PIN')?.click();
    await settle(fixture);

    fixture.componentInstance.pinForm.setValue({ pin: '4444' });
    void fixture.componentInstance.submitPin();
    await settle(fixture);

    const request = httpMock.expectOne('/api/lots/lot-1/reset-pin');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ pin: '4444' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(textOf(fixture)).toContain('PIN del lote 101 actualizado.');
  });

  it('desactiva un lote con confirmación', async () => {
    await loadLots();

    buttonByText(fixture, 'Desactivar')?.click();
    await settle(fixture);

    expect(textOf(fixture)).toContain('Confirmar');

    buttonByText(fixture, 'Confirmar')?.click();
    await settle(fixture);

    const request = httpMock.expectOne('/api/lots/lot-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ active: false });
    request.flush({ data: { ...LOT, active: false } });
    await settle(fixture);

    await loadLots([{ ...LOT, active: false }]);

    expect(textOf(fixture)).toContain('Lote 101 desactivado.');
    expect(textOf(fixture)).toContain('sesiones de propietario');
  });
});
