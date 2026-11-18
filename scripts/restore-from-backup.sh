#!/usr/bin/env bash
# Restores a MedCloud backup (database + uploaded files) into the stack on this server.
#
#   scripts/restore-from-backup.sh --check   <db-backup> [<files-backup>]   only checks the files
#   scripts/restore-from-backup.sh           <db-backup> [<files-backup>]   restores
#
# <db-backup>     pg_dump output: custom format (.dump, `pg_dump -Fc`), plain SQL (.sql) or
#                 gzipped plain SQL (.sql.gz). Detected from the contents, not the name.
# <files-backup>  tar.gz of the storage volume's contents (`tar czf ... -C /data .`).
#
# Run from the repo checkout the stack is deployed from (the runner's checkout on the Mac). It:
#   1. checks both files before touching anything;
#   2. refuses to overwrite a database that already holds patients, unless --replace-existing;
#   3. saves what this server has now to ~/backups/pre-restore-<time>/ (so the restore can be undone);
#   4. stops the app (the database keeps running), recreates the database, loads the backup;
#   5. runs the migrations of the deployed version (an older backup is brought up to date here:
#      e.g. a pre-multi-clinic backup becomes clinic #1) and the seed;
#   6. replaces the stored files, starts the app and prints counts to compare with the source.
#
# The backups hold patient health data: keep them encrypted at rest, never in a personal cloud
# folder, and delete the plain copies on this server once the restore is verified.
set -euo pipefail

ENV_FILE=${ENV_FILE:-/opt/expedientes/.env}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.mac.yml}
C=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

CHECK_ONLY=0
REPLACE_EXISTING=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --replace-existing) REPLACE_EXISTING=1 ;;
    -h|--help) sed -n 2,22p "$0"; exit 0 ;;
    *) ARGS+=("$arg") ;;
  esac
done
[ "${#ARGS[@]}" -ge 1 ] && [ "${#ARGS[@]}" -le 2 ] || { sed -n 2,10p "$0"; exit 2; }
DB_BACKUP=${ARGS[0]}
FILES_BACKUP=${ARGS[1]:-}

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 1. check the backup files
say "Revisando los respaldos"
[ -s "$DB_BACKUP" ] || fail "no existe o está vacío: $DB_BACKUP"

magic=$(head -c 5 "$DB_BACKUP" | od -An -c | tr -d ' ')
if [ "$magic" = "PGDMP" ]; then
  DB_FORMAT=custom
elif head -c 2 "$DB_BACKUP" | od -An -tx1 | grep -q '1f 8b'; then
  DB_FORMAT=sql.gz
  gzip -t "$DB_BACKUP" || fail "$DB_BACKUP está corrupto (gzip -t falló)"
else
  DB_FORMAT=sql
fi

# A plain dump taken with `docker exec -t` went through a terminal, which turns every line ending
# into CRLF. pg_dump never writes a raw carriage return itself (COPY data escapes it as \r), so
# stripping them is exact. Detected here and fixed while loading.
HAS_CRLF=0
if [ "$DB_FORMAT" != custom ]; then
  reader=(cat "$DB_BACKUP"); [ "$DB_FORMAT" = sql.gz ] && reader=(gzip -dc "$DB_BACKUP")
  head_sql=$("${reader[@]}" | head -c 200000 || true)
  grep -q 'PostgreSQL database dump' <<<"$head_sql" || fail "$DB_BACKUP no parece un pg_dump"
  if [[ $head_sql == *$'\r'* ]]; then HAS_CRLF=1; fi
  tail_sql=$("${reader[@]}" | tail -c 2000)
  grep -q 'PostgreSQL database dump complete' <<<"$tail_sql" \
    || fail "$DB_BACKUP está incompleto: falta el final del dump (¿se cortó la copia?)"
  patients_in_dump=$("${reader[@]}" | awk '/^COPY public."Patient" /{on=1;next} on&&/^\\\.\r?$/{exit} on{n++} END{print n+0}' || true)
