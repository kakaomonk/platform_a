#!/bin/bash
set -e

# Run on a fresh Oracle Cloud Ubuntu ARM instance.
# Usage: bash deploy.sh

# ── Docker ────────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Re-run this script to continue (group reload needed)."
    exec sg docker "$0"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save 2>/dev/null || true

# ── Repo ──────────────────────────────────────────────────────────────────────
REPO_DIR="$HOME/platform_a"
if [ ! -d "$REPO_DIR" ]; then
    git clone https://github.com/YOUR_USERNAME/platform_a.git "$REPO_DIR"
fi
cd "$REPO_DIR"
git pull

# ── Env ───────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "=========================================="
    echo " Edit $REPO_DIR/.env then re-run deploy.sh"
    echo "=========================================="
    exit 0
fi

# ── Up ────────────────────────────────────────────────────────────────────────
docker compose pull db caddy 2>/dev/null || true
docker compose up -d --build

echo ""
echo "Done. Check logs: docker compose logs -f"
