-- ─────────────────────────────────────────────────────────────────────────────
-- commercial_properties.parent_id: FK SEM cascade (alinha repo × schema real)
-- ─────────────────────────────────────────────────────────────────────────────
-- A migration 20260226000001 declarou esta FK com ON DELETE CASCADE, mas o banco
-- real está SEM cascade — descoberto em 2026-07-18 pelo erro 23503 ao excluir um
-- edifício com unidades ("violates foreign key constraint
-- commercial_properties_parent_id_fkey"). Mais um caso de histórico de migrations
-- divergente do schema: o repo dizia uma coisa, o banco fazia outra.
--
-- A correção é declarar no repo o que o banco de fato faz — NÃO ligar o cascade.
-- Motivo: cascade aqui é perigoso. `commercial_deals.property_id` também é
-- CASCADE, então apagar um edifício levaria junto, em silêncio, todas as
-- negociações de todas as unidades dele. A exclusão em cadeia agora é feita pela
-- aplicação (commercialService.getPropertyDeleteImpact + deleteProperty(id, true)),
-- que mede o impacto, mostra ao usuário quantas unidades e negociações serão
-- destruídas e só então apaga. Ver RentalsModule/SalesModule.handleDeleteProperty.
--
-- Efeito prático desta migration no banco atual: NENHUM (já está assim). Ela
-- existe para que uma reconstrução do schema do zero não reintroduza o cascade.
--
-- Aplicar MANUALMENTE no Supabase (nunca `supabase db push`). Idempotente.

ALTER TABLE public.commercial_properties
    DROP CONSTRAINT IF EXISTS commercial_properties_parent_id_fkey;

ALTER TABLE public.commercial_properties
    ADD CONSTRAINT commercial_properties_parent_id_fkey
    FOREIGN KEY (parent_id)
    REFERENCES public.commercial_properties(id);
    -- sem ON DELETE: NO ACTION é proposital (ver comentário acima)
