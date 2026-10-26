# 8. Estado actual y continuación

Registro de estado al **26/10/2026**. El código incluye las fases 0 a 6, el rediseño
del portal de propietarios, la Fase 7A (reintento y reconciliación de avisos), la
Fase 7B (rate limit compartido en Redis) y el despliegue LAN de la Fase 8 en la
notebook. Los últimos commits están en `main`; este documento se actualiza junto con
cada fase.

Este documento resume lo hecho, lo verificado, lo que falta y los pasos exactos para
retomar después de reiniciar Windows. No contiene contraseñas ni secretos: los valores
locales viven en `.env`, que está ignorado por Git.

## Resumen funcional

- Fases 0 a 6, 7A y 7B implementadas, y despliegue LAN de la Fase 8 en la notebook.
- API Express + TypeScript con autenticación de staff, lotes, vigiladores,
  correspondencia, auditoría y portal de propietarios.
- Portal Angular `/portal` con lote + PIN, listado paginado, estados y logout.
  Es una vista pública independiente: no muestra enlaces a Vigilancia ni Administración.
- Interfaz `/staff` para registrar correspondencia, ver pendientes y entregar con
  confirmación.
- Interfaz `/admin` para lotes, contactos, PIN y gestión de vigiladores.
- Notificaciones por WhatsApp asíncronas con cola BullMQ, worker separado, reintentos
  limitados, idempotencia, webhook autenticado, reintento manual y reconciliación de
  avisos `pending`. Apagadas por defecto.
- PWA con service worker; `/api` queda fuera de caché (`dataGroups: []`).
- Tests actuales: **188 API + 21 worker + 34 web**, con lint, typecheck, build y formato
  en verde.
- **Docker Compose validado** con `docker compose config`: MongoDB `mongo:8.0` y Redis
  `redis:7.4-alpine`, ambos en red interna y publicados solo en loopback en desarrollo.
- Último pipeline completo en verde.

## Verificación real realizada

Se probó el flujo completo por HTTP contra una instancia real de la API y
**MongoDB 8.0 nativo**, usando la base descartable `correspondencia_smoke`.
Resultado: **64/64 verificaciones OK**.

| Área | Qué se comprobó |
| --- | --- |
| Salud | `/api/health` responde 200 |
| Staff | Login de admin, cookie `HttpOnly`/`SameSite=Strict`/`Path=/`, sin hashes en respuestas |
| Permisos | Un vigilador recibe 403 en endpoints de administración |
| Lotes | Alta de lotes 101/102/103, PIN hasheado, reset de PIN |
| Correspondencia | Registro con `receivedBy` tomado de la sesión, pendientes, entrega |
| Doble entrega | Segunda entrega responde 409 con mensaje explícito |
| Portal | Acceso lote + PIN, `/me` solo devuelve `lotNumber`, DTO mínimo |
| Aislamiento | El propietario del lote 101 ignora `lotId`/`lotNumber=102` enviados por el cliente |
| Privacidad | DTO sin `lotId`, `receivedBy`, `deliveredBy`, contactos, teléfonos ni hashes |
| Caché | `Cache-Control: no-store` en `/api` |
| Sesiones | Logout invalida la cookie; reset de PIN y desactivación revocan sesiones |
| Rate limit | 5 fallos de PIN y el siguiente intento responde 429; el bloqueo compartido entre instancias se validó aparte |
| CSRF | `Origin` distinto de `APP_ORIGIN` responde 403 |
| Frontend | `/portal` responde 200 y el proxy `/api` llega a la API real |

La base `correspondencia_smoke` se eliminó al terminar. La API y el servidor Angular
se detuvieron; los puertos `3000` y `4200` quedaron libres.

### Misma prueba contra Docker Compose

El **25/10/2026** se repitió el smoke completo contra el MongoDB de Compose
(`mongo:8.0`, contenedor `compose-mongo-1`) publicado en `127.0.0.1:27018`, para no
chocar con el MongoDB nativo que seguía en `27017`. Resultado: **64/64 OK**.

Además se verificó:

