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
# Exceção conhecida: `sinapi_items` — catálogo de preços de referência do SINAPI
# (15.867 itens), dado público do governo. É leitura pública deliberada, mantida
# de propósito pela migration 20270208000002.
#
# `invoices` e `investor_opportunity_competitors` também estavam aqui e eram as
# duas que aquela migration marcou como "avaliar à parte". As duas foram
# corrigidas (aplicar_20270918000002 e ...012). A ressalva está fechada.
secao "1. Policies do papel anon com expressão true"
R=$(consulta "SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND 'anon'=ANY(roles) AND (qual='true' OR with_check='true') AND tablename NOT IN ('sinapi_items') ORDER BY tablename;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ policy anon sem recorte — dado exposto a quem tem a chave pública."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhuma"
fi

# ── 2. Policies de escrita sem condição (achado C1-01) ──────────────────────
# `WITH CHECK (true)` em organization_members permitia auto-promoção a owner.
# Exceções conhecidas desta verificação:
#   • organizations · "Authenticated users can create organizations" — é a criação
#     self-service da PRÓPRIA organização. SELECT/UPDATE/DELETE já são escopados
#     por is_org_member / owner / admin. Legítima.
#   • custom_databases, custom_items, rubrics — não têm coluna de tenant nenhuma.
#     Não é policy frouxa, é modelagem: são catálogos globais. Trocar para
#     is_org_member(...) sem a coluna esconderia os dados de todo mundo. Estão no
#     mesmo item do C1-05 no plano; sair daqui só depois da coluna existir.
secao "2. Policies de INSERT/ALL com WITH CHECK (true)"
R=$(consulta "SELECT tablename, policyname, cmd, roles::text FROM pg_policies WHERE schemaname='public' AND cmd IN ('INSERT','ALL') AND with_check='true' AND NOT ('service_role'=ANY(roles)) AND NOT (tablename='organizations' AND policyname='Authenticated users can create organizations') AND tablename NOT IN ('custom_databases','custom_items','rubrics') ORDER BY tablename;")
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
R=$(consulta "SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') AND p.prorettype <> 'trigger'::regtype AND pg_get_function_result(p.oid) <> 'boolean' AND pg_get_function_identity_arguments(p.oid) <> '' AND pg_get_function_identity_arguments(p.oid) NOT LIKE '%p_token%' AND p.proname NOT LIKE 'st\\_%' AND p.proname NOT IN ( 'get_public_marketplace','submit_public_interest', 'academy_validate_certificate','fn_get_document_status_public') ORDER BY 1;")
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

# ── 5. Placeholder de segredo, no comando OU no Vault (achado C4-02) ────────
# O `task-alert-notifier` rodou por meses contra 'SEU_PROJECT_REF.supabase.co'.
# A segunda metade da consulta veio do diagnóstico de 2026-09-02: o placeholder
# tinha SAÍDO do comando e ENTRADO no Vault ('<cole_aqui…>'), então olhar só o
# texto do job dava ✅ com todos os crons quebrados. Também pega GUC `app.*`,
# que neste banco não existe — era o que derrubava o `fiscal-fallback-polling`.
secao "5. Placeholder de segredo (comando, Vault ou GUC inexistente)"
R=$(consulta "SELECT jobname AS onde, 'comando' AS tipo FROM cron.job WHERE command LIKE '%SEU_PROJECT_REF%' OR command LIKE '%CONFIGURE_SERVICE_ROLE_KEY%' OR command LIKE '%INTERNAL_SECRET_HERE%' OR command LIKE '%current_setting(''app.%' UNION ALL SELECT name, 'vault' FROM vault.decrypted_secrets WHERE decrypted_secret LIKE '<%' OR length(decrypted_secret) < 40;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ credencial de cron é placeholder — o job falha sem entregar nada."; FALHAS=$((FALHAS+1))
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

# ── 7. Cron que nem chega a fazer HTTP ──────────────────────────────────────
# Ponto cego da 6, encontrado em 2026-09-02: job que estoura no SQL (GUC
# inexistente, permissão, erro de sintaxe) nunca escreve em net._http_response.
# O `fiscal-fallback-polling` acumulava 90 falhas / 0 sucessos em 3 h e a
# verificação 6 dizia ✅, porque ele não gerava resposta HTTP nenhuma para falhar.
secao "7. Jobs de cron falhando no próprio SQL (invisíveis para a 6)"
R=$(consulta "SELECT j.jobname, count(*) AS falhas, left(max(d.return_message), 80) AS erro FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid WHERE d.status = 'failed' AND d.start_time > now() - interval '1 hour' GROUP BY j.jobname ORDER BY 2 DESC;")
if [ "$(tem_resultado "$R")" = "sim" ]; then
    echo "$R"; echo "❌ job falha antes de sair do banco — a 6 não enxerga isto."; FALHAS=$((FALHAS+1))
else
    echo "✅ nenhum"
fi

# ── 8. Function de cron alcançável com a chave pública ──────────────────────
# `verify_jwt: true` NÃO é autorização: o gateway só confere que o token é uma
# chave válida do projeto — e a anon é uma delas, publicada no bundle do
# frontend. Em 2026-09-02 a `fiscal-nfe-processor` respondia 200 para a
# publishable key, sem gate nenhum no código, aceitando `body.record` e
# processando com service_role.
#
# Nenhuma verificação de banco pega isto, porque o defeito não está no banco.
# Só a sonda HTTP pega. Espera-se 401 em todas.
secao "8. Functions de cron: sonda HTTP nos três cenários"
CHAVE_PUB=$(grep -hoE 'sb_publishable_[A-Za-z0-9_-]+' .env .env.local 2>/dev/null | head -1)
URL_PROJ=$(grep -hoE 'https://[a-z]+\.supabase\.co' .env .env.local 2>/dev/null | head -1)
if [ -z "$CHAVE_PUB" ] || [ -z "$URL_PROJ" ]; then
    echo "⏭️  pulado (sem chave publicável ou URL no .env)"
else
    # Três cenários, não um. A versão anterior sondava só com a chave pública, e
    # cada um pega um defeito DIFERENTE:
    #
    #   sem header  → gate ausente do bundle publicado. Foi assim que a
    #                 `task-alert-notifier` ficou aberta na internet: o gate
    #                 existia no repositório e não no deploy. É a prova que a
    #                 REGRA #7 (pergunta 3) exige, e a que faltava aqui.
    #   chave anon  → `verify_jwt: true` sem gate próprio. O gateway aceita
    #                 qualquer chave do projeto, e a anon vai no bundle. Foi assim
    #                 que a `fiscal-nfe-processor` respondia 200.
    #   token lixo  → comparação frouxa. Guarda contra o caso de `CRON_SECRET`
    #                 vazio fazer `"Bearer "` casar com qualquer coisa.
    ABERTAS=0
    for FN in task-alert-notifier process-billing-ruler dunning-notifier \
              fiscal-nfe-processor notify-opportunity-interest; do
        LINHA="   $FN:"
        for CENARIO in sem-header anon token-lixo; do
            case "$CENARIO" in
                sem-header) H='X-Sonda: 1' ;;
                anon)       H="Authorization: Bearer $CHAVE_PUB" ;;
                token-lixo) H='Authorization: Bearer lixo-invalido' ;;
            esac
            CODIGO=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST \
                "$URL_PROJ/functions/v1/$FN" -H "$H" -H 'Content-Type: application/json' -d '{}')
            if [ "$CODIGO" = "401" ] || [ "$CODIGO" = "403" ]; then
                LINHA="$LINHA $CENARIO=$CODIGO"
            else
                LINHA="$LINHA $CENARIO=$CODIGO←ABERTA"
                ABERTAS=$((ABERTAS+1))
            fi
        done
        echo "$LINHA"
    done
    if [ "$ABERTAS" -gt 0 ]; then
        echo "❌ $ABERTAS sonda(s) passaram — há function de cron alcançável de fora."
        FALHAS=$((FALHAS+1))
    else
        echo "✅ todas recusam nos três cenários"
    fi
fi

echo
echo "═══════════════════════════════════════════════════════════"
if [ "$FALHAS" -eq 0 ]; then
    echo "✅ postura limpa nas 8 verificações"
    exit 0
fi
echo "❌ $FALHAS verificação(ões) com problema"
echo "   Contexto: docs/security-audit/relatorio-auditoria-seguranca.pdf"
exit 1
