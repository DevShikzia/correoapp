#!/usr/bin/env node
/**
 * Prueba de humo del flujo asíncrono de notificaciones por WhatsApp.
 *
 * Requiere la API y el worker corriendo con NOTIFICATIONS_ENABLED=true,
 * WHATSAPP_PROVIDER=console y un Redis real. Usa una base descartable cuyo
 * nombre contenga `_e2e`; al terminar la elimina, salvo SMOKE_KEEP_DATA=true.
 *
 * Uso:
 *   SMOKE_MONGODB_URI=mongodb://127.0.0.1:27017/correspondencia_e2e
 *   SMOKE_ADMIN_USERNAME=... SMOKE_ADMIN_PASSWORD=... pnpm smoke:notifications
 *
 * Variables opcionales:
 *   SMOKE_BASE_URL     por defecto http://127.0.0.1:3001/api
 *   SMOKE_ORIGIN       por defecto http://localhost:3001 (debe coincidir con APP_ORIGIN)
 *   SMOKE_TIMEOUT_MS   por defecto 30000
 *   SMOKE_KEEP_DATA    true conserva la base al terminar
 */

import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3001/api';
const ORIGIN = process.env.SMOKE_ORIGIN ?? 'http://localhost:3001';
const MONGODB_URI = process.env.SMOKE_MONGODB_URI;
const ADMIN_USERNAME = process.env.SMOKE_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const KEEP_DATA = process.env.SMOKE_KEEP_DATA === 'true';

const LOT_NUMBER = '901';
const LOT_PIN = '9011';
const CONTACT_PHONE = '+5491100000901';
const RETRY_PHONE = '+5491100000902';
const MAIL_DESCRIPTION = 'Carta de prueba e2e';
const GUARD_USERNAME = 'vigilador.e2e';
const GUARD_PASSWORD = `E2e-${randomUUID()}-2026!`;
const POLL_INTERVAL_MS = 250;

if (MONGODB_URI === undefined || ADMIN_USERNAME === undefined || ADMIN_PASSWORD === undefined) {
  console.error('Definí SMOKE_MONGODB_URI, SMOKE_ADMIN_USERNAME y SMOKE_ADMIN_PASSWORD.');
  process.exit(1);
}

