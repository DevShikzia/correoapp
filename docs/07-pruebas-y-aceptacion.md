# 7. Pruebas y criterios de aceptación

## Automatización mínima
- Unit tests para servicios/reglas de negocio.
- Integration tests para API y base de datos.
- Tests de autorización y aislamiento.
- Tests de componentes Angular para login, `/staff` y `/admin`: permisos, formularios, entrega y reset de PIN.
- Lint, typecheck y build en CI antes de integrar cambios.

## Casos críticos

Estado al **26/10/2026**: los casos marcados se verificaron con tests automatizados y/o
los smokes HTTP (`pnpm smoke:http` y `pnpm smoke:notifications`), tanto contra MongoDB
nativo como contra el MongoDB y el Redis de Compose. La Fase 6 agrega **11 tests del
worker** y **4 tests web** nuevos (34 en total) sobre los 149 de la API. La Fase 7A suma
**26 tests de API** (175) y **8 del worker** (19): reintento manual, listado de avisos y
reconciliación.

- [x] Login correcto e incorrecto de vigilador.
- [x] Vigilador desactivado no puede seguir usando sesión.
- [x] Solo admin puede crear lotes y usuarios.
- [x] PIN incorrecto no revela si el lote existe.
- [x] Demasiados intentos bloquean o ralentizan nuevos intentos.
- [x] Cambiar PIN invalida sesiones previas del lote.
- [x] Lote A no puede consultar correspondencia de lote B aunque cambie IDs/query params.
- [x] API nunca devuelve teléfonos ni PIN hash a propietarios.
- [x] Vigilador solo puede marcar entrega con transición válida.
- [x] Doble solicitud de entrega no genera registros contradictorios.
- [x] Una falla del proveedor WhatsApp no borra la correspondencia.
- [x] Reintentos y webhooks duplicados no duplican estados ni acciones.
- [x] Solo un administrador puede reintentar avisos y el reintento no duplica mensajes.
- [x] Los avisos `pending` viejos se reencolan sin tocar `queued`/`sending`.
- [x] El listado de avisos enmascara los teléfonos y no los expone completos.
- [x] Respuestas privadas no se guardan en caché PWA.
- [ ] Logs no contienen secretos ni datos sensibles.
- [x] MongoDB y Redis no están publicados en Internet (solo loopback en desarrollo y red interna en producción).
- [ ] Backup se restaura con éxito en entorno aislado.
- [ ] Reinicio de servicios recupera colas y datos persistidos.
- [ ] Configuración de producción usa HTTPS y cookies seguras.

## Antes de producción
- [ ] Crear usuarios reales con contraseñas individuales.
- [ ] Cambiar todos los secretos de ejemplo.
- [ ] Confirmar autorización para notificaciones WhatsApp.
- [ ] Configurar alertas externas de caída del servidor.
- [ ] Revisar actualización y restauración.
- [ ] Documentar quién puede acceder a datos y por cuánto tiempo se conservan.
- [ ] Obtener aprobación de quien administra el barrio y verificar requisitos legales/locales aplicables.

## Definition of Done
Una tarea está terminada cuando:
1. Cumple los criterios de aceptación.
2. Tiene tests apropiados.
3. Pasa lint, typecheck y build.
4. No introduce secretos ni vulnerabilidades conocidas.
5. La documentación necesaria está actualizada.
6. OpenCode informa con precisión lo probado y lo pendiente.
