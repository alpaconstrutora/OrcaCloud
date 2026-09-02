-- ============================================================
-- Migration: aplicar_20270918000016_custom_items_avulsos_com_dono.sql
-- SEGURANÇA — fecha a última fresta deixada pela aplicar_20270918000014
--
-- O QUE O TESTE MOSTROU
-- Depois da ...014 e da ...015, a prova
-- `provas/regressao-catalogos-pertencem-as-orgs.sql` deu:
--
--                            | bases | itens | rubricas
--   membro do grupo          |   1   |  24   |   33      <- correto
--   autenticado sem vinculo  |   0   |  17   |    2      <- 17 vazando
--   CLIENTE #2               |   0   |  17   |    2      <- 17 vazando
--
-- Bases e rubricas fechadas; itens não. A causa é uma escolha minha na ...014:
-- a policy de `custom_items` abria exceção para `database_id IS NULL`, com o
-- comentário "item solto, legado: continua visível". A intenção era não sumir
-- com dado antigo — o efeito foi manter aberto justamente o que se queria
-- fechar, e em 17 dos 24 itens: a MAIORIA da tabela.
--
-- Lição que vale registrar: exceção escrita para "não quebrar nada" é o lugar
-- onde o vazamento sobrevive. Quem pegou foi o teste que compara os três
-- olhares; a policy, lida isoladamente, parecia razoável.
--
-- A CORREÇÃO
-- Os 17 avulsos são de 2026-01-27, anteriores ao conceito de "base de dados"
-- (os 7 com base são de 2026-02-07). Ganham `organization_id` da organização
-- dona, e a policy passa a exigi-lo.
--
-- LIMITE CONHECIDO, E POR QUE É ACEITÁVEL AQUI
-- Item avulso fica visível a quem é membro da organização DONA — não há tabela
-- de compartilhamento para eles, e criar uma terceira para 17 linhas de legado
-- seria desproporcional. Na prática ninguém perde acesso: as três organizações
-- secundárias têm 1 membro cada, e é a mesma pessoa que está na dona (que tem
-- 7). Se algum dia existir alguém membro APENAS de uma organização secundária,
-- o caminho certo é mover esses itens para uma base compartilhada, não abrir a
-- policy de novo.
-- ============================================================

ALTER TABLE public.custom_items
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Dona: a mesma escolhida pela ...014 — a organização com dado real.
DO $$
DECLARE v_dona uuid; v_atualizados int;
BEGIN
    SELECT o.id INTO v_dona
      FROM public.organizations o
      LEFT JOIN public.suppliers s ON s.organization_id = o.id
     GROUP BY o.id
     ORDER BY count(s.id) DESC, o.created_at ASC
     LIMIT 1;

    UPDATE public.custom_items
       SET organization_id = v_dona
     WHERE organization_id IS NULL
       AND database_id IS NULL;
    GET DIAGNOSTICS v_atualizados = ROW_COUNT;

    RAISE NOTICE 'custom_items: % item(ns) avulso(s) receberam dona %', v_atualizados, v_dona;
END $$;

CREATE INDEX IF NOT EXISTS idx_custom_items_org ON public.custom_items (organization_id);

-- ── Leitura: sem a exceção que vazava ───────────────────────────────────────
DROP POLICY IF EXISTS "custom_items_select" ON public.custom_items;
CREATE POLICY "custom_items_select" ON public.custom_items
    FOR SELECT TO authenticated
    USING (
        -- Item de uma base: herda o pertencimento da base.
        EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (
                   public.is_org_member(d.organization_id)
                   OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                               WHERE sh.database_id = d.id
                                 AND public.is_org_member(sh.target_org_id))
               )
        )
        -- Item avulso (legado): pela própria organização.
        OR public.is_org_member(organization_id)
    );

-- ── Alteração/remoção: mesmo recorte ────────────────────────────────────────
DROP POLICY IF EXISTS "custom_items_update" ON public.custom_items;
CREATE POLICY "custom_items_update" ON public.custom_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (public.is_org_member(d.organization_id)
                    OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                                WHERE sh.database_id = d.id
                                  AND public.is_org_member(sh.target_org_id)))
        )
        OR public.is_org_member(organization_id)
    );

DROP POLICY IF EXISTS "custom_items_delete" ON public.custom_items;
CREATE POLICY "custom_items_delete" ON public.custom_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.custom_databases d
             WHERE d.id = custom_items.database_id
               AND (public.is_org_member(d.organization_id)
                    OR EXISTS (SELECT 1 FROM public.custom_database_org_shares sh
                                WHERE sh.database_id = d.id
                                  AND public.is_org_member(sh.target_org_id)))
        )
        OR public.is_org_member(organization_id)
    );

-- ── Verificação embutida ────────────────────────────────────────────────────
DO $$
DECLARE v_orfaos int;
BEGIN
    SELECT count(*) INTO v_orfaos
      FROM public.custom_items
     WHERE database_id IS NULL AND organization_id IS NULL;

    IF v_orfaos > 0 THEN
        RAISE EXCEPTION 'custom_items: % item(ns) sem base E sem organizacao — ficariam invisiveis', v_orfaos;
    END IF;

    RAISE NOTICE 'OK: todo item de catalogo tem base ou dona; nenhuma policy libera item sem condicao.';
END $$;
