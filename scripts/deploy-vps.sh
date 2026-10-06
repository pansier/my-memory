#!/usr/bin/env bash
# Run on the dedicated VPS, after its DNS record has been set.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
if [[ "${1:-}" == "--help" ]]; then
  printf 'Usage: sudo bash scripts/deploy-vps.sh DOMAIN EXPECTED_IPV4 COMMIT_SHA\n'
  exit 0
fi
[[ $# == 3 ]] || fail 'Usage: sudo bash scripts/deploy-vps.sh DOMAIN EXPECTED_IPV4 COMMIT_SHA'
[[ $EUID == 0 ]] || fail 'Run this installer with sudo on the dedicated VPS.'
domain=$1
expected_ip=$2
revision=$3
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ && "$domain" != *..* ]] || fail 'Invalid domain.'
[[ "$expected_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail 'Invalid IPv4 address.'
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || fail 'Provide a complete, reviewed Git commit SHA.'
ip -4 -o address show | awk '{split($4, address, "/"); print address[1]}' | grep -Fxq -- "$expected_ip" \
  || fail 'The expected IPv4 address is not on this server. No installation was performed.'
# shellcheck source=/dev/null
source /etc/os-release
[[ "$ID" == ubuntu ]] || fail 'This installer supports Ubuntu.'

install_dir=/opt/my-memory
repository=https://github.com/pansier/my-memory.git
if [[ -e "$install_dir" && ! -d "$install_dir/.git" ]]; then
  fail '/opt/my-memory already exists and is not the MyMemory repository.'
fi
if [[ -d "$install_dir/.git" ]]; then
  [[ "$(git -C "$install_dir" remote get-url origin)" == "$repository" ]] || fail 'Unexpected repository.'
  [[ -z "$(git -C "$install_dir" status --porcelain --untracked-files=no)" ]] || fail 'The repository has local changes.'
  if [[ -f "$install_dir/.env" ]]; then
    [[ "$(git -C "$install_dir" rev-parse HEAD)" == "$revision" ]] || fail 'For updates, use the backup/update procedure in docs/VPS.md.'
  fi
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-v2 ufw cron tzdata
systemctl enable --now docker

# Preserve SSH access when enabling the host firewall.
ssh_ports=$(/usr/sbin/sshd -T | awk '$1 == "port" {print $2}')
[[ -n "$ssh_ports" ]] || fail 'Cannot determine the SSH port; the firewall was not enabled.'
while read -r ssh_port; do
  ufw allow "$ssh_port/tcp"
done <<< "$ssh_ports"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

if [[ ! -d "$install_dir/.git" ]]; then
  git clone --no-checkout "$repository" "$install_dir"
fi
git -C "$install_dir" fetch origin "$revision"
git -C "$install_dir" checkout --detach "$revision"
cd "$install_dir"

if [[ ! -f .env ]]; then
  mkdir -p data
  # Secrets are written directly to private files, never to the terminal or Git.
  docker run --rm -i -e MEMORY_DOMAIN="$domain" \
    -v "$install_dir:/setup" -w /setup node:24-bookworm-slim \
    node --input-type=module <<'NODE'
import { createECDH, randomBytes, scryptSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const domain = process.env.MEMORY_DOMAIN;
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16).toString('hex');
const vapid = createECDH('prime256v1');
vapid.generateKeys();
const privateKey = vapid.getPrivateKey();
const settings = {
  NODE_ENV: 'production',
  MEMORY_DOMAIN: domain,
  APP_ORIGIN: `https://${domain}`,
  APP_USERNAME: 'alex@pansier.nl',
  APP_PASSWORD_HASH: `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
  MCP_TOKEN: randomBytes(32).toString('hex'),
  PORT: '3001',
  DATABASE_PATH: '/data/memory.sqlite',
  VAPID_SUBJECT: `https://${domain}`,
  VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]).toString('base64url'),
};
writeFileSync('data/LOGIN.production.txt', `MyMemory: https://${domain}\nGebruikersnaam: ${settings.APP_USERNAME}\nWachtwoord: ${password}\n`, {mode: 0o600, flag: 'wx'});
writeFileSync('.env', Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', {mode: 0o600, flag: 'wx'});
NODE
fi
grep -Fxq "MEMORY_DOMAIN=$domain" .env || fail 'Existing .env uses a different domain.'
grep -Fxq "APP_ORIGIN=https://$domain" .env || fail 'Existing .env uses a different origin.'
chmod 600 .env
docker compose config --quiet
docker compose build
docker compose up -d --wait --wait-timeout 180

# One daily SQLite backup, including images. This stays on the VPS;
# copy backups off-server separately as described in docs/VPS.md.
timedatectl set-timezone Europe/Amsterdam
cat > /etc/cron.d/my-memory-backup <<'CRON'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * * root cd /opt/my-memory && /usr/bin/docker compose exec -T memory npm run backup >> /var/log/my-memory-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/my-memory-backup
systemctl enable --now cron
docker compose exec -T memory npm run backup

if curl --fail --silent --show-error --max-time 15 "https://$domain/api/health" > /dev/null; then
  printf 'MyMemory is bereikbaar op https://%s\n' "$domain"
else
  printf 'De containers draaien. Controleer DNS en HTTPS met: docker compose logs --tail=50 caddy\n' >&2
fi
printf 'Bekijk je login in je eigen terminal: sudo cat /opt/my-memory/data/LOGIN.production.txt\n'
