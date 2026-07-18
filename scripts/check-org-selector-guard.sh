#!/usr/bin/env bash
# Trava mecânica: "Todas as organizações" (activeOrganizationId/organizationId
# nulo ou vazio) NUNCA pode fazer uma tela de LEITURA (lista, detalhe, aba)
# ficar em branco silenciosamente.
#
# Contexto (ver [[feedback_todas_organizacoes_nao_esconder]] na memória do
# projeto): esse é o bug mais repetido do projeto. Padrão típico do bug:
#
#   const load = useCallback(async () => {
#       if (!activeOrganizationId) return;   // <-- nunca chama o service
#       ...
#   }, [activeOrganizationId]);
#
# Isso já foi corrigido "várias vezes" pontualmente (Settings > Categorias,
# SalesModule, QualityModule, investor/OpportunitiesTab, FinancialIntelligence,
# ProcessosModule, OpuraGovernanceModule/companyService, ProlaboreReconciliationPanel,
# WarrantyModule, InventoryModule, brokerService...) e sempre volta em tela nova,
# porque quem escreve o componente novo não tem como adivinhar que precisa
# tratar esse caso. A correção agora é: nunca aceitar de novo silenciosamente.
#
# Regra de decisão (auditoria de 2026-07-18):
#   1. Ler/abrir (lista, detalhe, aba)  → NUNCA bloquear. Ou o service aceita
#      organizationId opcional/null (deixa a RLS filtrar), ou a entidade aberta
#      já carrega a org (derive dela: `organizationId || entity.organization_id`).
#   2. Criar do zero (sem entidade-pai) → legítimo exigir org, mas com
#      `disabled` + `title` explicando, nunca botão morto ou tela em branco.
#   3. Operação inerentemente por-empresa (fechamento de período, rateio
#      contábil, organograma) → pode exigir org, mas com MENSAGEM EXPLÍCITA
#      pedindo para selecionar uma organização — nunca silêncio.
#
# Este script não consegue distinguir automaticamente os 3 casos (isso exige
# julgamento). Ele serve para LISTAR candidatos: toda ocorrência do padrão
# "if (!organizationId) return" / "if (!activeOrganizationId) return" dentro
# de uma função de carregamento precisa ser revisada manualmente contra a
# regra acima antes de ser considerada correta.
#
# Uso:
#   scripts/check-org-selector-guard.sh                  # varre o repo inteiro
#   scripts/check-org-selector-guard.sh components/X.tsx # só os arquivos passados
#
# Exit 1 se achar alguma ocorrência (não é "erro" automático — é "revisar").

set -u

FORBIDDEN="if[[:space:]]*\([[:space:]]*!(active)?[Oo]rganizationId[[:space:]]*\)[[:space:]]*(\{[[:space:]]*)?return"

if [ "$#" -gt 0 ]; then
  files="$*"
else
  files=$(git ls-files '*.ts' '*.tsx' 2>/dev/null | grep -v '^scripts/check-org-selector-guard\.sh$')
fi

hits_total=0

for file in $files; do
  [ -f "$file" ] || continue

  hits=$(grep -nE "$FORBIDDEN" "$file" 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "⚠️  $file — guard de organização pode estar escondendo uma leitura:"
    echo "$hits" | sed 's/^/     /'
    hits_total=$((hits_total + 1))
  fi
done

if [ "$hits_total" -gt 0 ]; then
  echo ""
  echo "⚠️  $hits_total arquivo(s) com o padrão 'if (!organizationId) return'."
  echo "    Revise cada um contra a regra de decisão no topo deste script."
  echo "    Se for leitura (lista/detalhe/aba) sendo bloqueada → CORRIGIR."
  echo "    Se for criação/ação ou operação por-empresa já com mensagem"
  echo "    explícita → ok, não mexer."
  exit 1
fi

echo "✅ Nenhum guard de organização bloqueando leitura encontrado."
exit 0
