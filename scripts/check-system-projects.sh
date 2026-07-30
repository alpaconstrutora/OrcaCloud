#!/usr/bin/env bash
# Trava mecânica: projetos de sistema não podem ser filtrados "na mão".
#
# Contexto (ver utils/systemProjects.ts):
#   "Gestão Comercial" é um projeto criado pelo sistema, gravado com
#   classification = 'OBRA'. Durante muito tempo a defesa foi espalhar
#   `p.name !== 'Gestão Comercial'` pelas telas — 28 ocorrências em 18 arquivos.
#   Isso falha por construção: toda tela NOVA nasce errada, porque quem escreve
#   não tem como adivinhar que precisa daquele filtro. Foi assim que a tela de
#   seleção de obra do ÒPURA CNO passou a listar "Gestão Comercial" como obra.
#
# A regra agora:
#   - `useStore().projects` JÁ vem sem projetos de sistema → não filtre nada
#   - consulta direta ao Supabase → `.not('name','in', SYSTEM_PROJECT_NAMES_SQL)`
#   - precisa DO projeto de sistema → `useStore().systemProjects`
#
# Uso:
#   scripts/check-system-projects.sh                  # varre o repo inteiro
#   scripts/check-system-projects.sh components/X.tsx # só os arquivos passados
#
# Exit 1 se achar comparação literal com um nome de projeto de sistema.

set -u

# Arquivos que legitimamente mencionam o nome literal.
# TEMPORÁRIO: utils/__validation__/profitabilityLegacy\.ts reproduz o pipeline
# legado (commit ba3df7d) para o painel de comparação da Fase 2 do
# PLANO_RENTABILIDADE_COMERCIAL.md. Sai da allowlist junto com o harness.
ALLOWLIST_REGEX='^(utils/systemProjects\.ts|scripts/check-system-projects\.sh|utils/__validation__/profitabilityLegacy\.ts|services/commercialFinanceService\.ts|components/ProjectFinancialManager\.tsx|components/AppRouter\.tsx|components/BrokerModal\.tsx|components/ImovibCapexForm\.tsx|components/BankReconciliation\.tsx|components/ClientArea\.tsx|supabase/migrations/.*)$'

# Padrão proibido: comparar o nome do projeto com o literal, em qualquer direção.
FORBIDDEN="(!==|===|!=|==)[[:space:]]*['\"]Gestão Comercial['\"]|neq\(['\"]name['\"],[[:space:]]*['\"]Gestão Comercial['\"]\)"

if [ "$#" -gt 0 ]; then
  files="$*"
else
  files=$(git ls-files '*.ts' '*.tsx' 2>/dev/null)
fi

violations=0

for file in $files; do
  [ -f "$file" ] || continue

  # Normaliza o caminho para bater com a allowlist (remove ./ inicial)
  rel="${file#./}"
  if echo "$rel" | grep -qE "$ALLOWLIST_REGEX"; then
    continue
  fi

  hits=$(grep -nE "$FORBIDDEN" "$file" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "❌ $rel — comparação literal com nome de projeto de sistema:"
    echo "$hits" | sed 's/^/     /'
    echo "     → use useStore().projects (já filtrado) ou SYSTEM_PROJECT_NAMES_SQL."
    echo "       Ver utils/systemProjects.ts."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "❌ $violations arquivo(s) com filtro manual de projeto de sistema."
  exit 1
fi

echo "✅ Nenhum filtro manual de projeto de sistema encontrado."
exit 0
