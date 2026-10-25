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

## Regla de oro
La autorización se valida en el backend en cada petición. Ocultar datos en Angular no es seguridad. Ningún propietario puede consultar datos usando un `lotId` enviado por el cliente.

## Desarrollo local
Requisitos:
- Node.js 22 LTS (ver `.nvmrc`).
- pnpm fijado por Corepack; la versión exacta está en `packageManager` de `package.json`.
- Docker (Compose v2) para MongoDB.

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
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml up -d mongo
pnpm dev:api              # API en http://localhost:3000
pnpm dev:web              # Angular en http://localhost:4200
pnpm dev:worker           # worker (sin colas hasta la Fase 6)
```

Crear `.env` copiando `.env.example` y completar valores locales. `.env` nunca se versiona.

Primer administrador (una sola vez, con MongoDB en marcha):

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='contraseña-de-al-menos-12' \
  pnpm --filter @correspondencia/api bootstrap:admin
pnpm --filter @correspondencia/api sync:indexes
```

## Estructura
```text
apps/api/     Express + TypeScript; configuración validada, logger con redacción y /api/health
apps/web/     Angular 21 (standalone, zoneless); rutas /portal, /staff y /admin
apps/worker/  proceso TypeScript; procesará notificaciones en la Fase 6
infra/        Compose (MongoDB) y, más adelante, Nginx y scripts
docs/         alcance, plan, estándares, seguridad, API, despliegue y pruebas
```

Estado actual: Fase 3 (login y permisos). La API expone `/api/health`, `/api/auth` (login, logout, sesión actual), `/api/lots` y `/api/staff`, estas dos últimas solo para administradores autenticados.

Notas de operación:
- Los endpoints de administración exigen la cookie de sesión `staff_session` (`HttpOnly`, `SameSite=Strict`, `Secure` en producción).
- Con `APP_ORIGIN` definido, las peticiones `POST`/`PATCH`/`PUT`/`DELETE` deben enviar ese mismo `Origin` (protección CSRF).
- El límite de intentos de login vive en memoria: es válido para una sola instancia de la API. En la Fase 6/7 se reemplaza por un almacenamiento compartido si se escala horizontalmente.
- Ajustar `STAFF_SESSION_TTL_MINUTES` (por defecto 480) según la operación del barrio.


