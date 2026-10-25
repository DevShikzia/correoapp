# 8. Estado actual y continuación

Registro de estado al **25/10/2026**. El código de la aplicación corresponde al commit
`b93e648` (`feat(web): add owner portal and offline-safe PWA`); este documento y el
script de humo se agregaron después, sin cambios funcionales.

Este documento resume lo hecho, lo verificado, lo que falta y los pasos exactos para
retomar después de reiniciar Windows. No contiene contraseñas ni secretos: los valores
locales viven en `.env`, que está ignorado por Git.

## Resumen funcional

- Fases 0 a 5 del plan completadas.
- API Express + TypeScript con autenticación de staff, lotes, vigiladores,
  correspondencia, auditoría y portal de propietarios.
- Portal Angular `/portal` con lote + PIN, listado paginado, estados y logout.
- Interfaz `/staff` para registrar correspondencia, ver pendientes y entregar con
  confirmación.
- Interfaz `/admin` para lotes, contactos, PIN y gestión de vigiladores.
- PWA con service worker; `/api` queda fuera de caché (`dataGroups: []`).
- Tests actuales: **135 API + 30 web**, con lint, typecheck, build y formato en verde.
- **Docker Compose validado**: MongoDB `mongo:8.0` en `127.0.0.1:27018`, smoke
  HTTP 64/64 y datos persistentes tras reiniciar el contenedor.
- Último pipeline completo en verde antes de la Fase 6.

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
| Rate limit | 5 fallos de PIN y el siguiente intento responde 429 |
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
- El `.env` local apunta por defecto al MongoDB nativo para el desarrollo diario.
  La prueba contra Compose se hace con un override de `MONGODB_URI` en la shell.
- Los comandos de Compose deben usar `--env-file .env` de forma explícita para que
  el puerto y las credenciales se resuelvan sin ambigüedad.

## Cómo levantar el MongoDB de Compose

Desde la raíz del repositorio:

```powershell
docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml up -d mongo

docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml ps
```

El contenedor debe quedar `healthy` y publicado solo en loopback. Para apuntar la
API al Mongo de Compose, construir la URI con las credenciales del `.env` y el
puerto `MONGO_HOST_PORT`:

```powershell
$mongoUser = ((Get-Content .env | Where-Object { $_ -match '^MONGO_ROOT_USER=' }) -split '=',2)[1]
$mongoPassword = ((Get-Content .env | Where-Object { $_ -match '^MONGO_ROOT_PASSWORD=' }) -split '=',2)[1]
$env:MONGODB_URI = "mongodb://${mongoUser}:${mongoPassword}@127.0.0.1:27018/correspondencia?authSource=admin"
pnpm dev:api
```

Para bajar el contenedor conservando los datos:

```powershell
docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml down
```

El volumen `compose_mongo-data` permanece. No usar `down -v` salvo que se quieran
borrar los datos de Compose a propósito.

## Cierre de la Fase 5 y frontend operativo

La validación pendiente de Docker quedó completa:

- `docker version` y `docker ps` responden correctamente tras el reinicio.
- WSL2 informa versión 2 y el motor Linux de Docker funciona.
- El contenedor de MongoDB de Compose quedó `healthy` en `127.0.0.1:27018`.
- `pnpm smoke:http` pasó **64/64** contra esa instancia.
- Los datos sobrevivieron al reinicio del contenedor y el volumen quedó conservado.
- El MongoDB nativo y las demás bases no se vieron afectados.

Además, `/staff` y `/admin` dejaron de ser marcadores de posición y quedaron
cubiertos por **30 tests web**. La Fase 5 queda cerrada; el siguiente trabajo es la
Fase 6 (notificaciones por WhatsApp de forma asíncrona).

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
- El rate limit es por lote y por IP, en memoria, con 5 intentos por 15 minutos.
- La PWA no cachea respuestas de `/api` y el portal no usa `localStorage` ni
  `sessionStorage` para datos privados.
- El formato de fechas del portal usa `Intl.DateTimeFormat('es-AR')`.

## Riesgos y deuda pendiente

- El rate limit en memoria se reinicia con la API y una IP compartida (por ejemplo,
  una red doméstica con NAT) puede bloquear a varios propietarios durante 15 minutos.
- El MongoDB de Compose y el nativo conviven solo porque usan puertos distintos
  (`27018` y `27017`). Si se cambia `MONGO_HOST_PORT`, revisar el `.env` y la URI.
- Falta una pasada manual en navegador por `/staff` y `/admin` con datos reales de
  prueba; la cobertura actual es de tests de componentes.
- Los iconos PWA son los genéricos que genera Angular.
- Fase 6 (WhatsApp asíncrono), backups, restauración, HTTPS y endurecimiento de
  producción siguen pendientes.
- No se probó el flujo en un dispositivo móvil real ni la instalación de la PWA.

## Próximos pasos sugeridos

1. Fase 6: interfaz `NotificationProvider`, cola BullMQ, worker con reintentos e
   idempotencia y webhook autenticado.
2. Fase 7: endurecimiento, rate limit compartido, backups y restauración.
3. Fase 8: despliegue en Ubuntu Server con Nginx, Cloudflare Tunnel y HTTPS.

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
- [ ] Pasada manual en navegador de `/staff` y `/admin`.
- [ ] Fase 6.
