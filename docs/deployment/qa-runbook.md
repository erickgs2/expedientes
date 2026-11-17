# QA deployment runbook

One `t3.small` EC2 instance running the whole stack in Docker: Postgres, the API, nginx serving the
Angular bundle, and Caddy terminating TLS. Patient images go to S3. Deploys happen automatically on
every push to the `qa` branch.

```
        Internet
           │ 443
       ┌───▼────┐
       │ caddy  │  Let's Encrypt, QA_DOMAIN
       └───┬────┘
       ┌───▼────┐        ┌──────┐
       │  web   │──/api/─▶ api  │──▶ S3 (patient images)
       │ nginx  │        └───┬──┘
       └────────┘            │
                        ┌────▼────┐
                        │   db    │  postgres:16 + named volume
                        └─────────┘
```

Why images are pulled rather than built on the instance: a `t3.small` has 2 GiB of RAM and the
Angular and Next builds will exhaust it. CI builds and pushes to GHCR; the instance only pulls.

## 1. S3 bucket

Create a bucket in the same region as the instance. `mx-central-1` keeps patient data in Mexico,
which simplifies the LFPDPPP position — confirm the region is available to your account.

- **Block all public access: ON.** This bucket holds patient photographs and consent signatures.
  The app never issues presigned URLs; every read is proxied through `/api/files/[...path]`, which
  is what applies the permission check and writes the audit entry.
- Default encryption: SSE-S3 (or SSE-KMS).
- Versioning: **on**. It is what turns an accidental delete or a ransomware event into a recovery
  rather than a loss.

## 2. IAM

Create an instance role — **no access keys anywhere.** The SDK picks up credentials from the
instance metadata automatically, which is why neither the compose file nor `.env` mentions AWS
credentials.

Attach one inline policy, scoped to the bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
    }
  ]
}
```

The app never lists or deletes, so those permissions are deliberately absent.

## 3. The instance

`t3.small`, Amazon Linux 2023 or Ubuntu 24.04, 20 GB gp3 root volume, with the role from step 2.

**Security group inbound:**

| Port | Source | Why |
|---|---|---|
| 443 | 0.0.0.0/0 | the app |
| 80 | 0.0.0.0/0 | Let's Encrypt HTTP challenge — closing it breaks renewal in ~60 days |
| 22 | your IP only | deploys and maintenance |

Postgres port 5432 is **not** exposed; it is reachable only on the compose network.

Install Docker and log in to GHCR so the instance can pull private images. The token needs only
`read:packages`:

```bash
sudo dnf install -y docker && sudo systemctl enable --now docker   # Amazon Linux
sudo usermod -aG docker $USER && newgrp docker
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
sudo mkdir -p /opt/expedientes && sudo chown $USER /opt/expedientes
```

## 4. Instance environment

Create `/opt/expedientes/.env`. **This file is the only place these secrets exist** — CI never sends
them; it sets `IMAGE_TAG` and nothing else.

```bash
IMAGE_REPO=ghcr.io/erickgs2/expedientes
# rewritten by every deploy
IMAGE_TAG=placeholder
QA_DOMAIN=qa.example.com
ACME_EMAIL=you@example.com
JWT_SECRET=<openssl rand -hex 32>
POSTGRES_USER=expedientes
POSTGRES_PASSWORD=<openssl rand -hex 32>
STORAGE_S3_BUCKET=your-bucket
AWS_REGION=mx-central-1
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=<a real password, not the default>
```

```bash
chmod 600 /opt/expedientes/.env
```

Generate secrets as hex and keep comments on their own line: a `$` in a value is interpolated by
compose and silently blanked, and a trailing `# comment` can end up inside an unquoted value.

Point `QA_DOMAIN`'s DNS A record at the instance's public IP **before the first deploy** — Caddy
cannot obtain a certificate until it resolves, and repeated failures hit Let's Encrypt's rate limit.

## 5. GitHub configuration

Repository → Settings → Environments → **qa**, with these secrets:

| Secret | Value |
|---|---|
| `QA_SSH_HOST` | instance public IP or hostname |
| `QA_SSH_USER` | `ec2-user` (Amazon Linux) or `ubuntu` |
| `QA_SSH_KEY` | private half of the instance's key pair |

Add required reviewers on the environment if you want a human approval gate before QA moves.

## 6. Deploying

```bash
git switch -c qa       # first time only
git push -u origin qa
```

Every later push to `qa` runs [deploy-qa.yml](../../.github/workflows/deploy-qa.yml): test and build,
push three images tagged with the commit SHA, copy the compose file and Caddyfile to the instance,
run migrations, restart, and smoke-check `/api/hello`.

Deploys are serialised and never cancelled mid-flight — cancelling between the migration and the
restart would leave a migrated database serving the previous image.

## 7. After the first deploy

Sign in as `SEED_ADMIN_EMAIL` and open **Datos de la clínica** (`/admin/clinic`). Until the doctor's
name and cédula are set, consent signing is deliberately blocked. Upload the logo and signature, and
create the treatment types.

## 8. Backups — do this, not later

The Postgres volume is the only irreplaceable state on the instance. S3 holds the images and is
already durable and versioned; the database is not.

```bash
# /etc/cron.daily/expedientes-backup
set -euo pipefail
cd /opt/expedientes
. ./.env
docker compose -f docker-compose.qa.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" expedientes | gzip \
  | aws s3 cp - "s3://$STORAGE_S3_BUCKET/backups/expedientes-$(date +%F).sql.gz"
```

This needs `s3:PutObject` on `backups/*`, which the step 2 policy already grants.

**Restore-test it.** An untested backup is not a backup, and for a clinical record system that is
the difference between an incident and a catastrophe.

## Troubleshooting

**Login appears to do nothing.** Almost always TLS. The session cookie is `secure` in production, so
a browser silently discards it over plain HTTP. Reach the app via `https://QA_DOMAIN`, not the raw
IP. Check `docker compose logs caddy` for certificate failures.

**Images upload but never display.** The instance role is missing `s3:GetObject`, or
`STORAGE_S3_BUCKET` / `AWS_REGION` disagree with the bucket. `docker compose logs api` shows the SDK
error.

**Deploy fails at the migrate step.** The schema change failed; the old container is still serving.
Read the job output, fix the migration, push again — the stack is not left half-updated.

**Disk full.** `docker image prune -f` runs on each deploy, but old volumes are not touched. Check
with `docker system df`.
