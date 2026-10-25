# 5. API y modelos iniciales

Los nombres son una guía; mantener consistencia y documentar cambios. Prefijo `/api`.

## Autenticación de vigiladores
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## Acceso propietario
- `POST /public/access` — recibe `lotNumber` + `pin`; responde con `lotNumber` y `expiresAt` y crea una sesión `HttpOnly`.
- `POST /public/logout` — revoca la sesión y borra la cookie.
- `GET /public/me` — devuelve el `lotNumber` de la sesión.
- `GET /public/mail?page=&limit=` — correspondencia del lote de la sesión.

Las rutas `/public/*` obtienen el lote de la sesión verificada. Nunca aceptan un `lotId` del cliente para decidir permisos; cualquier `lotId` o `lotNumber` enviado por el cliente se ignora. Un lote o PIN inválido responde siempre con el mismo error genérico (`401`) para no revelar si el lote existe. Tras 5 intentos fallidos en 15 minutos (por lote y por IP) responde `429`. Cambiar el PIN o desactivar el lote revoca todas sus sesiones.

El portal no devuelve datos internos: solo identificación del envío, descripción, fecha de recepción, estado y fecha de entrega. No expone `lotId`, `receivedBy`, `deliveredBy`, contactos, teléfonos ni hashes.

## Administración
- `POST /lots`
- `GET /lots?page=&limit=&search=`
- `GET /lots/:id`
- `PATCH /lots/:id`
- `POST /lots/:id/reset-pin`
- `POST /staff`
- `GET /staff`
- `PATCH /staff/:id` — activar/desactivar/actualizar rol con reglas estrictas.

## Correspondencia
- `POST /mail` — recibe `lotNumber`, `description` opcional y `receivedAt` opcional. El servidor resuelve el lote (debe existir y estar activo) y toma `receivedBy` de la sesión; nunca del cuerpo.
- `GET /mail/pending?page=&limit=`
- `GET /mail/:id`
- `PATCH /mail/:id/deliver`

La entrega es una transición `pending → delivered` con actualización condicional atómica: una segunda solicitud responde `409 CONFLICT` y no genera otra auditoría. `receivedAt` no puede ser futura. Cada alta y cada entrega se registran en `AuditLog` (`mail.created`, `mail.delivered`) con actor, lote y `requestId`.

Solo usuarios autorizados pueden usar endpoints internos. Validar transiciones de estado en el servicio.

## Auditoría y notificaciones
- Las acciones relevantes se registran en `AuditLog` (`mail.created`, `mail.delivered`, etc.).
- `GET/POST /webhooks/whatsapp` — `GET` responde el challenge de verificación de Meta; `POST` valida la firma `X-Hub-Signature-256`, el formato y la idempotencia de los estados.
- `POST /notifications/:id/retry` — reenvío manual solo para admin; queda para la Fase 7.

La API guarda la correspondencia, la audita y recién después crea avisos durables (`NotificationJob`) y los encola en BullMQ. Un fallo de Redis o del proveedor no revierte el alta. El worker es un proceso separado y usa un modelo espejo de `NotificationJob`.

El aviso solo lleva el número de lote: no se envía la descripción, el PIN ni otros datos de la correspondencia. El webhook actualiza `status`, `providerStatus`, `providerMessageId` y `lastErrorCode` sin confiar en datos del cliente.

## Reglas de modelos
- Fechas guardadas como `Date` UTC.
- Índices únicos para `Lot.lotNumber` y `StaffUser.username`.
- Índices para `MailItem` por `lotId + receivedAt` y `status + receivedAt`.
- `MailItem` copia el número de lote al registrar para listar sin joins; el número de lote no se modifica después de crearlo.
- Índice TTL en `PublicSession.expiresAt`.
- `PublicSession` guarda solo el hash SHA-256 del token y tiene índice único por `tokenHash`; el token en claro solo viaja en la cookie.
- `NotificationJob` tiene índice único `{ mailItemId, phone }` para no duplicar avisos y un índice por `status + createdAt`. No guarda la descripción de la correspondencia.
- Índices de auditoría por `createdAt` y `lotId + createdAt`.
- No confiar en IDs recibidos: validar formato y autorización.
- Aplicar paginación y límites máximos.
- Devolver DTOs, nunca documentos Mongoose crudos.

## Registro de correspondencia
Campos mínimos: lote, descripción opcional y breve, fecha de recepción, vigilador que la registró y estado. La descripción no debe incluir información sensible innecesaria.

## Errores
Usar formato consistente, por ejemplo:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos ingresados."
  }
}
```
No incluir stack trace, secretos ni detalles internos en respuestas de producción.
