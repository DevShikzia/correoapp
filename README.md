# Correspondencia — guía del proyecto

Aplicación privada para registrar correspondencia recibida por aproximadamente 90 lotes y permitir que cada lote consulte únicamente sus propios envíos.

## Stack acordado
- Frontend: Angular + TypeScript, PWA.
- Backend: Node.js + Express + TypeScript.
- Base de datos: MongoDB + Mongoose.
- Cola de notificaciones: Redis + BullMQ.
- Infraestructura: Docker Compose, Nginx y Cloudflare Tunnel.
- Servidor inicial: notebook con Ubuntu Server, 4 GB RAM y HDD.
- WhatsApp: WhatsApp Business Platform o proveedor autorizado. No usar automatización no oficial.

## Cómo usar estos documentos con OpenCode
1. Copiá esta carpeta al repositorio raíz.
2. Abrí el repositorio en OpenCode.
3. Pedile que lea `AGENTS.md` y los documentos de `docs/`.
4. Implementá una fase por vez siguiendo `docs/02-plan-de-trabajo.md`.
5. No avances a la fase siguiente si fallan los tests o los criterios de aceptación.

## Orden recomendado
1. `AGENTS.md`
2. `docs/01-alcance-y-arquitectura.md`
3. `docs/02-plan-de-trabajo.md`
4. `docs/03-estandares-de-codigo.md`
5. `docs/04-seguridad-y-privacidad.md`
6. `docs/05-api-y-modelos.md`
7. `docs/06-despliegue.md`
8. `docs/07-pruebas-y-aceptacion.md`
9. `docs/08-estado-y-continuacion.md`

## Regla de oro
La autorización se valida en el backend en cada petición. Ocultar datos en Angular no es seguridad. Ningún propietario puede consultar datos usando un `lotId` enviado por el cliente.

## Desarrollo local
Requisitos:
- Node.js 22 LTS (ver `.nvmrc`).
- pnpm fijado por Corepack; la versión exacta está en `packageManager` de `package.json`.
- Docker (Compose v2) para MongoDB y Redis.

```bash
corepack enable pnpm      # Linux/macOS
pnpm install              # instalación limpia
pnpm lint                 # ESLint
pnpm typecheck            # TypeScript
pnpm test                 # pruebas
pnpm build                # build
pnpm format               # Prettier
```

Servicios de desarrollo:

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml up -d mongo redis
pnpm dev:api              # API en http://localhost:3000
pnpm dev:web              # Angular en http://localhost:4200 (proxy /api → :3000)
pnpm dev:worker           # worker de notificaciones (inactivo si NOTIFICATIONS_ENABLED=false)
```

### Servidor de la notebook

La aplicación está desplegada en la notebook Ubuntu de la red local:

- URL: `http://192.168.0.67:8080` (solo LAN).
- Docker Compose: `infra/compose/docker-compose.prod.yml`; MongoDB 7.0 y Redis internos.
- No toca la app de facturación que usa el puerto 80 ni su MongoDB nativo.
- Primer acceso: usuario `admin` y la contraseña de `~/correspondencia/.admin-password`
  en el servidor. Cambiala creando otro administrador desde `/admin`.
- `COOKIE_SECURE=false` es temporal para probar por HTTP; al configurar HTTPS debe
  volver a `true` junto con `APP_ORIGIN=https://dominio-real`.
- La PWA no se instala ni cachea offline hasta que haya HTTPS.

Detalle de la instalación y comandos en `docs/06-despliegue.md`.

`MONGO_HOST_PORT` define el puerto local del MongoDB de Compose (por defecto `27017`).
`REDIS_HOST_PORT` hace lo mismo para Redis (por defecto `6379`). Si ya hay un MongoDB
nativo en `27017`, usar `MONGO_HOST_PORT=27018` en `.env` y ajustar `MONGODB_URI` o
sobreescribirla en la shell. Compose publica siempre en `127.0.0.1`, nunca en todas
las interfaces. Para bajar los contenedores conservando los datos:
`docker compose --env-file .env -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml down`.

