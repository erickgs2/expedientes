# Servidor MacBook (piloto): preparación y deploys

La MacBook Pro con Ubuntu Server reemplaza a la Raspberry Pi como destino de los deploys de `dev`.
La app se publica en `https://medcloud.intech-erp.com` mediante Cloudflare Tunnel: no se abre ningún
puerto en el router y la IP dinámica de la casa no importa.

```
Internet ─▶ Cloudflare (TLS) ═══ túnel ═══▶ MacBook
                                            ├ cloudflared ─▶ web (nginx) ─▶ api ─▶ db
                                            └ runner de GitHub [dev-server]
```

**La Pi sigue funcionando.** Conserva la última versión desplegada y sus datos, pero deja de recibir
deploys. Su información se migrará a la Mac al terminar las fases del plan, con un respaldo nuevo
tomado ese día: el de hoy ya no tendrá lo que se capture después.

Todo se corre en la Mac por SSH, salvo donde se indique. **Cada paso empieza con una comprobación:
si ya está hecho, sáltalo.**

## 0. Inventario

Muestra lo que la Mac ya tiene. Pide la contraseña de `sudo` una vez.

```bash
echo "== Sistema"; lsb_release -ds; uname -m; free -h; swapon --show; df -h / | tail -1
echo "== Suspension"; systemctl is-enabled sleep.target suspend.target 2>&1; grep -hE '^HandleLidSwitch' /etc/systemd/logind.conf /etc/systemd/logind.conf.d/*.conf 2>/dev/null
echo "== Software"; for c in docker node npm git ufw tailscale certbot cloudflared ddclient nginx apache2 caddy; do printf '%-12s' "$c"; if command -v "$c" >/dev/null; then "$c" --version 2>/dev/null | head -1 || echo instalado; else echo '-'; fi; done
docker compose version 2>/dev/null; echo "grupos: $(groups)"
echo "== Firewall"; sudo ufw status 2>/dev/null | head -8
echo "== DuckDNS"; crontab -l 2>/dev/null | grep -i duck; sudo crontab -l 2>/dev/null | grep -i duck; sudo grep -ril duck /etc/cron* 2>/dev/null; systemctl list-units --all --no-pager 2>/dev/null | grep -i duck; systemctl list-timers --all --no-pager 2>/dev/null | grep -i duck; ls -d ~/duckdns /opt/duckdns 2>/dev/null; docker ps -a 2>/dev/null | grep -i duck
echo "== Certificados"; sudo certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains'
echo "== Puertos que escuchan"; sudo ss -tlnp | awk 'NR>1{print $4, $6}'
echo "== Runner y secretos"; ls -d ~/actions-runner 2>/dev/null; systemctl list-units --all --no-pager 2>/dev/null | grep -i actions.runner; ls -la /opt/expedientes 2>/dev/null
```

## 1. Base del sistema

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates openssl ufw
```

**Suspensión.** Sáltalo si el inventario muestra `masked` y `HandleLidSwitch=ignore`, que ya
configuraste antes:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/; s/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/; s/^#\?HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

## 2. Acceso remoto por Tailscale

Hazlo **antes** de quitar DuckDNS. Hoy entras a la Mac por un nombre de DuckDNS y un puerto abierto
en el router; al quitarlos, ese camino se cierra. Tailscale da acceso SSH privado (solo tus equipos)
sin abrir puertos. Es una VPN de administración, no la forma de publicar la app: la app sale por el
túnel de Cloudflare.

Sáltalo si el inventario muestra `tailscale` y ya lo usas.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
tailscale ip -4                     # anota la IP 100.x
```

Instala Tailscale también en tu laptop (y en tu celular si quieres) con la misma cuenta, y comprueba
que entras: `ssh usuario@100.x.x.x`. **No sigas al paso 3 hasta que esto funcione.**

## 3. Quitar DuckDNS de la Mac

Quita solo lo que actualiza el nombre de **esta Mac**. La Pi tiene su propio DuckDNS (el que sigue la
IP de la EC2 de QA y el que usa la clínica): no lo toques.

Según lo que haya mostrado el inventario en `== DuckDNS`:

- **Cron de tu usuario o de root:** `crontab -e` (o `sudo crontab -e`) y borra la línea de DuckDNS.
- **Archivo en `/etc/cron*`:** `sudo rm` el archivo que mostró el inventario.
- **Script de DuckDNS** (suele estar en `~/duckdns/`): `rm -r ~/duckdns`.
- **Servicio o temporizador de systemd:** `sudo systemctl disable --now NOMBRE` y borra su archivo en
  `/etc/systemd/system/`, luego `sudo systemctl daemon-reload`.
