#!/usr/bin/env node
/**
 * Prueba de humo HTTP contra una API real y una base descartable.
 *
 * Uso:
 *   SMOKE_ADMIN_USERNAME=... SMOKE_ADMIN_PASSWORD=... pnpm smoke:http
 *
 * Variables opcionales:
 *   SMOKE_BASE_URL   por defecto http://127.0.0.1:3000/api
 *   SMOKE_ORIGIN     por defecto http://localhost:4200 (debe coincidir con APP_ORIGIN)
 *   SMOKE_GUARD_PASSWORD  si se omite se genera una aleatoria
 *
 * La base debe estar recién creada y contener solo el administrador de bootstrap:
 * el script no elimina lotes ni usuarios y espera que 101, 102 y 103 no existan.
 * No ejecutar contra una base con datos reales.
 */

import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000/api';
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:4200';
const ADMIN_USERNAME = process.env.SMOKE_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const GUARD_USERNAME = 'vigilador.smoke';
const GUARD_PASSWORD = process.env.SMOKE_GUARD_PASSWORD ?? `Smoke-${randomUUID()}-2026!`;

if (ADMIN_USERNAME === undefined || ADMIN_PASSWORD === undefined) {
  console.error('Definí SMOKE_ADMIN_USERNAME y SMOKE_ADMIN_PASSWORD.');
  process.exit(1);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  apply(headers) {
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }
  }

  store(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, attrValue = ''] = attribute.split('=');
        return key.trim().toLowerCase() === 'max-age' && Number(attrValue.trim()) <= 0;
      });

      if (value === '' || expired) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  raw(name) {
    return this.cookies.get(name);
  }
}

const results = [];

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(
    `${condition ? 'PASS' : 'FAIL'}  ${name}${condition || !detail ? '' : ` :: ${detail}`}`,
  );
}

function abort(message) {
  console.error(`\nABORTADO: ${message}`);
  process.exit(1);
}

async function call(method, path, options = {}) {
  const { body, jar, headers = {} } = options;
  const requestHeaders = { accept: 'application/json', origin: ORIGIN, ...headers };

  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }

  jar?.apply(requestHeaders);

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.store(response);

  const text = await response.text();
  let parsed;

  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  return {
    status: response.status,
    body: parsed,
    headers: response.headers,
    setCookies: response.headers.getSetCookie(),
  };
}

function expectStatus(label, response, status) {
  check(
    `${label} → ${status}`,
    response.status === status,
    `recibido ${response.status}: ${JSON.stringify(response.body)}`,
  );
}

