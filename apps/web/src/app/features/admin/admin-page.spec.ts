import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import type { StaffUser } from '../../core/staff.models';
import { StaffLogin } from '../../shared/staff-login/staff-login';
import { AdminPage } from './admin-page';

const ADMIN_USER: StaffUser = {
  id: 'staff-admin',
  username: 'admin',
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

const GUARD_USER: StaffUser = {
  ...ADMIN_USER,
  id: 'staff-guard',
  username: 'vigilador.uno',
  role: 'guard',
};

async function settle(fixture: ComponentFixture<AdminPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<AdminPage>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttonByText(
  fixture: ComponentFixture<AdminPage>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

describe('AdminPage', () => {
  let fixture: ComponentFixture<AdminPage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function createPage(user: StaffUser): Promise<void> {
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();

    httpMock.expectOne('/api/auth/me').flush({ data: { user } });
    await settle(fixture);
  }

  it('muestra el acceso cuando no hay sesión', async () => {
    fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/auth/me')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión requerida.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Ingresá con un usuario administrador.');
    expect(fixture.debugElement.query(By.directive(StaffLogin))).not.toBeNull();
  });

  it('bloquea la administración a un vigilador', async () => {
    await createPage(GUARD_USER);

    expect(textOf(fixture)).toContain('No tenés permisos para acceder a administración.');
    expect(textOf(fixture)).toContain('Ir a Vigilancia');
  });

  it('carga lotes y cambia a vigiladores', async () => {
    await createPage(ADMIN_USER);

    httpMock
      .expectOne('/api/lots?page=1&limit=20')
      .flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    await settle(fixture);

    expect(textOf(fixture)).toContain('Nuevo lote');
    expect(textOf(fixture)).toContain('No hay lotes');

    buttonByText(fixture, 'Vigiladores')?.click();
    await settle(fixture);

    httpMock
      .expectOne('/api/staff?page=1&limit=20')
      .flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    await settle(fixture);

    expect(textOf(fixture)).toContain('Nuevo usuario');
    expect(textOf(fixture)).toContain('No hay usuarios');
  });
});
