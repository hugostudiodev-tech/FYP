#!/usr/bin/env bash
# Cài (hoặc cập nhật) Demo Review trên VPS Ubuntu 24.04. Chạy bằng root:
#   curl -fsSL https://raw.githubusercontent.com/hugostudiodev-tech/FYP/main/deploy/setup.sh | bash
# Chạy lại lần nữa = cập nhật lên code mới nhất (dữ liệu & .env được giữ nguyên).
set -euo pipefail
DOMAIN="${DOMAIN:-fyp.hugowishpax.studio}"
REPO="${REPO:-https://github.com/hugostudiodev-tech/FYP.git}"
DIR=/opt/fyp
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng tài khoản root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

step "1/7 Cập nhật hệ thống"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq curl git ufw gnupg debian-keyring debian-archive-keyring apt-transport-https

step "2/7 Tường lửa: chỉ mở SSH, HTTP, HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# VPS 1 GB RAM: thêm 2 GB swap để npm/Node không bị thiếu bộ nhớ.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "3/7 Node.js (cần >= 23.6)"
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>23||(a===23&&b>=6)?0:1)'; then
  curl -fsSL https://deb.nodesource.com/setup_current.x | bash -
  apt-get install -yq nodejs
fi
node -v

step "4/7 Caddy (HTTPS tự động)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -yq caddy
fi

step "5/7 Tải code"
id fyp >/dev/null 2>&1 || adduser --system --group --home "$DIR" --no-create-home fyp
if [ -d "$DIR/.git" ]; then
  sudo -u fyp git -C "$DIR" pull --ff-only
elif [ -d "$DIR" ] && [ -n "$(ls -A "$DIR")" ]; then
  echo "$DIR đã có dữ liệu nhưng không phải bản git — dừng lại để không xoá nhầm. Kiểm tra rồi chạy lại."; exit 1
else
  git clone "$REPO" "$DIR"
fi
chown -R fyp:fyp "$DIR"
cd "$DIR"
sudo -u fyp npm ci --omit=dev --no-audit --no-fund
[ -f .env ] || { sudo -u fyp cp .env.example .env; chmod 600 .env; }

step "6/7 Chạy nền (systemd)"
cp deploy/fyp.service /etc/systemd/system/fyp.service
systemctl daemon-reload
systemctl enable fyp >/dev/null 2>&1
systemctl restart fyp

step "7/7 Tên miền + HTTPS ($DOMAIN)"
sed "s/fyp\.hugowishpax\.studio/$DOMAIN/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

sleep 2
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  printf '\n\033[1;32mXONG.\033[0m App đang chạy. Mở: https://%s\n' "$DOMAIN"
  echo "Lần đầu Caddy cần 10–30 giây để lấy chứng chỉ HTTPS."
  echo "Sửa cấu hình: nano $DIR/.env  rồi  systemctl restart fyp"
  echo "Xem log:      journalctl -u fyp -f"
else
  echo "App chưa chạy được. Xem lỗi: journalctl -u fyp -n 50 --no-pager"
  exit 1
fi
