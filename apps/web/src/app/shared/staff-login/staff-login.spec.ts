import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StaffUser } from '../../core/staff.models';
import { StaffLogin } from './staff-login';

const STAFF_USER: StaffUser = {
  id: 'staff-1',
  username: 'admin',
  role: 'admin',
  active: true,
  lastLoginAt: '2026-03-01T10:00:00.000Z',
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

async function settle(fixture: ComponentFixture<StaffLogin>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<StaffLogin>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

describe('StaffLogin', () => {
  let fixture: ComponentFixture<StaffLogin>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StaffLogin],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(StaffLogin);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('inicia sesión y emite el usuario', async () => {
    let emitted: StaffUser | undefined;
    fixture.componentInstance.loggedIn.subscribe((user) => {
      emitted = user;
    });
    fixture.componentInstance.form.setValue({
      username: 'admin',
      password: 'Clave-Segura-2026',
    });

    void fixture.componentInstance.submit();
    await settle(fixture);

    const request = httpMock.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'admin', password: 'Clave-Segura-2026' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ data: { user: STAFF_USER, expiresAt: '2026-03-01T12:00:00.000Z' } });
    await settle(fixture);

    expect(emitted?.username).toBe('admin');
    expect(fixture.componentInstance.form.getRawValue()).toEqual({ username: '', password: '' });
  });

  it('muestra un mensaje genérico con credenciales incorrectas', async () => {
    fixture.componentInstance.form.setValue({ username: 'admin', password: 'incorrecta' });

    void fixture.componentInstance.submit();
    await settle(fixture);

    httpMock
      .expectOne('/api/auth/login')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Usuario o contraseña incorrectos.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Usuario o contraseña incorrectos.');
  });

  it('muestra el límite de intentos', async () => {
    fixture.componentInstance.form.setValue({ username: 'admin', password: 'incorrecta' });

    void fixture.componentInstance.submit();
    await settle(fixture);

    httpMock.expectOne('/api/auth/login').flush(
      {
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Demasiados intentos. Esperá unos minutos.',
        },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Demasiados intentos. Esperá unos minutos.');
  });
});