El servidor de desarrollo de Angular usa `apps/web/proxy.conf.json` para enviar `/api` a la API. Así el navegador trabaja siempre contra el mismo origen y las cookies `SameSite=Strict` funcionan igual que en producción con Nginx. No hace falta configurar CORS.

Crear `.env` copiando `.env.example` y completar valores locales. `.env` nunca se versiona.

Primer administrador (una sola vez, con MongoDB en marcha):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='contraseña-de-al-menos-12' \
  pnpm --filter @correspondencia/api bootstrap:admin
pnpm --filter @correspondencia/api sync:indexes
```

Prueba de humo HTTP contra una base descartable (requiere un administrador de bootstrap):

```bash
SMOKE_ADMIN_USERNAME=admin.smoke \
SMOKE_ADMIN_PASSWORD='contraseña-de-al-menos-12' \
  pnpm smoke:http
```

El script `scripts/smoke-http.mjs` verifica cookies, permisos, aislamiento entre lotes,
revocación de sesiones, rate limit y CSRF. No borra datos: usalo solo contra una base
recién creada, nunca contra datos reales. Ver `docs/08-estado-y-continuacion.md`.

Prueba de humo del flujo de notificaciones (requiere API, worker y Redis reales):

```bash
SMOKE_MONGODB_URI='mongodb://127.0.0.1:27017/correspondencia_e2e' \
SMOKE_ADMIN_USERNAME=admin.e2e \
SMOKE_ADMIN_PASSWORD='contraseña-de-al-menos-12' \
  pnpm smoke:notifications
