-- aplicar_20271112990000_link_celular_limite_de_uso.sql
--
-- Link do celular — limite de uso por link na mídia do Diário, e IS NOT TRUE
-- nas checagens de planejamento.
-- Plano: docs/planos/2026-11-11-link-celular-tarefas-diario.md, seção
-- "Ajustes — depois da Parte 2 no ar (2026-11-12)" (decisão do usuário,
-- 2026-11-12). São itens que a revisão da Parte 2 deixou para depois.
-- Prova: scripts/teste-link-celular-diario.sql (seção C).
-- Depende de:
--   aplicar_20271111950000_link_celular_tabela_e_gemeos.sql (user_mobile_links, _mobile_link_hash)
--   aplicar_20271112960000_link_celular_rpcs_diario.sql    (as quatro funções recriadas aqui)
--
-- Por quê: o link é público (/celular?token=) e a Edge celular-diario-midia
-- assina upload e download com a service_role. Sem teto, um token vazado (ou um
-- celular em laço) pede upload assinado e assinatura de URL sem fim. O teto é
-- POR LINK e por hora cheia, contado no banco — a Edge não guarda estado:
--   * subir   (celular_diario_autoriza)        → 120 por hora;
--   * assinar (celular_diario_midia_permitida) → 600 por hora.
-- Estouro → ERRCODE 54000 'limite de uso do link atingido — tente de novo em
-- alguns minutos'; a Edge devolve 429 com essa mensagem e a tela a mostra.
-- A contagem entra na transação da chamada: chamada que termina em erro (projeto
-- de outra org, pedido inválido, o próprio estouro) desfaz o incremento — só
-- conta o que de fato passou. Gerar um link novo NÃO zera a conta (é a mesma
-- linha de user_mobile_links).
--
-- celular_diario_autoriza, celular_diario_midia_permitida,
-- celular_planejamento_ler e celular_planejamento_gravar_evolucao: corpos
-- copiados do ARQUIVO aplicar_20271112960000 (não do banco). Mudam só:
--   * a linha PERFORM public._celular_cota(...) logo depois do resolver, nas
--     duas de mídia;
--   * `NOT public._celular_planejamento_aceito(...)` → `... IS NOT TRUE` nas
--     duas de planejamento (NULL também recusa, em vez de passar).
-- Assinatura, volatilidade, SECURITY DEFINER, search_path, REVOKE e GRANT iguais.
--
-- REGRA #7: user_mobile_link_uso com RLS e ZERO policy e sem privilégio de
-- tabela para os papéis da API; _celular_cota sem EXECUTE para nenhum deles.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).

SET lock_timeout = '5s';

-- ── Contagem de uso por link ────────────────────────────────────────────────
-- Uma linha por (link, ação, hora cheia). Linhas com mais de 2 dias somem na
-- chamada seguinte do mesmo link (_celular_cota).
CREATE TABLE IF NOT EXISTS public.user_mobile_link_uso (
    link_id UUID NOT NULL REFERENCES public.user_mobile_links(id) ON DELETE CASCADE,
    acao    TEXT NOT NULL CHECK (acao IN ('subir', 'assinar')),
    janela  TIMESTAMPTZ NOT NULL,
    n       INT NOT NULL DEFAULT 0,
    PRIMARY KEY (link_id, acao, janela)
);

COMMENT ON TABLE public.user_mobile_link_uso IS
    'Link do celular: uso por link, ação (subir/assinar) e hora cheia — o limite de uso da mídia do Diário. '
    'RLS sem policy: escrita só por _celular_cota (SECURITY DEFINER).';

ALTER TABLE public.user_mobile_link_uso ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito; e sem privilégio de tabela para os papéis da API.
REVOKE ALL ON TABLE public.user_mobile_link_uso FROM PUBLIC, anon, authenticated;

