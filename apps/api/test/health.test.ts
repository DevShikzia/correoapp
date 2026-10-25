import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('no se cachea y no expone datos internos', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/mongo|redis|secret|password/i);
  });
});

describe('ruta inexistente', () => {
  it('devuelve un error genérico sin stack trace', async () => {
    const response = await request(app).get('/api/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at \w+\./i);
  });
});
