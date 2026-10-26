#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.production"
EXAMPLE_FILE="$ROOT_DIR/.env.production.example"
ADMIN_PASSWORD_FILE="$ROOT_DIR/.admin-password"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "Falta $EXAMPLE_FILE" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" && "${1:-}" != "--force" ]]; then
  echo "Ya existe $ENV_FILE. Usá --force para regenerarlo." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Falta openssl." >&2
  exit 1
fi

LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')"

if [[ -z "${LAN_IP:-}" ]]; then
  LAN_IP="$(hostname -I | awk '{print $1}')"
fi

ORIGIN="${APP_ORIGIN:-http://$LAN_IP:8080}"

ROOT_PASSWORD="$(openssl rand -hex 32)"
APP_PASSWORD="$(openssl rand -hex 32)"
SESSION_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -hex 16)"

umask 077
sed \
  -e "s|^APP_ORIGIN=.*|APP_ORIGIN=$ORIGIN|" \
  -e "s|^MONGO_ROOT_PASSWORD=.*|MONGO_ROOT_PASSWORD=$ROOT_PASSWORD|" \
  -e "s|^MONGO_APP_PASSWORD=.*|MONGO_APP_PASSWORD=$APP_PASSWORD|" \
  -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET|" \
  "$EXAMPLE_FILE" >"$ENV_FILE"
chmod 600 "$ENV_FILE"

printf '%s\n' "$ADMIN_PASSWORD" >"$ADMIN_PASSWORD_FILE"
chmod 600 "$ADMIN_PASSWORD_FILE"

echo "Creado $ENV_FILE (600)"
echo "Origen configurado: $ORIGIN"
echo "Contraseña inicial del admin: $ADMIN_PASSWORD_FILE (600)"
echo "Usuario inicial: admin"
echo "Cambiá la contraseña después del primer acceso."