-- ── Cota (interno) ──────────────────────────────────────────────────────────
-- Conta mais um uso de p_acao para o link do token, na hora cheia corrente, e
-- recusa com 54000 acima de p_limite. Quem chama já passou pelo resolver (token
-- válido); link não achado aqui → a mesma recusa do resolver, nunca segue sem
-- contar. O INSERT … ON CONFLICT trava a linha: chamadas simultâneas não se
-- perdem.
CREATE OR REPLACE FUNCTION public._celular_cota(p_token TEXT, p_acao TEXT, p_limite INT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_link   UUID;
    v_janela TIMESTAMPTZ := date_trunc('hour', now());
    v_n      INT;
BEGIN
    SELECT l.id INTO v_link FROM public.user_mobile_links l WHERE l.token_hash = public._mobile_link_hash(p_token);
    IF v_link IS NULL THEN
        RAISE EXCEPTION 'link inválido ou vencido' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.user_mobile_link_uso AS u (link_id, acao, janela, n)
    VALUES (v_link, p_acao, v_janela, 1)
    ON CONFLICT (link_id, acao, janela) DO UPDATE SET n = u.n + 1
    RETURNING u.n INTO v_n;

    IF v_n > p_limite THEN
        RAISE EXCEPTION 'limite de uso do link atingido — tente de novo em alguns minutos' USING ERRCODE = '54000';
    END IF;

    -- Faxina barata: só as linhas velhas deste link (pela chave primária).
    DELETE FROM public.user_mobile_link_uso u
     WHERE u.link_id = v_link AND u.janela < v_janela - interval '2 days';
END;
$$;

-- ── Planejamento do diário: ler (960000 + IS NOT TRUE) ──────────────────────
CREATE OR REPLACE FUNCTION public.celular_planejamento_ler(p_token TEXT, p_diario_id UUID, p_planejamento_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user   UUID;
    v_org    UUID;
    v_d      public.projects;
    v_pl     public.projects;
    v_budget JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    IF v_d.id IS NULL OR public._celular_org_do_projeto(v_d.organization_id, v_d.settings) IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl.id, v_pl.organization_id, v_pl.settings, v_d.settings, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'planejamento não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(v_pl.budget) = 'array' AND jsonb_array_length(v_pl.budget) > 0 THEN
        v_budget := v_pl.budget;
    ELSIF v_pl.settings ->> 'linkedProjectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        -- Pela chave primária; vínculo que não é uuid fica sem orçamento.
        SELECT pai.budget INTO v_budget
          FROM public.projects pai
         WHERE pai.id = (v_pl.settings ->> 'linkedProjectId')::uuid
           AND coalesce(pai.organization_id, nullif(pai.settings ->> 'organizationId', '')::uuid) = v_org;
    END IF;

    RETURN jsonb_build_object(
        'schedule', v_pl.settings -> 'schedule',
        'budget',   (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'id',         b -> 'id',
                                'quantity',   b -> 'quantity',
                                'sinapiItem', jsonb_build_object('description', b -> 'sinapiItem' -> 'description'))
                            ORDER BY o), '[]'::jsonb)
                       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_budget) = 'array' THEN v_budget ELSE '[]'::jsonb END)
                            WITH ORDINALITY AS t(b, o)));
END;
$$;

-- ── Planejamento do diário: gravar evolução (960000 + IS NOT TRUE) ────────
CREATE OR REPLACE FUNCTION public.celular_planejamento_gravar_evolucao(
    p_token TEXT, p_diario_id UUID, p_planejamento_id UUID, p_evolucao JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user  UUID;
    v_org   UUID;
    v_d     public.projects;
    v_pl    public.projects;
    v_sched JSONB;
    v_itens JSONB;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;

    IF p_evolucao IS NULL OR jsonb_typeof(p_evolucao) <> 'object' THEN
        RAISE EXCEPTION 'evolução precisa ser um objeto {item: percentual}' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_evolucao)) > 2000 THEN
        RAISE EXCEPTION 'evolução com mais de 2000 itens' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_evolucao) k WHERE k = '' OR length(k) > 100) THEN
        RAISE EXCEPTION 'evolução inválida: id de item vazio ou com mais de 100 caracteres' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_evolucao) k
                WHERE CASE WHEN jsonb_typeof(k.value) = 'number'
                           THEN k.value::numeric NOT BETWEEN 0 AND 100
                           ELSE true END) THEN
        RAISE EXCEPTION 'evolução inválida: cada percentual tem de ser um número de 0 a 100' USING ERRCODE = '22023';
    END IF;

    SELECT p.* INTO v_d FROM public.projects p WHERE p.id = p_diario_id;
    IF v_d.id IS NULL OR public._celular_org_do_projeto(v_d.organization_id, v_d.settings) IS DISTINCT FROM v_org THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;
    SELECT p.* INTO v_pl FROM public.projects p WHERE p.id = p_planejamento_id FOR UPDATE;
    IF v_pl.id IS NULL OR public._celular_planejamento_aceito(v_pl.id, v_pl.organization_id, v_pl.settings, v_d.settings, v_org) IS NOT TRUE THEN
        RAISE EXCEPTION 'planejamento não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    v_sched := v_pl.settings -> 'schedule';
    IF jsonb_typeof(v_sched) IS DISTINCT FROM 'object' THEN
        RETURN NULL;
    END IF;
    v_itens := CASE WHEN jsonb_typeof(v_sched -> 'itemSchedules') = 'array'
                    THEN v_sched -> 'itemSchedules' ELSE '[]'::jsonb END;

    SELECT coalesce(jsonb_agg(x.e ORDER BY x.grupo, x.ord), '[]'::jsonb) INTO v_itens
      FROM (
            SELECT CASE WHEN jsonb_typeof(i.e) = 'object' AND p_evolucao ? (i.e ->> 'id')
                        THEN i.e || jsonb_build_object('manualRealPct', p_evolucao -> (i.e ->> 'id'))
                        ELSE i.e END AS e,
                   0 AS grupo, i.ord
              FROM jsonb_array_elements(v_itens) WITH ORDINALITY AS i(e, ord)
            UNION ALL
            SELECT jsonb_build_object('id', k.key, 'manualRealPct', k.value),
                   1, row_number() OVER (ORDER BY k.key)
              FROM jsonb_each(p_evolucao) k
             WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_itens) i2
                                WHERE jsonb_typeof(i2) = 'object' AND i2 ->> 'id' = k.key)
           ) x;

    v_sched := jsonb_set(v_sched, '{itemSchedules}', v_itens);

    UPDATE public.projects
       SET settings   = jsonb_set(coalesce(settings, '{}'::jsonb), '{schedule}', v_sched),
           updated_at = now()
     WHERE id = v_pl.id;

    RETURN v_sched;
