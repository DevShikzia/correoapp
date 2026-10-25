# 8. Estado actual y continuación

Registro de estado al **25/10/2026**, con el repositorio en el commit `b93e648`
(`feat(web): add owner portal and offline-safe PWA`).

Este documento resume lo hecho, lo verificado, lo que falta y los pasos exactos para
retomar después de reiniciar Windows. No contiene contraseñas ni secretos: los valores
locales viven en `.env`, que está ignorado por Git.

## Resumen funcional

- Fases 0 a 5 del plan completadas.
- API Express + TypeScript con autenticación de staff, lotes, vigiladores,
  correspondencia, auditoría y portal de propietarios.
- Portal Angular `/portal` con lote + PIN, listado paginado, estados y logout.
- PWA con service worker; `/api` queda fuera de caché (`dataGroups: []`).
- Pantallas `/staff` y `/admin`: todavía son marcadores de posición.
- Tests al cierre de la Fase 5: **135 API + 9 web**, con lint, typecheck, build y
  formato en verde.
- Último pipeline completo ejecutado sobre `b93e648`.

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

## Infraestructura local instalada

- **Docker Desktop 4.96.3** instalado con winget. Cliente `docker` 29.9.2 y
  Compose v5.6.1.
- **WSL2** instalado y kernel actualizado. Componentes
  `VirtualMachinePlatform`, `Microsoft-Windows-Subsystem-Linux` y
  `Microsoft-Hyper-V-All` habilitados.
- Docker Desktop configurado para iniciarse al iniciar sesión.
- **MongoDB 8.0 nativo** ya existía como servicio de Windows en
  `127.0.0.1:27017`, sin autenticación (`mongod.cfg` sin bloque `security`).
  Sus datos están en `C:\Program Files\MongoDB\Server\8.0\data`.
- `.env` local (ignorado por Git) apunta ahora al MongoDB nativo y deja comentada
  la línea para el MongoDB de Compose.

## Bloqueo actual: reinicio pendiente

La habilitación de los componentes devolvió `3010` (reinicio requerido) y `wsl --status`
todavía informa que la virtualización no está activa. Por eso Docker Desktop no puede
iniciar su motor y `docker version` devuelve error 500 en el contexto `desktop-linux`.

**No hay nada más que instalar.** Falta reiniciar Windows una vez.

## Pasos para continuar después del reinicio

### 1. Verificar Docker y WSL

```powershell
wsl --status        # debe informar versión predeterminada 2
docker version      # debe mostrar cliente y servidor, sin error 500
docker ps           # debe responder sin error
```

Si Docker Desktop no arrancó solo, abrirlo desde el menú Inicio y esperar a que el
motor esté listo.

### 2. Elegir qué MongoDB usar

El MongoDB nativo y el de Compose **no pueden escuchar ambos en `27017`**. Elegir una opción:

- **Compose (recomendado para validar Docker):** detener el servicio nativo desde una
  PowerShell de administrador:

  ```powershell
  Stop-Service MongoDB
  ```

  Opcionalmente, dejarlo manual para que no vuelva a tomar el puerto:

  ```powershell
  Set-Service MongoDB -StartupType Manual
  ```

- **MongoDB nativo:** no levantar el servicio `mongo` de Compose. Es lo que se usó en
  la verificación del 25/10.

### 3. Levantar MongoDB con Compose

Desde la raíz del repositorio:

```powershell
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml up -d mongo
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml ps
```

El contenedor debe quedar `healthy`. El archivo de desarrollo publica MongoDB solo en
`127.0.0.1:27017`; no se expone a Internet.

### 4. Apuntar `.env` al MongoDB de Compose

Descomentar en `.env` la línea:

```dotenv
MONGODB_URI=mongodb://correspondencia_admin:<password-local>@127.0.0.1:27017/correspondencia?authSource=admin
```

El usuario y la contraseña son los de `MONGO_ROOT_USER`/`MONGO_ROOT_PASSWORD` del
mismo `.env`. No versionar ese archivo.

### 5. Preparar la base y el administrador

```powershell
pnpm --filter @correspondencia/api sync:indexes

$env:ADMIN_USERNAME = 'elegir-usuario'
$env:ADMIN_PASSWORD = 'elegir-contraseña-de-12-o-más'
pnpm --filter @correspondencia/api bootstrap:admin
```

El bootstrap falla si el usuario ya existe. Usar credenciales propias, no las de
ejemplo de este documento.

### 6. Levantar API y portal

```powershell
pnpm dev:api    # http://localhost:3000
pnpm dev:web    # http://localhost:4200, proxy /api → :3000
```

Probar `/portal` en el navegador y, si se desea, correr el smoke contra una base
descartable como se explicó arriba.

### 7. Cerrar la validación de Docker

- Confirmar que el contenedor de Mongo sobrevive a un reinicio de Docker Desktop.
- Confirmar que la API se conecta a Compose y que `pnpm smoke:http` sigue en verde.
- Recién entonces pasar a la Fase 6.

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

- **Docker todavía no fue ejercitado**: falta el reinicio y la prueba de Compose.
- El rate limit en memoria se reinicia con la API y una IP compartida (por ejemplo,
  una red doméstica con NAT) puede bloquear a varios propietarios durante 15 minutos.
- MongoDB nativo y Compose compiten por el puerto `27017`; hay que elegir uno.
- Las pantallas `/staff` y `/admin` no tienen interfaz real todavía.
- Los iconos PWA son los genéricos que genera Angular.
- Fase 6 (WhatsApp asíncrono), backups, restauración, HTTPS y endurecimiento de
  producción siguen pendientes.
- No se probó el flujo en un dispositivo móvil real ni la instalación de la PWA.

## Próximos pasos sugeridos

1. Reiniciar Windows y completar la validación de Docker/Compose (secciones anteriores).
2. Cerrar la Fase 5 con la prueba sobre Compose y actualizar este documento.
3. Fase 6: interfaz `NotificationProvider`, cola BullMQ, worker con reintentos e
   idempotencia y webhook autenticado.
4. Implementar las pantallas de staff y administración.
5. Fase 7: endurecimiento, rate limit compartido, backups y restauración.
6. Fase 8: despliegue en Ubuntu Server con Nginx, Cloudflare Tunnel y HTTPS.

## Checklist para retomar

- [ ] Reiniciar Windows.
- [ ] `wsl --status` informa versión 2.
- [ ] `docker version` y `docker ps` funcionan sin error 500.
- [ ] Elegir MongoDB nativo o Compose y liberar `27017`.
- [ ] Contenedor `mongo` de Compose `healthy`.
- [ ] `.env` apunta a la base elegida.
- [ ] `sync:indexes` ejecutado.
- [ ] Administrador definitivo creado con credenciales propias.
- [ ] API y portal arrancan.
- [ ] `pnpm smoke:http` en verde contra base descartable.
- [ ] Base descartable eliminada.
- [ ] Continuar con la Fase 6.
