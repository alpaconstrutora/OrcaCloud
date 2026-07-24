-- ============================================================
-- Migration: 20270823000004_fix_user_table_column_preferences_email_case
-- A policy da 20270823000003 comparava user_email = auth.jwt()->>'email' com
-- igualdade exata. Mesmo bug de case-sensitivity já visto em outras tabelas
-- deste projeto (ver 20270208000007, 20270208000010, 20261230000003 etc.) —
-- se o e-mail chega com capitalização diferente do token, o WITH CHECK
-- rejeita o INSERT/UPDATE silenciosamente e "Salvar como padrão" não salva.
-- ============================================================

DROP POLICY IF EXISTS "user_table_column_preferences_own_row" ON public.user_table_column_preferences;
CREATE POLICY "user_table_column_preferences_own_row" ON public.user_table_column_preferences
  FOR ALL TO authenticated
  USING (lower(user_email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (lower(user_email) = lower(auth.jwt() ->> 'email'));
