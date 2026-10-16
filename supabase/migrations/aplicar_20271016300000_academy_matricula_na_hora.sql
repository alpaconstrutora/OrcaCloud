-- ============================================================
-- Academia — atribuição vira matrícula NA HORA
-- Plano: docs/planos/2026-10-16-atribuicao-vira-matricula-na-hora.md
--
-- Pedido (16/10/2026): a NR-18 atribuída ao Altair não aparecia no portal.
-- Causa: atribuição só virava matrícula no processamento diário
-- (`generate_academy_alerts`, cron 08:15 UTC) ou no "Processar agora" — e só
-- contra versão PUBLICADA. As atribuições foram criadas às 15:11, a versão
-- publicada às 15:15, e nada rodou depois. Decisão do usuário: gerar a
-- matrícula na hora, (1) ao salvar uma atribuição de treinamento que já tem
-- versão publicada e (2) ao publicar uma versão, para as atribuições ativas.
--
-- Mesma regra do bloco de atribuições de `generate_academy_alerts` (alvo
-- resolvido por `fn_academy_resolve_assignment_internal`, prazo
-- `data_limite` ou hoje + `prazo_dias` (30), sem duplicar matrícula viva na
-- versão). O processamento diário continua: quem entra na empresa depois
-- (novo colaborador no cargo/equipe/obra) segue sendo alcançado por ele.
--
-- Gatilhos ADIADOS (constraint trigger DEFERRABLE INITIALLY DEFERRED): rodam
-- no fim da transação. Na publicação isso é obrigatório — `fn_academy_publish_
-- version` cria RECICLAGEM e migra as matrículas abertas para a versão nova
-- DEPOIS de marcar a versão como PUBLICADA; se o gatilho rodasse na hora, a
-- matrícula de atribuição nasceria antes e a migração (que guarda NOT EXISTS)
-- deixaria de levar o progresso. Adiado, ele só completa quem ficou de fora.
--
-- REGRA #7: funções internas e de gatilho com REVOKE de PUBLIC, anon e
-- authenticated; ninguém as chama por RPC.
-- ============================================================

SET lock_timeout = '5s';

-- Materializa UMA atribuição. Devolve quantas matrículas criou.
CREATE OR REPLACE FUNCTION public.fn_academy_materializar_atribuicao(p_assignment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    a       RECORD;
    v_versao UUID;
    v_qtd   INTEGER := 0;
BEGIN
    SELECT * INTO a FROM public.academy_assignments WHERE id = p_assignment_id;
    IF a.id IS NULL OR a.status <> 'ATIVA' THEN
        RETURN 0;
    END IF;

    -- Versão congelada na atribuição, senão a vigente (PUBLICADA). Sem versão
    -- publicada não há o que matricular — o portal só mostra conteúdo publicado.
    SELECT COALESCE(a.version_id, v.id) INTO v_versao
      FROM public.academy_course_versions v
     WHERE v.course_id = a.course_id AND v.status = 'PUBLICADA'
     ORDER BY v.versao DESC
     LIMIT 1;
    IF v_versao IS NULL THEN
        RETURN 0;
    END IF;

    INSERT INTO public.academy_enrollments (
        org_id, course_id, version_id, employee_id, assignment_id,
        origem, status, data_limite)
    SELECT a.org_id, a.course_id, v_versao, t.employee_id, a.id,
           'ATRIBUICAO', 'NAO_INICIADO',
           COALESCE(a.data_limite, CURRENT_DATE + COALESCE(a.prazo_dias, 30))
      FROM public.fn_academy_resolve_assignment_internal(a.id) t
     WHERE NOT EXISTS (
            SELECT 1 FROM public.academy_enrollments en
             WHERE en.employee_id = t.employee_id
               AND en.version_id  = v_versao
               AND en.status <> 'CANCELADO');
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
    RETURN v_qtd;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_academy_materializar_atribuicao(UUID) FROM PUBLIC, anon, authenticated;

-- (1) Atribuição salva (criada ou alterada) ativa.
CREATE OR REPLACE FUNCTION public.trg_academy_atribuicao_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'ATIVA' THEN
        PERFORM public.fn_academy_materializar_atribuicao(NEW.id);
    END IF;
    RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_academy_atribuicao_matricula() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_academy_atribuicao_matricula ON public.academy_assignments;
CREATE CONSTRAINT TRIGGER trg_academy_atribuicao_matricula
    AFTER INSERT OR UPDATE ON public.academy_assignments
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.trg_academy_atribuicao_matricula();

-- (2) Versão publicada → atribuições ativas do curso.
CREATE OR REPLACE FUNCTION public.trg_academy_versao_publicada_matricula()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r RECORD;
BEGIN
    IF NEW.status = 'PUBLICADA' AND OLD.status IS DISTINCT FROM 'PUBLICADA' THEN
        FOR r IN
            SELECT id FROM public.academy_assignments
             WHERE course_id = NEW.course_id AND status = 'ATIVA'
        LOOP
            PERFORM public.fn_academy_materializar_atribuicao(r.id);
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_academy_versao_publicada_matricula() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_academy_versao_publicada_matricula ON public.academy_course_versions;
CREATE CONSTRAINT TRIGGER trg_academy_versao_publicada_matricula
    AFTER UPDATE ON public.academy_course_versions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.trg_academy_versao_publicada_matricula();

-- (3) Atribuições ativas que já estavam esperando (ex.: NR-18 do Altair,
-- criada antes de a versão ser publicada) — o mesmo que o processamento
-- diário faria na próxima rodada.
DO $$
DECLARE r RECORD; v_total INTEGER := 0;
BEGIN
    FOR r IN SELECT id FROM public.academy_assignments WHERE status = 'ATIVA' LOOP
        v_total := v_total + public.fn_academy_materializar_atribuicao(r.id);
    END LOOP;
    RAISE NOTICE 'matrículas criadas para atribuições pendentes: %', v_total;
END $$;
