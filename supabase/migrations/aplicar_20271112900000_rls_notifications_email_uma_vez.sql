-- ════════════════════════════════════════════════════════════════════════════
-- notifications_rw: e-mail do JWT lido UMA vez por consulta (12/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Depois da troca de is_org_member por conjunto (aplicar_20271112700000), a leitura
-- de notifications ainda gastava ~38 ms de RLS: a perna do destinatário
--   lower(recipient_email) = lower((auth.jwt() ->> 'email'))
-- chama auth.jwt() — que CONVERTE o JSON de `request.jwt.claims` — uma vez por linha.
-- Envolvida em (SELECT …) sem correlação, vira InitPlan: calculada 1× por consulta.
--
-- MESMO VALOR: a subconsulta escalar sem FROM devolve sempre exatamente uma linha com
-- o mesmo valor da expressão (auth.jwt() é STABLE); e-mail ausente no JWT → NULL nas
-- duas formas. O WITH CHECK não usa o e-mail e NÃO muda.
--
-- Prova (só leitura, como dono, sem ALTER): para 16 identidades — todo e-mail de
-- organization_members/broker_profiles, todo destinatário de notifications, um e-mail
-- que não existe e JWT vazio; e-mail do JWT em MAIÚSCULAS —, linhas com
-- (USING antigo) IS DISTINCT FROM (USING novo): **0**.
-- Tempo do filtro com JWT real (desenvolvedor@, 4.604 linhas): 37,4 → 5,4 ms.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): as MESMAS duas pernas (destinatário OU membro da org);
--   só muda quando o e-mail do JWT é calculado.
--   Pergunta 2 (quem executa): nenhuma função nova; papel e comando da policy iguais.
--
-- VOLTA:
--   ALTER POLICY "notifications_rw" ON "public"."notifications"
--     USING (((lower(recipient_email) = lower((auth.jwt() ->> 'email'::text))) OR ((organization_id IS NOT NULL) AND COALESCE((organization_id IN (SELECT public.minhas_orgs_membro())), false))));
--
-- Aplicar: npx supabase db query --linked -f <caminho deste arquivo>
-- NUNCA `supabase db push` (CLAUDE.md da raiz).

-- ALTER POLICY trava a tabela por milissegundos; tabela ocupada → falha em 2 s
-- (rodar de novo) em vez de enfileirar as leituras do app.
SET lock_timeout = '2s';

ALTER POLICY "notifications_rw" ON "public"."notifications"
  USING (((lower(recipient_email) = (SELECT lower((auth.jwt() ->> 'email'::text)))) OR ((organization_id IS NOT NULL) AND COALESCE((organization_id IN (SELECT public.minhas_orgs_membro())), false))));

-- Conferência depois de aplicar:
--   SELECT qual, with_check FROM pg_policies WHERE tablename = 'notifications';
--   (qual com "( SELECT lower((auth.jwt() ->> 'email'::text))"; with_check igual ao de antes)
