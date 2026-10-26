#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ALICE — Instalador del ecosistema en la VM Oracle Always Free (ARM)
#
#   curl -fsSL https://raw.githubusercontent.com/eddyflores100-lang/alicemail/main/deploy/install.sh | bash
#
# Hace: instala Docker (si falta) → clona el repo → prepara .env y
# datos → levanta el motor (docker compose) → verifica salud.
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_URL="${1:-https://github.com/eddyflores100-lang/alicemail.git}"
DIR="${2:-$HOME/alicemail}"

green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$1"; }

echo "════════════════════════════════════════════════════"
echo "  ALICE · ecosistema autónomo de cold email"
echo "  VM: $(uname -m) · destino: $DIR"
echo "════════════════════════════════════════════════════"

# ── 1) Docker ────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  yellow "→ Instalando Docker CE (dnf)…"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y dnf-utils git make >/dev/null
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo >/dev/null
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sudo sh
  else
    echo "✗ No encontré dnf ni apt-get: instala Docker manualmente." >&2
    exit 1
  fi
  sudo systemctl enable --now docker >/dev/null 2>&1 || true
  sudo usermod -aG docker "$USER" || true
  green "✓ Docker instalado"
else
  green "✓ Docker ya está instalado: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  yellow "→ Falta el plugin compose; instalando…"
  sudo dnf install -y docker-compose-plugin >/dev/null 2>&1 || true
fi

# ── 2) Código ────────────────────────────────────────────────
if [ -d "$DIR/.git" ]; then
  green "→ Repo existente: actualizando…"
  git -C "$DIR" fetch --all >/dev/null 2>&1 || true
  git -C "$DIR" reset --hard origin/main >/dev/null 2>&1 || git -C "$DIR" pull --ff-only || true
else
  yellow "→ Clonando $REPO_URL…"
  git clone --depth 1 "$REPO_URL" "$DIR" >/dev/null 2>&1
fi
cd "$DIR"

# ── 3) .env ──────────────────────────────────────────────────
if [ ! -f .env ]; then
  yellow "→ Generando .env inicial…"
  cat > .env <<ENV
# ═══ ALICE — variables del ecosistema ═══
DATABASE_URL=file:/app/db/custom.db

# Puente GitHub ↔ VM (obligatorio para el dashboard y la consola web)
# Crea un token fine-grained con permiso Contents: Read/Write SOLO sobre alice-data
GH_SYNC_TOKEN=
GH_DATA_REPO=eddyflores100-lang/alice-data
GH_SYNC_BRANCH=main
GH_SYNC_MASK_EMAILS=true
ENV
  green "✓ .env creado — edítalo con tu GH_SYNC_TOKEN"
else
  green "✓ .env ya existe (no se toca)"
fi

# ── 4) Datos persistentes ────────────────────────────────────
mkdir -p alicemail-db
green "✓ Directorio de datos: $DIR/alicemail-db"

# ── 5) Levantar ──────────────────────────────────────────────
yellow "→ Construyendo y arrancando (puede tardar 2-4 min la primera vez)…"
if ! docker info >/dev/null 2>&1; then
  sudo docker compose up -d --build
  COMPOSE="sudo docker compose"
else
  docker compose up -d --build
  COMPOSE="docker compose"
fi

# ── 6) Salud ─────────────────────────────────────────────────
yellow "→ Esperando al motor…"
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3000/api/stats >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

if curl -fsS http://127.0.0.1:3000/api/stats >/dev/null 2>&1; then
  green ""
  green "════════════════════════════════════════════════════"
  green "  ✓ ALICE está VIVO en la VM"
  green "════════════════════════════════════════════════════"
  echo "
  Panel local:   ssh -L 3000:localhost:3000 alicelabs-free  → http://localhost:3000
  Dashboard web: https://eddyflores100-lang.github.io/alicemail/
  Siguiente paso: edita .env (GH_SYNC_TOKEN) y reinicia:
    $COMPOSE up -d
  Logs:            $COMPOSE logs -f alicemail
  Actualizar:      cd $DIR && git pull && $COMPOSE up -d --build
"
else
  yellow "⚠ El contenedor sigue arrancando. Revisa los logs:"
  echo "   $COMPOSE logs -f alicemail"
fi
