-- ============================================================
-- empreendimento_types: RLS checava o membro por user_id, não por e-mail
--
-- SINTOMA (reportado 2026-08-04): criar um Tipo de Empreendimento em
-- Configurações do Sistema falhava com
--   new row violates row-level security policy for table "empreendimento_types" [42501]
-- e a lista só exibia os tipos globais (is_system), nunca os da organização.
--
-- CAUSA: as 4 policies desta tabela (read/insert/update/delete) resolvem o
-- vínculo do usuário assim:
--
--     organization_id IN (
--       SELECT organization_id FROM public.organization_members
--       WHERE user_id = auth.uid()          -- <<< por USER_ID
--     )
--
-- enquanto o resto do schema usa `public.is_org_member(uuid)`, que casa por
-- E-MAIL do JWT:
--
--     WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
--
-- `organization_members.user_id` fica NULL para membro convidado por e-mail
-- que nunca teve o id preenchido — caso do usuário. Resultado: o membro
-- legítimo era tratado como não-membro SÓ nesta tabela. Não era regressão da
-- aplicação: a tabela nasceu assim em 20270819000006, e o erro só apareceu
-- agora porque a tela passou a mostrar a mensagem real do banco
-- (antes um `instanceof Error` a engolia e exibia "Erro ao criar").
--
-- CORREÇÃO: usar `public.is_org_member(organization_id)`, o padrão da casa —
-- já usado em contract_types, supplier_categories, tax_settings,
-- contract_index_values. É SECURITY DEFINER, então não sofre com a RLS de
-- organization_members na subconsulta.
--
-- O ramo `user_id = auth.uid()` é MANTIDO em OR: cobre um eventual membro sem
-- e-mail e garante que ninguém que já conseguia escrever perca o acesso
-- (dual-check uid+email — ver memória [[feedback_rls_organization_members]]).
--
-- Não altera quem enxerga o quê além de corrigir o vínculo: continua valendo
-- que tipo do sistema (is_system) é somente leitura e que globais
-- (organization_id NULL) são visíveis a todos.
-- ============================================================

-- ─── SELECT ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "empreendimento_types_read" ON public.empreendimento_types;

CREATE POLICY "empreendimento_types_read" ON public.empreendimento_types
  FOR SELECT USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- ─── INSERT ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "empreendimento_types_insert" ON public.empreendimento_types;

CREATE POLICY "empreendimento_types_insert" ON public.empreendimento_types
  FOR INSERT WITH CHECK (
    is_system = false
    AND (
      public.is_org_member(organization_id)
      OR organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ─── UPDATE ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "empreendimento_types_update" ON public.empreendimento_types;

CREATE POLICY "empreendimento_types_update" ON public.empreendimento_types
  FOR UPDATE USING (
    is_system = false
    AND (
      public.is_org_member(organization_id)
      OR organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ─── DELETE ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "empreendimento_types_delete" ON public.empreendimento_types;

CREATE POLICY "empreendimento_types_delete" ON public.empreendimento_types
  FOR DELETE USING (
    is_system = false
    AND (
      public.is_org_member(organization_id)
      OR organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- anon nunca escreve catálogo (rollout drop-anon, ver project_rls_anon_rollout)
REVOKE ALL ON public.empreendimento_types FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empreendimento_types TO authenticated;
