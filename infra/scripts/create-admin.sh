#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.production ]]; then
  echo "Falta .env.production en $ROOT_DIR" >&2
  exit 1
fi

read -r -p "Usuario admin: " ADMIN_USERNAME
read -r -s -p "Contraseña (mínimo 12 caracteres): " ADMIN_PASSWORD
echo

if [[ -z "${ADMIN_USERNAME}" || -z "${ADMIN_PASSWORD}" ]]; then
  echo "Usuario y contraseña son obligatorios." >&2
  exit 1
fi

docker compose --env-file .env.production -f infra/compose/docker-compose.prod.yml exec -T \
  -e ADMIN_USERNAME="$ADMIN_USERNAME" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  api node apps/api/dist/scripts/bootstrap-admin.js

unset ADMIN_PASSWORD

LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"

if [[ -z "${LAN_IP:-}" ]]; then
  LAN_IP="$(hostname -I | awk '{print $1}')"
fi

echo
echo "Listo. Entrá a http://$LAN_IP:8080/admin con el usuario creado."
echo "Después desactivá el usuario admin inicial desde el panel."
