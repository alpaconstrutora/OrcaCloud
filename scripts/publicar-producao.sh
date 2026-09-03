#!/usr/bin/env bash
#
# publicar-producao.sh — publica o site e PROVA que o site passou a servir isso.
#
# ── Por que este script existe ──────────────────────────────────────────────
# Em 02/09/2026 produção quebrou por um `vercel deploy --prod` rodado à mão. Não
# foi descuido pontual: foram quatro armadilhas, e o comando cru não protege de
# nenhuma delas.
#
#   1. **Publicou uma branch atrasada.** A branch estava 59 commits atrás de
#      `main`. Publicar não somou o trabalho da outra frente — substituiu. Saíram
#      do ar quantitativo em planilha, editar pedido em abas, condomínios no
#      Portal do Cliente.
#   2. **`--scope` faltando.** Sem ele, `rollback` e `promote` falham com
#      "Deployment belongs to a different team", mensagem que não descreve o
#      problema e manda quem lê investigar a coisa errada.
#   3. **Depois de um rollback, publicar não basta.** O domínio fica preso na
#      versão revertida. O deploy novo aparece "Ready / Production" no painel e o
#      site continua servindo o pacote velho, até um `promote`.
#   4. **O painel não é prova.** Foi ele que disse "Ready" enquanto o site
#      entregava outra coisa. A única prova é baixar o arquivo que o site serve.
#
# O passo 5 aqui é o que nenhum comando do Vercel faz: compara o nome do bundle
# que o build gerou com o que o domínio está entregando. Enquanto não baterem, a
# publicação não terminou.
#
# ── Uso ─────────────────────────────────────────────────────────────────────
#   bash scripts/publicar-producao.sh              # publica de main
#   bash scripts/publicar-producao.sh --sem-testes # pula a suíte (emergência)
#
# Exit: 0 publicado e conferido · 1 recusado ou falhou

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ESCOPO="altairs-projects-aa74deda"
DOMINIO="https://orcacloud.vercel.app"
BRANCH_DE_PRODUCAO="main"
PULAR_TESTES=0
[ "${1:-}" = "--sem-testes" ] && PULAR_TESTES=1

recusa() { echo; echo "❌ $1"; echo "   Nada foi publicado."; exit 1; }
passo()  { echo; echo "── $1 ────────────────────────────────────────────"; }

# ── 1. O que está prestes a ir ao ar é o que você acha que é? ───────────────
passo "1/5 · Estado do repositório"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   branch: $BRANCH"

[ -n "$(git status --porcelain)" ] && recusa "Árvore suja. Publica-se um commit, não um rascunho — e o
   que está solto aqui pode ser de outra frente."

[ "$BRANCH" != "$BRANCH_DE_PRODUCAO" ] && recusa "Você está em '$BRANCH', não em '$BRANCH_DE_PRODUCAO'.
   Foi assim que produção caiu em 02/09: uma branch atrasada substituiu o que
   estava no ar. Se é intencional, funda '$BRANCH_DE_PRODUCAO' aqui antes:
     git merge origin/$BRANCH_DE_PRODUCAO"

git fetch -q origin 2>/dev/null

ATRAS=$(git rev-list --count "HEAD..origin/$BRANCH_DE_PRODUCAO" 2>/dev/null || echo 0)
[ "$ATRAS" -gt 0 ] && recusa "Faltam $ATRAS commit(s) de origin/$BRANCH_DE_PRODUCAO aqui.
   Publicar agora apagaria do ar o que eles trazem. Rode: git pull --ff-only"

FRENTE=$(git rev-list --count "origin/$BRANCH_DE_PRODUCAO..HEAD" 2>/dev/null || echo 0)
[ "$FRENTE" -gt 0 ] && recusa "$FRENTE commit(s) locais ainda não empurrados.
   Publicar código que não está no remoto deixa produção sem histórico
   correspondente — ninguém consegue reproduzir depois. Rode: git push"

echo "   ✅ limpa, em $BRANCH_DE_PRODUCAO, idêntica ao remoto ($(git rev-parse --short HEAD))"

# ── 2. Verificações ─────────────────────────────────────────────────────────
passo "2/5 · Verificações"
if [ "$PULAR_TESTES" -eq 1 ]; then
    echo "   ⏭️  puladas (--sem-testes)"
else
    npx tsc --noEmit           || recusa "Erro de tipagem."
    bash scripts/check-xss-sinks.sh > /dev/null || recusa "Sink de HTML sem sanitizeHtml()."

    # A saída da suíte vai para arquivo e só aparece se algo falhar. O jsdom
    # emite ~230 linhas de "Not implemented: HTMLCanvasElement.getContext" a cada
    # execução; num log de publicação isso soterra o que importa, e log ilegível
    # é log que ninguém lê na hora em que precisa.
    LOG_TESTES=$(mktemp)
    if ! npx vitest run --silent > "$LOG_TESTES" 2>&1; then
        grep -vE "Not implemented: HTMLCanvasElement" "$LOG_TESTES" | tail -30
        rm -f "$LOG_TESTES"
        recusa "Teste falhando."
    fi
    grep -E "Tests +[0-9]" "$LOG_TESTES" | tail -1
    rm -f "$LOG_TESTES"
    echo "   ✅ tipos, XSS e testes"