- Contenedor en estado `healthy` con autenticación root de Compose (`{"ok":1}`).
- Persistencia real tras `docker restart compose-mongo-1`: seguían los 3 lotes,
  2 registros de correspondencia (1 entregado) y 2 usuarios de staff.
- `docker compose down` conservó el volumen `compose_mongo-data`.
- El MongoDB nativo y sus otras bases (`panelLSO`, `tramiTickets`, etc.) no se
  detuvieron ni se modificaron.
- La base descartable se eliminó antes de bajar Compose.

### Reproducir la prueba

El script quedó versionado en `scripts/smoke-http.mjs` y se ejecuta con
`pnpm smoke:http`. **Solo debe usarse contra una base descartable recién creada**:
no borra lotes ni usuarios y espera que 101, 102 y 103 no existan.

Ejemplo en PowerShell (Windows):

```powershell
# 1. Base descartable y administrador temporal
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/correspondencia_smoke'
pnpm --filter @correspondencia/api sync:indexes
$env:ADMIN_USERNAME = 'admin.smoke'
$env:ADMIN_PASSWORD = 'elegir-una-contraseña-de-12-o-mas'
pnpm --filter @correspondencia/api bootstrap:admin

# 2. API apuntando a esa base (en otra terminal)
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017/correspondencia_smoke'
pnpm dev:api

# 3. Smoke
$env:SMOKE_ADMIN_USERNAME = 'admin.smoke'
$env:SMOKE_ADMIN_PASSWORD = 'la-misma-contraseña'
pnpm smoke:http

# 4. Limpieza: detener la API y borrar la base
pnpm --filter @correspondencia/api exec node --input-type=module -e "import mongoose from 'mongoose'; await mongoose.connect('mongodb://127.0.0.1:27017/correspondencia_smoke'); await mongoose.connection.dropDatabase(); await mongoose.disconnect();"
```

Variables opcionales del script: `SMOKE_BASE_URL` (por defecto
`http://127.0.0.1:3000/api`), `SMOKE_ORIGIN` (por defecto
`http://localhost:4200`, debe coincidir con `APP_ORIGIN`) y
`SMOKE_GUARD_PASSWORD` (si se omite, se genera una aleatoria).

## Interfaz de staff y administración

El **25/10/2026** se reemplazaron los marcadores de posición por pantallas
operativas sobre los endpoints existentes:

- `/staff`: login, alta de correspondencia por número de lote, lista paginada de
  pendientes y entrega con confirmación en dos pasos.
- `/admin`: solo administradores; alta y edición de lotes, propietarios y
  contactos, reset de PIN, activación/desactivación y gestión de vigiladores.
- Sesión de staff compartida entre ambas pantallas; la navegación oculta
  “Administración” a un vigilador, pero el backend sigue validando el rol.
- Los formularios no guardan contraseñas, PIN ni datos privados en el navegador.
- Cobertura: **30 tests web** (8 del portal existente + 22 nuevos: login, navegación,
  `/staff`, `/admin`, paneles de lotes y vigiladores) además de los 135 tests de la
  API.

La interfaz fue validada con tests de componentes y build de producción. Todavía
falta una pasada manual completa en navegador antes de considerarla cerrada.

## Entorno local

- **Docker Desktop 4.96.3** con cliente `docker` 29.9.2, motor Linux y Compose
  v5.6.1. Arranca al iniciar sesión.
- **WSL2** versión 2 con kernel 6.18; hipervisor activo.
- **MongoDB 8.0 nativo** como servicio de Windows en `127.0.0.1:27017`, sin
  autenticación (`mongod.cfg` sin bloque `security`). Sus datos están en
  `C:\Program Files\MongoDB\Server\8.0\data`.
- **MongoDB de Compose** (`mongo:8.0`) se publica en `127.0.0.1:${MONGO_HOST_PORT}`
  mediante `infra/compose/docker-compose.dev.yml`. Para convivir con el nativo,
  el `.env` local usa `MONGO_HOST_PORT=27018`.
