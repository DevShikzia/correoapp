# 6. Repositorio, configuración y despliegue

## Crear repositorio
1. Crear repositorio Git privado en el proveedor elegido.
2. Crear carpeta y ejecutar `git init`.
3. Agregar `.gitignore`, `.editorconfig`, `README.md`, `AGENTS.md`, `docs/`.
4. Crear `.env.example` con nombres de variables y valores ficticios.
5. Instalar dependencias con lockfile y subirlo al repositorio.
6. Primer commit: `chore: initialize project documentation`.
7. Crear rama de trabajo por feature y commits pequeños.

## `.gitignore` mínimo
Ignorar `.env`, `.env.*` excepto `.env.example`, `node_modules/`, `dist/`, `.angular/`, `coverage/`, logs, dumps, archivos de datos MongoDB, certificados privados, claves y backups.

## Configuración
- Validar variables al iniciar; fallar rápido si falta una variable obligatoria.
- Separar configuración de desarrollo y producción.
- No tener valores secretos por defecto.
- No imprimir el entorno completo en logs.
- Fijar versiones de imágenes y dependencias; evitar `latest` en producción.

## Compose — servicios previstos
- `mongo`: solo red interna, volumen persistente, autenticación y caché limitada.
- `redis`: solo red interna, AOF y límite de memoria prudente.
- `api`: Express, sin publicar puerto directamente.
- `worker`: BullMQ; reinicio automático.
- `web`: build Angular servido por Nginx, proxy `/api` a `api`.
- `cloudflared`: conecta al Nginx local mediante Tunnel.
- `backup`: tarea programada o script externo que haga dump cifrado.

No copiar contraseñas reales en `docker-compose.yml`. Mantener Mongo/Redis fuera de `ports:`. Agregar healthchecks y `restart: unless-stopped`.

### Compose en desarrollo

`infra/compose/docker-compose.dev.yml` publica MongoDB y Redis solo en loopback para poder
ejecutar la API y el worker fuera de Docker. Los puertos locales son configurables:

```powershell
docker compose --env-file .env `
  -f infra/compose/docker-compose.yml `
  -f infra/compose/docker-compose.dev.yml up -d mongo redis
```

- `MONGO_HOST_PORT` (por defecto `27017`) define el puerto del host. Si ya existe un
  MongoDB nativo en `27017`, usar `27018` para convivir sin detenerlo.
- `REDIS_HOST_PORT` (por defecto `6379`) define el puerto local de Redis.
- Las credenciales de Mongo salen de `MONGO_ROOT_USER` y `MONGO_ROOT_PASSWORD` del `.env`.
  Redis no tiene contraseña porque no se publica fuera de loopback ni de la red interna.
- Redis usa AOF (`appendfsync everysec`), `maxmemory 256mb` y política `noeviction` para
  no perder avisos de la cola. La API y el worker se conectan con `REDIS_URL`.
- Usar `--env-file .env` explícito para evitar ambigüedad entre proyectos Compose.
- `down` conserva los volúmenes `compose_mongo-data` y `compose_redis-data`; no usar
  `down -v` salvo que se quieran borrar los datos a propósito.
- En producción este archivo de desarrollo no se usa: MongoDB y Redis quedan solo en la
  red interna de Compose.

### Compose de producción en la notebook

Desplegado el **26/10/2026** en Ubuntu Server 26.04 (kernel 7.0), IP `192.168.0.67`:

- Docker 29.1.3 y Compose 2.40.3; el usuario `shikzia` pertenece al grupo `docker`.
- Código en `/home/shikzia/correspondencia`. Los secretos viven en `.env.production`
  (permisos `600`) y se generan con `infra/scripts/generate-prod-env.sh`.
- `infra/compose/docker-compose.prod.yml` levanta `mongo`, `redis`, `api`, `worker` y
  `web`. Solo `web` publica `${WEB_PORT}` (8080) en la LAN; MongoDB y Redis no tienen
  `ports:` y quedan en la red interna de Compose.
- El puerto 8080 evita tocar la app de facturación que ya usa el Nginx del sistema en el
  puerto 80. Esa app y el MongoDB nativo (7.0.32) no se modificaron.
- UFW permite 8080 solo desde `192.168.0.0/24`.
- `mongo:7.0` está fijado a propósito: MongoDB 8.0 se niega a arrancar en kernels 6.19+
  y 8.2 se reinició con SIGSEGV (código 139) durante las pruebas. 7.0 es la misma versión
  del MongoDB nativo validado.
- Primer despliegue: `build`, `up -d`, `sync-indexes` y `bootstrap-admin`. Para actualizar:
  reemplazar el código, `docker compose ... build api worker web` y `up -d`.
- `down` conserva los volúmenes; **nunca** usar `down -v` en producción.

Comandos útiles en el servidor:

```bash
cd ~/correspondencia
docker compose --env-file .env.production -f infra/compose/docker-compose.prod.yml ps
docker compose --env-file .env.production -f infra/compose/docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f infra/compose/docker-compose.prod.yml up -d
```

Pendiente para producción: Cloudflare Tunnel/HTTPS (cambiar `APP_ORIGIN` y
`COOKIE_SECURE=true`), backups y habilitar WhatsApp.

## Notebook (7,1 GB medidos)
- Ubuntu Server sin entorno gráfico.
- El servidor actual tiene **7,1 GB de RAM**, 4 GB de swap y 98 GB de disco (83 GB
  libres). Los límites de Compose dejan margen: MongoDB 1 GB, Redis 160 MB, API 384 MB,
  worker 320 MB y web 96 MB.
- Empezar con límite conservador para MongoDB (0,25 GB de caché WiredTiger en el
  Compose de producción; ajustar tras medir).
- Redis inicialmente 96 MB en producción; revisar política de memoria antes de crecer.
- Limitar heap Node con `NODE_OPTIONS` (la API usa 256 MB y el worker 192 MB).
- Swap de emergencia puede ayudar a evitar una caída, pero el HDD puede volverse muy lento si el sistema empieza a intercambiar memoria continuamente.
- Medir RAM, CPU, disco y logs en uso real. No asumir que los límites propuestos garantizan el consumo total del proceso.

## Publicación
1. Actualizar Ubuntu; usuario admin no-root y SSH seguro.
2. Configurar firewall para SSH y conexiones salientes; no abrir puertos entrantes de aplicación.
3. Levantar servicios internos (MongoDB, Redis, API y worker) y probar localmente.
4. Crear backup y restaurarlo en un entorno de prueba.
5. Registrar dominio y agregarlo a Cloudflare.
6. Crear Cloudflare Tunnel hacia Nginx local.
7. Verificar HTTPS, cookies seguras, CORS, rate limits y logs.
8. Probar reinicio de servicios y de la notebook.
9. Configurar el webhook de WhatsApp con HTTPS y el token de verificación.
10. Habilitar WhatsApp (`NOTIFICATIONS_ENABLED=true`) después de completar pruebas de privacidad.

## Backups
- Ejecutar `mongodump` con autenticación, comprimir y cifrar.
- Retención inicial sugerida: 7 diarios y 4 semanales.
- Copia local más copia cifrada fuera de la notebook.
- No sincronizar archivos vivos de datos de MongoDB con servicios de nube.
- Probar restauración periódicamente; un backup no probado no es suficiente.
- No incluir secretos dentro del repositorio ni en logs de backup.

## Limitación
La notebook y su conexión son un único punto de falla. Si se apaga o pierde Internet, la aplicación deja de estar disponible. Cloudflare Tunnel evita abrir puertos, pero no hace que el servidor sea redundante.
