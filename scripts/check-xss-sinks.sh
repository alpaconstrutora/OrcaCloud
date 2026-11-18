#!/usr/bin/env bash
#
# check-xss-sinks.sh — nenhum HTML entra no DOM fora do invólucro HtmlSanitizado.
#
# Duas camadas, dois achados:
#
# 1. Achados C5-01, C5-02 e C5-04 da auditoria de 2026-09-01. O projeto injetava
#    HTML vindo do banco em quatro lugares e não tinha biblioteca de sanitização
#    nenhuma. As tabelas que alimentavam esses pontos (`academy_lessons`,
#    `contract_templates`) têm policy de escrita `is_org_member(...)`: o membro de
#    papel mais baixo escrevia HTML que rodava na sessão de um administrador.
#    → todo sink passou a usar `sanitizeHtml()`.
#
# 2. Achado F70 da varredura de 2026-11-15. `sanitizeHtml()` mantém `style` e
#    `class` (os modelos precisam), e isso basta para plantar uma camada de tela
#    inteira com link (`position:fixed;inset:0`, ou as classes `fixed inset-0
#    z-[9999]` que o Tailwind do app já compilou) sobre a tela de um admin.
#    → o HTML só entra no DOM por `components/ui/HtmlSanitizado.tsx`, que
#      sanitiza E contém (`contain: paint` + `overflow: auto`). `sanitizeHtml()`
#      sozinho num sink deixou de bastar.
#
# Uso:
#   bash scripts/check-xss-sinks.sh            # repo inteiro
#   bash scripts/check-xss-sinks.sh <arquivo>  # um arquivo
#
# Exit code: 0 limpo · 1 achou sink fora do invólucro
#
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ALVO="${1:-}"
if [ -n "$ALVO" ]; then
    ARQUIVOS="$ALVO"
else
    ARQUIVOS=$(
        find components utils hooks lib services store -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null
        ls App.tsx index.tsx 2>/dev/null
    )
fi

CRUS=0          # sink sem sanitização nenhuma
SEM_INVOLUCRO=0 # sanitizado, mas fora do HtmlSanitizado (F70)

for arquivo in $ARQUIVOS; do
    [ -f "$arquivo" ] || continue

    case "$arquivo" in
        # O helper de sanitização CITA os sinks na documentação, explicando o
        # que neutraliza. Acusá-lo seria acusar a solução.
        */utils/sanitizeHtml.ts|utils/sanitizeHtml.ts) continue ;;
        # O invólucro é o ÚNICO lugar autorizado a abrir um sink de HTML.
        */components/ui/HtmlSanitizado.tsx|components/ui/HtmlSanitizado.tsx) continue ;;
    esac

    # Sinks: dangerouslySetInnerHTML, .innerHTML =, .outerHTML =, insertAdjacentHTML
    linhas=$(grep -nE 'dangerouslySetInnerHTML|\.innerHTML[[:space:]]*=|\.outerHTML[[:space:]]*=|insertAdjacentHTML' "$arquivo" 2>/dev/null)
    [ -z "$linhas" ] && continue

    while IFS= read -r linha; do
        num="${linha%%:*}"
        codigo="${linha#*:}"

        # Linha de comentário (`//`, `/*`, ` * `, `{/*`) que só CITA o sink —
        # ex.: PainelTopografia explica por que mostra o SVG como <img>.
        echo "$codigo" | grep -qE '^[[:space:]]*(//|/\*|\*|\{/\*)' && continue

        # Isento — <style> com CSS constante do próprio código: o sink É o
        # atributo do próprio <style> (`<style dangerouslySetInnerHTML=…`). Não
        # é dado de usuário; é folha de estilo escrita à mão (ex.:
        # DiaryReportViewer, FiscalModule). Um `<style>` qualquer na mesma linha
        # ou nas vizinhas não libera um <div dangerouslySetInnerHTML> ao lado.
        echo "$codigo" | grep -qE '<style[[:space:]]+dangerouslySetInnerHTML' && continue

        # Contexto: o sink pode quebrar em várias linhas (JSX formatado).
        trecho=$(sed -n "${num},$((num + 3))p" "$arquivo")

        if echo "$trecho" | grep -q 'sanitizeHtml'; then
            echo "❌ $arquivo:$num — sanitizado, mas fora do invólucro contido (F70)"
            SEM_INVOLUCRO=$((SEM_INVOLUCRO + 1))
        else
            echo "❌ $arquivo:$num — HTML sem sanitização"
            CRUS=$((CRUS + 1))
        fi
        echo "   $(echo "$codigo" | sed 's/^[[:space:]]*//' | cut -c1-100)"
    done <<< "$linhas"
done

FALHAS=$((CRUS + SEM_INVOLUCRO))

echo
if [ "$FALHAS" -eq 0 ]; then
    echo "✅ nenhum sink de HTML fora do HtmlSanitizado (sanitiza + contém)"
    exit 0
fi

cat <<'AJUDA'
Sink de HTML fora do invólucro.

HTML de fora (banco, formulário, modelo) só entra no DOM pelo componente único,
que sanitiza E contém a pintura dentro da própria caixa:

    import { HtmlSanitizado, preencherComHtmlSanitizado } from '<caminho>/components/ui/HtmlSanitizado';

    // JSX — no lugar de <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(valor) }} />
    <HtmlSanitizado className="prose …" html={valor} />

    // imperativo — no lugar de elemento.innerHTML = sanitizeHtml(valor)
    preencherComHtmlSanitizado(elemento, valor);

Passe o HTML CRU: a sanitização é feita lá dentro.

Por que `sanitizeHtml()` sozinho não basta: ele mantém `style` e `class`, e
`position:fixed;inset:0` (ou as classes `fixed inset-0 z-[9999]`) cobre a tela
inteira com um link. O invólucro tem `contain: paint` — vira o bloco de
contenção do `fixed` e não pinta nada fora da caixa — e `overflow: auto`, para
conteúdo largo rolar dentro do quadro em vez de ser cortado.

Se for CSS constante escrito à mão, use <style dangerouslySetInnerHTML={…}> na
mesma linha — o script reconhece e libera.

Contexto: docs/security-audit/relatorio-auditoria-seguranca.pdf (C5-01, C5-02,
C5-04) e achado F70 da varredura de 2026-11-15 (components/ui/HtmlSanitizado.tsx).
AJUDA
[ "$CRUS" -gt 0 ] && echo "❌ $CRUS sink(s) sem sanitização"
[ "$SEM_INVOLUCRO" -gt 0 ] && echo "❌ $SEM_INVOLUCRO sink(s) sanitizado(s) fora do invólucro contido"
exit 1
