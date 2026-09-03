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
    npx vitest run --silent    || recusa "Teste falhando."
    echo "   ✅ tipos, XSS e testes"
fi

# ── 3. Build, e o nome que ele gerou ────────────────────────────────────────
# `dist/` é apagado antes: builds antigos se acumulam ali, e um bundle velho
# faria a conferência do passo 5 comparar contra a coisa errada.
passo "3/5 · Build"
rm -rf dist
npx vite build > /dev/null 2>&1 || recusa "Build falhou."

BUNDLE_LOCAL=$(grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
[ -z "$BUNDLE_LOCAL" ] && recusa "Não achei o bundle em dist/index.html."
echo "   ✅ gerou $BUNDLE_LOCAL"

# ── 4. Publicar e assumir o domínio ─────────────────────────────────────────
passo "4/5 · Publicando"
SAIDA=$(npx vercel deploy --prod --yes --scope "$ESCOPO" 2>&1)
URL=$(echo "$SAIDA" | grep -oE 'https://orcacloud-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | tail -1)
[ -z "$URL" ] && { echo "$SAIDA" | tail -5; recusa "Deploy não devolveu URL."; }
echo "   deploy: $URL"

# `deploy --prod` NÃO assume o domínio se houve rollback antes. Promover sempre é
# idempotente e barato; descobrir que faltou é caro — foi o que aconteceu em 02/09.
npx vercel promote "$URL" --scope "$ESCOPO" --yes > /dev/null 2>&1 \
    && echo "   promovido ao domínio" \
    || echo "   ⚠️  promote não confirmou — o passo 5 dirá se importou"

# ── 5. A prova: o que o domínio ESTÁ servindo ───────────────────────────────
passo "5/5 · Conferindo o que o site entrega"
for TENTATIVA in 1 2 3 4 5 6; do
    SERVIDO=$(curl -s "$DOMINIO/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
    if [ "$SERVIDO" = "$BUNDLE_LOCAL" ]; then
        echo "   ✅ o site serve $SERVIDO — igual ao build"
        echo
        echo "═══════════════════════════════════════════════════════════"
        echo "✅ Publicado e conferido · $(git rev-parse --short HEAD) · $DOMINIO"
        exit 0
    fi
    echo "   tentativa $TENTATIVA: site ainda em ${SERVIDO:-?} (esperado $BUNDLE_LOCAL)"
    [ "$TENTATIVA" -lt 6 ] && sleep 10
done

recusa "O deploy foi feito, mas o domínio continua servindo outro pacote.
   Quase sempre é o domínio preso numa versão revertida. Rode à mão:
     npx vercel promote $URL --scope $ESCOPO
   E confira de novo com:
     curl -s $DOMINIO/ | grep -oE '/assets/index-[^\"]+\.js'"
