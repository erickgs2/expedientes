# Migración de dev: Raspberry Pi → MacBook (Ubuntu Server)

Mueve el stack completo de dev (caddy, web, api, db, duckdns) de la Pi a la MacBook, con la base de
datos y los archivos subidos, y redirige el runner de GitHub para que los deploys de `dev` caigan
en la Mac.

```
ANTES                                   DESPUÉS
Internet ─▶ router A ─▶ Pi              Internet ─▶ router B ─▶ MacBook
                        ├ caddy                                 ├ caddy
                        ├ web / api                             ├ web / api
                        ├ db                                    ├ db   (restaurada desde la Pi)
                        ├ duckdns                               ├ duckdns (mismo subdominio)
                        └ runner [raspberrypi]                  └ runner [dev-server]
```

El dominio (`APP_DOMAIN`) **no cambia**: el contenedor duckdns de la Mac apunta el mismo subdominio a
la IP pública de la casa de la Mac. Por eso **nunca deben correr los dos duckdns a la vez**: se
pelearían el registro DNS. El orden de este documento lo evita.

Lo que hay que mover:

| Qué | Dónde vive en la Pi | Cómo se mueve |
|---|---|---|
| Secretos | `/opt/expedientes/.env` | copia tal cual (mismas credenciales de Postgres) |
| Base de datos | volumen `expedientes_db_data` | `pg_dump -Fc` → `pg_restore` |
| Archivos subidos (fotos, firmas, logo) | volumen `expedientes_storage_data` | `tar` del volumen |
| Certificados TLS | volumen `expedientes_caddy_data` | no se mueve: Caddy emite uno nuevo |
| Código | checkout del runner | no se mueve: el runner de la Mac hace su propio checkout |

Ventana de inactividad esperada: lo que tarde el primer deploy en la Mac más la restauración
(~15–30 min).

---

## Fase 1 — Preparar la MacBook (sin tocar la Pi)

Todo en la Mac, por SSH.

### 1.1 Base

```bash
uname -m                      # esperado: x86_64
free -h                       # RAM disponible para el build de Angular
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates openssl
```

Refuerzo de "nunca suspender", además de la configuración de la tapa que ya tienes:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

Si `free -h` muestra menos de 8 GB y no hay swap, agrega 4 GB de swap (igual que en el runbook de la
Pi, paso 3).

### 1.2 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# cierra sesión SSH y vuelve a entrar para que el grupo aplique
docker run --rm hello-world
docker compose version
```

**No instales Postgres ni nada más en el host**: Postgres corre como contenedor (`postgres:16`), igual
que en la Pi.

### 1.3 Node 22 (lo necesita el runner para `npm ci` y `nx test`)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version     # v22.x y npm 10+
```

No uses el `nodejs` de apt de Ubuntu ni nvm (ver runbook de la Pi, paso 5: npm 9 rompe el lock file y
el servicio del runner no ve nvm).

### 1.4 Tailscale (en la Mac **y** en la Pi)

Sirve para pasar el dump de una casa a otra sin abrir puertos, y queda como canal de administración.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
tailscale ip -4                     # anota la IP 100.x de cada equipo
```

Corre lo mismo en la Pi. Desde la Pi, verifica: `ping <ip-tailscale-mac>`.
Instálalo también en tu laptop/celular para administrar.

### 1.5 Router de la casa de la Mac

1. **Reserva DHCP** para la Mac (que su IP local no cambie).
2. **Reenvía 80 y 443** a la Mac. Todavía no hay nada escuchando; no pasa nada por dejarlo listo.
3. Revisa CGNAT: entra al router y compara su IP WAN con `curl -4 ifconfig.me` desde la Mac. Si no
   coinciden, o la WAN empieza con `100.64.`–`100.127.`, el reenvío de puertos **no va a funcionar**
   en esa casa. Detente aquí y avísame; la alternativa es Cloudflare Tunnel.

### 1.6 Secretos

Copia el `.env` de la Pi a la Mac (por Tailscale):

```bash
# en la Mac
sudo mkdir -p /opt/expedientes && sudo chown $USER /opt/expedientes
scp <usuario-pi>@<ip-tailscale-pi>:/opt/expedientes/.env /opt/expedientes/.env
chmod 600 /opt/expedientes/.env
```

Mismo archivo, sin cambios: mismo `APP_DOMAIN`, mismo token de DuckDNS y, sobre todo, **mismo
`POSTGRES_USER`/`POSTGRES_PASSWORD`**, para que el dump se restaure con el mismo dueño.

### 1.7 Runner de GitHub en la Mac

Repo → Settings → Actions → Runners → **New self-hosted runner** → **Linux / x64**. Corre los comandos
que te da GitHub. Cuando pregunte por labels, escribe **`dev-server`**.

```bash
cd ~/actions-runner
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

Instálalo **después** de agregar tu usuario al grupo `docker` (1.2); si no, el servicio no puede usar
Docker. Si ya lo instalaste antes: `sudo ./svc.sh stop && sudo ./svc.sh start`.

En GitHub debe aparecer como **Idle** con labels `self-hosted, Linux, X64, dev-server`. Mientras el
workflow siga pidiendo `raspberrypi`, este runner no recibe trabajos, así que puede quedarse así.

---

## Fase 2 — Corte en la Pi (inicia la ventana de inactividad)

En la Pi, por SSH.

