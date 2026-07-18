#!/usr/bin/env bash
# Trava mecânica: "obra" nunca vem misturada com orçamento/planejamento/diário.
#
# Contexto (ver utils/projectClassification.ts):
#   A tabela `projects` guarda 4 coisas diferentes separadas só por
#   settings.classification: OBRA, ORCAMENTO, PLANEJAMENTO, DIARIO. Telas que
#   falam em "obra" mostravam os quatro juntos, porque cada uma decidia o filtro
#   por conta propria — e discordavam entre si (61 lugares no padrao estrito,
#   outros no padrao frouxo que deixava passar projeto sem classificacao, e
#   dezenas sem filtro nenhum).
#
# A regra agora:
#   - `useStore().projects` JA e so OBRA          -> nao filtre nada
#   - precisa de orcamento/planejamento/diario    -> `allProjects` + helpers
#   - comparacao de classificacao                 -> use os helpers, nao string
#
# Uso:
#   scripts/check-project-classification.sh                  # repo inteiro
#   scripts/check-project-classification.sh components/X.tsx # so os passados
#
# Exit 1 se achar comparacao literal de classification fora dos helpers.

set -u

# Arquivos que legitimamente comparam a string literal.
#  - projectClassification.ts: e a propria definicao
#  - ProjectList.tsx: recebe `classificationFilter` como prop e implementa o
#    seletor de abas (Obras/Orcamentos/Planejamentos/Diarios) — e a tela cuja
#    funcao E distinguir os tipos
#  - ProjectModal/AppRouter/ProjectOverview/useProjectOperations: navegam entre
#    projetos vinculados (obra -> orcamento -> planejamento) resolvendo cadeia
#  - constants.ts: define o default
#  - ProjectSettingsView.tsx: le `formData.classification` do PROPRIO formulario
#    aberto (para escolher o rotulo "Configuracoes da Obra" x "do Orcamento") —
#    nao filtra lista de projetos
ALLOWLIST_REGEX='^(utils/projectClassification\.ts|scripts/check-project-classification\.sh|constants\.ts|components/ProjectList\.tsx|components/ProjectModal\.tsx|components/AppRouter\.tsx|components/ProjectOverview\.tsx|components/ProjectDiaryManager\.tsx|components/ProjectSettingsView\.tsx|components/FinancialSchedule\.tsx|components/PlanningList\.tsx|hooks/useProjectOperations\.ts|services/budgetResolver\.ts|services/projectService\.ts|types/project\.ts)$'

# Padrao proibido: comparar classification com literal, ou o Set NON_OBRA.
FORBIDDEN="classification[[:space:]]*(===|!==|==|!=)[[:space:]]*['\"](OBRA|ORCAMENTO|PLANEJAMENTO|DIARIO|COST_ESTIMATION)['\"]|NON_OBRA"

if [ "$#" -gt 0 ]; then
  files="$*"
else
  files=$(git ls-files '*.ts' '*.tsx' 2>/dev/null)
fi

violations=0

for file in $files; do
  [ -f "$file" ] || continue
  rel="${file#./}"
  echo "$rel" | grep -qE "$ALLOWLIST_REGEX" && continue

  hits=$(grep -nE "$FORBIDDEN" "$file" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "❌ $rel — comparacao literal de classification:"
    echo "$hits" | sed 's/^/     /'
    echo "     → useStore().projects ja e so OBRA. Para os outros tipos use"
    echo "       allProjects + isObra/onlyObras/onlyOrcamentos/onlyPlanejamentos."
    echo "       Ver utils/projectClassification.ts."
    violations=$((violations + 1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "❌ $violations arquivo(s) comparando classification na mao."
  exit 1
fi

echo "✅ Nenhuma comparacao literal de classification fora dos helpers."
exit 0