async function main() {
  const adminJar = new CookieJar();
  const guardJar = new CookieJar();
  const ownerJar = new CookieJar();

  const health = await call('GET', '/health');
  expectStatus('health', health, 200);

  if (health.status !== 200) {
    abort('la API no responde en /api/health');
  }

  const adminLogin = await call('POST', '/auth/login', {
    jar: adminJar,
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expectStatus('login admin', adminLogin, 200);

  if (adminLogin.status !== 200) {
    abort('no se pudo iniciar sesión con el administrador de bootstrap');
  }

  const staffCookie = adminLogin.setCookies.find((cookie) => cookie.startsWith('staff_session='));
  check('cookie staff HttpOnly', /HttpOnly/i.test(staffCookie ?? ''), staffCookie);
  check('cookie staff SameSite=Strict', /SameSite=Strict/i.test(staffCookie ?? ''), staffCookie);
  check('cookie staff Path=/', /Path=\//i.test(staffCookie ?? ''), staffCookie);
  check(
    'cookie staff Secure=false en desarrollo',
    !/;\s*Secure/i.test(staffCookie ?? ''),
    staffCookie,
  );
  check('login admin no devuelve hash', !JSON.stringify(adminLogin.body).includes('passwordHash'));

  const existingLots = await call('GET', '/lots?page=1&limit=1', { jar: adminJar });

  if (existingLots.status !== 200) {
    abort(`no se pudo verificar la base limpia: ${JSON.stringify(existingLots.body)}`);
  }

  if ((existingLots.body?.meta?.total ?? 0) > 0) {
    abort('la base ya tiene lotes; usá una base descartable recién creada');
  }

  const lot101 = await call('POST', '/lots', {
    jar: adminJar,
    body: {
      lotNumber: '101',
      ownerNames: ['Familia Uno'],
      contacts: [{ name: 'Contacto Uno', phone: '+5491100000001' }],
      pin: '1111',
    },
  });
  expectStatus('crear lote 101', lot101, 201);

  const lot102 = await call('POST', '/lots', {
    jar: adminJar,
    body: { lotNumber: '102', ownerNames: ['Familia Dos'], contacts: [], pin: '2222' },
  });
  expectStatus('crear lote 102', lot102, 201);

  const lot103 = await call('POST', '/lots', {
    jar: adminJar,
    body: { lotNumber: '103', ownerNames: ['Familia Tres'], contacts: [], pin: '3333' },
  });
  expectStatus('crear lote 103', lot103, 201);

  check('lote no expone pinHash', !JSON.stringify(lot101.body).includes('pinHash'));

  const guardCreate = await call('POST', '/staff', {
    jar: adminJar,
    body: { username: GUARD_USERNAME, password: GUARD_PASSWORD, role: 'guard' },
  });
  expectStatus('crear vigilador', guardCreate, 201);
  check('staff no expone hash', !JSON.stringify(guardCreate.body).includes('passwordHash'));

  const guardLogin = await call('POST', '/auth/login', {
    jar: guardJar,
    body: { username: GUARD_USERNAME, password: GUARD_PASSWORD },
  });
  expectStatus('login vigilador', guardLogin, 200);

  const guardLots = await call('GET', '/lots', { jar: guardJar });
  expectStatus('vigilador no puede listar lotes', guardLots, 403);
  check(
    'error de permisos genérico',
    guardLots.body?.error?.code === 'FORBIDDEN',
    JSON.stringify(guardLots.body),
  );

  const mail101 = await call('POST', '/mail', {
    jar: guardJar,
    body: { lotNumber: '101', description: 'Carta para lote 101' },
  });
  expectStatus('registrar correspondencia lote 101', mail101, 201);

  const mail102 = await call('POST', '/mail', {
    jar: guardJar,
    body: { lotNumber: '102', description: 'Carta para lote 102' },
  });
  expectStatus('registrar correspondencia lote 102', mail102, 201);

  check(
    'mail registrado guarda lote',
    mail101.body?.data?.lotNumber === '101',
    JSON.stringify(mail101.body),
  );
  check(
    'mail registrado toma receivedBy de la sesión',
    mail101.body?.data?.receivedBy === guardCreate.body?.data?.id,
    JSON.stringify(mail101.body?.data?.receivedBy),
  );

  const pending = await call('GET', '/mail/pending?page=1&limit=20', { jar: guardJar });
  expectStatus('listar pendientes', pending, 200);
  check(
    'pendientes incluye ambos lotes',
    pending.body?.meta?.total === 2,
    JSON.stringify(pending.body?.meta),
  );

  const deliver = await call('PATCH', `/mail/${mail101.body.data.id}/deliver`, { jar: guardJar });
  expectStatus('entregar correspondencia', deliver, 200);
  check(
    'entrega irreversible con deliveredBy',
    deliver.body?.data?.status === 'delivered' &&
      deliver.body?.data?.deliveredBy === guardCreate.body?.data?.id,
    JSON.stringify(deliver.body?.data),
  );

  const duplicate = await call('PATCH', `/mail/${mail101.body.data.id}/deliver`, { jar: guardJar });
  expectStatus('segunda entrega rechazada', duplicate, 409);
  check(
    'mensaje de entrega duplicada',
    duplicate.body?.error?.message === 'La correspondencia ya fue entregada.',
    JSON.stringify(duplicate.body),
  );

  const ownerAccess = await call('POST', '/public/access', {
    jar: ownerJar,
    body: { lotNumber: '101', pin: '1111' },
  });
  expectStatus('acceso propietario lote 101', ownerAccess, 200);
  check(
    'acceso devuelve solo lotNumber',
    JSON.stringify(Object.keys(ownerAccess.body?.data ?? {}).sort()) ===
      JSON.stringify(['expiresAt', 'lotNumber']),
    JSON.stringify(ownerAccess.body),
  );

  const ownerCookie = ownerAccess.setCookies.find((cookie) => cookie.startsWith('owner_session='));
  check('cookie owner HttpOnly', /HttpOnly/i.test(ownerCookie ?? ''), ownerCookie);
  check('cookie owner SameSite=Strict', /SameSite=Strict/i.test(ownerCookie ?? ''), ownerCookie);
  check('cookie owner Path=/', /Path=\//i.test(ownerCookie ?? ''), ownerCookie);
  check('cookie staff separada de owner', ownerJar.raw('staff_session') === undefined);

  const ownerMe = await call('GET', '/public/me', { jar: ownerJar });
  expectStatus('sesión propietario /me', ownerMe, 200);
  check(
    'sesión propietario ligada al lote 101',
    ownerMe.body?.data?.lotNumber === '101',
    JSON.stringify(ownerMe.body),
  );
  check(
    '/me no expone lotId',
    !('lotId' in (ownerMe.body?.data ?? {})),
    JSON.stringify(ownerMe.body),
  );

  const ownerMail = await call(
    'GET',
    `/public/mail?lotId=${lot102.body.data.id}&lotNumber=102&page=1&limit=10`,
    { jar: ownerJar },
  );
  expectStatus('consultar correspondencia propietario', ownerMail, 200);
  check(
    'propietario ignora lotId/lotNumber del cliente',
    ownerMail.body?.data?.length === 1 &&
      ownerMail.body.data[0].description === 'Carta para lote 101',
    JSON.stringify(ownerMail.body),
  );

  const ownerKeys = Object.keys(ownerMail.body?.data?.[0] ?? {}).sort();
  check(
    'DTO propietario mínimo',
    JSON.stringify(ownerKeys) ===
      JSON.stringify(['deliveredAt', 'description', 'id', 'receivedAt', 'status']),
    JSON.stringify(ownerKeys),
  );
  check(
    'DTO propietario sin datos internos',
    !/lotId|receivedBy|deliveredBy|lotNumber|contacts|phone|pinHash/i.test(
      JSON.stringify(ownerMail.body),
    ),
  );
  check(
    '/api/public/mail con Cache-Control no-store',
    /no-store/.test(ownerMail.headers.get('cache-control') ?? ''),
    ownerMail.headers.get('cache-control'),
  );
  check(
    '/api/lots con Cache-Control no-store',
    /no-store/.test(
      (await call('GET', '/lots', { jar: adminJar })).headers.get('cache-control') ?? '',
    ),
  );

  const ownerLogout = await call('POST', '/public/logout', { jar: ownerJar });
  expectStatus('logout propietario', ownerLogout, 204);
  check('cookie owner eliminada en logout', !ownerJar.raw('owner_session'));

  const ownerMeAfterLogout = await call('GET', '/public/me', { jar: ownerJar });
  expectStatus('sesión cerrada ya no sirve', ownerMeAfterLogout, 401);

  const owner102 = await call('POST', '/public/access', {
    jar: ownerJar,
    body: { lotNumber: '102', pin: '2222' },
  });
  expectStatus('acceso propietario lote 102', owner102, 200);

  const owner102Mail = await call('GET', '/public/mail?page=1&limit=10', { jar: ownerJar });
  expectStatus('correspondencia lote 102', owner102Mail, 200);
  check(
    'aislamiento entre lotes',
    owner102Mail.body?.data?.length === 1 &&
      owner102Mail.body.data[0].description === 'Carta para lote 102',
    JSON.stringify(owner102Mail.body),
  );

  const owner101Again = await call('POST', '/public/access', {
    jar: ownerJar,
    body: { lotNumber: '101', pin: '1111' },
  });
  expectStatus('acceso propietario 101 para probar revocación', owner101Again, 200);

  const resetPin = await call('POST', `/lots/${lot101.body.data.id}/reset-pin`, {
    jar: adminJar,
    body: { pin: '4444' },
  });
  expectStatus('resetear PIN lote 101', resetPin, 204);

  const afterReset = await call('GET', '/public/mail?page=1&limit=10', { jar: ownerJar });
  expectStatus('reset de PIN revoca sesión owner', afterReset, 401);

  const oldPin = await call('POST', '/public/access', {
    jar: new CookieJar(),
    body: { lotNumber: '101', pin: '1111' },
  });
  expectStatus('PIN anterior rechazado', oldPin, 401);
  check(
    'mensaje genérico de acceso',
    oldPin.body?.error?.message === 'Lote o PIN incorrectos.',
    JSON.stringify(oldPin.body),
  );

  const newPin = await call('POST', '/public/access', {
    jar: ownerJar,
    body: { lotNumber: '101', pin: '4444' },
  });
  expectStatus('PIN nuevo aceptado', newPin, 200);

  const deactivate = await call('PATCH', `/lots/${lot101.body.data.id}`, {
    jar: adminJar,
    body: { active: false },
  });
  expectStatus('desactivar lote 101', deactivate, 200);

  const afterDeactivate = await call('GET', '/public/mail?page=1&limit=10', { jar: ownerJar });
  expectStatus('desactivar lote revoca sesión owner', afterDeactivate, 401);

  const mailToInactive = await call('POST', '/mail', {
    jar: guardJar,
    body: { lotNumber: '101', description: 'No debería entrar' },
  });
  expectStatus('no se registra correspondencia en lote inactivo', mailToInactive, 404);
  check(
    'mensaje de lote inactivo',
    mailToInactive.body?.error?.message === 'El lote no existe o está inactivo.',
    JSON.stringify(mailToInactive.body),
  );

  const inactiveAccess = await call('POST', '/public/access', {
    jar: new CookieJar(),
    body: { lotNumber: '101', pin: '4444' },
  });
  expectStatus('lote inactivo no permite acceso', inactiveAccess, 401);
  check(
    'mensaje genérico para lote inactivo',
    inactiveAccess.body?.error?.message === 'Lote o PIN incorrectos.',
    JSON.stringify(inactiveAccess.body),
  );

  // Un login exitoso reinicia el contador de intentos del cliente.
  const resetLimiter = await call('POST', '/public/access', {
    jar: ownerJar,
    body: { lotNumber: '102', pin: '2222' },
  });
  expectStatus('login exitoso antes de probar límite', resetLimiter, 200);

  let sawTooManyRequests = false;
  let blockedMessage = null;

  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const response = await call('POST', '/public/access', {
      jar: new CookieJar(),
      body: { lotNumber: '103', pin: '0000' },
    });

    if (response.status === 429) {
      sawTooManyRequests = true;
      blockedMessage = response.body?.error?.message ?? null;
      break;
    }

    if (response.status !== 401) {
      check(`intento ${attempt} devuelve 401 o 429`, false, `recibido ${response.status}`);
      break;
    }
  }

  check('límite de intentos responde 429', sawTooManyRequests);
  check(
    'mensaje de límite de intentos',
    blockedMessage === 'Demasiados intentos. Esperá unos minutos.',
    blockedMessage,
  );

  const csrf = await call('POST', '/lots', {
    jar: adminJar,
    headers: { origin: 'http://evil.example' },
    body: { lotNumber: '999', ownerNames: ['Otro'], contacts: [], pin: '9999' },
  });
  expectStatus('origen no permitido rechazado', csrf, 403);
  check(
    'mensaje de origen no permitido',
    csrf.body?.error?.message === 'Origen no permitido.',
    JSON.stringify(csrf.body),
  );

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificaciones OK`);

  if (failed.length > 0) {
    console.log('\nFallos:');

    for (const failure of failed) {
      console.log(`- ${failure.name} ${failure.detail}`);
    }

    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('ERROR FATAL', error);
  process.exitCode = 1;
});
