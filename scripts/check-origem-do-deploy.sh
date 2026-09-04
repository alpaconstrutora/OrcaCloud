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

# Recuperação deliberada: quem passou BUILD_COMMIT sabe o que está fazendo, e o
# bundle sai carimbado — dá para provar depois o que subiu.
if [ -n "${BUILD_COMMIT:-}" ]; then
    echo "✅ origem do deploy: BUILD_COMMIT explícito (${BUILD_COMMIT:0:7}) — recuperação deliberada"
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
exit 0
