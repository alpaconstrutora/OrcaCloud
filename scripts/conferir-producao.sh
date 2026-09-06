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
# ver a marca da própria tela. Os chunks são carregados sob demanda, então é
# preciso ir atrás deles.
#
# ⚠️ Três armadilhas, todas encontradas em 06/09/2026 procurando código que
# ESTAVA no ar e o script jurava não estar:
#
#  1. O índice cita chunk de duas formas — `"./x.js"` e `"assets/x.js"`. Pegar
#     só a primeira deixava metade de fora.
#  2. Chunk citado só por OUTRO chunk não aparecia em lista nenhuma. O serviço
#     de conciliação vive num desses.
#  3. `curl -s` de chunk inexistente devolve a página de 404 com status 200 do
#     ponto de vista do shell, e o texto do 404 entra no arquivo de busca como
#     se fosse código. Aí "não achei" vira o veredito, quando a verdade é "não
#     consegui baixar" — e as duas coisas exigem reações opostas.
#
# A 3 acontece de rotina: se outra publicação entra no ar entre o download do
# índice e o dos chunks, os hashes mudam e os chunks do índice velho somem.
if [ "$#" -gt 0 ]; then
    echo
    echo "── Textos procurados nos bundles servidos ───────────────"
    cp "$TMP/index.js" "$TMP/todos.js"
    BAIXADOS=" "
    FALHAS=0
    # O filtro `Nome-HASH8.js` é o que separa chunk de verdade de qualquer outro
    # ".js" que apareça no código — "sw.js", "registerSW.js", até a palavra
    # "Node.js" numa string. Todos dariam 404 sob /assets/ e virariam alarme falso.
    FILA=$(grep -ohE '"(\./)?(assets/)?[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js"' "$TMP/index.js" | tr -d '"' | sed 's|^\./||;s|^assets/||' | sort -u)
    for _nivel in 1 2; do
        PROXIMA=""
        for c in $FILA; do
            case "$BAIXADOS" in *" $c "*) continue;; esac
            BAIXADOS="$BAIXADOS$c "
            if curl -sf "$DOMINIO/assets/$c" -o "$TMP/chunk.js"; then
                cat "$TMP/chunk.js" >> "$TMP/todos.js"
                PROXIMA="$PROXIMA $(grep -ohE '"(\./)?(assets/)?[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8}\.js"' "$TMP/chunk.js" | tr -d '"' | sed 's|^\./||;s|^assets/||')"
            else
                FALHAS=$((FALHAS + 1))
            fi
        done
        FILA=$(printf '%s
' $PROXIMA | sort -u)
    done

    if [ "$FALHAS" -gt 0 ]; then
        echo "   ⚠️  $FALHAS chunk(s) do índice não baixaram (404)."
        echo "      Quase sempre é publicação nova entrando no ar durante a conferência:"
        echo "      o índice que baixamos ficou velho e os hashes trocaram. Rode de novo."
        echo
        echo "❌ Não dá para afirmar nada sobre os textos com chunk faltando."
        exit 1
    fi

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