- **Contenedor:** `docker rm -f NOMBRE`.
- **ddclient:** `sudo apt purge -y ddclient`.
- **Certificado de Let's Encrypt para el dominio de DuckDNS:** `sudo certbot delete --cert-name NOMBRE`.
  Si certbot no tiene otros certificados, `sudo apt purge -y certbot`.

Si el inventario no mostró nada en `== DuckDNS`, no hay nada que quitar.

**En el router de la casa de la Mac**, borra los reenvíos de puertos hacia la Mac (80, 443 y el de
SSH). Con el túnel y Tailscale ya no hacen falta, y cada puerto abierto es una entrada menos que
vigilar. Si en la página de DuckDNS el subdominio de la Mac no lo usa nada más, bórralo también.

## 4. Firewall

Sáltalo si `ufw status` ya dice `active` con SSH permitido.

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

## 5. Swap

Con 4 GB de RAM, compilar Angular y Next.js necesita swap. Sáltalo si `swapon --show` ya muestra
4 GB o más.

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 6. Docker

Sáltalo si el inventario muestra `docker`, `docker compose` y tu usuario en el grupo `docker`.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# cierra la sesión SSH y vuelve a entrar para que el grupo aplique
docker run --rm hello-world
```

No instales Postgres en el sistema: corre como contenedor. Tampoco instales `cloudflared`: corre como
contenedor dentro del stack.

## 7. Node 22

Lo usa el runner para `npm ci` y las pruebas. Sáltalo si `node --version` muestra v22 o más.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version     # v22.x y npm 10+
```

No uses el `nodejs` de apt de Ubuntu ni nvm: npm 9 rompe el lock file y el servicio del runner no ve nvm.

## 8. Secretos

```bash
sudo mkdir -p /opt/expedientes && sudo chown $USER /opt/expedientes
nano /opt/expedientes/.env
chmod 600 /opt/expedientes/.env
```

Contenido (genera cada secreto con `openssl rand -base64 32`):

```
CLOUDFLARE_TUNNEL_TOKEN=<token del túnel medcloud-mac, de Contraseñas de Apple>
JWT_SECRET=<openssl rand -base64 32>
POSTGRES_USER=medcloud
POSTGRES_PASSWORD=<openssl rand -base64 32>
SEED_ADMIN_EMAIL=<tu correo de administrador>
SEED_ADMIN_PASSWORD=<una contraseña fuerte>
```

Usa `nano` u otro editor: si pones el token en un comando, queda en el historial de bash.

## 9. Runner de GitHub

Sáltalo si el inventario ya muestra `~/actions-runner` y un servicio `actions.runner` con la etiqueta
`dev-server` (la etiqueta se ve en GitHub, en **Settings → Actions → Runners**).

En GitHub: **repo → Settings → Actions → Runners → New self-hosted runner → Linux / x64**. Corre en la
Mac los comandos que muestra GitHub. Cuando pregunte por etiquetas (labels), escribe **`dev-server`**.

Instálalo como servicio para que arranque solo:

```bash
cd ~/actions-runner
sudo ./svc.sh install $USER
sudo ./svc.sh start
sudo ./svc.sh status
```

## 10. Apagar el runner de la Pi

En la Pi, para que no tome trabajos por error. Esto no detiene la app de la Pi:

```bash
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
```

En GitHub, en **Settings → Actions → Runners**, el runner `raspberrypi` aparecerá como offline;
puedes eliminarlo desde ahí.

## 11. Primer deploy

Mezcla en `dev` el PR que trae `docker-compose.mac.yml`. El workflow corre en la Mac: instala
dependencias, prueba, compila las imágenes, migra la base de datos (vacía, con el administrador del
paso 8) y levanta el stack. El primer build en esta máquina tarda bastante; los siguientes reutilizan
la caché.

Comprobaciones:

```bash
cd ~/actions-runner/_work/expedientes/expedientes
docker compose -f docker-compose.mac.yml --env-file /opt/expedientes/.env ps
docker compose -f docker-compose.mac.yml --env-file /opt/expedientes/.env logs --tail=30 cloudflared
```

- En Cloudflare, el túnel `medcloud-mac` debe verse con 1 réplica y en buen estado.
- `https://medcloud.intech-erp.com` debe abrir el login, y debes poder entrar con el administrador del paso 8.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Error 502 en el navegador | `web` no está arriba, o la ruta del túnel no es `http://web:80` | Revisa `ps` y la ruta en Cloudflare |
| Error 1033 de Cloudflare | `cloudflared` no está conectado | Revisa sus logs y el token en `.env` |
| El build se detiene o la Mac deja de responder | Falta de memoria | Confirma el swap del paso 5 |
| El job queda "Waiting for a runner" | El runner no tiene la etiqueta `dev-server` o está detenido | `sudo ./svc.sh status` en la Mac |
| No puedes entrar por SSH | Se quitó DuckDNS antes de tener Tailscale | Entra con teclado y pantalla en la Mac y completa el paso 2 |
