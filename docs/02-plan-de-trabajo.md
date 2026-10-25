# 2. Plan de trabajo por fases

Trabajar en una fase por vez. No generar toda la aplicación de una sola vez.

## Fase 0 — Repositorio
- Crear repositorio Git privado.
- Crear `README.md`, `AGENTS.md`, `.gitignore`, `.editorconfig` y `.env.example`.
- Definir Node LTS, package manager y scripts de lint/test/build.
- Activar TypeScript strict y formato consistente.
**Aceptar cuando:** instalación limpia y comandos base funcionan; `.env` queda ignorado por Git.

## Fase 1 — Esqueleto
- Crear `apps/api`, `apps/web`, `apps/worker` y `infra/`.
- API Express con configuración, logger seguro, manejo centralizado de errores y `/api/health`.
- Angular con navegación vacía por rol.
- MongoDB local por Compose; no exponer el puerto al host salvo necesidad de desarrollo.
**Aceptar cuando:** API y frontend arrancan y `/api/health` responde.

## Fase 2 — Modelos y administración
- Modelos `Lot`, `StaffUser`, `MailItem`, `AuditLog`.
- Crear el primer administrador con comando/script seguro de bootstrap; nunca una contraseña fija en el repositorio.
- CRUD de lotes y gestión de vigiladores.
- Auditoría de cambios sensibles.
**Aceptar cuando:** validaciones e índices funcionan; solo admin puede administrar.

## Fase 3 — Login y permisos
- Login/logout de vigiladores.
- Hash de contraseña con Argon2id o biblioteca mantenida equivalente.
- Sesión segura y revocación al desactivar un usuario.
- PIN de propietarios hasheado; limitar intentos y invalidar sesiones al cambiar PIN.
**Aceptar cuando:** pruebas negativas de autenticación y autorización pasan.

## Fase 4 — Correspondencia
- Registrar correspondencia, listar pendientes y marcar entrega.
- Guardar usuario, fecha y cambios de estado.
- Validar transición de estados y prevenir doble entrega accidental.
- No hacer lógica de negocio dentro de controladores.
**Aceptar cuando:** cada acción queda auditada y los errores no filtran información.

## Fase 5 — Portal propietario
- Acceso por lote + PIN.
- Crear sesión temporal vinculada a un único `lotId`.
- Listar solo correspondencia del lote de la sesión.
- Respuestas privadas con `Cache-Control: no-store`; excluirlas de caché PWA.
**Aceptar cuando:** pruebas demuestran que cambiar IDs en requests no permite ver otro lote.

## Fase 6 — WhatsApp asíncrono
- Definir interfaz `NotificationProvider`; implementar proveedor oficial/autorizado.
- Guardar la correspondencia primero.
- Registrar evento pendiente durable en MongoDB y encolar con BullMQ.
- Worker con reintentos limitados, backoff e idempotencia.
- Webhook autenticado para estados del proveedor.
**Aceptar cuando:** fallo de WhatsApp no pierde correspondencia ni crea envíos duplicados en reintentos normales.

## Fase 7 — Pruebas y endurecimiento
- Pruebas unitarias, integración, autorización, aislamiento de lotes y rate limit.
- Revisar logs, dependencias, CORS, CSRF, headers y manejo de secretos.
- Prueba de recuperación de backup.
**Aceptar cuando:** checklist de `docs/07-pruebas-y-aceptacion.md` completo.

## Fase 8 — Despliegue
- Ubuntu Server actualizado, usuario admin, SSH seguro y firewall.
- Docker Compose con redes internas, volúmenes, healthchecks y límites de memoria.
- Backup cifrado, copia fuera del equipo y prueba de restauración.
- Dominio en Cloudflare y Tunnel; sin puertos entrantes en router.
- Configurar WhatsApp solo tras validar privacidad.
**Aceptar cuando:** reinicio del equipo, recuperación de datos y acceso HTTPS están probados.

## Regla para OpenCode
Para cada fase: inspeccionar → plan breve → implementar → tests/lint/build → revisar diff → actualizar documentación. No pasar de fase si los criterios no se cumplen.
