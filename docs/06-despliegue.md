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

## Notebook de 4 GB RAM
- Ubuntu Server sin entorno gráfico.
- Empezar con límite conservador para MongoDB (aprox. 512 MB de caché WiredTiger; ajustar tras medir).
- Redis inicialmente 64–96 MB; revisar política de memoria antes de producción.
- Limitar heap Node con `NODE_OPTIONS` si las mediciones lo requieren.
- Swap de emergencia puede ayudar a evitar una caída, pero el HDD puede volverse muy lento si el sistema empieza a intercambiar memoria continuamente.
- Medir RAM, CPU, disco y logs en uso real. No asumir que los límites propuestos garantizan el consumo total del proceso.

## Publicación
1. Actualizar Ubuntu; usuario admin no-root y SSH seguro.
2. Configurar firewall para SSH y conexiones salientes; no abrir puertos entrantes de aplicación.
3. Levantar servicios internos y probar localmente.
4. Crear backup y restaurarlo en un entorno de prueba.
5. Registrar dominio y agregarlo a Cloudflare.
6. Crear Cloudflare Tunnel hacia Nginx local.
7. Verificar HTTPS, cookies seguras, CORS, rate limits y logs.
8. Probar reinicio de servicios y de la notebook.
9. Habilitar WhatsApp después de completar pruebas de privacidad.

## Backups
- Ejecutar `mongodump` con autenticación, comprimir y cifrar.
- Retención inicial sugerida: 7 diarios y 4 semanales.
- Copia local más copia cifrada fuera de la notebook.
- No sincronizar archivos vivos de datos de MongoDB con servicios de nube.
- Probar restauración periódicamente; un backup no probado no es suficiente.
- No incluir secretos dentro del repositorio ni en logs de backup.

## Limitación
La notebook y su conexión son un único punto de falla. Si se apaga o pierde Internet, la aplicación deja de estar disponible. Cloudflare Tunnel evita abrir puertos, pero no hace que el servidor sea redundante.
