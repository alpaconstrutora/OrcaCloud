-- ============================================================
-- Migration: 20270823000003_user_table_column_preferences
-- Preferência de colunas visíveis por usuário (não por navegador) —
-- primeira infraestrutura de "preferência de usuário" persistida no banco.
-- Independente de organização: o mesmo usuário quer o mesmo layout de
-- colunas em qualquer org que acesse.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_table_column_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      TEXT NOT NULL,
  -- Mesma chave usada hoje no localStorage (useTableColumns(COLUMNS, storageKey))
  -- — reaproveitada aqui para que qualquer tela possa adotar sem inventar um
  -- novo identificador.
  storage_key     TEXT NOT NULL,
  visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_column     TEXT,
  sort_direction  TEXT NOT NULL DEFAULT 'asc' CHECK (sort_direction IN ('asc', 'desc')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_email, storage_key)
);

CREATE INDEX IF NOT EXISTS idx_user_table_column_preferences_lookup
  ON public.user_table_column_preferences(user_email, storage_key);

ALTER TABLE public.user_table_column_preferences ENABLE ROW LEVEL SECURITY;

-- Preferência pessoal, não é dado de organização nem público — sem policy anon.
DROP POLICY IF EXISTS "user_table_column_preferences_own_row" ON public.user_table_column_preferences;
CREATE POLICY "user_table_column_preferences_own_row" ON public.user_table_column_preferences
  FOR ALL TO authenticated
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');