```

El script `apps/api/scripts/smoke-notifications.mjs` registra una correspondencia,
espera al worker y verifica que el aviso quede `sent` con el lote y el teléfono
correctos, sin descripción. Exige que la base contenga `_e2e` en el nombre y la
elimina al terminar (`SMOKE_KEEP_DATA=true` la conserva). La API y el worker deben
correr con `NOTIFICATIONS_ENABLED=true` y `WHATSAPP_PROVIDER=console`; los puertos y
el origen se ajustan con `SMOKE_BASE_URL`, `SMOKE_ORIGIN` y `APP_ORIGIN`.

## Estructura
```text
apps/api/     Express + TypeScript; configuración validada, logger con redacción y /api/health
apps/web/     Angular 21 (standalone, zoneless); rutas /portal, /staff y /admin
apps/worker/  proceso TypeScript; procesa la cola BullMQ de notificaciones por WhatsApp
infra/        Compose (MongoDB y Redis) y, más adelante, Nginx y scripts
docs/         alcance, plan, estándares, seguridad, API, despliegue y pruebas
```

Estado actual: Fases 0 a 6, 7A y 7B implementadas, y despliegue LAN de la Fase 8 en la notebook. La API expone `/api/health`, `/api/auth` (login, logout, sesión actual), `/api/lots` y `/api/staff` (solo administradores), `/api/mail` (cualquier vigilador autenticado): alta, pendientes, detalle y entrega, `/api/notifications` (solo administradores): listado de avisos y reintento, `/api/public` (lote + PIN): acceso, logout, sesión actual y consulta de la correspondencia del propio lote, y `/api/webhooks/whatsapp` para los estados del proveedor.

- `/portal`: vista pública e independiente para el propietario. Ingresa con lote + PIN, consulta su correspondencia y cierra sesión. No muestra enlaces a Vigilancia ni Administración.
- `/staff`: login de vigilancia, alta de correspondencia, pendientes paginados y entrega con confirmación.
- `/admin`: solo administradores; alta y edición de lotes, contactos, PIN, activación/desactivación y gestión de vigiladores.

Tests actuales: **188 API + 21 worker + 34 web**, con lint, typecheck, build y formato en verde.

Notas de operación:
- Todos los endpoints internos exigen la cookie de sesión `staff_session` (`HttpOnly`, `SameSite=Strict`, `Secure` en producción).
- El portal del propietario usa una cookie independiente `owner_session` con las mismas protecciones y expiración corta (`PUBLIC_SESSION_TTL_MINUTES`, por defecto 30).
- Con `APP_ORIGIN` definido, las peticiones `POST`/`PATCH`/`PUT`/`DELETE` deben enviar ese mismo `Origin` (protección CSRF).
- El límite de intentos de acceso (staff y propietarios) se comparte entre instancias cuando `REDIS_URL` está configurada: 5 fallos por usuario/lote e IP en ventanas de 15 minutos. Sin Redis usa memoria local (válido para desarrollo o una sola instancia). Si Redis no responde, cae al límite local y avisa una vez en el log.
- Ajustar `STAFF_SESSION_TTL_MINUTES` (por defecto 480) según la operación del barrio.
- Al registrar correspondencia se envía el número de lote; la API valida que exista y esté activo. Los pendientes se listan del más antiguo al más nuevo y la entrega es irreversible desde la API (una segunda entrega responde `409`).
- Cambiar el PIN o desactivar un lote revoca de inmediato todas las sesiones de propietario de ese lote.
- La PWA solo cachea recursos estáticos. `ngsw-config.json` no define `dataGroups`, por lo que las respuestas de `/api` no se guardan en caché; el portal tampoco usa `localStorage` ni `sessionStorage` para datos privados.
- La navegación oculta “Administración” cuando la sesión activa es de un vigilador. El backend vuelve a validar el rol en cada petición: ocultar la pantalla no es la protección.
- El portal de propietarios usa una barra propia y **no muestra Vigilancia ni Administración**. El personal entra por `/staff` o `/admin`; el backend valida la sesión y el rol en cada endpoint.
- Los formularios de staff y administración no guardan contraseñas, PIN ni datos privados en el navegador.

### Notificaciones por WhatsApp

- Apagadas por defecto (`NOTIFICATIONS_ENABLED=false`): no se crean avisos ni se usa Redis. La correspondencia se registra igual.
- Al activarlas, la API guarda y audita la correspondencia **primero**; después crea un `NotificationJob` durable por teléfono único y lo encola en BullMQ. Si Redis falla, el aviso queda `pending` y el alta no se revierte.
- El worker corre como proceso aparte (`pnpm dev:worker`), con reintentos limitados (`NOTIFICATION_MAX_ATTEMPTS`), backoff exponencial (`NOTIFICATION_BACKOFF_MS`) e idempotencia por `jobId` y estado del aviso.
- `GET /api/notifications` (solo admin) lista los avisos con el teléfono enmascarado y filtro por estado; `POST /api/notifications/:id/retry` reencola un aviso `failed` o `pending`. Los estados `queued`, `sending` y `sent` responden `409` para no duplicar un mensaje.
- El worker reconcilia al arrancar y cada 5 minutos: reencola avisos `pending` con más de 2 minutos. No toca `queued` ni `sending` porque ahí el mensaje pudo salir sin confirmación.
- `WHATSAPP_PROVIDER=console` simula el envío para desarrollo; `meta` usa WhatsApp Cloud API. La plantilla aprobada debe tener una variable en el cuerpo (`{{1}}` = número de lote). No se envía la descripción ni datos de la correspondencia.
- `POST /api/webhooks/whatsapp` valida la firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET` y actualiza estados. Queda fuera del guard de `Origin` porque lo invoca Meta; el `GET` de verificación usa `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- Para probar en desarrollo: `NOTIFICATIONS_ENABLED=true`, `WHATSAPP_PROVIDER=console`, `REDIS_URL=redis://127.0.0.1:6379` y el contenedor `redis` levantado. Los envíos reales requieren credenciales y plantilla aprobada de Meta; no se versionan.


