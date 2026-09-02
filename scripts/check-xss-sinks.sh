#!/usr/bin/env bash
#
# check-xss-sinks.sh — nenhum HTML entra no DOM sem passar por sanitizeHtml().
#
# Achados C5-01, C5-02 e C5-04 da auditoria de 2026-09-01. O projeto injetava
# HTML vindo do banco em quatro lugares e não tinha biblioteca de sanitização
# nenhuma. As tabelas que alimentavam esses pontos (`academy_lessons`,
# `contract_templates`) têm policy de escrita `is_org_member(...)`: o membro de
# papel mais baixo escrevia HTML que rodava na sessão de um administrador.
#
# Uso:
#   bash scripts/check-xss-sinks.sh            # repo inteiro
#   bash scripts/check-xss-sinks.sh <arquivo>  # um arquivo
#
# Exit code: 0 limpo · 1 achou sink cru
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ALVO="${1:-}"
if [ -n "$ALVO" ]; then
    ARQUIVOS="$ALVO"
else
    ARQUIVOS=$(find components utils hooks lib -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null)
fi

FALHAS=0

for arquivo in $ARQUIVOS; do
    [ -f "$arquivo" ] || continue

    # O próprio helper é isento: ele CITA os sinks na documentação, explicando
    # o que neutraliza. Acusá-lo seria acusar a solução.
    case "$arquivo" in
        */utils/sanitizeHtml.ts|utils/sanitizeHtml.ts) continue ;;
    esac

    # Sinks: dangerouslySetInnerHTML, .innerHTML =, .outerHTML =, insertAdjacentHTML
    linhas=$(grep -nE 'dangerouslySetInnerHTML|\.innerHTML[[:space:]]*=|\.outerHTML[[:space:]]*=|insertAdjacentHTML' "$arquivo" 2>/dev/null)
    [ -z "$linhas" ] && continue

    while IFS= read -r linha; do
        num="${linha%%:*}"
        # Contexto: o sink pode quebrar em várias linhas (JSX formatado).
        trecho=$(sed -n "${num},$((num + 3))p" "$arquivo")

        # Isento 1 — sanitizado.
        echo "$trecho" | grep -q 'sanitizeHtml' && continue

        # Isento 2 — <style> com CSS constante do próprio código. Não é dado de
        # usuário; é folha de estilo escrita à mão (ex.: DiaryReportViewer,
        # FiscalModule). Reconhecido pela tag <style na mesma linha.
        echo "$trecho" | grep -q '<style' && continue

        echo "❌ $arquivo:$num"
        echo "   $(echo "$linha" | cut -d: -f2- | sed 's/^[[:space:]]*//' | cut -c1-100)"
        FALHAS=$((FALHAS + 1))
    done <<< "$linhas"
done

echo
if [ "$FALHAS" -eq 0 ]; then
    echo "✅ nenhum sink de HTML sem sanitizeHtml()"
    exit 0
fi

cat <<'AJUDA'
Sink de HTML sem sanitização.

Corrija importando o helper único:

    import { sanitizeHtml } from '<caminho>/utils/sanitizeHtml';

    dangerouslySetInnerHTML={{ __html: sanitizeHtml(valor) }}
    elemento.innerHTML = sanitizeHtml(valor);

Se for CSS constante escrito à mão, use <style> — o script reconhece e libera.

Contexto: docs/security-audit/relatorio-auditoria-seguranca.pdf (C5-01, C5-02, C5-04)
AJUDA
echo "❌ $FALHAS sink(s) sem sanitização"
exit 1
