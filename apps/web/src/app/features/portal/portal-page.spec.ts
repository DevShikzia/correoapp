import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PortalPage } from './portal-page';

const ACCESS_RESPONSE = {
  data: {
    lotNumber: '42',
    expiresAt: '2026-03-01T12:30:00.000Z',
  },
};

const MAIL_ITEM = {
  id: 'mail-1',
  description: 'Carta certificada',
  receivedAt: '2026-03-01T10:00:00.000Z',
  status: 'pending',
  deliveredAt: null,
};

async function settle(fixture: ComponentFixture<PortalPage>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function textOf(fixture: ComponentFixture<PortalPage>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttonByText(
  fixture: ComponentFixture<PortalPage>,
  label: string,
): HTMLButtonElement | undefined {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
    button.textContent?.includes(label),
  );
}

describe('PortalPage', () => {
  let fixture: ComponentFixture<PortalPage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortalPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PortalPage);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function flushAnonymousSession(): Promise<void> {
    const request = httpMock.expectOne('/api/public/me');
    request.flush(
      { error: { code: 'UNAUTHORIZED', message: 'Sesión requerida.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle(fixture);
  }

  async function loginAndLoad(item = MAIL_ITEM): Promise<void> {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '1234' });
    const form = (fixture.nativeElement as HTMLElement).querySelector('form');
    form?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    const accessRequest = httpMock.expectOne('/api/public/access');
    expect(accessRequest.request.method).toBe('POST');
    expect(accessRequest.request.body).toEqual({ lotNumber: '42', pin: '1234' });
    expect(accessRequest.request.withCredentials).toBe(true);
    accessRequest.flush(ACCESS_RESPONSE);
    await settle(fixture);

    const mailRequest = httpMock.expectOne('/api/public/mail?page=1&limit=10');
    expect(mailRequest.request.params.get('lotId')).toBeNull();
    expect(mailRequest.request.params.get('lotNumber')).toBeNull();
    mailRequest.flush({ data: [item], meta: { page: 1, limit: 10, total: 1 } });
    await settle(fixture);
  }

  it('muestra el formulario cuando no hay sesión', async () => {
    await flushAnonymousSession();

    expect(textOf(fixture)).toContain('Consultá tu correspondencia');
    expect((fixture.nativeElement as HTMLElement).querySelector('#lotNumber')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#pin')).not.toBeNull();
    expect(textOf(fixture)).not.toContain('Tu sesión venció');
  });

  it('ingresa y muestra solo la correspondencia del lote', async () => {
    await loginAndLoad();

    const content = textOf(fixture);
    expect(content).toContain('Lote 42');
    expect(content).toContain('Carta certificada');
    expect(content).toContain('Pendiente');
    expect(content).toContain('Recibida el');
  });

  it('muestra un error genérico con PIN incorrecto', async () => {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '9999' });
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    const request = httpMock.expectOne('/api/public/access');
    request.flush(
      { error: { code: 'UNAUTHORIZED', message: 'Lote o PIN incorrectos.' } },
      { status: 401, statusText: 'Unauthorized' },
    );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Lote o PIN incorrectos.');
    expect(textOf(fixture)).toContain('Consultá tu correspondencia');
  });

  it('muestra el límite de intentos', async () => {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '9999' });
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    const request = httpMock.expectOne('/api/public/access');
    request.flush(
      {
        error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Esperá unos minutos.' },
      },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Demasiados intentos. Esperá unos minutos.');
  });

  it('muestra un estado vacío sin correspondencia', async () => {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '1234' });
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    httpMock.expectOne('/api/public/access').flush(ACCESS_RESPONSE);
    await settle(fixture);

    httpMock
      .expectOne('/api/public/mail?page=1&limit=10')
      .flush({ data: [], meta: { page: 1, limit: 10, total: 0 } });
    await settle(fixture);

    expect(textOf(fixture)).toContain('No tenés correspondencia registrada.');
  });

  it('cierra la sesión y vuelve al formulario', async () => {
    await loginAndLoad();

    buttonByText(fixture, 'Salir')?.click();
    await settle(fixture);

    const request = httpMock.expectOne('/api/public/logout');
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(textOf(fixture)).toContain('Consultá tu correspondencia');
  });

  it('vuelve al acceso si la sesión vence al listar', async () => {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '1234' });
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    httpMock.expectOne('/api/public/access').flush(ACCESS_RESPONSE);
    await settle(fixture);

    httpMock
      .expectOne('/api/public/mail?page=1&limit=10')
      .flush(
        { error: { code: 'UNAUTHORIZED', message: 'Sesión inválida o vencida.' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await settle(fixture);

    expect(textOf(fixture)).toContain('Tu sesión venció. Ingresá nuevamente.');
    expect(textOf(fixture)).toContain('Consultá tu correspondencia');
  });

  it('pagina la correspondencia sin enviar el lote', async () => {
    await flushAnonymousSession();

    fixture.componentInstance.form.setValue({ lotNumber: '42', pin: '1234' });
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')
      ?.dispatchEvent(new Event('submit'));
    await settle(fixture);

    httpMock.expectOne('/api/public/access').flush(ACCESS_RESPONSE);
    await settle(fixture);

    httpMock
      .expectOne('/api/public/mail?page=1&limit=10')
      .flush({ data: [MAIL_ITEM], meta: { page: 1, limit: 10, total: 15 } });
    await settle(fixture);

    buttonByText(fixture, 'Siguiente')?.click();
    await settle(fixture);

    const secondPage = httpMock.expectOne('/api/public/mail?page=2&limit=10');
    expect(secondPage.request.params.get('lotId')).toBeNull();
    secondPage.flush({
      data: [{ ...MAIL_ITEM, id: 'mail-11' }],
      meta: { page: 2, limit: 10, total: 15 },
    });
    await settle(fixture);

    expect(textOf(fixture)).toContain('Página 2 de 2');
  });
});
