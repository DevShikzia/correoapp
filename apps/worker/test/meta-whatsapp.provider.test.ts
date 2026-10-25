import { describe, expect, it } from 'vitest';
import { createMetaWhatsappProvider } from '../src/notifications/meta-whatsapp.provider.js';
import { NotificationProviderError } from '../src/notifications/provider.js';

const CONFIG = {
  apiUrl: 'https://graph.example.test/v23.0',
  phoneNumberId: 'phone-1',
  token: 'token-secreto',
  templateName: 'correspondencia_llegada',
  templateLanguage: 'es_AR',
};

function fetchReturning(response: Response, calls: { url: string; init?: RequestInit }[] = []) {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    return response;
  }) as typeof fetch;
}

describe('metaWhatsappProvider', () => {
  it('envía una plantilla con el número de lote y sin descripción', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const provider = createMetaWhatsappProvider(
      CONFIG,
      fetchReturning(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] })), calls),
    );

    const result = await provider.send({
      phone: '+5491122334455',
      lotNumber: '42',
    });

    expect(result.messageId).toBe('wamid.1');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://graph.example.test/v23.0/phone-1/messages');

    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      to: string;
      template: {
        name: string;
        language: { code: string };
        components: { parameters: { text: string }[] }[];
      };
    };

    expect(body.to).toBe('5491122334455');
    expect(body.template.name).toBe('correspondencia_llegada');
    expect(body.template.language.code).toBe('es_AR');
    expect(body.template.components[0]?.parameters.map((parameter) => parameter.text)).toEqual([
      '42',
    ]);
    expect(String(calls[0]?.init?.body)).not.toContain('Carta');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer token-secreto');
  });

  it('marca como definitivo un error 400 con código del proveedor', async () => {
    const provider = createMetaWhatsappProvider(
      CONFIG,
      fetchReturning(new Response(JSON.stringify({ error: { code: 131026 } }), { status: 400 })),
    );

    await expect(provider.send({ phone: '+5491122334455', lotNumber: '42' })).rejects.toMatchObject(
      { code: 'WHATSAPP_131026', retryable: false },
    );
  });

  it('marca como recuperable un error 503', async () => {
    const provider = createMetaWhatsappProvider(
      CONFIG,
      fetchReturning(new Response('no disponible', { status: 503 })),
    );

    await expect(provider.send({ phone: '+5491122334455', lotNumber: '42' })).rejects.toMatchObject(
      { code: 'HTTP_503', retryable: true },
    );
  });

  it('marca como recuperable un timeout de red', async () => {
    const timeoutFetch = (async (): Promise<Response> => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      throw error;
    }) as typeof fetch;
    const provider = createMetaWhatsappProvider(CONFIG, timeoutFetch);

    await expect(provider.send({ phone: '+5491122334455', lotNumber: '42' })).rejects.toMatchObject(
      { code: 'TIMEOUT', retryable: true },
    );
  });

  it('rechaza un teléfono inválido sin llamar a la API', async () => {
    let calls = 0;
    const provider = createMetaWhatsappProvider(CONFIG, (async () => {
      calls += 1;
      return new Response('{}');
    }) as typeof fetch);

    const error = await provider
      .send({ phone: '+12', lotNumber: '42' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotificationProviderError);
    expect(error).toMatchObject({ code: 'INVALID_PHONE', retryable: false });
    expect(calls).toBe(0);
  });
});