else
  # Read the archive's table of contents: a truncated or damaged custom dump fails here.
  if command -v docker >/dev/null; then
    docker run --rm -i postgres:16 pg_restore -l < "$DB_BACKUP" > /dev/null \
      || fail "$DB_BACKUP está corrupto o incompleto (pg_restore -l falló)"
  fi
  patients_in_dump="(se ve después de restaurar)"
fi
echo "  base de datos: $DB_BACKUP  formato=$DB_FORMAT  $(du -h "$DB_BACKUP" | cut -f1)"
[ "$HAS_CRLF" = 1 ] && echo "  aviso: el dump tiene fines de línea CRLF (pg_dump con -t); se corrigen al cargar"
echo "  pacientes en el respaldo: $patients_in_dump"

if [ -n "$FILES_BACKUP" ]; then
  [ -s "$FILES_BACKUP" ] || fail "no existe o está vacío: $FILES_BACKUP"
  gzip -t "$FILES_BACKUP" || fail "$FILES_BACKUP está corrupto (gzip -t falló)"
  file_count=$(tar tzf "$FILES_BACKUP" | grep -vc '/$' || true)
  echo "  archivos:      $FILES_BACKUP  $(du -h "$FILES_BACKUP" | cut -f1)  ($file_count archivos)"
else
  echo "  archivos:      (sin respaldo de archivos: se conservan los que ya tiene este servidor)"
fi

if [ "$CHECK_ONLY" = 1 ]; then
  say "Respaldos válidos. Nada se modificó (--check)."
  exit 0
fi

# ---------------------------------------------------------------- 2. preconditions on this server
[ -f "$COMPOSE_FILE" ] || fail "corre el script desde el checkout del repo (no encuentro $COMPOSE_FILE)"
[ -r "$ENV_FILE" ] || fail "no puedo leer $ENV_FILE"
# Only the value needed here is read. The file is not sourced: it is written for Docker Compose,
# where `NAME=Erick Garcia` is valid but a shell would run "Garcia" as a command.
POSTGRES_USER=$(sed -n 's/^[[:space:]]*POSTGRES_USER[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" | tail -1 | sed "s/^[\"']//; s/[\"'][[:space:]]*$//")
[ -n "$POSTGRES_USER" ] || fail "POSTGRES_USER falta en $ENV_FILE"

if systemctl is-active --quiet 'actions.runner.*' 2>/dev/null; then
  fail "el runner de GitHub está activo: un deploy a mitad de la restauración la rompería.
       Deténlo con:  cd ~/actions-runner && sudo ./svc.sh stop   (y vuelve a iniciarlo al final)"
fi

"${C[@]}" up -d db >/dev/null
for _ in $(seq 1 30); do "${C[@]}" exec -T db pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1 && break; sleep 2; done
psql_db() { "${C[@]}" exec -T db psql -U "$POSTGRES_USER" -v ON_ERROR_STOP=1 -qAt "$@"; }

current_patients=$(psql_db -d expedientes -c 'SELECT count(*) FROM "Patient"' 2>/dev/null || echo 0)
if [ "$current_patients" != 0 ] && [ "$REPLACE_EXISTING" = 0 ]; then
  fail "la base de este servidor ya tiene $current_patients pacientes. Si de verdad quieres reemplazarla,
       vuelve a correr con --replace-existing (antes se respalda lo actual)."
fi

echo
echo "Se va a REEMPLAZAR la base de datos de este servidor${FILES_BACKUP:+ y sus archivos} con el respaldo."
echo "La app estará apagada unos minutos. Lo actual se guarda antes en ~/backups/."
read -r -p "Escribe RESTAURAR para continuar: " answer
[ "$answer" = RESTAURAR ] || fail "cancelado"

# ---------------------------------------------------------------- 3. save what is here now
SAFETY=~/backups/pre-restore-$(date +%Y%m%d-%H%M%S)
mkdir -p "$SAFETY"; chmod 700 "$SAFETY"
say "Respaldando lo actual en $SAFETY"
"${C[@]}" exec -T db pg_dump -U "$POSTGRES_USER" -Fc expedientes > "$SAFETY/db.dump" \
  || echo "  (la base actual no existe o está vacía; nada que respaldar)"

