-- ============================================================================
-- Planta Inteligente — terraplenagem fase 5: VÁRIAS linhas desenhadas do
-- perfil altimétrico por estudo.
--
-- Sem mudança de coluna: `perfil_polilinha` é JSONB e passa a guardar a lista
-- `[[{x, y}, …], …]`. O que a fase 4 gravou como uma linha só (`[{x, y}, …]`)
-- continua válido — a leitura (`linhasDoPerfilDaColuna`) aceita as duas formas
-- e a próxima gravação já sai na forma nova. Só o comentário muda.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

COMMENT ON COLUMN public.blueprint_study_terraplenagem.perfil_polilinha IS
  'Linhas desenhadas do perfil altimétrico: [[{x, y}, …], …] em mm do desenho (fase 4 gravava uma linha só, [{x, y}, …]; ainda lida). NULL = usa um corte.';
