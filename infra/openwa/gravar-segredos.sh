#!/bin/bash
# Recebe WA_W e WA_H pelo ambiente (WSLENV). Não imprime os valores.
set -e
cd ~/openwa
w=$(printf '%s' "${WA_W:-}" | tr -cd '0-9a-fA-F' | tr 'A-F' 'a-f'); h=$(printf '%s' "${WA_H:-}" | tr -cd '0-9a-fA-F' | tr 'A-F' 'a-f')
ok=1
[ ${#w} = 64 ] || { echo "WA_WORKER_SECRET inválido (${#w} caracteres hex; esperado 64)"; ok=0; }
[ ${#h} = 64 ] || { echo "OPENWA_WEBHOOK_SECRET inválido (${#h} caracteres hex; esperado 64)"; ok=0; }
[ "$w" != "$h" ] || { echo "Os dois valores são iguais — confira"; ok=0; }
[ $ok = 1 ] || exit 1
sed -i "s|^WA_WORKER_SECRET=.*|WA_WORKER_SECRET=$w|; s|^OPENWA_WEBHOOK_SECRET=.*|OPENWA_WEBHOOK_SECRET=$h|" .env
echo "OK: os 2 segredos foram gravados no ~/openwa/.env"
