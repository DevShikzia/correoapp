# 4. Seguridad y privacidad — requisitos obligatorios

## Aislamiento de lotes
- Tras validar lote + PIN, el backend determina el `lotId` desde la sesión.
- Los endpoints de propietario no aceptan `lotId` como fuente de autorización.
- Toda consulta de correspondencia del propietario filtra por `session.lotId`.
- No devolver contactos, teléfonos ni datos de otros lotes.
- Pruebas automatizadas para intentos de acceso cruzado.

## Autenticación
- Hash de contraseñas y PIN con Argon2id o alternativa mantenida.
- Nunca almacenar ni registrar PIN/contraseñas en texto plano.
- Rate limit por IP y por lote/usuario; enfriamiento gradual ante fallos.
- Mensajes de acceso genéricos para no confirmar si un lote existe.
- Sesiones temporales, revocables y con expiración.
- Cookies: `HttpOnly`, `Secure` en producción, `SameSite`; protección CSRF para acciones mutables cuando se use autenticación por cookie.
- Cambiar PIN invalida sesiones del lote.
- Desactivar vigilador invalida sus sesiones.

## API y navegador
- Validación server-side en cada endpoint.
- CORS restringido al origen real.
- Helmet/headers seguros, límites de tamaño, timeout y rate limiting.
- No exponer stack trace ni datos internos al cliente.
- Respuestas privadas con `Cache-Control: no-store`.
- No almacenar datos privados en caché offline de Angular PWA.
- Revisar control de acceso a cada recurso, no solo al menú.

## Secretos y operación
- `.env` fuera de Git; usar permisos restrictivos.
- Nunca registrar cookies, tokens, PIN, contraseña, payload sensible ni credenciales del proveedor.
- MongoDB y Redis solo en redes internas de Docker; sin `ports:` públicos.
- Cloudflare Tunnel hacia Nginx local; no abrir puertos del router.
- Proteger y rotar claves de sesión y WhatsApp.
- Actualizar dependencias y las imágenes de Docker de forma controlada.
- Backups cifrados; una copia fuera del equipo; ensayar restauración.
- Retención mínima necesaria para auditoría; no almacenar datos personales innecesarios.

## WhatsApp
- Usar plataforma oficial o proveedor autorizado y plantillas aprobadas cuando corresponda.
- Obtener autorización apropiada para notificar al teléfono configurado.
- Mensaje mínimo: no incluir detalles privados de la correspondencia; avisar que hay un envío y dirigir al portal.
- Validar firma/autenticidad de webhooks e implementar idempotencia.
- No permitir que el proveedor de notificaciones bloquee el guardado de correspondencia.

## Amenazas a probar
- Enumeración de lotes.
- Fuerza bruta de PIN/login.
- IDOR: reemplazar IDs por los de otro lote.
- CSRF si aplica.
- Sesión robada, vencida o revocada.
- Duplicación de webhook o reintento de mensaje.
- Inyección y datos inválidos.
- Exposición accidental en logs, errores, caché o backup.
