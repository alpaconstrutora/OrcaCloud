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
