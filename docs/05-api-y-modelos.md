# 5. API y modelos iniciales

Los nombres son una guía; mantener consistencia y documentar cambios. Prefijo `/api`.

## Autenticación de vigiladores
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## Acceso propietario
- `POST /public/access` — recibe `lotNumber` + `pin`; devuelve sesión segura.
- `POST /public/logout`
- `GET /public/me`
- `GET /public/mail?page=&limit=`

Las rutas `/public/*` obtienen el lote de la sesión verificada. Nunca aceptan un `lotId` del cliente para decidir permisos.

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
- `POST /mail`
- `GET /mail/pending?page=&limit=`
- `GET /mail/:id`
- `PATCH /mail/:id/deliver`

Solo usuarios autorizados pueden usar endpoints internos. Validar transiciones de estado en el servicio.

## Auditoría y notificaciones
- `GET /audit?page=&limit=&from=&to=`
- `POST /notifications/:id/retry` — solo admin, con límites.
- `POST /webhooks/whatsapp` — validar autenticidad, formato e idempotencia.

## Reglas de modelos
- Fechas guardadas como `Date` UTC.
- Índices únicos para `Lot.lotNumber` y `StaffUser.username`.
- Índices para `MailItem` por `lotId + receivedAt` y `status + receivedAt`.
- Índice TTL en `PublicSession.expiresAt`.
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
