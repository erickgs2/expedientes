# Dev deployment runbook — Raspberry Pi + DuckDNS

The whole stack on a Raspberry Pi on a home network, reachable through a DuckDNS hostname over
HTTPS. Deploys run on every push to `dev`.

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
natively on arm64 — cross-building on GitHub's amd64 runners means QEMU, roughly ten times slower
for npm builds.

Written against **Raspberry Pi OS Lite (64-bit), Debian Trixie**. The 64-bit build matters:
`postgres:16` has no 32-bit image.

---

## 0. Check the board first

The Angular build is the memory peak of every deploy, and it decides whether this design works at
all on your hardware.

| Board | Build on the Pi? |
|---|---|
| Pi 5, Pi 4 (8 GB) | Comfortable |
| Pi 4 / 400 (4 GB) | Works with swap; ~20 min per deploy |
| Pi 4 (2 GB) | Marginal — expect OOM kills |
| **Pi 3 (1 GB)** | **No.** The build will not complete. |

On a Pi 3 this workflow cannot work as written. Build the arm64 images in GitHub Actions and pull
them instead, the way [the QA stack](qa-runbook.md) does.

Use an **SSD over USB3 rather than an SD card** if you can. Builds write heavily; SD cards are slow
and wear out. On an SD card, assume it will fail eventually and keep backups off the Pi.

---

## 1. Flash the card

In Raspberry Pi Imager, open **Edit settings** (the gear) *before* writing and set:

- hostname — e.g. `expedientes`
- **enable SSH**, with a password or your public key
- username and password
- WiFi credentials, if not wired
- locale and timezone

Lite has no desktop, so this is the only way in on first boot.

## 2. First boot

```bash
ssh <user>@expedientes.local
sudo apt update && sudo apt full-upgrade -y && sudo reboot
```

Give the Pi a **DHCP reservation** on the router now, so the port forwards in step 6 don't drift
when the lease changes.

## 3. Swap — skip only on 8 GB

An OOM kill partway through the Angular build is the most likely first failure without this.

Check what the image already gave you:

```bash
swapon --show
free -h
zramctl 2>/dev/null
```

If `swapon --show` prints nothing, add a 2 GB swapfile:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h        # expect ~2 GB of swap
```

This is deliberately the plain-Linux route rather than `dphys-swapfile`, which recent Pi OS Lite
images do not always ship — `sudo apt install -y dphys-swapfile` if you prefer its config file, but
the swapfile above needs no package and survives image changes.

If `zramctl` showed a device, that is compressed swap held **in RAM**. It eases general memory
pressure but does not help a build that needs more memory than the board has, since it competes for
the same 4 GB. Add the disk swapfile as well.

On an SD card, 2 GB of active swap on every build is slow and wears the card — one more reason to
boot from an SSD over USB3.

## 4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
docker run --rm hello-world
```

If `hello-world` printed its message, Docker is installed — **skip the rest of this step.**

Only if the convenience script *failed* (Trixie is recent enough that it may not recognise the
release), fall back to Debian's own packages:

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
docker compose version
```

Do **not** run this on top of a working Docker CE install. `docker.io` is Debian's separate
packaging of the same daemon and the two conflict — the usual result is a broken Docker rather than
two working ones. Package names also vary by release (`docker-compose-plugin`, `docker-compose-v2`,
or neither); `apt-cache search docker-compose` shows what your release actually has.

## 5. Node 20 or newer

The runner needs it for `npm ci` and `nx test`.

```bash
sudo apt install -y nodejs npm
node --version        # must be v20+
```

Trixie should ship Node 20. **If that prints anything older, use nvm** rather than fighting apt:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 20 && nvm alias default 20
```

Note that a runner installed as a service does not read `~/.bashrc`. With nvm, either symlink the
binaries into `/usr/local/bin` or set `PATH` in the runner's service environment, or the workflow
will not find Node.

## 6. DuckDNS and the router

