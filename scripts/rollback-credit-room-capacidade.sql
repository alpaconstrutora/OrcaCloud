-- Rollback de aplicar_20271122000000_credit_room_capacidade.sql
-- ⚠️ Apaga as 4 colunas (e o que estiver gravado nelas). NUNCA `supabase db push`.
DROP TRIGGER IF EXISTS trg_credit_rooms_grupo_valido ON public.credit_rooms;
DROP FUNCTION IF EXISTS public.fn_credit_room_grupo_valido();
ALTER TABLE public.credit_rooms
    DROP COLUMN IF EXISTS parametros_capacidade,
    DROP COLUMN IF EXISTS empreendimento_ids,
    DROP COLUMN IF EXISTS grupo_organization_ids,
    DROP COLUMN IF EXISTS escopo;
