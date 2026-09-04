#!/usr/bin/env bash
#
# conferir-producao.sh — responde "o que o domínio ESTÁ servindo bate com main?"
#
# Não publica nada. É a contraparte de `check-origem-do-deploy.sh`: aquele
# previne o que dá para prevenir dentro do build; este DETECTA o resto, de
# fora, olhando o que o site entrega de fato.
#
# ── Por que "o painel diz Ready" não serve ─────────────────────────────────
# 04/09/2026: o painel do Vercel mostrava produção saudável enquanto o domínio
# servia um bundle de ~40 min antes, publicado por CLI de uma pasta atrasada. A
# funcionalidade que tinha ido ao ar (e sido provada no ar) não estava mais lá.
# Só baixar o que o domínio entrega mostra isso.
#
# ── Uso ─────────────────────────────────────────────────────────────────────
#   bash scripts/conferir-producao.sh
#   bash scripts/conferir-producao.sh "Rastreamento logístico" "Aba Financeiro"
#     → além do commit, procura cada texto dentro dos bundles servidos; serve
#       para provar que UMA tela específica é a versão nova, e não só que o
#       commit bate.
#
# Exit: 0 bate com origin/main · 1 não bate (ou não deu para provar)

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

DOMINIO="${DOMINIO:-https://orcacloud.vercel.app}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "── O que origin/main diz ────────────────────────────────"
git fetch -q origin || { echo "❌ não consegui buscar do remoto."; exit 1; }
ESPERADO=$(git rev-parse origin/main)
echo "   origin/main: ${ESPERADO:0:7}  $(git log -1 --format=%s origin/main)"

echo
echo "── O que o domínio entrega ──────────────────────────────"
HTML=$(curl -s -H 'Cache-Control: no-cache' "$DOMINIO/")
ENTRY=$(echo "$HTML" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
[ -z "$ENTRY" ] && { echo "❌ não achei o bundle de entrada em $DOMINIO"; exit 1; }
curl -s "$DOMINIO$ENTRY" -o "$TMP/index.js"
echo "   bundle: $ENTRY"

# O carimbo vem do `define` em vite.config.ts. Vazio = build de CLI sem commit
# associado — é o próprio sintoma do incidente.
SERVIDO=$(grep -oE '__BUILD_COMMIT__="[0-9a-f]*"' "$TMP/index.js" | head -1 | grep -oE '[0-9a-f]{7,40}')

if [ -z "$SERVIDO" ]; then
    echo "   commit carimbado: (vazio)"
    echo
    echo "❌ O bundle no ar não tem commit carimbado."
    echo "   Isso é assinatura de \`vercel deploy --prod\` sem BUILD_COMMIT — publicação"
    echo "   por CLI, de uma árvore local. Não dá para saber qual código está no ar."
    echo "   Recupere republicando de main (ver REGRA #8 no CLAUDE.md)."
    exit 1
fi

echo "   commit carimbado: ${SERVIDO:0:7}"

# ── Textos específicos, quando pedidos ─────────────────────────────────────
# O commit bater já diz muito, mas quem está depurando "minha tela sumiu" quer
# ver a marca da própria tela. Os chunks são carregados sob demanda pelo
# bundle de entrada, então é dele que sai a lista.
if [ "$#" -gt 0 ]; then
    echo
    echo "── Textos procurados nos bundles servidos ───────────────"
    CHUNKS=$(grep -oE '"\./[A-Za-z0-9_.-]+\.js"' "$TMP/index.js" | tr -d '"' | sed 's|\./||' | sort -u)
    for c in $CHUNKS; do curl -s "$DOMINIO/assets/$c" >> "$TMP/todos.js"; done
    cat "$TMP/index.js" >> "$TMP/todos.js"
    FALTOU=0
    for texto in "$@"; do
        if grep -qF "$texto" "$TMP/todos.js"; then
            echo "   ✅ \"$texto\""
        else
            echo "   ❌ \"$texto\" — NÃO está no que o domínio serve"
            FALTOU=1
        fi
    done
    [ "$FALTOU" -eq 1 ] && { echo; echo "❌ Falta código no ar."; exit 1; }
fi

echo
if [ "$SERVIDO" = "$ESPERADO" ]; then
    echo "═══════════════════════════════════════════════════════════"
    echo "✅ O domínio serve exatamente origin/main (${SERVIDO:0:7})."
    exit 0
fi

ATRAS=$(git rev-list --count "$SERVIDO..$ESPERADO" 2>/dev/null || echo '?')
echo "❌ O domínio NÃO serve origin/main."
echo "   no ar:      ${SERVIDO:0:7}  $(git log -1 --format=%s "$SERVIDO" 2>/dev/null || echo '(commit desconhecido aqui — rode git fetch)')"
echo "   origin/main:${ESPERADO:0:7}  $(git log -1 --format=%s "$ESPERADO")"
echo "   faltam $ATRAS commit(s) no ar."
exit 1
