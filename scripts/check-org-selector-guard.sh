#!/usr/bin/env bash
# Trava: o seletor de organização do TOPO da página é a autoridade sobre qual
# organização o sistema usa — e "Todas as organizações" nunca esconde leitura.
#
# ── Este script agora é só um atalho ──────────────────────────────────────
#
# A verificação de verdade virou um TESTE:
#
#     __tests__/orgContextGuard.test.ts
#
# Motivo da mudança (2026-08-03): este script existia desde 2026-07-18 e o bug
# voltou assim mesmo, porque ele dependia de alguém lembrar de executá-lo — o
# CI (.github/workflows/ci.yml) roda `tsc`, `vitest` e `build`, e nunca rodou
# os `scripts/check-*.sh`. Como teste, a trava roda sozinha em todo push e PR
# para `main`, e código novo com o padrão errado quebra o build antes do merge.
#
# O teste cobre mais do que este script cobria:
#   1. `organizations[0]` usado como organização (grava/lê na org errada)
#   2. `activeOrganizationId || ''` (terceira sentinela; quebra o `??`)
#   3. `if (!organizationId) return` em carregamento (tela em branco)
#   4. `enabled: !!organizationId` em react-query (idem)
#
# Contrato da regra de produto: hooks/useOrgContext.tsx
#   `useOrgContext()`     → ler (null = "Todas", nunca bloqueia)
#   `useOrgWriteTarget()` → criar (só pergunta se o topo estiver em "Todas")
#
# Uso:
#   scripts/check-org-selector-guard.sh
#
# Exit 0 = conforme. Exit ≠ 0 = violação; a saída do vitest diz o arquivo, a
# linha e como corrigir.

set -eu

cd "$(dirname "$0")/.."

echo "→ npx vitest run __tests__/orgContextGuard.test.ts"
echo "  (contrato em hooks/useOrgContext.tsx · CLAUDE.md REGRA #5)"
echo ""

exec npx vitest run __tests__/orgContextGuard.test.ts