fi

# ── 3. Build local (só para falhar cedo) ────────────────────────────────────
# O Vercel recompila do lado dele; este build não é o que vai ao ar. Serve para
# um erro de build aparecer aqui, em segundos, e não depois de subir.
#
# `dist/` é apagado antes porque builds antigos se acumulam e confundem quem for
# inspecionar o resultado à mão.
passo "3/5 · Build local (validação)"
rm -rf dist
npx vite build > /dev/null 2>&1 || recusa "Build falhou."
echo "   ✅ compila"

SHA=$(git rev-parse HEAD)

# ── 4. O push já publicou? ──────────────────────────────────────────────────
# O projeto TEM integração com o GitHub: push em `main` dispara build de produção
# sozinho. Descobri isso tarde — o `.vercel/project.json` local não carrega essa
# configuração, e eu tinha concluído "git não ligado" a partir dele. Enquanto isso
# o script fazia `vercel deploy` depois de cada push, criando um SEGUNDO build do
# mesmo commit.
#
# Então: espera o build do push. Só se ele não vier é que o CLI entra — o que
# cobre build do git falhando, integração desligada, ou republicação sem commit
# novo.
passo "4/5 · Aguardando o build disparado pelo push"
JA_ESTA=0
for TENTATIVA in 1 2 3 4 5 6 7 8; do
    ENTRY=$(curl -s -H 'Cache-Control: no-cache' "$DOMINIO/" \
            | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
    if [ -n "$ENTRY" ] && curl -s "$DOMINIO$ENTRY" | grep -q "$SHA"; then
        echo "   ✅ o push já publicou — sem deploy pelo CLI"
        JA_ESTA=1
        break
    fi
    echo "   ainda não ($TENTATIVA/8)"
    [ "$TENTATIVA" -lt 8 ] && sleep 20
done

if [ "$JA_ESTA" -eq 1 ]; then
    echo
    echo "═══════════════════════════════════════════════════════════"
    echo "✅ Publicado e conferido · $(git rev-parse --short HEAD) · $DOMINIO"
    exit 0
fi

echo "   build do push não chegou — publicando pelo CLI"

# `--build-env BUILD_COMMIT` é o que torna o passo 5 possível: sem git ligado, o
# Vercel não sabe de qual commit está compilando, e o bundle sairia sem carimbo.
SAIDA=$(npx vercel deploy --prod --yes --scope "$ESCOPO" --build-env BUILD_COMMIT="$SHA" 2>&1)
URL=$(echo "$SAIDA" | grep -oE 'https://orcacloud-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | tail -1)
[ -z "$URL" ] && { echo "$SAIDA" | tail -5; recusa "Deploy não devolveu URL."; }
echo "   deploy: $URL"

# `deploy --prod` NÃO assume o domínio quando houve rollback antes: o alias fica
# preso na versão promovida. `promote` desfaz isso e é idempotente — responde 409
# quando já é o atual, o que não é erro. Se nem assim andar, `alias set` força.
npx vercel promote "$URL" --scope "$ESCOPO" --yes > /dev/null 2>&1 \
    && echo "   promovido" || echo "   promote não mudou nada (normal se já era o atual)"
npx vercel alias set "$URL" "${DOMINIO#https://}" --scope "$ESCOPO" > /dev/null 2>&1 \
    && echo "   domínio apontado"

# ── 5. A prova: o commit que o site ESTÁ servindo ───────────────────────────
# NÃO se compara o nome do bundle local com o do site. O Vercel compila na
# infraestrutura dele, com as dependências dele: os dois arquivos têm o mesmo
# tamanho e conteúdo equivalente, mas hashes diferentes. A primeira versão deste
# script fazia essa comparação e acusou falha numa publicação correta.
#
# O que vale é o carimbo: baixar o que o domínio entrega e achar o SHA lá dentro.
passo "5/5 · Conferindo o commit que o site entrega"
for TENTATIVA in 1 2 3 4 5 6; do
    ENTRY=$(curl -s -H 'Cache-Control: no-cache' "$DOMINIO/" \
            | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
    if [ -n "$ENTRY" ] && curl -s "$DOMINIO$ENTRY" | grep -q "$SHA"; then
        echo "   ✅ o site serve o commit ${SHA:0:12} (em $ENTRY)"
        echo
        echo "═══════════════════════════════════════════════════════════"
        echo "✅ Publicado e conferido · $(git rev-parse --short HEAD) · $DOMINIO"
        exit 0
    fi
    echo "   tentativa $TENTATIVA: ainda não achei o carimbo em ${ENTRY:-?}"
    [ "$TENTATIVA" -lt 6 ] && sleep 15
done

recusa "O deploy foi feito, mas o domínio não entrega este commit.
   Duas causas prováveis, nesta ordem:
     • alias preso numa versão anterior:
         npx vercel alias set $URL ${DOMINIO#https://} --scope $ESCOPO
     • cache de borda ainda quente — reconfira em um minuto:
         curl -s $DOMINIO/ | grep -oE '/assets/index-[^\"]+\.js'"