- **Redis de Compose** (`redis:7.4-alpine`) se publica en
  `127.0.0.1:${REDIS_HOST_PORT}` (por defecto `6379`) solo en desarrollo. En la
  configuración base no tiene `ports:`.
- El `.env` local apunta por defecto al MongoDB nativo para el desarrollo diario y a
  `redis://127.0.0.1:6379` para la cola. La prueba contra Compose se hace con un
  override de `MONGODB_URI` en la shell.
- Los comandos de Compose deben usar `--env-file .env` de forma explícita para que
  el puerto y las credenciales se resuelvan sin ambigüedad.

## Cómo levantar MongoDB y Redis de Compose

Desde la raíz del repositorio:

```powershell
docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml up -d mongo redis

docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml ps
```

Los contenedores deben quedar `healthy` y publicados solo en loopback. Para verificar
Redis: `docker compose ... exec redis redis-cli ping` debe responder `PONG`. Para
apuntar la API al Mongo de Compose, construir la URI con las credenciales del `.env` y
el puerto `MONGO_HOST_PORT`:

```powershell
$mongoUser = ((Get-Content .env | Where-Object { $_ -match '^MONGO_ROOT_USER=' }) -split '=',2)[1]
$mongoPassword = ((Get-Content .env | Where-Object { $_ -match '^MONGO_ROOT_PASSWORD=' }) -split '=',2)[1]
$env:MONGODB_URI = "mongodb://${mongoUser}:${mongoPassword}@127.0.0.1:27018/correspondencia?authSource=admin"
pnpm dev:api
```

Para bajar los contenedores conservando los datos:

```powershell
docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml down
```

Los volúmenes `compose_mongo-data` y `compose_redis-data` permanecen. No usar
`down -v` salvo que se quieran borrar los datos de Compose a propósito.

## Cierre de la Fase 5 y frontend operativo

La validación pendiente de Docker quedó completa:

- `docker version` y `docker ps` responden correctamente tras el reinicio.
- WSL2 informa versión 2 y el motor Linux de Docker funciona.
- El contenedor de MongoDB de Compose quedó `healthy` en `127.0.0.1:27018`.
- `pnpm smoke:http` pasó **64/64** contra esa instancia.
- Los datos sobrevivieron al reinicio del contenedor y el volumen quedó conservado.
- El MongoDB nativo y las demás bases no se vieron afectados.

Además, `/staff` y `/admin` dejaron de ser marcadores de posición y quedaron
cubiertos por **30 tests web**. La Fase 5 quedó cerrada con esos 30 tests.

## Fase 6 — WhatsApp asíncrono

Implementada el **25/10/2026**. Flujo completo:

1. `POST /mail` resuelve el lote desde la sesión del vigilador y guarda `MailItem`.
2. Registra la auditoría `mail.created`.
3. Si `NOTIFICATIONS_ENABLED=true`, crea un `NotificationJob` por teléfono único
   (índice único `{ mailItemId, phone }`) con estado `pending`.
4. Encola cada aviso en BullMQ con `jobId = notificationId` para evitar duplicados.
5. Si el encolado falla, el aviso queda `pending` y el alta responde 201 igual: el
   fallo de WhatsApp o de Redis nunca revierte la correspondencia.
6. El worker (`apps/worker`) toma el aviso, no reenvía estados `sent`/`failed`, llama
   al proveedor y actualiza `sent`, `queued` (reintento) o `failed`.
7. Los errores 4xx del proveedor (salvo 408/429) son definitivos y usan
   `UnrecoverableError`; 408/429/5xx, red y timeout se reintentan con backoff exponencial.
8. El webhook valida la firma HMAC y confirma `sent`/`delivered`/`read`/`failed`.

Configuración principal:

- `NOTIFICATIONS_ENABLED=false` por defecto. Sin activarlo no se crean avisos ni se
  conecta Redis, tanto en la API como en el worker.
- `WHATSAPP_PROVIDER`: `console` para desarrollo (no envía mensajes reales) o `meta`
  para WhatsApp Cloud API.
