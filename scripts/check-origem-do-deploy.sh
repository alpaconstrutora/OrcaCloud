#!/usr/bin/env bash
#
# check-origem-do-deploy.sh — recusa build de PRODUÇÃO que não veio de um push.
#
# ── O incidente que isto resolve ────────────────────────────────────────────
# 04/09/2026: um commit foi para `main`, o build do GitHub publicou, e a prova
# do domínio passou (o SHA estava no bundle). ~40 min depois a funcionalidade
# tinha sumido do ar. Não foi rollback nem bug: **quatro `vercel deploy --prod`
# por CLI em 21 minutos**, de outra pasta de trabalho, atrasada. Publicar por
# CLI não soma ao que está no ar — substitui.
#
# A assinatura do estrago era visível no próprio bundle servido:
#
#     window.__BUILD_COMMIT__=""
#
# Vazio. Build do GitHub carimba `VERCEL_GIT_COMMIT_SHA`; build de CLI daquela
# forma não carimbou nada. É esse buraco que este script fecha.
#
# ── A regra ─────────────────────────────────────────────────────────────────
# Em `VERCEL_ENV=production`, o build só passa se vier de UMA destas origens:
#
#   1. push/redeploy pelo Git — tem `VERCEL_GIT_COMMIT_SHA` e o ref é `main`;
#   2. recuperação deliberada — `BUILD_COMMIT` passado à mão
#      (`vercel deploy --prod --build-env BUILD_COMMIT=$(git rev-parse HEAD)`),
#      que é o caminho do `scripts/publicar-producao.sh`.
#
# Fora do Vercel (build local, `npm run build`) e em preview, não opina.
#
# ── O que ele NÃO cobre (diga em voz alta, não confie demais) ───────────────
# Se alguém rodar `vercel deploy --prod` de uma pasta na branch `main` porém
# ATRASADA, e a CLI anexar a metadata de git dessa pasta, o ref será `main` e o
# build passa — publicando código velho. Conferir isso exigiria perguntar ao
# GitHub qual é o `main` de agora, e o build não tem token para um repositório
# privado. Para esse caso a defesa é a de fora: `scripts/conferir-producao.sh`,
# que compara o que o domínio ENTREGA com `origin/main` — detecção, já que a
# prevenção não alcança.

set -uo pipefail

# Não é build do Vercel: não é assunto deste script.
[ "${VERCEL:-}" = "1" ] || exit 0
[ "${VERCEL_ENV:-}" = "production" ] || exit 0

recusa() {
    echo
    echo "❌ Build de PRODUÇÃO recusado: $1"
    echo
    echo "   Publicar neste projeto é empurrar para main — o Vercel compila sozinho:"
    echo "     git push origin HEAD:main"
    echo
    echo "   Se isto é uma recuperação deliberada (o domínio ficou servindo build"
    echo "   errado), passe o commit à mão, para o bundle sair carimbado:"
    echo "     vercel deploy --prod --build-env BUILD_COMMIT=\$(git rev-parse HEAD)"
    echo
    echo "   Ver REGRA OBRIGATÓRIA #8 no CLAUDE.md."
    exit 1
}

