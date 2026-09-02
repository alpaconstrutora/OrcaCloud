#!/usr/bin/env bash
#
# check-rls-postura.sh — confere a POSTURA REAL de segurança do banco remoto.
#
# Complementa `__tests__/segurancaMigrations.test.ts`:
#
#   • O teste roda no CI e pega o PADRÃO no texto da migration, antes do merge.
#     Não precisa de credencial, mas também não sabe o que o banco realmente tem.
#   • Este script roda sob demanda contra o banco e confere o RESULTADO.
#     É o que vale, porque o histórico de migrations deste projeto tem drift
#     (as `2027*` foram aplicadas por SQL direto, fora de `schema_migrations`).
#
# Origem: auditoria de 2026-09-01 (docs/security-audit/). As quatro consultas
# abaixo são exatamente as que encontraram os quatro achados críticos.
#
# Uso:
#   bash scripts/check-rls-postura.sh
#
# Exit code:
#   0 — postura limpa
#   1 — encontrou pelo menos um problema (detalhado na saída)
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

FALHAS=0

consulta() {
    # ⚠️ O SQL TEM DE VIR NUMA LINHA SÓ: `supabase db query` considera apenas a
    # primeira linha do argumento. Quebrar a query em várias linhas faz o WHERE
    # ser descartado em silêncio — e a verificação passa a devolver a tabela
    # inteira, parecendo um monte de achados falsos.
    npx supabase db query --linked -o table "$1" 2>/dev/null | sed '/^Initialising/d;/A new version/d;/We recommend/d'
}

# Há dado na saída? A tabela do CLI usa `│` no cabeçalho e em cada linha de
# dado; resultado vazio não imprime nada. Logo: 1 linha `│` = só cabeçalho,
# 2 ou mais = tem dado. (Já errou com `> 2`, que engolia resultado de 1 linha.)
tem_resultado() {
    echo "$1" | grep -cE '^│' | awk '{print ($1 > 1) ? "sim" : "nao"}'
}

secao() {
    echo
    echo "── $1 ─────────────────────────────────────────────────"
}

# ── 1. Policies para `anon` sem recorte (achado C1-02) ──────────────────────
# A chave anon vai no bundle do frontend: policy anon com USING(true) é acesso
# público, não "acesso do portal".
secao "1. Policies do papel anon com expressão true"
R=$(consulta "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND 'anon'=ANY(roles) AND (qual='true' OR with_check='true') ORDER BY tablename;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ policy anon sem recorte — dado exposto a quem tem a chave pública."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma"
fi

# ── 2. Policies de escrita sem condição (achado C1-01) ──────────────────────
# `WITH CHECK (true)` em organization_members permitia auto-promoção a owner.
secao "2. Policies de INSERT/ALL com WITH CHECK (true)"
R=$(consulta "SELECT tablename, policyname, cmd, roles::text FROM pg_policies WHERE schemaname='public' AND cmd IN ('INSERT','ALL') AND with_check='true' AND NOT ('service_role'=ANY(roles)) ORDER BY tablename;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ escrita liberada sem condição — verifique se é intencional."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma"
fi

# ── 3. SECURITY DEFINER executável por anon (achados C3-01 e C3-02) ─────────
# O PostgreSQL concede EXECUTE a PUBLIC por padrão; sem REVOKE, `anon` executa.
# A allowlist é o conjunto legítimo: RPCs recortadas por token de portal e as
# funções realmente públicas do marketplace.
secao "3. Funções SECURITY DEFINER executáveis por anon (fora da allowlist)"
R=$(consulta "SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.prorettype <> 'trigger'::regtype AND pg_get_function_identity_arguments(p.oid) <> '' AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%p_token%' AND p.proname NOT LIKE 'st\\_%' AND p.proname NOT IN ( 'get_public_marketplace','submit_public_interest', 'academy_validate_certificate','fn_get_document_status_public') ORDER BY 1;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"
    echo "❌ SECURITY DEFINER alcançável por anon sem token."
    echo "   Corrija com: REVOKE EXECUTE ON FUNCTION public.<nome>(<args>) FROM PUBLIC, anon;"
    FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma"
fi

# ── 4. Tabelas com coluna de tenant e policy sem recorte (achado C1-04) ─────
secao "4. Tabelas com organization_id mas policy USING(true)"
R=$(consulta "SELECT DISTINCT pol.tablename, pol.policyname FROM pg_policies pol WHERE pol.schemaname='public' AND 'authenticated'=ANY(pol.roles) AND pol.qual='true' AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=pol.tablename AND c.column_name IN ('organization_id','org_id')) ORDER BY 1;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ tabela tem coluna de tenant mas a policy não a usa."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma"
fi

# ── 5. Jobs de cron com placeholder de segredo (achado C4-02) ───────────────
# O `task-alert-notifier` rodou por meses contra 'SEU_PROJECT_REF.supabase.co'.
secao "5. Jobs de cron com placeholder não substituído"
R=$(consulta "SELECT jobname FROM cron.job WHERE command LIKE '%SEU_PROJECT_REF%' OR command LIKE '%CONFIGURE_SERVICE_ROLE_KEY%' OR command LIKE '%INTERNAL_SECRET_HERE%';")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ job de cron com placeholder — ele falha em silêncio."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhum"
fi

# ── 6. Cron que falha sem ninguém ver ───────────────────────────────────────
# pg_cron marca `succeeded` quando só ENFILEIROU a chamada: pg_net é assíncrono.
# O resultado HTTP de verdade só aparece em net._http_response.
secao "6. Respostas HTTP do pg_net na última hora (status real dos crons)"
R=$(consulta "SELECT coalesce(status_code::text,'(falha de rede)') AS status, count(*) AS respostas FROM net._http_response WHERE created > now() - interval '1 hour' GROUP BY 1 ORDER BY 2 DESC;")
echo "$R"
R2=$(consulta "SELECT 1 FROM net._http_response WHERE created > now() - interval '1 hour' AND (status_code IS NULL OR status_code >= 400) LIMIT 1;")
if [ "$(tem_resultado "$R2")" = "sim" ]; then
    echo "❌ há chamadas de cron falhando — investigue error_msg em net._http_response."
    FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma falha na última hora"
fi

echo
echo "═══════════════════════════════════════════════════════════"
if [ "$FALHAS" -eq 0 ]; then
    echo "✅ postura limpa nas 6 verificações"
    exit 0
fi
echo "❌ $FALHAS verificação(ões) com problema"
echo "   Contexto: docs/security-audit/relatorio-auditoria-seguranca.pdf"
exit 1
