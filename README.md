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
- Docker para MongoDB y Redis a partir de la Fase 1 (todavía no es necesario).

```bash
corepack enable pnpm      # Linux/macOS
pnpm install              # instalación limpia
pnpm lint                 # ESLint
pnpm typecheck            # TypeScript
pnpm test                 # pruebas
pnpm build                # build
pnpm format               # Prettier
```

Crear `.env` copiando `.env.example` y completar valores locales. `.env` nunca se versiona.

Estado actual: Fase 0 (base del repositorio). Todavía no hay código de aplicación; se agrega en la Fase 1.

