#!/usr/bin/env bash
#
# fechar-frente.sh — remove o diretório de uma frente SEM levar junto o
# `node_modules` do repositório real.
#
# ── Por que este script existe, e não um `git worktree remove` ──────────────
# `git worktree remove --force` DESCE por junção do Windows e apaga o conteúdo
# do ALVO. Aconteceu duas vezes em 2026-08-23: o `node_modules/.bin` do
# repositório inteiro sumiu (`npx vitest` deixou de existir) e pacotes foram
# levados junto. `npm install` restaura, mas são minutos e um susto.
#
# `rmdir` do Git Bash NÃO apaga junção — falha em silêncio, e foi essa falha
# silenciosa que deixou a junção no lugar nas duas vezes. Só
# `(Get-Item ...).Delete()` do PowerShell remove a junção sem seguir o alvo.
#
# Frentes criadas pelo `nova-frente.sh` têm `node_modules` de verdade, não
# junção — então o perigo não se aplica a elas. Este script trata os dois casos
# porque as worktrees ANTIGAS, de julho, foram feitas com junção.
#
# ── Uso ─────────────────────────────────────────────────────────────────────
#   bash scripts/fechar-frente.sh planta-3d          # frente criada aqui
#   bash scripts/fechar-frente.sh /c/tmp/orcacloud-x # worktree por caminho
#   bash scripts/fechar-frente.sh planta-3d --sem-publicar  # descartar sem ter publicado

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RAIZ="$(pwd)"
ALVO_ARG="${1:-}"

erro() { echo; echo "❌ $1"; exit 1; }

[ -z "$ALVO_ARG" ] && erro "Falta o nome da frente ou o caminho da worktree.
   Uso: bash scripts/fechar-frente.sh <nome|caminho>"

case "$ALVO_ARG" in
    /*) ALVO="$ALVO_ARG" ;;
    *)  ALVO="/c/D/frentes/$ALVO_ARG" ;;
esac

# `grep -q` no fim de um pipe fecha a entrada cedo e o git morre com SIGPIPE,
# imprimindo "Aborted" no meio da saída. Guardar a lista numa variável antes
# evita isso — e a saída deste script precisa ser legível, porque é ela que diz
# se o node_modules sobreviveu.
LISTA=$(git worktree list --porcelain 2>/dev/null)
case "$LISTA" in
    *"$(echo "$ALVO" | sed 's|^/c/|C:/|')"*) ;;
    *) echo "   ⚠️  '$ALVO' não aparece em git worktree list — seguindo assim mesmo (pode ser órfã)" ;;
esac

# ── 0. O trabalho chegou em produção? ──────────────────────────────────────
# Em 06/09/2026 uma sessão isolou o commit numa branch, empurrou a branch, não
# abriu PR, não avisou ninguém — e considerou entregue. A correção ficou fora do
# ar até alguém, por acaso, perguntar pelo estado do repositório. Branch sem
# dono avisado não é entrega, é limbo.
#
# Fechar a frente é o gesto de "terminei". Se a branch não está contida em
# `origin/main`, terminado ela não está: neste projeto publicar É empurrar para
# main. Este é o último instante em que dá para dizer isso a quem ainda tem o
# contexto na cabeça.
#
# `--sem-publicar` existe para o caso legítimo — abandonar uma frente
# explorátoria — e obriga a dizer isso em voz alta, em vez de o script decidir
# por conta própria que "provavelmente foi de propósito".
SEM_PUBLICAR=0
[ "${2:-}" = "--sem-publicar" ] && SEM_PUBLICAR=1

BRANCH_DA_FRENTE=$(git -C "$ALVO" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')

if [ "$SEM_PUBLICAR" -eq 0 ] && [ -n "$BRANCH_DA_FRENTE" ] && [ "$BRANCH_DA_FRENTE" != "HEAD" ]; then
    git fetch -q origin 2>/dev/null
    if ! git merge-base --is-ancestor "$BRANCH_DA_FRENTE" origin/main 2>/dev/null; then
        FALTAM=$(git rev-list --count "origin/main..$BRANCH_DA_FRENTE" 2>/dev/null || echo '?')
        erro "A branch '$BRANCH_DA_FRENTE' NÃO está em origin/main — $FALTAM commit(s) fora do ar.

   Publicar neste projeto é empurrar para main; o Vercel compila sozinho:
     cd \"$ALVO\" && git fetch origin && git rebase origin/main && git push origin HEAD:main

   Empurrar só a branch NÃO publica nada — foi o limbo de 06/09/2026.

   Se a frente é para ser descartada mesmo, diga isso:
     bash scripts/fechar-frente.sh $ALVO_ARG --sem-publicar"
    fi
    echo "   ✅ '$BRANCH_DA_FRENTE' está contida em origin/main — publicado"
fi

# ── 1. Contar o node_modules do repositório real ANTES ─────────────────────
# É a testemunha. Se este número cair, a junção levou o alvo junto — e é melhor
# descobrir agora, com o número na tela, do que daqui a uma hora com `npx` sumido.
ANTES=$(ls "$RAIZ/node_modules/.bin" 2>/dev/null | wc -l)
echo "── node_modules do repositório real: $ANTES executáveis em .bin ──"

# ── 2. A junção sai primeiro, pelo PowerShell ──────────────────────────────
if [ -e "$ALVO/node_modules" ]; then
    CAMINHO_WIN=$(echo "$ALVO/node_modules" | sed 's|^/c/|C:\\|; s|/|\\|g')
    EH_JUNCAO=$(powershell -NoProfile -Command \
        "if ((Get-Item -LiteralPath '$CAMINHO_WIN' -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { 'sim' } else { 'nao' }" \
        2>/dev/null | tr -d '\r\n ')

    if [ "$EH_JUNCAO" = "sim" ]; then
        echo "   junção detectada — removendo pelo PowerShell (rmdir do bash falha em silêncio)"
        powershell -NoProfile -Command "(Get-Item -LiteralPath '$CAMINHO_WIN' -Force).Delete()" \
            || erro "Não consegui remover a junção. NÃO prossiga com git worktree remove."
        echo "   ✅ junção removida"
    else
        echo "   node_modules é pasta de verdade — sem perigo de travessia"
    fi
fi

# ── 3. Só agora a worktree ──────────────────────────────────────────────────
git worktree remove --force "$ALVO" 2>/dev/null \
    || { echo "   git worktree remove não deu conta; apagando a pasta"; rm -rf "$ALVO"; }
git worktree prune
echo "   ✅ worktree removida"

# ── 4. A testemunha ─────────────────────────────────────────────────────────
DEPOIS=$(ls "$RAIZ/node_modules/.bin" 2>/dev/null | wc -l)
echo
if [ "$DEPOIS" -lt "$ANTES" ]; then
    erro "O node_modules do repositório ENCOLHEU: $ANTES → $DEPOIS.
   A junção levou o alvo junto. Rode: npm install"
fi
echo "═══════════════════════════════════════════════════════════"
echo "✅ Fechada. node_modules do repositório intacto ($DEPOIS executáveis)."
