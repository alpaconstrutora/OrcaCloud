#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Verifica as duas fases de docs/planos/2026-08-06-views-expostas-anon.md
# ═══════════════════════════════════════════════════════════════════════════
#
#   Uso:  bash scripts/verificar-views-anon.sh '<senha-do-agente-leitura>'
#
# FASE 1 (REVOKE anon)      → cada view deve responder 42501 SEM sessão.
# FASE 2 (security_invoker) → COM sessão, cada view só pode devolver linhas da
#                             organização do próprio usuário. Org alheia
#                             aparecendo = cross-tenant ainda aberto — SALVO as
#                             exceções abaixo, que são o produto funcionando.
#
# ─── EXCEÇÕES ──────────────────────────────────────────────────────────────
# `org_id ≠ org do usuário` NÃO é sinônimo de vazamento. `employee_org_shares`
# (migration 20261108000001) existe para disponibilizar um colaborador a outras
# organizações do mesmo grupo, e a policy de `employees` tem o segundo ramo
# `is_employee_shared_with_user(id)` — que exige linha explícita naquela tabela,
# não é amplo. Toda view construída sobre `employees` herda isso.
#
# Sem esta lista o script reportava FALHA em TODA execução por causa de
# `vw_hr_retention_cohorts`, o que treina quem roda a ignorar o resultado — e um
# verificador que ninguém lê não verifica nada. Se aparecer uma view nova aqui,
# a pergunta é "qual mecanismo autoriza?", não "como silencio?".
#
# ⚠️ Incluir uma view aqui é decisão de SEGURANÇA. Só entra o que tem mecanismo
#    de autorização identificado e escrito ao lado.
esperado_por_compartilhamento() {
  case "$1" in
    # Conta colaboradores compartilhados nas coortes de retenção da org.
    # Resíduo de PRODUTO (se retenção deve incluir emprestado é decisão em
    # aberto), não de segurança.
    vw_hr_retention_cohorts) return 0 ;;
    *) return 1 ;;
  esac
}
#
# POR QUE ESTE SCRIPT EXISTE, e não uma query no SQL Editor: o Editor roda como
# service role e passa por cima de RLS, GRANT e security_invoker — ele SEMPRE
# mostraria tudo, inclusive depois de tudo corrigido. Duas tentativas de fazer
# isso em SQL falharam antes desta versão (RAISE NOTICE não é exibido; função
# em pg_temp não sobrevive entre statements). A prova tem de vir de fora, por
# HTTP, com o mesmo caminho que o app usa.
#
# A senha entra por argumento e não é gravada em lugar nenhum — decisão do
# usuário em 2026-08-05.
set -u

SENHA="${1:?informe a senha do agente-leitura como argumento}"
EMAIL="agente-leitura@alpaconstrutora.com.br"
ENVFILE="$(dirname "$0")/../.env"

URL=$(grep -E "^VITE_SUPABASE_URL=" "$ENVFILE" | cut -d= -f2- | tr -d '\r"')
KEY=$(grep -E "^VITE_SUPABASE_ANON_KEY=" "$ENVFILE" | cut -d= -f2- | tr -d '\r"')

VIEWS="dead_letter_queue retry_candidates vw_bi_commercial vw_bi_operational
vw_bi_supply vw_fact_deal vw_fact_financial_tx vw_fact_purchase_order
vw_intercompany_transactions pipeline_health vw_commercial_tax_payables
vw_communication_read_rate vw_company_consolidated vw_esocial_status_panel
vw_incentive_event_months vw_journal_entries tts_apuracao_view
vw_fpa_budget_vs_actual vw_fpa_cashflow_projection vw_hr_productivity_by_project
vw_hr_retention_cohorts vw_hr_turnover_trend vw_project_cost_comparison
vw_team_hourly_cost"

