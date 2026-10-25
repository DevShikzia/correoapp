import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { StaffMailItem, StaffUser } from '../../core/staff.models';
import { StaffLogin } from '../../shared/staff-login/staff-login';
import { StaffPage } from './staff-page';

const GUARD_USER: StaffUser = {
  id: 'staff-guard',
  username: 'vigilador.uno',
  role: 'guard',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const MAIL_ITEM: StaffMailItem = {
  id: 'mail-1',
  lotId: 'lot-1',
  lotNumber: '101',
  description: 'Carta certificada',
  receivedAt: '2026-03-01T10:00:00.000Z',
  receivedBy: 'staff-guard',
  status: 'pending',
  deliveredAt: null,
  deliveredBy: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
};

async function settle(fixture: ComponentFixture<StaffPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<StaffPage>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttonByText(
  fixture: ComponentFixture<StaffPage>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

function pendingPage(items: StaffMailItem[], total = items.length) {
  return { data: items, meta: { page: 1, limit: 20, total } };
}

describe('StaffPage', () => {
  let fixture: ComponentFixture<StaffPage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function createPage(user: StaffUser | null, items: StaffMailItem[] = []): Promise<void> {
    fixture = TestBed.createComponent(StaffPage);
    fixture.detectChanges();

    const sessionRequest = httpMock.expectOne('/api/auth/me');

    if (user === null) {
      sessionRequest.flush(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión requerida.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
      await settle(fixture);
      return;
    }

    sessionRequest.flush({ data: { user } });
    await settle(fixture);

    httpMock.expectOne('/api/mail/pending?page=1&limit=20').flush(pendingPage(items));
    await settle(fixture);
  }

  it('muestra el acceso cuando no hay sesión', async () => {
    await createPage(null);

    expect(textOf(fixture)).toContain('Ingresá con tu usuario');
    expect(fixture.debugElement.query(By.directive(StaffLogin))).not.toBeNull();
  });

  it('inicia sesión y carga los pendientes', async () => {
    await createPage(null);

    const login = fixture.debugElement.query(By.directive(StaffLogin))
      .componentInstance as StaffLogin;
    login.form.setValue({ username: 'vigilador.uno', password: 'Clave-Segura-2026' });
    void login.submit();
    await settle(fixture);

    httpMock
      .expectOne('/api/auth/login')
      .flush({ data: { user: GUARD_USER, expiresAt: '2026-03-01T12:00:00.000Z' } });
    await settle(fixture);

    httpMock.expectOne('/api/mail/pending?page=1&limit=20').flush(pendingPage([MAIL_ITEM]));
    await settle(fixture);

    expect(textOf(fixture)).toContain('Lote 101');
    expect(textOf(fixture)).toContain('Carta certificada');
    expect(textOf(fixture)).toContain('Vigilador');
  });

  it('registra correspondencia y recarga la lista', async () => {
    await createPage(GUARD_USER);

    fixture.componentInstance.form.setValue({ lotNumber: '101', description: '  Carta  ' });
    void fixture.componentInstance.submitRegister();
    await settle(fixture);

    const request = httpMock.expectOne('/api/mail');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ lotNumber: '101', description: 'Carta' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: MAIL_ITEM }, { status: 201, statusText: 'Created' });
    await settle(fixture);

    httpMock.expectOne('/api/mail/pending?page=1&limit=20').flush(pendingPage([MAIL_ITEM]));
    await settle(fixture);

    expect(textOf(fixture)).toContain('Correspondencia registrada.');
    expect(textOf(fixture)).toContain('Lote 101');
  });

  it('pide confirmación antes de entregar y recarga los pendientes', async () => {
    await createPage(GUARD_USER, [MAIL_ITEM]);

    buttonByText(fixture, 'Entregar')?.click();
    await settle(fixture);

    expect(textOf(fixture)).toContain('Confirmar entrega');

    buttonByText(fixture, 'Confirmar entrega')?.click();
    await settle(fixture);

    const request = httpMock.expectOne('/api/mail/mail-1/deliver');
    expect(request.request.method).toBe('PATCH');
    request.flush({ data: { ...MAIL_ITEM, status: 'delivered' } });
    await settle(fixture);

    httpMock.expectOne('/api/mail/pending?page=1&limit=20').flush(pendingPage([]));
    await settle(fixture);

    expect(textOf(fixture)).toContain('Entrega registrada para el lote 101.');
    expect(textOf(fixture)).toContain('No hay correspondencia pendiente.');
  });

  it('vuelve al acceso si la sesión vence', async () => {
    await createPage(GUARD_USER);

    buttonByText(fixture, 'Actualizar')?.click();
    await settle(fixture);

    httpMock
      .expectOne('/api/mail/pending?page=1&limit=20')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión inválida o vencida.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Tu sesión venció. Ingresá nuevamente.');
    expect(fixture.debugElement.query(By.directive(StaffLogin))).not.toBeNull();
  });

  it('cierra la sesión local aunque el servidor no responda', async () => {
    await createPage(GUARD_USER, [MAIL_ITEM]);

    buttonByText(fixture, 'Salir')?.click();
    await settle(fixture);

    httpMock
      .expectOne('/api/auth/logout')
      .flush(
        { error: { code: 'INTERNAL_ERROR', message: 'Error interno.' } },
        { status: 500, statusText: 'Internal Server Error' },
      );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Ingresá con tu usuario');
    expect(fixture.debugElement.query(By.directive(StaffLogin))).not.toBeNull();
  });
});
