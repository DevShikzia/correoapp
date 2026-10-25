# 1. Alcance y arquitectura

## Objetivo
Registrar la llegada y entrega de cartas/paquetes a unos 90 lotes. Los propietarios consultan únicamente la correspondencia de su lote.

## Roles
- **Administrador:** configura lotes, PIN y usuarios de vigilancia; consulta auditoría.
- **Vigilador:** inicia sesión individual, registra correspondencia y marca entregas.
- **Propietario:** acceso limitado con número de lote + PIN compartido por la familia; solo lectura de su lote.

No hay registro público de usuarios ni acceso de propietarios a datos administrativos.

## Módulos
- `auth`: login/logout y sesiones de vigiladores.
- `public-access`: acceso propietario mediante lote + PIN.
- `lots`: administración de lotes y contactos autorizados.
- `mail`: registrar, consultar y entregar correspondencia.
- `notifications`: cola, envío, estados y reintentos de WhatsApp.
- `audit`: historial de acciones relevantes.
- `health`: estado básico del servicio sin revelar secretos.

## Arquitectura
- Angular PWA: `/portal`, `/staff`, `/admin`.
- Express API: validación, autorización y reglas de negocio.
- MongoDB: fuente de verdad.
- Redis + BullMQ: trabajos asíncronos de notificación.
- Worker Node.js: envía mensajes y procesa reintentos.
- Nginx: sirve Angular y reenvía `/api` al backend.
- Cloudflare Tunnel: publica Nginx sin abrir puertos del router.

## Modelo de datos inicial
- `Lot`: `lotNumber` único, `ownerNames`, `contacts[]`, `pinHash`, `active`, timestamps.
- `StaffUser`: `username` único, `passwordHash`, `role`, `active`, `lastLoginAt`.
- `MailItem`: `lotId`, `description` opcional, `receivedAt`, `receivedBy`, `status`, `deliveredAt`, `deliveredBy`, timestamps.
- `PublicSession`: `tokenHash`, `lotId`, `expiresAt`, `createdAt`; índice TTL.
- `NotificationJob`: `mailItemId`, `lotId`, `phone`, `status`, `attempts`, `providerMessageId`, `lastErrorCode`, timestamps.
- `AuditLog`: `actorType`, `actorId`, `action`, `entityType`, `entityId`, `lotId`, `requestId`, `createdAt`.

Usar referencias ObjectId y esquemas Mongoose. Crear índices explícitos según las consultas reales. No almacenar DNI ni datos innecesarios.

## Decisiones de producto
- Configurar inicialmente los 90 lotes desde el panel admin; no importar Excel en la primera versión.
- PIN compartido por familia, con posibilidad de reinicio por administración.
- Cada vigilador tiene usuario propio; nunca compartir credenciales.
- WhatsApp y portal web son canales complementarios.
- El registro de correspondencia se guarda aunque WhatsApp falle.
- PWA instalable, pero las consultas privadas requieren conexión.
