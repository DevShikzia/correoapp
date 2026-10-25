# Instrucciones para OpenCode

## Forma de trabajar
- Antes de editar, inspeccioná el repositorio y resumí qué existe.
- Leé `README.md` y todos los documentos de `docs/` relevantes a la tarea.
- Trabajá en cambios pequeños y coherentes. Una fase por vez.
- Antes de crear archivos, proponé una estructura breve; luego implementá solo lo necesario.
- No inventes secretos, dominios, números de teléfono, credenciales ni IDs reales.
- Usá `.env.example` con placeholders; nunca escribas secretos en el código ni en Git.
- Si falta una decisión crítica, preguntá una sola cosa concreta. Si no bloquea, elegí una opción simple y documentala.
- No declares una tarea terminada sin ejecutar los tests, lint y build disponibles; informá claramente lo que no se pudo ejecutar.
- Al terminar, reportá: archivos cambiados, decisiones, comandos ejecutados, resultados y riesgos pendientes.

## Clean Code
- TypeScript en frontend y backend, con `strict: true`.
- Funciones pequeñas, nombres descriptivos, responsabilidades únicas.
- Separar rutas/controladores, servicios de negocio, repositorios/consultas y validación.
- Evitar lógica de negocio en controladores y componentes Angular.
- Evitar `any`, duplicación, abstracciones prematuras, archivos gigantes y comentarios que repitan el código.
- Manejar errores con un formato consistente; no exponer stack traces al cliente.
- Validar todos los datos de entrada en el servidor.
- No usar valores mágicos: constantes con nombres claros.
- Mantener dependencias mínimas y justificadas.

## Seguridad obligatoria
- Nunca confiar en permisos o `lotId` del frontend.
- Consultas de propietarios siempre se filtran por el lote obtenido de una sesión validada por el servidor.
- Contraseñas y PIN guardados como hashes robustos, nunca en texto plano.
- Secretos solo por variables de entorno/secretos del despliegue.
- No registrar PIN, contraseña, cookie, token, credenciales de WhatsApp ni contenido sensible en logs.
- No publicar puertos de MongoDB ni Redis.
- No guardar respuestas privadas de correspondencia en caché PWA/offline.
- Agregar pruebas de aislamiento entre lotes desde el inicio.
- Para cookies de sesión, aplicar `HttpOnly`, `Secure` en producción, `SameSite`, expiración y protección CSRF cuando corresponda.
- Limitar intentos de acceso y devolver errores genéricos que no revelen si un lote existe.

## Límites de alcance inicial
- No implementar lectura de DNI, fotos, reconocimiento de imágenes ni almacenamiento de documentos.
- No usar microservicios ni Kubernetes.
- No permitir registro público de vigiladores.
- No mandar WhatsApp antes de persistir el registro de correspondencia.
- No permitir que un fallo de WhatsApp impida guardar la correspondencia.
