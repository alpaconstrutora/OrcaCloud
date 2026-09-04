-- ============================================================================
-- notifications: coluna organization_id + fechamento da policy legada
-- ============================================================================
--
-- ## O problema
--
-- A tabela nasceu em `20260215000011_notifications_and_chat.sql` com:
--
--     CREATE POLICY "Allow anon all on notifications" ON public.notifications
--         FOR ALL TO public USING (true) WITH CHECK (true);
--
-- `TO public` + `USING (true)` = qualquer papel, inclusive `anon` (cuja chave
-- vai no bundle do frontend), lê TODAS as notificações de TODOS os clientes do
-- SaaS. Nenhuma migration posterior tocou nessa policy — confirmado por grep em
-- todas as migrations: só esta e a original mencionam a tabela em contexto de
-- policy.
--
-- O risco já era conhecido e vinha sendo contornado por autocensura, não por
-- controle de acesso. O cabeçalho de `20270850000009_academy_alerts_cron.sql`
-- diz, textualmente: "public.notifications tem policy legada FOR ALL TO public
-- USING (true) e não tem organization_id — na prática qualquer autenticado lê
-- tudo. Por isso a mensagem NUNCA contém nota, percentual, CPF ou NR sensível."
--
-- Os avisos financeiros de `20270919000002` quebram essa premissa: eles
-- carregam nome de locatário, número de contrato e valor da parcela. Publicar
-- isso sob a policy atual seria vazamento entre tenants.
--
-- ## A correção
--
-- 1. `organization_id` na tabela (não existia — não havia como recortar);
-- 2. backfill do que é INEQUÍVOCO (destinatário membro de uma única org);
-- 3. policy por destinatário OU membro da organização dona da notificação.
--
-- Linha com `organization_id` NULL fica visível SÓ ao próprio destinatário. É o
-- fallback seguro: nada some para quem é dono da notificação, e nada vaza para
-- quem não é. Os produtores que ainda não sabem a organização (TaskForm, chat
-- de pedido) continuam funcionando com esse alcance reduzido.
-- ============================================================================

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS organization_id uuid
        REFERENCES public.organizations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.notifications.organization_id IS
    'Organização dona da notificação. NULL = notificação pessoal, visível apenas ao recipient_email (ver policy notifications_rw).';

-- A tela ordena por created_at DESC dentro do recorte de organização.
CREATE INDEX IF NOT EXISTS notifications_org_created_idx
    ON public.notifications (organization_id, created_at DESC);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Só o que é inequívoco. Destinatário que é membro de mais de uma organização
-- fica NULL de propósito: chutar a organização aqui poderia ESCONDER a
-- notificação de quem deveria vê-la, ou mostrá-la a quem não deveria. NULL
-- mantém a linha visível ao dono, que é o comportamento correto na dúvida.
UPDATE public.notifications n
   SET organization_id = m.organization_id
  FROM (
        -- `(array_agg(...))[1]` e não `MIN(...)`: não existe `min(uuid)` no
        -- Postgres. Como o HAVING abaixo já garante organização única, qualquer
        -- elemento do agregado é O elemento.
        SELECT LOWER(email) AS email, (array_agg(organization_id))[1] AS organization_id
          FROM public.organization_members
         WHERE email IS NOT NULL
         GROUP BY LOWER(email)
        HAVING COUNT(DISTINCT organization_id) = 1
       ) m
 WHERE n.organization_id IS NULL
   AND LOWER(n.recipient_email) = m.email;

-- ── Policy ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon all on notifications" ON public.notifications;
-- Re-executável: o arquivo inteiro pode rodar de novo sem erro 42710.
DROP POLICY IF EXISTS notifications_rw ON public.notifications;

-- Duas pernas, e nenhuma delas libera sozinha (REGRA OBRIGATÓRIA #7):
--
--   1. `recipient_email = e-mail do JWT` — a notificação é sua. Cobre também
--      destinatário que NÃO é membro de organização (fornecedor, cliente,
--      corretor), que é justamente quem ficaria de fora da perna 2.
--   2. `is_org_member(organization_id)` — helper canônico do projeto (prefere
--      `user_id`, com fallback por e-mail para linhas legadas). Preserva a
--      visão "admin vê a organização inteira" que a tela já tinha para os
--      grupos DESENVOLVEDOR/USUARIO, agora recortada pelo tenant. O
--      `organization_id IS NOT NULL` é o que impede a perna de virar
--      `is_org_member(NULL)` e liberar linha órfã.
--
-- `TO authenticated`: `anon` perde o acesso por completo. As funções de cron
-- são SECURITY DEFINER (rodam como `postgres`) e não passam por aqui.
CREATE POLICY notifications_rw ON public.notifications
    FOR ALL
    TO authenticated
    USING (
        LOWER(recipient_email) = LOWER(auth.jwt() ->> 'email')
        OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
    )
    WITH CHECK (
        organization_id IS NULL
        OR public.is_org_member(organization_id)
    );

-- Drift encontrado ao aplicar esta migration (03/09/2026): o banco tinha duas
-- policies que NÃO existem em nenhum arquivo de migration —
-- `users_read_own_notifications` (SELECT) e `users_update_own_notifications`
-- (UPDATE), ambas `TO public` com `recipient_email = auth.email()`. Não eram
-- vazamento (para `anon`, `auth.email()` é NULL, então não casavam linha
-- nenhuma), mas são estritamente mais estreitas que a perna 1 de
-- `notifications_rw` e, sendo permissivas, só somam ruído a um OR que já as
-- contém. Removidas para o estado do banco voltar a ser reproduzível a partir
-- dos arquivos.
DROP POLICY IF EXISTS users_read_own_notifications   ON public.notifications;
DROP POLICY IF EXISTS users_update_own_notifications ON public.notifications;

-- O gate mais forte não é a policy, é o grant: sem SELECT, `anon` não chega a
-- ser avaliado por policy nenhuma.
REVOKE ALL   ON public.notifications FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
