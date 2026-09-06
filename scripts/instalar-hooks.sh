#!/usr/bin/env bash
#
# instalar-hooks.sh — liga os hooks versionados de `.githooks/`.
#
# `.git/hooks/` não é versionado: hook que mora lá some no próximo clone e
# nunca chega a quem não sabia que ele existia — que é justamente quem a trava
# deveria proteger. `core.hooksPath` resolve isso apontando para uma pasta que
# ESTÁ no repositório.
#
# O caminho é relativo de propósito. Assim cada worktree usa o `.githooks/` da
# própria árvore, e uma frente antiga (criada antes desta trava) simplesmente
# não tem hook — não quebra, só não protege, e passa a proteger no primeiro
# rebase em origin/main.
#
# `core.hooksPath` vive em `.git/config`, que é COMUM a todas as worktrees:
# rodar isto uma vez vale para o repositório inteiro, presentes e futuras.
#
#   bash scripts/instalar-hooks.sh

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

git config core.hooksPath .githooks || { echo "❌ não consegui gravar core.hooksPath"; exit 1; }

# No Windows o bit de execução vem do índice do git, não do sistema de
# arquivos. Sem isto o hook existe e nunca roda — falha silenciosa, que é o
# pior tipo para uma trava.
for h in .githooks/*; do
    [ -f "$h" ] || continue
    chmod +x "$h" 2>/dev/null
    git update-index --chmod=+x "$h" 2>/dev/null
done

echo "✅ hooks ligados: $(git config core.hooksPath)"
echo "   $(ls .githooks | tr '\n' ' ')"
echo
echo "   Conferir que roda de verdade (deve RECUSAR no checkout de integração):"
echo "     cd /c/D/ORÇACLOUD/orçacloud-saas && git commit --allow-empty -m teste"
