-- ============================================================================
-- Planta Inteligente — topografia fase 17, correção: a emissão do projeto
-- executivo NÃO aponta mais por FK para a versão de topografia.
--
-- Achado no passeio em produção: `topografia_id … ON DELETE SET NULL` faz o
-- Postgres emitir um UPDATE na linha EMITIDA quando a versão de topografia é
-- apagada — e a linha emitida é imutável (trigger). Resultado: a versão não
-- podia ser apagada ("blueprint_study_projeto_executivo é imutável").
--
-- Uma emissão é registro HISTÓRICO: guarda versão, hash e memorial como
-- estavam, e não deve ser tocada por cascata nenhuma. `topografia_id` fica
-- como UUID solto (referência informativa); `topografia_versao` e
-- `topografia_hash` continuam dizendo de que terreno a emissão falou.
--
-- ⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_study_projeto_executivo
    DROP CONSTRAINT IF EXISTS blueprint_study_projeto_executivo_topografia_id_fkey;

COMMENT ON COLUMN public.blueprint_study_projeto_executivo.topografia_id IS
  'Id da versão de topografia na emissão — sem FK de propósito (a emissão é histórico imutável; versão e hash ficam ao lado).';

RESET lock_timeout;
