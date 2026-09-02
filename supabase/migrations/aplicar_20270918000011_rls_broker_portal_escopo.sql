-- ============================================================
-- Migration: aplicar_20270918000011_rls_broker_portal_escopo.sql
-- SEGURANÇA — achado C1-06 (lote descoberto em 2026-09-02)
-- Plano: docs/planos/2026-09-02-correcao-auditoria-seguranca.md
--
-- COMO ESTE LOTE APARECEU
-- A varredura da auditoria original buscou `cmd IN ('ALL','SELECT') AND
-- qual='true'`. Em policy de INSERT não existe `qual` — a expressão vive em
-- `with_check`. O filtro era cego exatamente para a categoria que libera
-- ESCRITA sem condição. O defeito veio à tona ao corrigir um bug de limiar no
-- `scripts/check-rls-postura.sh`, que engolia resultado de uma linha só.
--
-- O QUE ESTA MIGRATION CORRIGE
--   broker_portal_chat_messages — `SELECT USING (true)`: qualquer usuário
--   autenticado lia TODA conversa de corretor de TODOS os tenants. E
--   `INSERT WITH CHECK (true)` permitia forjar mensagem em qualquer canal.
--
--   broker_portal_leads — `INSERT WITH CHECK (true)`: dava para injetar lead
--   na carteira de outra organização. (A leitura já era escopada
--   corretamente por `broker_email` / `is_org_member`, então não é vazamento —
--   é poluição de dado.)
--
-- POR QUE É SEGURO APERTAR AGORA
-- As três tabelas do Portal do Corretor (`_leads`, `_chat_messages`,
-- `_chat_channels`) estão VAZIAS (0 linhas) e nenhum serviço ou componente as
-- referencia — `grep -rn "broker_portal_leads\|broker_portal_chat_messages"`
-- em `services/` e `components/` não retorna nada. São de uma migration de
-- 2026-03 cujo consumidor nunca foi escrito. Não há fluxo para quebrar, e é o
-- melhor momento possível para acertar a regra: antes de existir dado.
--
-- `broker_portal_chat_messages` não tem coluna de organização; o recorte vai
-- pelo canal, que tem (`broker_portal_chat_channels.organization_id`).
--
-- NÃO ESTÃO NESTE LOTE (decisão deliberada, ver o plano):
--   • `organizations` — a policy de INSERT aberta é a criação self-service da
--     PRÓPRIA organização; SELECT/UPDATE/DELETE já são escopados por
--     is_org_member / owner / admin. Não é achado.
--   • `custom_databases`, `custom_items`, `rubrics` — não têm coluna de tenant
--     NENHUMA. Não é policy frouxa, é modelagem: são catálogos globais hoje.
--     Cair de `true` para `is_org_member(...)` sem a coluna simplesmente
--     esconderia os dados de todo mundo. Vai junto com o C1-05 (`is_shared`),
--     que é o mesmo problema.
-- ============================================================

-- ── broker_portal_chat_messages: recorte pelo canal ─────────────────────────
DROP POLICY IF EXISTS "broker_messages_select" ON public.broker_portal_chat_messages;
DROP POLICY IF EXISTS "broker_messages_insert" ON public.broker_portal_chat_messages;

CREATE POLICY "broker_messages_select" ON public.broker_portal_chat_messages
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.broker_portal_chat_channels ch
         WHERE ch.id = broker_portal_chat_messages.channel_id
           AND (public.is_org_member(ch.organization_id) OR public.is_superadmin())
    ));

-- Além do canal ser da organização, quem escreve tem de ser quem diz ser:
-- `sender_email` não pode ser preenchido com o e-mail de outra pessoa.
CREATE POLICY "broker_messages_insert" ON public.broker_portal_chat_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.broker_portal_chat_channels ch
             WHERE ch.id = broker_portal_chat_messages.channel_id
               AND (public.is_org_member(ch.organization_id) OR public.is_superadmin())
        )
        AND (sender_email = (auth.jwt() ->> 'email') OR public.is_superadmin())
    );

-- ── broker_portal_leads: escrita na própria organização ─────────────────────
DROP POLICY IF EXISTS "broker_leads_insert" ON public.broker_portal_leads;

CREATE POLICY "broker_leads_insert" ON public.broker_portal_leads
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_org_member(organization_id)
        OR broker_email = (auth.jwt() ->> 'email')
        OR public.is_superadmin()
    );

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE
    v_frouxas text;
    v_leitura int;
BEGIN
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_frouxas
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('broker_portal_chat_messages','broker_portal_leads')
       AND (qual = 'true' OR with_check = 'true');

    IF v_frouxas IS NOT NULL THEN
        RAISE EXCEPTION 'C1-06: policies ainda sem condicao: %', v_frouxas;
    END IF;

    -- Não pode ficar sem policy de leitura (lockout).
    SELECT count(*) INTO v_leitura
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'broker_portal_chat_messages'
       AND cmd IN ('SELECT','ALL');

    IF v_leitura = 0 THEN
        RAISE EXCEPTION 'C1-06: broker_portal_chat_messages ficaria sem leitura nenhuma';
    END IF;

    RAISE NOTICE 'C1-06 OK: Portal do Corretor recortado por organizacao (via canal) antes de existir dado.';
END $$;