function databaseNameOf(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

const databaseName = databaseNameOf(MONGODB_URI);

if (/_e2e/.test(databaseName) === false) {
  console.error('La base debe ser descartable y contener `_e2e` en el nombre.');
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
  process.exitCode = 1;
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

  return { status: response.status, body: parsed };
}

function expectStatus(label, response, status) {
  check(
    `${label} → ${status}`,
    response.status === status,
    `recibido ${response.status}: ${JSON.stringify(response.body)}`,
  );
}

async function waitForNotification(mailItemId) {
  const deadline = Date.now() + TIMEOUT_MS;
  const mailItemObjectId = new mongoose.Types.ObjectId(mailItemId);
  const jobs = mongoose.connection.collection('notificationjobs');

  while (Date.now() < deadline) {
    const job = await jobs.findOne({ mailItemId: mailItemObjectId });

    if (job !== null && (job.status === 'sent' || job.status === 'failed')) {
      return job;
    }

    await delay(POLL_INTERVAL_MS);
  }

  return null;
}

async function waitForNotificationById(notificationId) {
  const deadline = Date.now() + TIMEOUT_MS;
  const notificationObjectId = new mongoose.Types.ObjectId(notificationId);
  const jobs = mongoose.connection.collection('notificationjobs');

  while (Date.now() < deadline) {
    const job = await jobs.findOne({ _id: notificationObjectId });

    if (job !== null && (job.status === 'sent' || job.status === 'failed')) {
      return job;
    }

    await delay(POLL_INTERVAL_MS);
  }

  return null;
}

async function runChecks(adminJar) {
  const health = await call('GET', '/health');
  expectStatus('health', health, 200);

  if (health.status !== 200) {
    abort('la API no responde en /api/health');
    return;
  }

  const adminLogin = await call('POST', '/auth/login', {
    jar: adminJar,
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expectStatus('login admin', adminLogin, 200);

  if (adminLogin.status !== 200) {
    abort('no se pudo iniciar sesión con el administrador de bootstrap');
    return;
  }

  const lot = await call('POST', '/lots', {
    jar: adminJar,
    body: {
      lotNumber: LOT_NUMBER,
      ownerNames: ['Familia E2E'],
      contacts: [{ name: 'Contacto E2E', phone: CONTACT_PHONE }],
      pin: LOT_PIN,
    },
  });
  expectStatus('crear lote de prueba', lot, 201);

  const guard = await call('POST', '/staff', {
    jar: adminJar,
    body: { username: GUARD_USERNAME, password: GUARD_PASSWORD, role: 'guard' },
  });
  expectStatus('crear vigilador de prueba', guard, 201);

  const guardJar = new CookieJar();
  const guardLogin = await call('POST', '/auth/login', {
    jar: guardJar,
    body: { username: GUARD_USERNAME, password: GUARD_PASSWORD },
  });
  expectStatus('login vigilador', guardLogin, 200);

  const mail = await call('POST', '/mail', {
    jar: guardJar,
    body: { lotNumber: LOT_NUMBER, description: MAIL_DESCRIPTION },
  });
  expectStatus('registrar correspondencia', mail, 201);

  const mailItemId = mail.body?.data?.id;
  const lotId = lot.body?.data?.id;

  if (typeof mailItemId !== 'string') {
    abort('la API no devolvió el id de la correspondencia');
    return;
  }

  if (typeof lotId !== 'string') {
    abort('la API no devolvió el id del lote');
    return;
  }

  const mailItemObjectId = new mongoose.Types.ObjectId(mailItemId);
  const mailStillStored = await mongoose.connection
    .collection('mailitems')
    .countDocuments({ _id: mailItemObjectId });
  check('la correspondencia queda guardada aunque falle WhatsApp', mailStillStored === 1);

  const job = await waitForNotification(mailItemId);

  if (job === null) {
    abort(`el worker no terminó el aviso en ${TIMEOUT_MS} ms`);
    return;
  }

  const jobCount = await mongoose.connection
    .collection('notificationjobs')
    .countDocuments({ mailItemId: mailItemObjectId });

  check('se crea un único aviso por correspondencia y teléfono', jobCount === 1);
  check('el worker envía el aviso', job.status === 'sent', `estado ${String(job.status)}`);
  check('el primer intento alcanza', job.attempts === 1, `intentos ${String(job.attempts)}`);
  check('el aviso lleva el lote correcto', job.lotNumber === LOT_NUMBER);
  check('el aviso usa el teléfono del contacto', job.phone === CONTACT_PHONE);
  check(
    'el proveedor console devuelve un id de mensaje',
    typeof job.providerMessageId === 'string' && job.providerMessageId.startsWith('console-'),
  );
  check('el aviso registra la fecha de envío', job.sentAt instanceof Date);
  check('el aviso no guarda la descripción', !('description' in job));
  check(
    'el aviso no expone otros datos internos',
    !/pinHash|passwordHash|contacts/.test(JSON.stringify(job)),
  );

  await checkRetryAndList(adminJar, guardJar, { mailItemId, lotId });
}

async function checkRetryAndList(adminJar, guardJar, { mailItemId, lotId }) {
  const jobs = mongoose.connection.collection('notificationjobs');
  const retryNotificationId = new mongoose.Types.ObjectId();

  await jobs.insertOne({
    _id: retryNotificationId,
    mailItemId: new mongoose.Types.ObjectId(mailItemId),
    lotId: new mongoose.Types.ObjectId(lotId),
    lotNumber: LOT_NUMBER,
    phone: RETRY_PHONE,
    status: 'failed',
    attempts: 5,
    retryCount: 0,
    providerMessageId: null,
    providerStatus: null,
    lastErrorCode: 'HTTP_503',
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const retry = await call('POST', `/notifications/${retryNotificationId.toHexString()}/retry`, {
    jar: adminJar,
  });
  expectStatus('reintentar un aviso fallido', retry, 200);
  check('el reintento deja el aviso en cola', retry.body?.data?.status === 'queued');
  check('el reintento no expone el teléfono', !JSON.stringify(retry.body).includes(RETRY_PHONE));

  const retried = await waitForNotificationById(retryNotificationId.toHexString());

  if (retried === null) {
    abort(`el worker no procesó el reintento en ${TIMEOUT_MS} ms`);
    return;
  }

  check(
    'el reintento termina enviado',
    retried.status === 'sent',
    `estado ${String(retried.status)}`,
  );
  check('el reintento usa un jobId nuevo', retried.retryCount === 1);

  const secondRetry = await call(
    'POST',
    `/notifications/${retryNotificationId.toHexString()}/retry`,
    {
      jar: adminJar,
    },
  );
  expectStatus('un aviso enviado no se reintenta', secondRetry, 409);

  const list = await call('GET', '/notifications?status=sent', { jar: adminJar });
  expectStatus('listar avisos enviados', list, 200);
  const listedIds = (list.body?.data ?? []).map((item) => item.id);
  check(
    'el listado incluye el aviso reintentado',
    listedIds.includes(retryNotificationId.toHexString()),
  );
  check('el listado enmascara los teléfonos', !JSON.stringify(list.body).includes(RETRY_PHONE));
  check(
    'el listado no devuelve el campo phone',
    (list.body?.data ?? []).every((item) => !('phone' in item)),
  );

  const guardList = await call('GET', '/notifications', { jar: guardJar });
  expectStatus('el vigilador no puede listar avisos', guardList, 403);
}

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });

  try {
    await runChecks(new CookieJar());
  } finally {
    if (KEEP_DATA) {
      console.log(`\nDatos conservados en la base ${databaseName}.`);
    } else {
      await mongoose.connection.dropDatabase();
      console.log(`\nBase descartable ${databaseName} eliminada.`);
    }

    await mongoose.disconnect();
  }

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
