-- Ajuda dos portais — "Primeiros passos" editáveis pela construtora (tour v2, F8)
--
-- Pedido do usuário em 04/10/2026: entre as escolhas do plano "Tour guiado
-- (F3) funcionou mais ficou bem básico. faça plano para contemplar o
-- restante", um checklist simples "Primeiros passos" no portal; depois
-- "implementar f7 e f8". Plano: docs/planos/2026-10-04-tour-guiado-v2-portais.md.
--
-- Os itens do checklist vivem no código (utils/portalHelpDefaults.ts ›
-- CHECKLIST_ITEMS, cada um ligado a uma aba ou ação do portal); a construtora
-- só renomeia ou oculta — mesma sobrescrita por `default_key` dos artigos e do
-- tour, com kind='checklist'. O progresso de cada externo fica em
-- portal_tour_progress (F7) com tour_id 'checklist:<chave>'; "ocultar o
-- cartão" é tour_id 'checklist' com status 'pulado'.
--
-- REGRA #7: nenhuma função e nenhuma policy nesta migration (só o CHECK).

SET lock_timeout = '3s';

ALTER TABLE public.portal_help_items DROP CONSTRAINT IF EXISTS portal_help_items_kind_check;
ALTER TABLE public.portal_help_items ADD CONSTRAINT portal_help_items_kind_check
    CHECK (kind IN ('artigo', 'faq', 'tour', 'checklist'));
