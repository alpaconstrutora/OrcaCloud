#!/usr/bin/env bash
#
# nova-frente.sh — cria um diretório de trabalho ISOLADO para uma frente.
#
# ── O problema que isto resolve ─────────────────────────────────────────────
# Em 02–03/09/2026 três sessões trabalhavam no MESMO diretório
# (`C:\D\ORÇACLOUD\orçacloud-saas`). O resultado, tudo observado:
#
#   • `HEAD` mudava embaixo de quem estava trabalhando — uma sessão encontrava a
#     branch trocada por outra, sem aviso;
#   • `git status` vinha sujo com arquivo de terceiro, e não dava para saber de
#     quem era sem arqueologia;
#   • árvore suja impede `rebase` e `merge`, então cada frente contornava de um
#     jeito diferente;
#   • o mesmo trabalho aparecia commitado duas vezes, com hashes diferentes, em
#     branches paralelas;
#   • uma publicação subiu uma branch 59 commits atrás de `main` e tirou
#     funcionalidades do ar.
#
# Nenhum desses é bug de código. Todos são consequência de compartilhar uma
# árvore de trabalho. A correção é uma árvore por frente.
#
# ── Por que `npm install` de verdade, e não junção ──────────────────────────
# O atalho conhecido é ligar `node_modules` por junção do Windows. Ele tem dois
# defeitos documentados em memória, ambos já custaram tempo aqui:
#
#   1. `git worktree remove --force` DESCE pela junção e apaga o alvo — o
#      `node_modules` do repositório real, duas vezes em 2026-08-23;
#   2. `vitest` não roda com `node_modules` por junção: resolve o próprio pacote
#      por outro realpath e perde o runner. Em 2026-09-02, 121 arquivos falharam
#      idênticos em 10 s enquanto a mesma suíte passava no repositório real.
#
# Instalação própria custa ~810 MB por frente e elimina os dois. Numa máquina de
# desenvolvimento é troca boa: disco é barato, e ninguém depura um falso
# negativo de suíte de graça.
#
# ── Uso ─────────────────────────────────────────────────────────────────────
#   bash scripts/nova-frente.sh planta-3d
#     → cria C:/D/frentes/planta-3d na branch feat/planta-3d, a partir de
#       origin/main, com node_modules próprio.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASE="/c/D/frentes"
NOME="${1:-}"

erro() { echo; echo "❌ $1"; exit 1; }

[ -z "$NOME" ] && erro "Falta o nome da frente.
   Uso: bash scripts/nova-frente.sh <nome-curto>
   Exemplo: bash scripts/nova-frente.sh planta-3d"

case "$NOME" in
    *[!a-z0-9-]*) erro "Use só minúsculas, números e hífen — o nome vira pasta e branch." ;;
esac

DESTINO="$BASE/$NOME"
BRANCH="feat/$NOME"

[ -e "$DESTINO" ] && erro "$DESTINO já existe."
git show-ref --verify --quiet "refs/heads/$BRANCH" && erro "A branch $BRANCH já existe.
   Se é para retomá-la: git worktree add \"$DESTINO\" $BRANCH"

echo "── Criando a frente '$NOME' ────────────────────────────────"
git fetch -q origin || erro "Não consegui buscar do remoto."

# Sempre a partir de origin/main, nunca do estado local: o local pode estar
# atrás, à frente, ou com trabalho de outra frente no meio. Foi partir de um
# ponto errado que gerou a branch 59 commits atrás.
mkdir -p "$BASE"
git worktree add -b "$BRANCH" "$DESTINO" origin/main || erro "git worktree add falhou."
echo "   ✅ $DESTINO  (branch $BRANCH, a partir de origin/main)"

echo
echo "── Instalando dependências (alguns minutos) ─────────────────"
( cd "$DESTINO" && npm ci --silent ) || {
    echo "   ⚠️  npm ci falhou; tentando npm install"
    ( cd "$DESTINO" && npm install --silent ) || erro "Não consegui instalar as dependências em $DESTINO."
}

# Auto-cura: `core.hooksPath` é comum a todas as worktrees, então basta uma vez
# — mas "basta uma vez" é a premissa que falha quando alguém clona de novo ou
# desliga a config sem contar. Custa 20 ms religar aqui.
( cd "$DESTINO" && bash scripts/instalar-hooks.sh > /dev/null 2>&1 ) \
    && echo "   ✅ hooks da REGRA #8 ligados" \
    || echo "   ⚠️  não consegui ligar os hooks (rode: bash scripts/instalar-hooks.sh)"

# O `.env` não é versionado e o app não sobe sem ele.
if [ -f .env ] && [ ! -f "$DESTINO/.env" ]; then
    cp .env "$DESTINO/.env"
    echo "   ✅ .env copiado"
fi

echo
echo "═══════════════════════════════════════════════════════════"
echo "✅ Frente '$NOME' pronta e isolada."
echo
echo "   cd \"$DESTINO\""
echo
echo "   Publicar é empurrar para main — não há comando de deploy:"
echo "     git push origin HEAD:main"
echo
echo "   Ao terminar:  bash scripts/fechar-frente.sh $NOME"
