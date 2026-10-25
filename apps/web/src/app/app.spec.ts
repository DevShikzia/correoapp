import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StaffUser } from './core/staff.models';
import { App } from './app';

const GUARD_USER: StaffUser = {
  id: 'staff-guard',
  username: 'vigilador.uno',
  role: 'guard',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};

async function settle(fixture: ComponentFixture<App>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('muestra las tres secciones sin sesión', async () => {
    httpMock
      .expectOne('/api/auth/me')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión requerida.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(fixture);

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('nav a')).toHaveLength(3);
  });

  it('oculta administración a un vigilador', async () => {
    httpMock.expectOne('/api/auth/me').flush({ data: { user: GUARD_USER } });
    await settle(fixture);

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('nav a')).toHaveLength(2);
    expect(compiled.textContent).not.toContain('Administración');
  });
});
