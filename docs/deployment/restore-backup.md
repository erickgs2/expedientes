# Restaurar un respaldo en el servidor Mac

Pasa la base de datos y los archivos subidos (fotos, firmas, consentimientos, logo) de un respaldo —
por ejemplo, los de la Raspberry Pi— al stack de la Mac. Lo hace `scripts/restore-from-backup.sh`.

Los respaldos tienen datos de salud de pacientes: cópialos solo por SSH/Tailscale, guárdalos
cifrados y nunca en una carpeta de nube personal. Borra las copias sin cifrar de la Mac cuando
confirmes que la restauración quedó bien.

## Qué acepta

| Respaldo | Formatos | Cómo se generó |
|---|---|---|
| Base de datos | `.dump` (`pg_dump -Fc`), `.sql` o `.sql.gz` | se detecta por el contenido, no por el nombre |
| Archivos | `.tar.gz` / `.tgz` del contenido del volumen | `tar czf … -C /data .` |

Un respaldo viejo, de antes de multi-clínica, también sirve: después de cargarlo el script corre las
migraciones de la versión desplegada, que lo convierten en la clínica #1 con todos sus datos. Los
usuarios, contraseñas y roles son los del respaldo.

Un `.sql.gz` hecho con `docker exec -t` (como decía antes el runbook de la Pi) tiene fines de línea
CRLF; el script lo detecta y lo corrige al cargar.

## 1. Respaldo fresco en la Pi (el día de la migración)

```bash
cd /opt/expedientes && set -a && . ./.env && set +a
DB=$(docker ps -q --filter "label=com.docker.compose.service=db")
mkdir -p ~/migracion && chmod 700 ~/migracion
docker exec "$DB" pg_dump -U "$POSTGRES_USER" -Fc expedientes > ~/migracion/db.dump
docker run --rm -v expedientes_storage_data:/data -v ~/migracion:/out alpine \
  tar czf /out/storage.tar.gz -C /data .
ls -lh ~/migracion                       # ninguno debe pesar 0 bytes
docker exec "$DB" psql -U "$POSTGRES_USER" -d expedientes -Atc 'SELECT count(*) FROM "Patient"'
```

Anota el número de pacientes para compararlo al final. Si después de esto se sigue capturando en la
Pi, esos datos no viajan: apaga la app de la Pi antes del respaldo si la migración es definitiva.

Copia a la Mac:

```bash
ssh <usuario>@intech-mac 'mkdir -p ~/migracion && chmod 700 ~/migracion'
scp ~/migracion/db.dump ~/migracion/storage.tar.gz <usuario>@intech-mac:~/migracion/
```

## 2. Revisar los archivos en la Mac (no modifica nada)

```bash
cd ~/actions-runner/_work/expedientes/expedientes
git pull          # para tener el script
scripts/restore-from-backup.sh --check ~/migracion/db.dump ~/migracion/storage.tar.gz
```

## 3. Restaurar

La versión desplegada en la Mac debe ser igual o más nueva que la de la Pi. Detén el runner para que
un deploy no caiga a la mitad:

```bash
cd ~/actions-runner && sudo ./svc.sh stop
cd ~/actions-runner/_work/expedientes/expedientes
scripts/restore-from-backup.sh ~/migracion/db.dump ~/migracion/storage.tar.gz
cd ~/actions-runner && sudo ./svc.sh start
```

El script:

1. revisa los respaldos;
2. se niega a reemplazar una base que ya tenga pacientes, salvo con `--replace-existing`;
3. pide escribir `RESTAURAR`;
4. guarda lo que tiene la Mac en `~/backups/pre-restore-<fecha>/`;
5. apaga la app, recrea la base, carga el respaldo y corre migraciones y seed;
6. reemplaza los archivos, enciende la app e imprime conteos.

Si algo falla a la mitad, imprime el comando exacto para volver a como estaba.

## 4. Verificar

- Los pacientes del resultado coinciden con los que anotaste en la Pi.
- Entra con un usuario de la Pi, abre un paciente con fotos y un consentimiento firmado, y descarga
  su PDF.
- Lo que existía solo en la Mac antes de restaurar (usuarios de prueba, registros) se reemplazó.
  El administrador de `/plataforma` se vuelve a crear desde `PLATFORM_ADMIN_*` del `.env` si siguen
  ahí; su autenticador hay que enrolarlo de nuevo.
- Los datos de Stripe guardados en clínicas (cliente, suscripción) son los del respaldo: la Pi no
  tenía pagos, así que no hay nada que corregir.

Después: borra `~/migracion` en la Mac y en la Pi (o guárdalo cifrado fuera de ambos equipos).