- `WHATSAPP_TEMPLATE_NAME` y `WHATSAPP_TEMPLATE_LANGUAGE`: plantilla aprobada con una
  variable en el cuerpo (`{{1}}` = número de lote). **No se envía la descripción ni
  otros datos de la correspondencia**, según `docs/04-seguridad-y-privacidad.md`.
- `WHATSAPP_APP_SECRET` valida `X-Hub-Signature-256`; `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  responde el challenge del `GET`.
- `NOTIFICATION_MAX_ATTEMPTS`, `NOTIFICATION_BACKOFF_MS` y `NOTIFICATION_CONCURRENCY`.

El worker es un proceso desplegable aparte y mantiene un modelo espejo de
`NotificationJob` y las constantes de la cola. Si las notificaciones están apagadas,
queda inactivo sin tocar MongoDB ni Redis.

Se agregaron `bullmq` e `ioredis` a la API y `bullmq`, `ioredis` y `mongoose` al worker.
Redis se sumó a Compose con AOF, `maxmemory 256mb`, `noeviction`, healthcheck y sin
puerto en la configuración base (loopback solo en el override de desarrollo).

Pruebas: **14 tests nuevos en la API** (servicio de notificaciones, webhook, mail y
modelo) y **11 del worker** (procesador y proveedor Meta).

Validación end-to-end del **25/10/2026**: con el Redis de Compose levantado, la API y el
worker corriendo con `WHATSAPP_PROVIDER=console` y una base descartable,
`pnpm smoke:notifications` verificó **16/16**: la correspondencia se guarda, se crea un
único aviso, el worker lo envía al primer intento y queda `sent` con el lote, el teléfono
y la fecha. El aviso no contiene la descripción. Los logs de la API y del worker no
mostraron teléfonos, PIN, cookies ni credenciales. La Fase 7A extendió el mismo script a
**27 verificaciones** con el reintento manual y el listado enmascarado.

Pendiente de la Fase 6:

- Probar con credenciales y plantilla reales de Meta: no hay secretos disponibles.
- Configurar el webhook público con HTTPS y validarlo desde Meta.

## Fase 7A — Resiliencia de avisos

Implementada el **26/10/2026**:

1. `POST /api/notifications/:id/retry` (solo admin) pasa un aviso `failed` o `pending` a
   `queued` con un `findOneAndUpdate` condicional, reinicia `attempts` y limpia
   `lastErrorCode`. Dos reintentos simultáneos no duplican el envío.
2. Responde **409** para `queued`, `sending` y `sent`, **404** si el aviso no existe y
   **503** si Redis falla; en ese último caso el aviso vuelve a `pending`.
3. `GET /api/notifications?status=&page=&limit=` (solo admin) lista los avisos con el
   teléfono enmascarado (`+549••••4455`). No devuelve el número completo.
4. `retryCount` es nuevo en el modelo. Cada reintento usa `jobId = <id>-r<n>`: BullMQ
   rechaza `:` en los ids personalizados y descarta un `add` con un jobId ya completado.
5. La reconciliación corre en el worker al arrancar y cada 5 minutos. Reencola solo
   avisos `pending` con más de 2 minutos y nunca toca `queued`/`sending`, donde el
   mensaje pudo salir sin confirmación.
6. La auditoría registra `notification.retried`.

Configuración: no agrega variables nuevas. La API y el worker comparten
`NOTIFICATION_MAX_ATTEMPTS` y `NOTIFICATION_BACKOFF_MS` para que los trabajos
reencolados por el worker usen los mismos límites que los de la API.

Validación real del **26/10/2026**:

- `pnpm smoke:notifications` → **27/27**. Incluye un aviso fallido insertado a mano,
  reintento por el administrador, envío por el worker al primer intento, segundo
  reintento rechazado (409), listado enmascarado y 403 para vigiladores.
- Reconciliación con Mongo y Redis reales: un aviso `pending` de 30 minutos se envió al
  primer intento (`requeued: 1`) mientras uno recién creado siguió `pending`.
- Sin teléfonos ni credenciales en los logs y sin bases `*e2e*` residuales.

## Fase 7B — Rate limit compartido

Implementada el **26/10/2026**:

1. `AttemptLimiter` pasó a ser asíncrono y tiene dos implementaciones: memoria local y
   Redis.
2. Con `REDIS_URL` configurada, staff y propietarios comparten los contadores entre
   instancias con los prefijos `ratelimit:staff:` y `ratelimit:owner:`.
3. El incremento usa un script Lua con `INCR` + `PEXPIRE` en el primer fallo: la ventana
   de 15 minutos no queda abierta si el proceso cae entre ambas operaciones.
4. Las claves separan usuario/lote e IP. No contienen contraseñas, PIN ni tokens.
5. Si Redis no está listo o una operación falla, se usa el limitador local, se avisa una
   sola vez en el log y el login sigue disponible. El respaldo recibe los mismos fallos y
   se limpia al reiniciar, para que una caída breve no habilite intentos extra.
6. Sin `REDIS_URL` (desarrollo o una sola instancia) se usa memoria local; en producción
   se registra una advertencia al arrancar.

Validación real del **26/10/2026**:

- Dos instancias de la API contra el mismo Redis y una base descartable: 3 fallos en una
  instancia y 2 en la otra produjeron **429** en ambas (**19/19** verificaciones).
- El contador del usuario llegó a 5 y conservó su TTL de 15 minutos.
- Una tercera instancia con Redis inaccesible permitió el login correcto y bloqueó al
  sexto intento con el límite local.
- Sin contraseñas en los logs; las claves de Redis no incluyen secretos.

## Fase 8 — Despliegue en la notebook

Desplegado el **26/10/2026** en la notebook Ubuntu 26.04 (`192.168.0.67`, kernel 7.0):

1. Docker 29.1.3 y Compose 2.40.3 instalados; `shikzia` en el grupo `docker`.
2. Código en `/home/shikzia/correspondencia`; `.env.production` con permisos `600` y
   secretos generados en el servidor con `infra/scripts/generate-prod-env.sh`.
3. `infra/compose/docker-compose.prod.yml` levanta MongoDB, Redis, API, worker y web.
   Solo la web publica el puerto **8080** en la LAN; MongoDB y Redis no tienen `ports:`.
4. La app de facturación del puerto 80 y el MongoDB nativo (7.0.32) quedaron intactos.
   UFW permite 8080 solo desde `192.168.0.0/24`.
5. `mongo:7.0` está fijado porque 8.0 se niega a arrancar en kernels 6.19+ y 8.2 se
   reinició con SIGSEGV (139) durante las pruebas. 7.0 es la versión del MongoDB nativo
   que ya funcionaba.
6. Se crearon los índices y el administrador inicial (`admin`); la contraseña está en
   `~/correspondencia/.admin-password` y conviene reemplazarla creando otro
   administrador desde `/admin`.

Validación real del **26/10/2026**:

- `http://192.168.0.67:8080` responde 200 con el título “Correspondencia”.
- `/api/health` a través de Nginx responde 200 y `{"status":"ok"}`.
- Login de `admin` responde 200 y `/api/auth/me` devuelve el rol `admin`.
- La app existente en `http://192.168.0.67/` sigue respondiendo 200.
- MongoDB 7.0 se mantuvo estable, sin reinicios, con 83 MB de uso.

