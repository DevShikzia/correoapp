import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StaffUser } from '../../core/staff.models';
import { StaffPanel } from './staff-panel';

const GUARD: StaffUser = {
  id: 'staff-guard',
  username: 'vigilador.uno',
  role: 'guard',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

async function settle(fixture: ComponentFixture<StaffPanel>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<StaffPanel>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttonByText(
  fixture: ComponentFixture<StaffPanel>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

describe('StaffPanel', () => {
  let fixture: ComponentFixture<StaffPanel>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffPanel);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function loadUsers(items: StaffUser[] = [GUARD]): Promise<void> {
    httpMock
      .expectOne('/api/staff?page=1&limit=20')
      .flush({ data: items, meta: { page: 1, limit: 20, total: items.length } });
    await settle(fixture);
  }

  it('crea un usuario vigilador', async () => {
    await loadUsers([]);

    fixture.componentInstance.form.setValue({
      username: 'vigilador.dos',
      password: 'Clave-Segura-2026',
      role: 'guard',
    });
    void fixture.componentInstance.submitCreate();
    await settle(fixture);

    const request = httpMock.expectOne('/api/staff');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      username: 'vigilador.dos',
      password: 'Clave-Segura-2026',
      role: 'guard',
    });
    request.flush(
      { data: { ...GUARD, id: 'staff-2', username: 'vigilador.dos' } },
      { status: 201, statusText: 'Created' },
    );
    await settle(fixture);

    await loadUsers([{ ...GUARD, id: 'staff-2', username: 'vigilador.dos' }]);

    expect(textOf(fixture)).toContain('Usuario vigilador.dos creado.');
  });

  it('cambia el rol de un usuario', async () => {
    await loadUsers();

    void fixture.componentInstance.changeRole(GUARD, 'admin');
    await settle(fixture);

    const request = httpMock.expectOne('/api/staff/staff-guard');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ role: 'admin' });
    request.flush({ data: { ...GUARD, role: 'admin' } });
    await settle(fixture);

    await loadUsers([{ ...GUARD, role: 'admin' }]);

    expect(textOf(fixture)).toContain('Rol de vigilador.uno actualizado a Administrador.');
  });

  it('desactiva un usuario con confirmación', async () => {
    await loadUsers();

    buttonByText(fixture, 'Desactivar')?.click();
    await settle(fixture);

    expect(textOf(fixture)).toContain('Confirmar');

    buttonByText(fixture, 'Confirmar')?.click();
    await settle(fixture);

    const request = httpMock.expectOne('/api/staff/staff-guard');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ active: false });
    request.flush({ data: { ...GUARD, active: false } });
    await settle(fixture);

    await loadUsers([{ ...GUARD, active: false }]);

    expect(textOf(fixture)).toContain('Usuario vigilador.uno desactivado.');
    expect(textOf(fixture)).toContain('sesiones se cerraron');
  });

  it('valida la contraseña mínima antes de enviar', async () => {
    await loadUsers([]);

    fixture.componentInstance.form.setValue({
      username: 'vigilador.dos',
      password: 'corta',
      role: 'guard',
    });
    void fixture.componentInstance.submitCreate();
    await settle(fixture);

    httpMock.expectNone('/api/staff');
    expect(textOf(fixture)).toContain('al menos 12 caracteres');
  });
});