Create a subdomain at [duckdns.org](https://www.duckdns.org) and copy the token. The `duckdns`
container in the stack keeps it pointed at your changing IP — but the record must resolve **before
the first deploy**, or Caddy cannot obtain a certificate.

Forward ports **80 and 443** on the router to the Pi. Port 80 is not optional: Caddy answers the
ACME challenge there, so closing it breaks renewal roughly every 60 days.

Verify from outside the network:

```bash
dig +short yoursubdomain.duckdns.org      # must equal your public IP
```

**Stop here if** it does not resolve, or your public IP starts `100.64.`–`100.127.` — that range
means you are behind CGNAT and port forwarding cannot work. Use a Cloudflare Tunnel instead and
drop Caddy; the tunnel terminates TLS for you.

## 7. Stack secrets

`/opt/expedientes/.env` is the only place these exist. The workflow reads it on the Pi via
`--env-file`; nothing here is stored in GitHub.

```bash
sudo mkdir -p /opt/expedientes && sudo chown $USER /opt/expedientes
nano /opt/expedientes/.env
```

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

## 8. The self-hosted runner

Repository → Settings → Actions → Runners → **New self-hosted runner**, choose **Linux / ARM64**,
and run the commands it gives you. When it asks for labels, add **`raspberrypi`** — the workflow
targets `[self-hosted, raspberrypi]`.

Install it as a service so it survives reboots:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

**Understand the trust boundary.** A self-hosted runner executes any workflow from the repository
directly on your machine, with no container between it and your home network. That is fine for a
private repo you control. If this repository is ever made public, remove the runner first — a pull
request from a stranger would otherwise run their code on your Pi.

## 9. Deploy

**Nothing is cloned on the Pi.** These commands run on your development machine, in this repo. The
runner checks the code out itself, into `~/actions-runner/_work/expedientes/expedientes`, and
re-checks it out on every deploy — treat that directory as disposable and never edit it.

`/opt/expedientes` holds only `.env`: no code, no compose file. The workflow reads it with
`--env-file` while the compose file comes from the runner's checkout, which is what keeps the
secrets off GitHub.

Confirm the runner shows **Idle** under Settings → Actions → Runners first, or the workflow will
queue with nothing to pick it up.

```bash
git push -u origin main            # if the remote has nothing yet
git switch -c dev && git push -u origin dev
```

Every later push to `dev` runs [deploy-dev.yml](../../.github/workflows/deploy-dev.yml): install,
generate the Prisma client, run the API tests, build both images on the Pi, migrate, restart, and
smoke-check `/api/hello`. Deploys are queued, never cancelled mid-flight.

Expect **10–25 minutes** on a Pi 4, most of it the Angular build. The first run is slowest, with
nothing cached.

## 10. First sign-in

Open `https://APP_DOMAIN` — **not** the Pi's LAN IP, which will never work for login. Sign in as
`SEED_ADMIN_EMAIL`, then fill in **Datos de la clínica** (`/admin/clinic`): the doctor's name and
cédula, the logo, and the signature. Consent signing stays blocked until the name and cédula are
set. Then create the treatment types under `/admin/treatments`.

---

## Troubleshooting

**Caddy cannot get a certificate.** Check in order: does `APP_DOMAIN` resolve to your current public
IP, is port 80 forwarded, is your ISP blocking it, are you behind CGNAT. `docker compose logs caddy`
names the failure.

**Login does nothing.** Use `https://APP_DOMAIN`, not the LAN IP. The session cookie is `secure` in
production, so a browser discards it over plain HTTP — the LAN address loads the page but can never
log in.

**The build is killed partway through.** Out of memory. Add the swap from step 3, stop other
containers, and check the board against step 0.

**The workflow queues forever.** The runner is offline — `sudo ./svc.sh status` on the Pi.

**`node: command not found` in the workflow.** The runner service does not read your shell profile;
see the nvm note in step 5.

**Disk full.** `docker image prune -f` runs after each deploy, but volumes and build cache are not
touched. `docker system df` shows what is using space; `docker builder prune` usually reclaims most.

## Backups

The `db_data` and `storage_data` volumes hold everything irreplaceable, on a home machine with one
disk. `/opt/expedientes` holds only `.env` — the compose file lives in the runner's checkout, which
moves — so address the containers directly rather than through `docker compose`:

```bash
mkdir -p ~/backups && set -a && . /opt/expedientes/.env && set +a

DB=$(docker ps -q --filter "label=com.docker.compose.service=db")

docker exec -t "$DB" pg_dump -U "$POSTGRES_USER" expedientes \
  | gzip > ~/backups/db-$(date +%F).sql.gz

docker run --rm -v expedientes_storage_data:/data -v ~/backups:/out alpine \
  tar czf /out/storage-$(date +%F).tar.gz -C /data .
```

Confirm the volume's real name with `docker volume ls` — Compose prefixes it with the project name,
which is the directory the stack was started from.

Copy these off the Pi. A backup on the same disk as the thing it protects is not a backup.
