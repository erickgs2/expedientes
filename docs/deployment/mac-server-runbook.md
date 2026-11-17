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

Todo se corre en la Mac por SSH, salvo donde se indique.

## 1. Base del sistema

```bash
uname -m                      # esperado: x86_64
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates openssl ufw
```

Que nunca se suspenda, ni con la tapa cerrada:

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo sed -i 's/^#\?HandleLidSwitch=.*/HandleLidSwitch=ignore/; s/^#\?HandleLidSwitchExternalPower=.*/HandleLidSwitchExternalPower=ignore/; s/^#\?HandleLidSwitchDocked=.*/HandleLidSwitchDocked=ignore/' /etc/systemd/logind.conf
sudo systemctl restart systemd-logind
```

Firewall: solo SSH de entrada. El túnel es una conexión de salida y no necesita puertos abiertos.

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

## 2. Swap

Con 4 GB de RAM, compilar Angular y Next.js necesita swap.

```bash
swapon --show                 # si ya hay 4 GB o más, sáltate el resto de este paso
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# cierra la sesión SSH y vuelve a entrar para que el grupo aplique
docker run --rm hello-world
docker compose version
```

No instales Postgres en el sistema: corre como contenedor.

## 4. Node 22

Lo usa el runner para `npm ci` y las pruebas.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version && npm --version     # v22.x y npm 10+
```

No uses el `nodejs` de apt de Ubuntu ni nvm: npm 9 rompe el lock file y el servicio del runner no ve nvm.

## 5. Secretos

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

## 6. Runner de GitHub

En GitHub: **repo → Settings → Actions → Runners → New self-hosted runner → Linux / x64**. Corre en la
Mac los comandos que muestra GitHub. Cuando pregunte por etiquetas (labels), escribe **`dev-server`**.

Instálalo como servicio para que arranque solo:

```bash
cd ~/actions-runner
sudo ./svc.sh install $USER
sudo ./svc.sh start
sudo ./svc.sh status
```

El runner corre con tu usuario, que ya está en el grupo `docker`.

## 7. Apagar el runner de la Pi

En la Pi, para que no tome trabajos por error. Esto no detiene la app de la Pi:

```bash
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
```

En GitHub, en **Settings → Actions → Runners**, el runner `raspberrypi` aparecerá como offline;
puedes eliminarlo desde ahí.

## 8. Primer deploy

Mezcla en `dev` el PR que trae `docker-compose.mac.yml`. El workflow corre en la Mac: instala
dependencias, prueba, compila las imágenes, migra la base de datos (vacía, con el administrador del
paso 5) y levanta el stack. El primer build en esta máquina tarda bastante; los siguientes reutilizan
la caché.

Comprobaciones:

```bash
cd ~/actions-runner/_work/expedientes/expedientes
docker compose -f docker-compose.mac.yml --env-file /opt/expedientes/.env ps
docker compose -f docker-compose.mac.yml --env-file /opt/expedientes/.env logs --tail=30 cloudflared
```

- En Cloudflare, el túnel `medcloud-mac` debe verse con 1 réplica y en buen estado.
- `https://medcloud.intech-erp.com` debe abrir el login, y debes poder entrar con el administrador del paso 5.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Error 502 en el navegador | `web` no está arriba, o la ruta del túnel no es `http://web:80` | Revisa `ps` y la ruta en Cloudflare |
| Error 1033 de Cloudflare | `cloudflared` no está conectado | Revisa sus logs y el token en `.env` |
| El build se detiene o la Mac deja de responder | Falta de memoria | Confirma el swap del paso 2 |
| El job queda "Waiting for a runner" | El runner no tiene la etiqueta `dev-server` o está detenido | `sudo ./svc.sh status` en la Mac |
