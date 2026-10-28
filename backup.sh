#!/bin/sh
# Backup do volume de dados (banners, uploads, data.js) para ./backups, mantendo os 14 mais recentes.
# Uso:  sh backup.sh      Cron diário às 3h:  0 3 * * * cd /opt/tv && sh backup.sh
set -e
cd "$(dirname "$0")"
mkdir -p backups
FILE="backups/nn-data-$(date +%Y%m%d-%H%M%S).tar.gz"
docker compose exec -T app tar -czf - -C /data . > "$FILE"
ls -1t backups/nn-data-*.tar.gz | tail -n +15 | xargs -r rm --
echo "Backup criado: $FILE ($(du -h "$FILE" | cut -f1))"