# ── É o TOPO de main? ──────────────────────────────────────────────────────
# O buraco que o cabeçalho deste arquivo admitia em voz alta: `vercel deploy
# --prod` de uma pasta na branch `main` porém ATRASADA carrega a metadata do
# git, o ref é "main", o SHA existe — e o build passava, publicando código
# velho. Foi assim em 02/09/2026 (branch 59 commits atrás tirou do ar
# quantitativo em planilha, edição de pedido em abas e condomínios no Portal do
# Cliente) e quase de novo em 06/09, de uma árvore 151 commits atrás.
#
# O cabeçalho dizia que conferir exigiria "perguntar ao GitHub qual é o main de
# agora, e o build não tem token para um repositório privado". Tem, se lhe
# derem um: `GITHUB_READ_TOKEN` (fine-grained, só Contents:Read) nas Environment
# Variables do projeto no Vercel. Com ele, publicar árvore atrasada deixa de ser
# DETECTÁVEL e passa a ser IMPOSSÍVEL.
#
# ⚠️ A corrida é conhecida e a escolha é deliberada: se OUTRA sessão empurrar nos
# segundos entre o push e o início deste build, o topo já terá andado e ESTE
# build é recusado, mesmo sendo legítimo. Está certo assim — ele já nasceu
# obsoleto, e o build do push que o ultrapassou publica a versão mais nova. A
# falha se cura sozinha; o domínio nunca fica com código mais velho por causa
# dela. Não troque isto por "aceita se for ancestral do topo": o incidente de
# 02/09 era exatamente um ancestral do topo (59 commits atrás), e a regra
# frouxa deixaria passar de novo.
#
# ⚠️ Sem o token esta verificação não roda — avisa e deixa passar. Não é
# descuido: uma trava que derruba TODO build de produção no dia em que o token
# expira é uma trava que alguém arranca na primeira urgência, e aí não sobra
# nem a proteção antiga. O aviso abaixo aparece no log do build, e a rede de
# fora (`.github/workflows/conferir-producao.yml`) continua comparando o que o
# domínio serve com origin/main.
confirma_topo_de_main() {
    local candidato="$1" origem="$2"

    if [ -z "${GITHUB_READ_TOKEN:-}" ]; then
        echo "⚠️  GITHUB_READ_TOKEN ausente — não dá para confirmar que este é o topo de main."
        echo "   A trava contra publicar árvore atrasada está INERTE. Ver REGRA #8 no CLAUDE.md."
        return 0
    fi

    local repo="${VERCEL_GIT_REPO_OWNER:-alpaconstrutora}/${VERCEL_GIT_REPO_SLUG:-OrcaCloud}"
    local topo
    topo=$(curl -sf --max-time 20 \
             -H "Authorization: Bearer $GITHUB_READ_TOKEN" \
             -H "Accept: application/vnd.github+json" \
             "https://api.github.com/repos/$repo/commits/main" \
           | grep -oE '"sha"[[:space:]]*:[[:space:]]*"[0-9a-f]{40}"' | head -1 \
           | grep -oE '[0-9a-f]{40}')

    # Rede fora, API fora, token sem permissão: mesma escolha de cima.
    if [ -z "$topo" ]; then
        echo "⚠️  não consegui ler o topo de main na API do GitHub — verificação pulada."
        return 0
    fi

    if [ "$candidato" != "$topo" ]; then
        recusa "este build NÃO é o topo de main.
   origem:    $origem
   compilando: ${candidato:0:7}
   topo main:  ${topo:0:7}

   Publicar isto substituiria o que está no ar por código mais velho — não soma,
   troca. Se o domínio está servindo build errado, o caminho é promover de novo
   pelo Vercel (\`vercel promote\`), que não passa por build; se é código novo,
   empurre para main e deixe o push compilar."
    fi

    echo "   ✅ é o topo de main (${topo:0:7})"
}

# Recuperação deliberada: quem passou BUILD_COMMIT sabe o que está fazendo, e o
# bundle sai carimbado — dá para provar depois o que subiu. Mas "deliberada" não
# dispensa ser o topo: recuperação é republicar main, não publicar um commit
# antigo à mão.
if [ -n "${BUILD_COMMIT:-}" ]; then
    echo "✅ origem do deploy: BUILD_COMMIT explícito (${BUILD_COMMIT:0:7}) — recuperação deliberada"
    confirma_topo_de_main "$BUILD_COMMIT" "BUILD_COMMIT explícito (CLI)"
    exit 0
fi

[ -z "${VERCEL_GIT_COMMIT_SHA:-}" ] && recusa "veio da CLI, sem commit associado.
   O bundle sairia com __BUILD_COMMIT__=\"\" e ninguém conseguiria dizer depois
   qual código está no ar. Foi exatamente assim que o rastreamento logístico
   saiu do ar em 04/09/2026."

# Ref vazio com SHA presente: é build de Git com metadata incompleta. Deixa
# passar de propósito — a proteção que importa (ter commit associado) já valeu, e
# recusar aqui quebraria TODO deploy caso o Vercel mude o nome dessa variável.
# Trava de build que erra para o lado de bloquear é trava que alguém arranca.
REF="${VERCEL_GIT_COMMIT_REF:-}"
if [ -n "$REF" ] && [ "$REF" != "main" ]; then
    recusa "produção a partir do ref '$REF', não de 'main'.
   Branch que não é main vira PREVIEW, nunca produção."
fi

echo "✅ origem do deploy: push em main (${VERCEL_GIT_COMMIT_SHA:0:7})"
confirma_topo_de_main "$VERCEL_GIT_COMMIT_SHA" "metadata de git do build"
exit 0