storage_volume() {
  local id
  id=$("${C[@]}" ps -a -q api | head -1)
  [ -n "$id" ] || fail "no encuentro el contenedor api: haz un deploy normal primero"
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data/storage"}}{{.Name}}{{end}}{{end}}' "$id"
}
VOLUME=$(storage_volume)
[ -n "$VOLUME" ] || fail "no encuentro el volumen de archivos del api"
if [ -n "$FILES_BACKUP" ]; then
  docker run --rm -v "$VOLUME":/data -v "$SAFETY":/out alpine tar czf /out/storage.tar.gz -C /data .
fi
echo "  listo (para deshacer: corre este mismo script con los archivos de $SAFETY)"

# ---------------------------------------------------------------- 4. load the database
trap 'printf "\n\033[31mLa restauración falló a la mitad.\033[0m La app quedó apagada.\nPara volver a como estaba: %s --replace-existing %s/db.dump %s\n" "$0" "$SAFETY" "${FILES_BACKUP:+$SAFETY/storage.tar.gz}" >&2' ERR
say "Apagando la app (la base sigue encendida)"
"${C[@]}" stop api api-pdf web >/dev/null

say "Recreando la base de datos y cargando el respaldo"
psql_db -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='expedientes' AND pid <> pg_backend_pid()" >/dev/null
psql_db -d postgres -c 'DROP DATABASE IF EXISTS expedientes'
psql_db -d postgres -c "CREATE DATABASE expedientes OWNER \"$POSTGRES_USER\""

case "$DB_FORMAT" in
  custom)
    "${C[@]}" exec -T db pg_restore -U "$POSTGRES_USER" -d expedientes --no-owner --exit-on-error < "$DB_BACKUP" ;;
  sql|sql.gz)
    reader=(cat "$DB_BACKUP"); [ "$DB_FORMAT" = sql.gz ] && reader=(gzip -dc "$DB_BACKUP")
    "${reader[@]}" | tr -d '\r' | "${C[@]}" exec -T db psql -U "$POSTGRES_USER" -d expedientes -v ON_ERROR_STOP=1 -q >/dev/null ;;
esac
echo "  pacientes cargados: $(psql_db -d expedientes -c 'SELECT count(*) FROM "Patient"')"

# ---------------------------------------------------------------- 5. bring the schema up to date
say "Aplicando las migraciones de la versión desplegada"
"${C[@]}" --profile tools run --rm migrate

# ---------------------------------------------------------------- 6. files, start, verify
if [ -n "$FILES_BACKUP" ]; then
  say "Reemplazando los archivos del volumen $VOLUME"
  docker run --rm -v "$VOLUME":/data -v "$(cd "$(dirname "$FILES_BACKUP")" && pwd)":/in:ro alpine \
    sh -c "find /data -mindepth 1 -delete && tar xzf /in/$(basename "$FILES_BACKUP") -C /data && chown -R 1000:1000 /data"
fi

trap - ERR
say "Encendiendo la app"
"${C[@]}" up -d api api-pdf web >/dev/null

say "Resultado (compáralo con la fuente)"
psql_db -d expedientes -F ' | ' -c '
  SELECT $$clínicas$$, count(*) FROM "Clinic"
  UNION ALL SELECT $$usuarios$$, count(*) FROM "User"
  UNION ALL SELECT $$pacientes$$, count(*) FROM "Patient"
  UNION ALL SELECT $$valoraciones$$, count(*) FROM "Valoracion"
  UNION ALL SELECT $$tratamientos$$, count(*) FROM "Treatment"
  UNION ALL SELECT $$consentimientos$$, count(*) FROM "Consent"
  UNION ALL SELECT $$citas$$, count(*) FROM "Appointment"'
echo "archivos | $(docker run --rm -v "$VOLUME":/data alpine find /data -type f | wc -l)"
echo "última migración | $(psql_db -d expedientes -c 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1')"
cat <<MSG

Siguiente:
  * Entra a la app y abre un paciente con fotos y un consentimiento firmado.
  * Reinicia el runner:  cd ~/actions-runner && sudo ./svc.sh start
  * Cuando confirmes que todo está bien, borra las copias sin cifrar del respaldo de este servidor.
  * Respaldo de lo que había antes: $SAFETY
MSG