Pendiente de esta fase:

- Cloudflare Tunnel y HTTPS; después cambiar `APP_ORIGIN` y `COOKIE_SECURE=true`.
- Backups y prueba de restauración (Fase 7C).
- Habilitar WhatsApp con credenciales y plantilla reales.
- La PWA no se instala ni cachea offline por HTTP; necesita HTTPS.

## Portal de propietarios separado y rediseñado

El **25/10/2026** el portal dejó de compartir la interfaz interna:

- La barra de navegación compartida solo se muestra en `/staff` y `/admin`. En
  `/portal` el propietario ve una barra propia con la marca y, si tiene sesión, su lote
  y el botón “Salir”. No hay enlaces a Vigilancia ni Administración.
- El backend sigue validando la sesión de propietario y el rol de staff; ocultar la
  navegación no es la protección.
- Rediseño: fondo con gradientes suaves, tarjeta de acceso con PIN visible/ocultable,
  ayudas de validación, estado de carga, tarjetas de correspondencia con detalle
  expandible, botón “Actualizar”, estado vacío ilustrado y animaciones que respetan
  `prefers-reduced-motion`.
- Enfoque **mobile-first**: la base es una columna con el formulario antes que las
  ventajas, controles de al menos 44 px, campos de 16 px para evitar el zoom de iOS y
  `env(safe-area-inset-*)` en la barra y el pie. Las mejoras llegan desde `521px`
  (fila de correspondencia y paginación) y `861px` (grilla de dos columnas).
