# Dev deployment runbook — Raspberry Pi + DuckDNS

The whole stack on a Pi on the home network, reachable through a DuckDNS hostname over HTTPS.
Deploys run on every push to `dev`.

```
     Internet ──▶ router :80/:443 forwarded ──▶ Raspberry Pi
                                                 ├── caddy   (Let's Encrypt for APP_DOMAIN)
                                                 ├── web     (nginx + Angular, proxies /api/)
                                                 ├── api     (Next.js, storage on a volume)
                                                 ├── db      (postgres:16 + volume)
                                                 └── duckdns (keeps the hostname on the current IP)
```

**Deploys use a self-hosted runner on the Pi**, not SSH from GitHub. The runner polls outbound, so
no inbound SSH port is exposed and no key to your home network is stored in GitHub. It also builds
natively on arm64 — cross-building on GitHub's amd64 runners means QEMU, which is about ten times
slower for npm builds.

## 1. Hardware

A Pi 4 or 5 with **4 GB minimum**, 8 GB comfortable, on an **SSD over USB3 rather than an SD card**.
Building Angular and Next writes a lot; SD cards are slow and wear out. If you must use an SD card,
expect it to fail eventually and keep backups off the Pi.

Add swap if you have 4 GB — the Angular build is the memory peak:

```bash
sudo dphys-swapfile swapoff
sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon
```

## 2. Software

64-bit Raspberry Pi OS (Bookworm or newer) — the arm64 build matters, `postgres:16` has no 32-bit
image.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Node 20, for the runner's npm ci / nx test steps
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo mkdir -p /opt/expedientes && sudo chown $USER /opt/expedientes
```

## 3. DuckDNS

Create a subdomain at [duckdns.org](https://www.duckdns.org) and copy the token. The `duckdns`
container in the stack keeps it pointed at your current IP, so nothing else is needed — but the
record must resolve **before the first deploy**, or Caddy cannot get a certificate.

**Forward ports 80 and 443** on the router to the Pi's LAN address, and give the Pi a static DHCP
lease so the forward doesn't drift. Port 80 is not optional: Caddy answers the ACME challenge
there, so closing it breaks renewal roughly every 60 days.

Some ISPs block inbound 80/443 on residential lines, and CGNAT breaks port forwarding entirely. If
either applies, use a Cloudflare Tunnel instead of port forwarding and skip Caddy — the tunnel
terminates TLS for you.

## 4. Stack environment

Create `/opt/expedientes/.env`. **This file is the only place these secrets exist** — the workflow
reads it on the Pi via `--env-file` and nothing is stored in GitHub.

```bash
APP_DOMAIN=miclinica.duckdns.org
ACME_EMAIL=you@example.com
DUCKDNS_SUBDOMAIN=miclinica          # the label only, not the full hostname
DUCKDNS_TOKEN=<from duckdns.org>
JWT_SECRET=<openssl rand -base64 48>
POSTGRES_USER=expedientes
POSTGRES_PASSWORD=<openssl rand -base64 32>
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=<a real password, not the default>
```

```bash
chmod 600 /opt/expedientes/.env
```

Uploads stay on a local Docker volume here. To exercise the S3 path instead, add
`STORAGE_S3_BUCKET` and `AWS_REGION` — the app switches driver with no schema change.

## 5. The self-hosted runner

Repository → Settings → Actions → Runners → **New self-hosted runner**, choose **Linux / ARM64**,
and follow the commands it gives you. When it asks for labels, add **`raspberrypi`** — the workflow
targets `[self-hosted, raspberrypi]`.

Then install it as a service so it survives reboots:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

**Understand the trust boundary before doing this.** A self-hosted runner executes any workflow
from the repository directly on your home network, without a container between it and the machine.
That is fine for a private repo you control. If this repository is ever made public, remove the
runner first — a pull request from a stranger would otherwise run their code on your Pi.

## 6. Deploying

```bash
git switch -c dev      # first time only
git push -u origin dev
```

Every later push to `dev` runs [deploy-dev.yml](../../.github/workflows/deploy-dev.yml): install,
generate the Prisma client, run the API tests, build both images on the Pi, migrate, restart, and
smoke-check `/api/hello`.

Expect **10–25 minutes** on a Pi 4, most of it the Angular build. Deploys are queued, never
cancelled mid-flight.

## 7. After the first deploy

Open `https://APP_DOMAIN`, sign in as `SEED_ADMIN_EMAIL`, and fill in **Datos de la clínica**
(`/admin/clinic`). Consent signing stays blocked until the doctor's name and cédula are set.

## Troubleshooting

**Caddy cannot get a certificate.** Check in order: does `APP_DOMAIN` resolve to your current public
IP (`dig +short APP_DOMAIN`), is port 80 forwarded, is your ISP blocking it, and is your connection
behind CGNAT (a public IP starting `100.64.`–`100.127.` means yes). `docker compose logs caddy`
names the failure.

**Login does nothing.** Reach the app via `https://APP_DOMAIN`, not the Pi's LAN IP. The session
cookie is `secure` in production, so a browser discards it over plain HTTP — the LAN address will
never work for login even though the page loads.

**The build is killed partway through.** Out of memory. Add the swap from step 1, and stop other
containers while deploying.

**Disk full.** `docker image prune -f` runs after each deploy, but volumes and build cache are not
touched. Check with `docker system df`; `docker builder prune` reclaims the most.

**The workflow queues forever.** The runner is offline — `sudo ./svc.sh status` on the Pi.

## Backups

The `db_data` and `storage_data` volumes hold everything irreplaceable, and this is a home machine
with a single disk. Even for a dev environment, copy them somewhere else:

Note that `/opt/expedientes` holds only `.env` — the compose file lives in the runner's checkout,
which moves. So address the containers directly rather than through `docker compose`:

```bash
mkdir -p ~/backups && set -a && . /opt/expedientes/.env && set +a

# The db container, found by its compose service label rather than a guessed name.
DB=$(docker ps -q --filter "label=com.docker.compose.service=db")

docker exec -t "$DB" pg_dump -U "$POSTGRES_USER" expedientes \
  | gzip > ~/backups/db-$(date +%F).sql.gz

docker run --rm -v expedientes_storage_data:/data -v ~/backups:/out alpine \
  tar czf /out/storage-$(date +%F).tar.gz -C /data .
```

Confirm the volume's real name with `docker volume ls` — Compose prefixes it with the project name,
which is the directory the stack was started from.

Copy these off the Pi. A backup sitting on the same disk as the thing it protects is not a backup.
