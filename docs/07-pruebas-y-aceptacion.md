# 7. Pruebas y criterios de aceptación

## Automatización mínima
- Unit tests para servicios/reglas de negocio.
- Integration tests para API y base de datos.
- Tests de autorización y aislamiento.
- Lint, typecheck y build en CI antes de integrar cambios.

## Casos críticos
- [ ] Login correcto e incorrecto de vigilador.
- [ ] Vigilador desactivado no puede seguir usando sesión.
- [ ] Solo admin puede crear lotes y usuarios.
- [ ] PIN incorrecto no revela si el lote existe.
- [ ] Demasiados intentos bloquean o ralentizan nuevos intentos.
- [ ] Cambiar PIN invalida sesiones previas del lote.
- [ ] Lote A no puede consultar correspondencia de lote B aunque cambie IDs/query params.
- [ ] API nunca devuelve teléfonos ni PIN hash a propietarios.
- [ ] Vigilador solo puede marcar entrega con transición válida.
- [ ] Doble solicitud de entrega no genera registros contradictorios.
- [ ] Una falla del proveedor WhatsApp no borra la correspondencia.
- [ ] Reintentos y webhooks duplicados no duplican estados ni acciones.
- [ ] Respuestas privadas no se guardan en caché PWA.
- [ ] Logs no contienen secretos ni datos sensibles.
- [ ] MongoDB y Redis no están publicados en Internet.
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
