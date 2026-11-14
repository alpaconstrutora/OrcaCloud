#!/usr/bin/env bash
# scripts/montar-ensaio.sh — monta o arquivo de ENSAIO de uma prova SQL.
#
# As provas (scripts/teste-*.sql) rodam dentro de BEGIN … ROLLBACK e têm linhas-marcador
# (`-- MIGRATION`, e às vezes outras, como `-- VOLTA`) onde entra o conteúdo de uma
# migration ainda não aplicada. Este script troca cada marcador pelo(s) arquivo(s) e
# grava o resultado em <saida>, para `npx supabase db query --linked -f <saida>`.
#
# ⚠️ Migration nova vem embrulhada em `BEGIN; … COMMIT;` (uma transação só, com
# lock_timeout). Inlinada como está, o COMMIT dela fecharia a transação da PROVA e o
# ensaio GRAVARIA no banco de produção. Por isso o script tira as linhas que são só
# `BEGIN;` ou `COMMIT;` (o `BEGIN` dos corpos plpgsql não tem `;` e fica; `END;` fica —
# fecha o corpo plpgsql), e recusa montar se o resultado ainda tiver `COMMIT;`, ou mais
# de um `BEGIN;`, ou nenhum `ROLLBACK;`.
# `SET LOCAL` da migration continua valendo — vale para a transação da prova.
#
# Uso:
#   bash scripts/montar-ensaio.sh -o <saida.sql> <prova.sql> [ARQ | MARCADOR=ARQ] ...
#     ARQ           entra no lugar de `-- MIGRATION`
#     MARCADOR=ARQ  entra no lugar de `-- MARCADOR` (ex.: VOLTA=scripts/rollback-x.sql)
#   Vários arquivos no mesmo marcador entram na ordem dada. Marcador sem arquivo fica
#   como está (comentário). Sem arquivo nenhum = a prova como está (o banco de hoje).
#
# Exemplo:
#   bash scripts/montar-ensaio.sh -o /tmp/ensaio.sql scripts/teste-tarefas-visibilidade.sql \
#        supabase/migrations/aplicar_20271112998000_tarefas_visibilidade_por_responsavel.sql
#   npx supabase db query --linked -f /tmp/ensaio.sql        # última linha: TUDO OK
set -euo pipefail

saida=""
if [ "${1:-}" = "-o" ]; then saida="${2:-}"; shift 2; fi
prova="${1:-}"; shift || true
if [ -z "$saida" ] || [ -z "$prova" ]; then
  sed -n '2,25p' "$0" >&2; exit 2
fi
[ -f "$prova" ] || { echo "montar-ensaio: prova não encontrada: $prova" >&2; exit 2; }

# pares "MARCADOR<TAB>arquivo", na ordem
pares=""
for a in "$@"; do
  case "$a" in
    *=*) m="${a%%=*}"; f="${a#*=}" ;;
    *)   m="MIGRATION"; f="$a" ;;
  esac
  [ -f "$f" ] || { echo "montar-ensaio: arquivo não encontrado: $f" >&2; exit 2; }
  pares="${pares}${m}"$'\t'"${f}"$'\n'
done

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

while IFS= read -r linha || [ -n "$linha" ]; do
  linha="${linha%$'\r'}"
  marcador=""
  if [[ "$linha" =~ ^[[:space:]]*--[[:space:]]+([A-Z][A-Z0-9_-]*)[[:space:]]*$ ]]; then
    marcador="${BASH_REMATCH[1]}"
  fi
  achou=0
  if [ -n "$marcador" ] && [ -n "$pares" ]; then
    while IFS=$'\t' read -r m f; do
      [ -n "$m" ] || continue
      if [ "$m" = "$marcador" ]; then
        achou=1
        echo "-- ═══ montar-ensaio: ${marcador} ← ${f} (sem BEGIN;/COMMIT; próprios) ═══"
        # tira BEGIN;/COMMIT; de linha inteira (case-insensitive) e o CR do fim.
        # `END;` NÃO sai: é ele que fecha o corpo das funções plpgsql.
        sed -e 's/\r$//' "$f" | grep -v -i -E '^[[:space:]]*(BEGIN|COMMIT)([[:space:]]+(TRANSACTION|WORK))?[[:space:]]*;[[:space:]]*(--.*)?$' || true
        echo "-- ═══ montar-ensaio: fim de ${f} ═══"
      fi
    done <<< "$pares"
  fi
  [ "$achou" = 1 ] || printf '%s\n' "$linha"
done < "$prova" > "$tmp"

# Travas: o ensaio tem de ser UMA transação que termina em ROLLBACK.
n_begin=$(grep -c -i -E '^[[:space:]]*BEGIN[[:space:]]*;' "$tmp" || true)
# COMMIT no começo da linha ou depois de `;` (ex.: `select 1; commit;`), fora de comentário.
n_commit=$(grep -v -E '^[[:space:]]*--' "$tmp" | grep -c -i -E '(^|;)[[:space:]]*(COMMIT|END[[:space:]]+(TRANSACTION|WORK))([[:space:]]|;|$)' || true)
n_rollback=$(grep -c -i -E '^[[:space:]]*ROLLBACK[[:space:]]*;' "$tmp" || true)
if [ "$n_begin" != 1 ] || [ "$n_commit" != 0 ] || [ "$n_rollback" -lt 1 ]; then
  echo "montar-ensaio: RECUSADO — o ensaio precisa de 1 BEGIN; (tem $n_begin), 0 COMMIT; (tem $n_commit) e ROLLBACK; (tem $n_rollback)." >&2
  exit 1
fi
if [ -n "$pares" ]; then
  while IFS=$'\t' read -r m f; do
    [ -n "$m" ] || continue
    grep -q -F "montar-ensaio: ${m} ← ${f}" "$tmp" || {
      echo "montar-ensaio: RECUSADO — a prova não tem a linha '-- ${m}' para ${f}." >&2; exit 1; }
  done <<< "$pares"
fi

cp "$tmp" "$saida"
echo "montar-ensaio: $saida ($(wc -l < "$saida") linhas; 1 BEGIN, 0 COMMIT, termina em ROLLBACK)" >&2
