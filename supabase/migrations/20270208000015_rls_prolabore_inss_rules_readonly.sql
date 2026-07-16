-- ============================================================
-- Migration: 20270208000015_rls_prolabore_inss_rules_readonly.sql
-- Projeto RLS camada AUTHENTICATED — trava a ESCRITA em prolabore_inss_rules.
--
-- prolabore_inss_rules é tabela de REFERÊNCIA NACIONAL (faixas/alíquota/teto de
-- INSS do pró-labore por competência) — não tem coluna de org, é compartilhada.
-- Leitura global para authenticated é CORRETA. O problema era a policy
-- `prolabore_inss_rules_manage_all` (ALL, qual=true): qualquer usuário logado
-- podia ALTERAR/APAGAR as regras fiscais — o que corromperia o cálculo de
-- pró-labore de TODAS as empresas.
--
-- Verificado: o app só LÊ (remuneracaoSocietariaService.getProlaboreInssRule →
-- .select('rate, teto, patronal_rate')). Não há caminho de escrita no código;
-- as faixas entram por seed/migration (service_role bypassa RLS). Portanto
-- travar a escrita não quebra nada.
--
-- Alinha ao padrão da tabela irmã dividend_withholding_rules, que já é
-- `dividend_rules_select` (SELECT, qual=true) — read-only.
-- Sem código, sem dependência de ordem.
-- ============================================================

DROP POLICY IF EXISTS "prolabore_inss_rules_manage_all" ON public.prolabore_inss_rules;

CREATE POLICY "prolabore_inss_rules_select" ON public.prolabore_inss_rules
  FOR SELECT TO authenticated
  USING (true);