- Se ajustó el presupuesto `anyComponentStyle` de Angular a 12 kB (aviso) / 16 kB
  (error): el CSS del portal supera el límite anterior de 8 kB.
- Cobertura: **34 tests web** (30 previos + 3 de interacción del portal + 1 de
  separación de la navegación).

## Decisiones y comportamientos a tener presentes

- El lote del propietario **siempre** sale de la sesión validada por el servidor;
  `lotId` y `lotNumber` enviados por el cliente se ignoran.
- `receivedBy` y `deliveredBy` son IDs de staff, no objetos expandidos.
- Registrar correspondencia en un lote inexistente o inactivo responde **404**
  (`El lote no existe o está inactivo.`).
- Los mensajes de acceso son genéricos: no revelan si el lote existe.
- Cambiar el PIN o desactivar un lote revoca todas las sesiones de propietario de
  ese lote.
- Las cookies son `HttpOnly`, `SameSite=Strict`, `Path=/` y `Secure` solo en
  producción.
- El rate limit es por lote/usuario y por IP, con 5 intentos por 15 minutos. Con
  `REDIS_URL` se comparte vía Redis; sin ella queda en memoria local. Si Redis falla, se
  usa el respaldo local y se avisa una vez en el log.
- La PWA no cachea respuestas de `/api` y el portal no usa `localStorage` ni
  `sessionStorage` para datos privados.
- El formato de fechas del portal usa `Intl.DateTimeFormat('es-AR')`.
- Las notificaciones se guardan antes de enviarse: primero `MailItem` + auditoría, luego
  `NotificationJob` y recién después la cola. Un fallo de WhatsApp nunca revierte el alta.
- El aviso de WhatsApp solo incluye el número de lote. La descripción de la
  correspondencia no se envía ni se guarda en `NotificationJob`.
- El worker y la API duplican a propósito el modelo `NotificationJob` y las constantes
  de la cola porque son procesos desplegables separados.
- El webhook de WhatsApp se monta antes del guard de `Origin` y del parser JSON global,
  porque lo invoca Meta y se autentica con HMAC sobre el cuerpo crudo.
- Los estados `sent`/`failed` no se reenvían. El alta usa `jobId = notificationId`; cada
  reintento manual usa `<id>-r<n>`, porque BullMQ rechaza `:` en los jobIds personalizados.
- El listado de avisos es solo para administradores y enmascara el teléfono. No se expone
  el contacto completo ni se usa para notificar.
- Los avisos `pending` de más de 2 minutos se reconcilian automáticamente. `queued` y
  `sending` quedan para revisión manual: el mensaje pudo haber salido sin confirmación.
- `NOTIFICATIONS_ENABLED=false` es el valor por defecto: sin activarlo no se usa Redis.

## Riesgos y deuda pendiente

- La app está publicada por **HTTP** en la LAN (`http://192.168.0.67:8080`); las
  credenciales viajan sin cifrar. No abrir 8080 a Internet. Antes del uso real hay que
  configurar HTTPS/Cloudflare y pasar `COOKIE_SECURE=true` y `APP_ORIGIN` al dominio.