# ── FASE 1 ────────────────────────────────────────────────────────────────
echo "── FASE 1 — sem sessao (esperado: 42501 em todas)"
abertas=0
for v in $VIEWS; do
  r=$(curl -s "$URL/rest/v1/$v?select=*&limit=1" -H "apikey: $KEY" | head -c 60)
  echo "$r" | grep -q "42501" || { echo "   AINDA ABERTA: $v -> $r"; abertas=$((abertas+1)); }
done
[ "$abertas" -eq 0 ] && echo "   OK — 24/24 fechadas para anon" \
                     || echo "   FALHA — $abertas view(s) ainda respondem sem sessao"
echo

# ── FASE 2 ────────────────────────────────────────────────────────────────
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$SENHA\"}" \
  | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
[ -z "$TOKEN" ] && { echo "LOGIN FALHOU — nao da para verificar a Fase 2"; exit 1; }

MINHA=$(curl -s "$URL/rest/v1/organization_members?select=organization_id" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  | grep -o '[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}' | sort -u | head -1)

echo "── FASE 2 — com sessao de $EMAIL (org $MINHA)"
printf "   %-32s %-8s %s\n" "VIEW" "LINHAS" "SITUACAO"
vaza=0; naoverif=0
for v in $VIEWS; do
  hdr=$(curl -s -I "$URL/rest/v1/$v?select=*" -H "apikey: $KEY" \
        -H "Authorization: Bearer $TOKEN" -H "Prefer: count=exact" -H "Range: 0-0")
  n=$(echo "$hdr" | grep -i "^content-range" | tr -d '\r' | awk '{print $2}' | sed 's|.*/||')
  [ -z "$n" ] && { printf "   %-32s %-8s %s\n" "$v" "-" "BLOQUEADA para logado — investigar"; continue; }

  # A coluna de organização tem dois nomes no schema: organization_id e org_id.
  # Procurar só o primeiro dá falso "sem coluna" em 4 views de RH/empresa.
  alheias=0
  temcol=0
  for col in organization_id org_id; do
    d=$(curl -s "$URL/rest/v1/$v?select=$col&limit=2000" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN")
    echo "$d" | grep -q "42703" && continue
    temcol=1
    alheias=$(echo "$d" | grep -o '[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}' \
              | sort -u | grep -v "^$MINHA$" | grep -c .)
    break
  done

  if [ "$alheias" -gt 0 ] && esperado_por_compartilhamento "$v"; then
    # Org alheia AQUI é o produto funcionando, não falha. Ver o bloco de
    # EXCECOES no topo.
    printf "   %-32s %-8s %s\n" "$v" "$n" "ok (org alheia esperada — colaborador compartilhado)"
  elif [ "$alheias" -gt 0 ]; then
    printf "   %-32s %-8s %s\n" "$v" "$n" "VAZA — $alheias org(s) alheia(s)"
    vaza=$((vaza+1))
  elif [ "$temcol" -eq 0 ] && [ "$n" -gt 0 ]; then
    # NÃO dizer "ok" aqui. Sem coluna de organização não há o que comparar, e
    # "ok" sem verificação é falso negativo. `vw_project_cost_comparison` cai
    # neste caso e VAZA de fato: expõe 6 projetos, dos quais o usuário só
    # enxerga 4 em `projects` sob RLS. Escopo indireto exige conferência manual
    # contra a tabela pela qual a view escopa.
    printf "   %-32s %-8s %s\n" "$v" "$n" "NAO VERIFICAVEL — escopo indireto, conferir a mao"
    naoverif=$((naoverif+1))
  else
    printf "   %-32s %-8s %s\n" "$v" "$n" "ok"
  fi
done
echo
[ "$vaza" -eq 0 ] && echo "   OK — nenhuma view VERIFICAVEL expoe organizacao alheia" \
                  || echo "   FALHA — $vaza view(s) com cross-tenant aberto"
[ "$naoverif" -gt 0 ] && echo "   ATENCAO — $naoverif view(s) de escopo indireto nao foram verificadas aqui; conferir a mao contra a tabela pela qual escopam"
exit 0
