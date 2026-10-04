-- Ajuda dos portais — passos de tour próprios da construtora (tour v2, F6)
--
-- Pedido do usuário em 04/10/2026: "Tour guiado (F3) funcionou mais ficou bem
-- básico. faça plano para contemplar o restante" — entre as escolhas dele:
-- "construtora cria/ordena passos próprios" no editor.
-- Plano: docs/planos/2026-10-04-tour-guiado-v2-portais.md (fase F6).
--
-- Um passo de tour precisa de três dados que um artigo não tem:
--   anchor  — o `data-tour` do elemento que o passo realça (catálogo no código,
--             utils/portalHelpDefaults.ts › ancorasDoTour);
--   tour_id — a que tour pertence: NULL = tour do portal; id da aba = "como
--             usar esta tela";
--   section — já existia: a aba onde o elemento está (o tour navega até ela).
-- Passos PADRÃO continuam no código (âncora/tour fixos); a linha deles aqui é
-- só sobrescrita (texto, oculto, posição em `sort_order`). Passo PRÓPRIO é uma
-- linha kind='tour' sem default_key — e aí a âncora é obrigatória (CHECK).
--
-- portal_help_org_json monta o JSON campo a campo: precisa listar as colunas
-- novas. Definição de partida lida do BANCO em 04/10/2026 (md5
-- ba727003df462548f0074c4d338f9d88, igual a aplicar_20271003000050).
--
-- REGRA #7
--   Pergunta 1 (policy): nenhuma policy nova; a da tabela segue
--   is_org_manager(organization_id).
--   Pergunta 2 (quem executa): portal_help_org_json continua sem grant
--   (REVOKE de PUBLIC, anon e authenticated repetido abaixo).

-- ─── PARTE 1 — colunas ─────────────────────────────────────────────────────────
SET lock_timeout = '3s';

ALTER TABLE public.portal_help_items ADD COLUMN IF NOT EXISTS anchor TEXT;
ALTER TABLE public.portal_help_items ADD COLUMN IF NOT EXISTS tour_id TEXT;

COMMENT ON COLUMN public.portal_help_items.anchor IS
    'Só kind=tour: data-tour do elemento que o passo realça. Obrigatório em passo próprio (sem default_key).';
COMMENT ON COLUMN public.portal_help_items.tour_id IS
    'Só kind=tour: NULL = tour do portal; id da aba = mini-tour "como usar esta tela".';

ALTER TABLE public.portal_help_items DROP CONSTRAINT IF EXISTS portal_help_items_tour_proprio_ck;
ALTER TABLE public.portal_help_items ADD CONSTRAINT portal_help_items_tour_proprio_ck
    CHECK (kind <> 'tour' OR default_key IS NOT NULL OR anchor IS NOT NULL);

-- ─── PARTE 2 — núcleo devolve as colunas novas ─────────────────────────────────
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.portal_help_org_json(p_org UUID, p_portal TEXT)
 RETURNS JSONB
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT jsonb_build_object(
        'org_id', p_org,
        'contact', (
            SELECT jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'website', o.website)
            FROM public.organizations o WHERE o.id = p_org
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', h.id, 'kind', h.kind, 'default_key', h.default_key, 'section', h.section,
                'title', h.title, 'body_html', h.body_html, 'sort_order', h.sort_order,
                'is_published', h.is_published, 'updated_at', h.updated_at,
                'anchor', h.anchor, 'tour_id', h.tour_id
            ) ORDER BY h.sort_order, h.created_at)
            FROM public.portal_help_items h
            WHERE h.organization_id = p_org AND h.portal = p_portal
        ), '[]'::jsonb)
    );
$function$;
REVOKE ALL ON FUNCTION public.portal_help_org_json(UUID, TEXT) FROM PUBLIC, anon, authenticated;