```bash
cd ~/actions-runner/_work/expedientes/expedientes
COMPOSE="docker compose -f docker-compose.pi.yml --env-file /opt/expedientes/.env"
set -a; . /opt/expedientes/.env; set +a
mkdir -p ~/migracion

# 1. Detener el runner de la Pi para que nada vuelva a desplegar aquí
(cd ~/actions-runner && sudo ./svc.sh stop)

# 2. Detener la app (la db sigue arriba para el dump)
$COMPOSE stop caddy web api

# 3. Dump de la base (formato custom, comprimido)
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -Fc expedientes > ~/migracion/db.dump
ls -lh ~/migracion/db.dump                       # no debe ser 0 bytes

# 4. Archivos subidos
docker run --rm -v expedientes_storage_data:/data -v ~/migracion:/out alpine \
  tar czf /out/storage.tgz -C /data .
ls -lh ~/migracion/storage.tgz

# 5. Apagar todo, duckdns incluido. SIN -v: los volúmenes se quedan en la Pi como respaldo
$COMPOSE down
docker ps                                        # no debe quedar ningún contenedor de expedientes
```

Si `docker volume ls` muestra otros nombres (por ejemplo, sin el prefijo `expedientes_`), usa esos
en los comandos de arriba.

Copia los archivos a la Mac:

```bash
ssh <usuario-mac>@<ip-tailscale-mac> 'mkdir -p ~/migracion'
scp ~/migracion/db.dump ~/migracion/storage.tgz <usuario-mac>@<ip-tailscale-mac>:~/migracion/
```

---

## Fase 3 — Primer deploy en la Mac

En tu máquina de desarrollo, en el repo, cambia **una línea** en
`.github/workflows/deploy-dev.yml`:

```diff
-    runs-on: [self-hosted, raspberrypi]
+    runs-on: [self-hosted, dev-server]
```

(Opcional: agrega `uname -m` al paso "Show toolchain" para ver en el log en qué arquitectura corrió.)

```bash
git switch dev
git add .github/workflows/deploy-dev.yml
git commit -m "ci(dev): deploy to the dev-server runner (MacBook)"
git push
```

El runner de la Mac toma el job: instala, corre las pruebas, construye las imágenes, levanta `db`
**vacía**, corre `migrate` (migraciones + seed), levanta todo y hace el smoke check. Al levantarse,
duckdns apunta el subdominio a la IP de la casa de la Mac, y Caddy obtiene el certificado en cuanto
el DNS resuelve (de 1 a 2 minutos).

Espera a que el workflow termine en verde. El primer build tarda más porque no hay caché.

---

## Fase 4 — Restaurar los datos en la Mac

En la Mac:

```bash
cd ~/actions-runner/_work/expedientes/expedientes
COMPOSE="docker compose -f docker-compose.pi.yml --env-file /opt/expedientes/.env"
set -a; . /opt/expedientes/.env; set +a

# 1. Detener la app; la db queda arriba
$COMPOSE stop api web

# 2. Reemplazar la base recién sembrada por la de la Pi
$COMPOSE exec -T db dropdb   -U "$POSTGRES_USER" expedientes
$COMPOSE exec -T db createdb -U "$POSTGRES_USER" expedientes
$COMPOSE exec -T db pg_restore -U "$POSTGRES_USER" -d expedientes --no-owner < ~/migracion/db.dump

# 3. Restaurar los archivos subidos
docker run --rm -v expedientes_storage_data:/data -v ~/migracion:/in alpine \
  sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /in/storage.tgz -C /data'

# 4. Levantar todo
$COMPOSE up -d
$COMPOSE ps
```

Es seguro restaurar sobre el esquema migrado porque el código desplegado es el mismo que tenía la Pi
(el único cambio es la línea del workflow). El dump trae su propia tabla `_prisma_migrations`.

---

## Fase 5 — Verificar

```bash
dig +short <APP_DOMAIN>             # debe dar la IP pública de la casa de la Mac
$COMPOSE logs --tail=30 caddy       # certificado obtenido, sin errores ACME
$COMPOSE exec -T web wget -q -O - http://api:3000/api/hello
```

En el navegador, `https://<APP_DOMAIN>`:

- [ ] Inicias sesión con tu usuario **real** (no solo el del seed), lo que prueba que la base es la de
  la Pi.
- [ ] Un expediente existente muestra sus fotos, lo que prueba que el storage se restauró.
- [ ] En Datos de la clínica aparecen el logo y la firma.
- [ ] Un push de prueba a `dev` despliega en la Mac (revisa el log: `uname -m` → `x86_64`).

---

## Fase 6 — Limpieza (después de unos días estable)

**En GitHub:** Settings → Actions → Runners → elimina el runner de la Pi.

**En la Pi:**

```bash
cd ~/actions-runner && sudo ./svc.sh uninstall
# Los volúmenes viejos quedan como respaldo. Bórralos solo cuando confirmes que la Mac está bien:
# docker volume rm expedientes_db_data expedientes_storage_data expedientes_caddy_data expedientes_caddy_config
```

**Router de la casa de la Pi:** cierra el reenvío de 80/443. La Pi ya no sirve nada público.

**Repo:** el runbook `dev-pi-runbook.md` y `docker-compose.pi.yml` siguen funcionando tal cual en la
Mac (no tienen nada específico de ARM). Renombrarlos a `dev-…` es cosmético y se puede hacer después.

---

## Si algo sale mal: volver a la Pi

Los volúmenes de la Pi siguen intactos (`down` sin `-v`). Para regresar:

1. En la Mac: `$COMPOSE down` (apaga su duckdns).
2. Revierte la línea `runs-on` a `raspberrypi` y haz push, o en la Pi: `cd ~/actions-runner && sudo ./svc.sh start`
   y relanza el workflow con *Run workflow*.
3. La Pi levanta con sus datos originales; su duckdns regresa el DNS a su IP.

Todo lo que se haya escrito en la Mac durante la prueba se pierde en este caso.