- No hay backups automáticos ni prueba de restauración todavía (Fase 7C).
- MongoDB está fijado en 7.0 por la incompatibilidad del kernel 7.0 con 8.0/8.2. Revisar
  el salto a una 8.x estable cuando esté disponible.
- La notebook es un único punto de falla: si se apaga o pierde Internet, la app deja de
  estar disponible. El HDD y el swap pueden afectar la latencia bajo carga.
- El MongoDB de Compose de desarrollo y el nativo conviven solo porque el de desarrollo
  usa otro puerto (`27018`). En producción el Compose no publica MongoDB ni Redis.
- Falta una pasada manual en navegador por `/staff`, `/admin` y el rediseño del portal
  con datos reales de prueba; la cobertura actual es de tests de componentes.
- El proveedor `meta` no se probó contra la API real: faltan credenciales y una plantilla
  aprobada. El proveedor `console` sí se validó contra un Redis real.
- Un aviso `queued` cuyo trabajo se perdió en Redis no se reencola solo: queda visible en
  el listado para decidir a mano. La reconciliación tampoco puede avanzar mientras Redis
  siga caído; los `pending` esperan en Mongo y se reencolan cuando vuelve.
- El presupuesto de CSS del portal se amplió a 12/16 kB; conviene dividir la vista en
  componentes si sigue creciendo.
- Los iconos PWA son los genéricos que genera Angular. La PWA no se instala ni cachea
  offline por HTTP; necesita HTTPS.
- No se probó el flujo en un dispositivo móvil real.

## Próximos pasos sugeridos

1. Cloudflare Tunnel + HTTPS; actualizar `APP_ORIGIN` y `COOKIE_SECURE=true`.
2. Fase 7C: backups cifrados, copia fuera del equipo y prueba de restauración.
3. Fase 7D: credenciales de Meta, plantilla real y webhook público con HTTPS.
4. Pasada manual en navegador y celular por `/portal`, `/staff` y `/admin`.

## Checklist para retomar

- [x] Reiniciar Windows.
- [x] `wsl --status` informa versión 2.
- [x] `docker version` y `docker ps` funcionan sin error.
- [x] MongoDB de Compose en `127.0.0.1:27018` con `MONGO_HOST_PORT`.
- [x] Contenedor `mongo` de Compose `healthy`.
- [x] Autenticación root de Compose verificada.
- [x] `sync:indexes` ejecutado contra Compose.
- [x] `pnpm smoke:http` en verde contra base descartable (64/64).
- [x] Datos persistentes tras reiniciar el contenedor.
- [x] Base descartable eliminada.
- [x] Volumen `compose_mongo-data` conservado.
- [x] MongoDB nativo y sus otras bases intactos.
- [x] Pantallas `/staff` y `/admin` operativas con 30 tests web.
- [x] Portal separado de la navegación interna y rediseñado (34 tests web).
- [x] Fase 6 implementada: cola BullMQ, worker, reintentos, idempotencia y webhook.
- [x] Redis agregado a Compose y `.env.example` actualizado.
- [x] `docker compose config` válido con `mongo` y `redis`.
- [x] Redis levantado y envío end-to-end con el proveedor `console` (16/16).
- [x] Fase 7A implementada: reintento manual, listado de avisos y reconciliación.
- [x] Reintento y reconciliación validados con Mongo y Redis reales (27/27).
- [x] Fase 7B implementada: rate limit compartido en Redis con respaldo local.
- [x] Rate limit validado con dos instancias y con Redis caído (19/19).
- [x] Docker 29 y Compose 2.40 instalados en la notebook.
- [x] Stack de producción arriba en `http://192.168.0.67:8080` (health y login 200).
- [x] App de facturación del puerto 80 y MongoDB nativo intactos.
- [x] MongoDB 7.0 del Compose estable, sin reinicios.
- [ ] Configurar Cloudflare Tunnel/HTTPS y `COOKIE_SECURE=true`.
- [ ] Configurar backups y probar una restauración.
- [ ] Probar el proveedor `meta` con credenciales y plantilla reales.
- [ ] Pasada manual en navegador de `/portal`, `/staff` y `/admin`.