END;
$$;

-- ── Mídia: subir (Edge) — 960000 + cota de 120 por hora ───────────────────
CREATE OR REPLACE FUNCTION public.celular_diario_autoriza(p_token TEXT, p_project_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v_p    public.projects;
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_cota(p_token, 'subir', 120);

    SELECT p.* INTO v_p FROM public.projects p WHERE p.id = p_project_id;
    IF v_p.id IS NULL OR public._celular_org_do_projeto(v_p.organization_id, v_p.settings) IS DISTINCT FROM v_org
       OR public._celular_classificacao(v_p.settings) NOT IN ('DIARIO', 'OBRA') THEN
        RAISE EXCEPTION 'diário não encontrado ou sem permissão' USING ERRCODE = '42501';
    END IF;

    RETURN v_org;
END;
$$;

-- ── Mídia: assinar (Edge) — 960000 + cota de 600 por hora ─────────────────
CREATE OR REPLACE FUNCTION public.celular_diario_midia_permitida(p_token TEXT, p_paths TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID;
    v_org  UUID;
    v      TEXT[];
BEGIN
    SELECT r.user_id, r.org_id INTO v_user, v_org FROM public._mobile_link_resolver(p_token) r;
    PERFORM public._celular_cota(p_token, 'assinar', 600);
    PERFORM public._celular_confere_paths(p_paths);

    -- Pedidos válidos primeiro: sem nenhum, nem varre os projetos.
    IF NOT EXISTS (SELECT 1 FROM unnest(p_paths) u(path) WHERE public._celular_midia_path_ok(u.path, v_org, NULL)) THEN
        RETURN '{}'::text[];
    END IF;

    -- Os citados da org são levantados UMA vez e cruzados com os pedidos.
    WITH pedidos AS (
        SELECT DISTINCT ON (u.path) u.path, u.ord
          FROM unnest(p_paths) WITH ORDINALITY AS u(path, ord)
         WHERE public._celular_midia_path_ok(u.path, v_org, NULL)
         ORDER BY u.path, u.ord
    ), citados AS (
        SELECT DISTINCT c.ref
          FROM public.projects p
         CROSS JOIN LATERAL public._celular_midias_citadas(p.settings) AS c(ref)
         WHERE coalesce(p.organization_id, nullif(p.settings ->> 'organizationId', '')::uuid) = v_org
    )
    SELECT coalesce(array_agg(x.path ORDER BY x.ord), '{}'::text[])
      INTO v
      FROM pedidos x
     WHERE x.path IN (SELECT ct.ref FROM citados ct);

    RETURN v;
END;
$$;

-- ── Privilégios (REGRA #7) ──────────────────────────────────────────────────
-- Interno: nenhum papel da API executa; só as celular_*, que rodam como dono.
REVOKE EXECUTE ON FUNCTION public._celular_cota(TEXT, TEXT, INT)                                    FROM PUBLIC, anon, authenticated;

-- As quatro recriadas: os mesmos REVOKE/GRANT de aplicar_20271112960000.
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_ler(TEXT, UUID, UUID)                        TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_planejamento_gravar_evolucao(TEXT, UUID, UUID, JSONB)     TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_autoriza(TEXT, UUID)                               TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.celular_diario_midia_permitida(TEXT, TEXT[])                      TO anon, authenticated;
