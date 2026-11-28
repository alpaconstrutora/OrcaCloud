-- ==========================================================================
-- Ofícios: só a aprovação marca o ofício como aprovado (e ofício não nasce emitido)
-- Date: 2026-11-28 (pedido de 27/11/2026; revisão r1 em 28/11)
-- Plano: docs/planos/2026-11-27-docgen-aprovacao-trava.md
-- Prova: scripts/teste-docgen-aprovacao-trava.sql
-- Base:  fn_alcada_guarda de aplicar_20271118915100_alcada_trava_servidor.sql (F14, PR #576),
--        copiada SEM MUDANÇA; definições vigentes no banco em 27/11 de fn_doc_gen_congelar,
--        doc_gen_emitir, fn_alcada_enviar/aprovar/rejeitar e fn_alcada_trava_passo
-- ==========================================================================
-- O QUE FECHA
--   Em produção, um membro comum da organização marcava um ofício em RASCUNHO como APROVADO
--   com um PATCH direto pela API — {approval_status:'APROVADO'} — e emitia, pulando a aprovação
--   que o modelo exige (doc_gen_modelos.exige_aprovacao): doc_gen_emitir só confere
--   approval_status = 'APROVADO'. Também inseria o ofício já APROVADO. O histórico ainda
--   registrava "APROVADO por <quem fez o PATCH>". Reproduzido em 27/11 (BEGIN … ROLLBACK):
--   PATCH → ok:1, emitir → ok:OF-0001/2026; INSERT aprovado → emitir → ok:OF-0002/2026.
--
--   Por que passava: a RLS de doc_gen_documentos só confere a organização; fn_doc_gen_congelar
--   deixa approval_status livre no rascunho (está em v_fora_do_texto, de propósito: é o campo
--   que a aprovação muda); trg_zz_alcada_trava_passo só dispara em UPDATE OF approval_chain.
--   A trava que fecha isso já existe — fn_alcada_guarda, na aplicar_20271118915100 — mas essa
--   migration nunca foi aplicada (em 27/11 trg_alcada_guarda não existe em nenhuma tabela).
--
--   Revisão r1 (28/11) — dois buracos que a trava da 915100 sozinha deixa no ofício:
--   1. Aprovação velha valendo para texto novo. fn_doc_gen_congelar devolve APROVADO → RASCUNHO
--      quando o texto muda, e retirar da aprovação volta a RASCUNHO — nos dois casos a cadeia
--      fica (é histórico). A trava deixa o cliente pôr PENDENTE direto se a cadeia não mudar
--      (só fn_alcada_enviar zera a cadeia). Aí fn_alcada_proximo_nivel vê o nível 1 já feito e
--      pede o 2 — que, sem aprovador cadastrado no nível, qualquer membro aprova: o texto novo
--      era emitido sem o aprovador ter visto. Também num PATCH só {assunto, approval_status:
--      'PENDENTE'} sobre o aprovado.
--   2. Ofício inserido já emitido. fn_doc_gen_congelar é só BEFORE UPDATE e a policy de INSERT
--      só confere a organização: um membro inseria {status:'EMITIDO', numero:'OF-…', …}.
--
-- O QUE MUDA
--   trg_alcada_guarda (BEFORE INSERT OR UPDATE) SÓ em doc_gen_documentos, com a MESMA função da
--   915100. Para quem escreve pela API (current_user authenticated/anon) fora das RPCs da alçada:
--     • INSERT não nasce APROVADO nem com passos;
--     • UPDATE não vira APROVADO, não grava passo na cadeia, não rebaixa níveis em curso;
--     • ofício aprovado (ou com passo) não muda de organização.
--   Segue livre o que só TIRA aprovação: retirar da aprovação (PENDENTE → RASCUNHO,
--   docGenDocumentoService.retirarDaAprovacao) e salvar o texto (fn_doc_gen_congelar devolve
--   APROVADO → RASCUNHO depois da trava — gatilho 'trg_alcada_…' roda antes de 'trg_doc_gen_…').
--   Quem grava a aprovação passa como antes: fn_alcada_enviar/aprovar/rejeitar (SECURITY
--   INVOKER, ligam orcacloud.alcada_servidor só no UPDATE da decisão) e as SECURITY DEFINER
--   (doc_gen_emitir, doc_gen_tramitar, mover_contrato_organizacao: current_user é o dono).
--   Recusa = 42501 "ALCADA_NAO_PERMITE: …" (utils/alcada.mensagemDaAlcada mostra a frase).
--   Ofício não usa os ramos de internal_transactions/process_instance_steps da função — eles só
--   rodam nas tabelas deles (TG_TABLE_NAME), e esta migration não liga a trava nelas.
--   ⚠️ O corpo copiado chama public.fn_alcada_org_condominio(uuid), que SÓ a 915100 cria (não
--   existe no banco em 28/11). Em doc_gen_documentos é código morto (ramo de
--   internal_transactions); ligar trg_alcada_guarda em internal_transactions sem aplicar a 915100
--   inteira QUEBRA toda gravação de título a pagar que mude a organização (função inexistente).
--
--   trg_doc_gen_trava_entrada (BEFORE INSERT OR UPDATE, fn_doc_gen_trava_entrada) — r1:
--     • pela API (current_user authenticated/anon, fora das RPCs da alçada), o ofício NUNCA entra
--       em PENDENTE direto — nem INSERT PENDENTE, nem UPDATE de outro estado para PENDENTE. Só
--       fn_alcada_enviar, que zera a cadeia: o texto novo pede o nível 1 de novo. O front já envia
--       só pela RPC (docGenDocumentoService.enviarParaAprovacao → approvalService.submit).
--     • QUALQUER escritor: INSERT nasce RASCUNHO, sem numero/emitido_em/emitido_por — salvo com a
--       marca da emissão (docgen.emitindo = 'on'). Caminhos que inserem ofício, conferidos em 28/11:
--       só o front (Novo ofício, rascunho). Nenhuma função do banco nem Edge Function faz INSERT em
--       doc_gen_documentos (pg_proc e supabase/); mover_contrato_organizacao só faz UPDATE da
--       organização. A frente feat/edital-assembleia (aplicar_20271127960000) cria
--       trg_doc_gen_edital_assembleia com a mesma regra só para edital (assembleia_id) — nomes não
--       colidem, e o dela ordena ANTES deste ('…edital…' < '…trava…'): no edital, a mensagem
--       dela (HINT edital_invalido) é a que aparece para INSERT emitido. Para INSERT de edital já
--       APROVADO, trg_alcada_guarda (desta migration ou da 915100) dispara antes da dela.
--     Recusas = 42501 (ALCADA_NAO_PERMITE na primeira, como a trava da alçada).
--
-- RELAÇÃO COM A 915100
--   Esta é a parte "ofício" da 915100, adiantada. A função só é criada se ainda não existir:
--   se a 915100 já tiver sido aplicada (ou vier a ser, com o corpo revisado), a versão dela
--   prevalece — esta migration nunca a sobrescreve. A 915100, aplicada depois, faz
--   CREATE OR REPLACE da função e recria trg_alcada_guarda nas 8 tabelas, inclusive esta.
--
-- REGRA #7 (CLAUDE.md)
--   P1: sem policy nova.
--   P2: fn_alcada_guarda e fn_doc_gen_trava_entrada são funções de gatilho, SECURITY INVOKER de
--       propósito (current_user é quem escreve); REVOKE de PUBLIC e anon. Nenhuma DEFINER nova.
--   P3: sem Edge Function.
--
-- ORDEM: pode ir a qualquer momento — o front já aprova pelas RPCs (aplicar_20271118915000,
-- aplicada; approvalService desde o PR #576) e não grava approval_status = 'APROVADO' direto.
--
-- COMO CONFERIR
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.doc_gen_documentos'::regclass
--      AND NOT tgisinternal ORDER BY 1;   -- trg_alcada_guarda (1º BEFORE) e trg_doc_gen_trava_entrada
--   npx supabase db query --linked -f scripts/teste-docgen-aprovacao-trava.sql   -- TUDO OK
--
-- ROLLBACK
--   DROP TRIGGER trg_alcada_guarda ON public.doc_gen_documentos;
--   DROP TRIGGER trg_doc_gen_trava_entrada ON public.doc_gen_documentos;
--   DROP FUNCTION public.fn_doc_gen_trava_entrada();
--   (fn_alcada_guarda fica: é a da 915100, e sem gatilho não faz nada)
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── A trava (corpo idêntico ao da aplicar_20271118915100; só criada se não existir) ──
DO $do$
BEGIN
    IF to_regprocedure('public.fn_alcada_guarda()') IS NOT NULL THEN
        RAISE NOTICE 'fn_alcada_guarda já existe (915100 aplicada?) — mantida como está.';
        RETURN;
    END IF;
    EXECUTE $guarda$
CREATE OR REPLACE FUNCTION public.fn_alcada_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cliente   boolean := current_user IN ('authenticated', 'anon')
                           AND COALESCE(current_setting('orcacloud.alcada_servidor', true), '') <> 'on';
    v_st        text    := COALESCE(NEW.approval_status, 'RASCUNHO');
    v_cad       jsonb   := CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END;
    v_st_ant    text;
    v_cad_ant   jsonb;
    v_em_curso  boolean;
    v_ctx       record;
    v_org_mudou boolean := false;
    v_favorecido_mudou boolean := false;
    v_piso_ant  numeric;
    v_piso      numeric;
    v_niveis    integer;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF v_cliente THEN
            IF v_st = 'APROVADO' THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item novo não nasce aprovado — a aprovação é feita em Financeiro › Aprovações.'
                    USING ERRCODE = '42501';
            END IF;
            IF jsonb_array_length(v_cad) > 0 THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item novo não traz etapas de aprovação.'
                    USING ERRCODE = '42501';
            END IF;
            IF v_st = 'PENDENTE' THEN
                SELECT * INTO v_ctx FROM public.fn_alcada_contexto(TG_TABLE_NAME, to_jsonb(NEW));
                NEW.approval_required_levels := LEAST(2, GREATEST(COALESCE(NEW.approval_required_levels, 1),
                    COALESCE((SELECT f.niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f), 1)));
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    v_st_ant   := COALESCE(OLD.approval_status, 'RASCUNHO');
    v_cad_ant  := CASE WHEN jsonb_typeof(OLD.approval_chain) = 'array' THEN OLD.approval_chain ELSE '[]'::jsonb END;
    v_em_curso := v_st_ant = 'APROVADO' OR (v_st_ant = 'PENDENTE' AND jsonb_array_length(v_cad_ant) > 0);

    IF v_cliente THEN
        IF v_cad IS DISTINCT FROM v_cad_ant AND (jsonb_array_length(v_cad) > 0 OR v_st = 'APROVADO') THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: as etapas da aprovação só são gravadas pela própria aprovação (Financeiro › Aprovações). Recarregue a tela e tente de novo.'
                USING ERRCODE = '42501';
        END IF;
        IF v_st = 'APROVADO' AND v_st_ant <> 'APROVADO' THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: só a aprovação marca o item como aprovado (Financeiro › Aprovações). Recarregue a tela e tente de novo.'
                USING ERRCODE = '42501';
        END IF;
        IF COALESCE(NEW.approval_required_levels, 1) < COALESCE(OLD.approval_required_levels, 1)
           AND v_st IN ('PENDENTE', 'APROVADO') AND v_st_ant IN ('PENDENTE', 'APROVADO') THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o número de níveis da aprovação não diminui no meio da aprovação.'
                USING ERRCODE = '42501';
        END IF;
        IF v_st = 'PENDENTE'
           AND (v_st_ant <> 'PENDENTE' OR NEW.approval_required_levels IS DISTINCT FROM OLD.approval_required_levels) THEN
            SELECT * INTO v_ctx FROM public.fn_alcada_contexto(TG_TABLE_NAME, to_jsonb(NEW));
            NEW.approval_required_levels := LEAST(2, GREATEST(COALESCE(NEW.approval_required_levels, 1),
                COALESCE((SELECT f.niveis FROM public.fn_alcada_faixa(v_ctx.org, v_ctx.valor) f), 1)));
        END IF;

        IF TG_TABLE_NAME = 'process_instance_steps' THEN
            IF v_em_curso AND (to_jsonb(NEW) ->> 'process_instance_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'process_instance_id') THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: etapa aprovada (ou com aprovação em curso) não troca de processo.'
                    USING ERRCODE = '42501';
            END IF;
        ELSIF TG_TABLE_NAME <> 'internal_transactions' AND v_em_curso
              AND (to_jsonb(NEW) ->> 'organization_id') IS DISTINCT FROM (to_jsonb(OLD) ->> 'organization_id') THEN
            RAISE EXCEPTION 'ALCADA_NAO_PERMITE: item aprovado (ou com aprovação em curso) não muda de organização — a aprovação vale na organização em que foi dada.'
                USING ERRCODE = '42501';
        END IF;

        -- Título a pagar não entra em organização de condomínio (lá não há alçada): seria o
        -- jeito de tirar um título da fila. Mover entre organizações é do servidor
        -- (mover_contrato_organizacao); o boleto só muda de organização antes de virar título.
        IF TG_TABLE_NAME = 'internal_transactions' THEN
            IF NEW.direction = 'DEBIT' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
                IF public.fn_alcada_org_condominio(NEW.organization_id)
                   AND NOT public.fn_alcada_org_condominio(OLD.organization_id) THEN
                    RAISE EXCEPTION 'ALCADA_NAO_PERMITE: título a pagar não é levado para a organização de um condomínio.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Título a pagar com aprovação dada (ou em curso) volta para aprovação quando:
    --   • muda de ORGANIZAÇÃO — qualquer escritor, inclusive mover_contrato_organizacao: a
    --     aprovação vale na organização em que foi dada (decisão do usuário, 18/11). Só título em
    --     aberto: o que já foi pago não sai mais pela alçada;
    --   • muda o FAVORECIDO — quem escreve pela API, título em aberto (decisão do usuário, 18/11):
    --     fornecedor, colaborador ou cliente (supplier_id/employee_id/party_id) diferente; ou, sem
    --     nenhum desses ids, o nome (party_name) diferente. Com o id igual, trocar só o nome é
    --     renomear o mesmo cadastro (propagação de nome) e mantém. Preencher o id num título que
    --     só tinha o nome REABRE: o título não guarda CPF/CNPJ, nomes não são únicos e o cadastro
    --     escolhido é o que o PIX vai usar — não há como provar que é o mesmo favorecido;
    --   • o VALOR sobe para faixa de piso maior — qualquer escritor (sync, conciliação…).
    -- IF aninhado: as colunas abaixo só existem em internal_transactions, e o PL/pgSQL não
    -- garante parar no primeiro AND falso.
    IF TG_TABLE_NAME = 'internal_transactions' THEN
        IF NEW.direction = 'DEBIT'
           AND NEW.darf_id IS NULL
           AND COALESCE(NEW.approval_status, 'RASCUNHO') IN ('APROVADO', 'PENDENTE')
           AND COALESCE(NEW.status, 'PENDING') <> 'CANCELLED'
           AND COALESCE(NEW.business_status, '') NOT IN ('RETIDO', 'CANCELADO')
           AND COALESCE(NEW.source_system, '') NOT IN ('ASAAS_FEE', 'DARF')
           AND COALESCE(NEW.entry_type, 'PRINCIPAL') <> 'CONTRA' THEN
            IF v_em_curso AND COALESCE(NEW.status, 'PENDING') = 'PENDING' THEN
                IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
                    v_org_mudou := true;
                ELSIF v_cliente AND (
                       NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
                    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
                    OR NEW.party_id    IS DISTINCT FROM OLD.party_id
                    OR (COALESCE(NEW.supplier_id, NEW.employee_id, NEW.party_id) IS NULL
                        AND lower(regexp_replace(btrim(COALESCE(NEW.party_name, '')), '\s+', ' ', 'g'))
                         <> lower(regexp_replace(btrim(COALESCE(OLD.party_name, '')), '\s+', ' ', 'g')))) THEN
                    v_favorecido_mudou := true;
                END IF;
            END IF;
            IF v_org_mudou OR v_favorecido_mudou OR NEW.amount IS DISTINCT FROM OLD.amount THEN
                SELECT f.faixa_min, f.niveis INTO v_piso, v_niveis FROM public.fn_alcada_faixa(NEW.organization_id, NEW.amount) f;
                IF NOT v_org_mudou THEN
                    SELECT f.faixa_min INTO v_piso_ant FROM public.fn_alcada_faixa(NEW.organization_id, OLD.amount) f;
                END IF;
            END IF;
            IF v_org_mudou OR v_favorecido_mudou
               OR (NEW.amount IS DISTINCT FROM OLD.amount AND v_piso IS NOT NULL AND (v_piso_ant IS NULL OR v_piso > v_piso_ant)) THEN
                IF NOT public.fn_alcada_org_condominio(NEW.organization_id) THEN
                    IF NEW.approval_status = 'APROVADO'
                       OR jsonb_array_length(CASE WHEN jsonb_typeof(NEW.approval_chain) = 'array' THEN NEW.approval_chain ELSE '[]'::jsonb END) > 0 THEN
                        NEW.approval_status := 'PENDENTE';
                        NEW.approval_chain  := '[]'::jsonb;
                        IF NEW.business_status = 'APROVADO' AND COALESCE(NEW.status, 'PENDING') = 'PENDING' THEN
                            NEW.business_status := 'PREVISTO';
                        END IF;
                        IF NEW.status = 'CONCILIATED' AND NEW.pago_sem_alcada_em IS NULL THEN
                            NEW.pago_sem_alcada_em := now();
                        END IF;
                    END IF;
                    NEW.approval_required_levels := COALESCE(v_niveis, 1);
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$;
    $guarda$;
END
$do$;

REVOKE EXECUTE ON FUNCTION public.fn_alcada_guarda() FROM PUBLIC, anon;

-- ── Só em doc_gen_documentos (a 915100 liga nas 8 tabelas) ────────────────────
-- Nome 'trg_alcada_…' vem antes de trg_doc_gen_congelar e de trg_zz_alcada_trava_passo: a trava
-- vê o que o cliente mandou, antes de o congelamento devolver APROVADO → RASCUNHO.
DROP TRIGGER IF EXISTS trg_alcada_guarda ON public.doc_gen_documentos;
CREATE TRIGGER trg_alcada_guarda BEFORE INSERT OR UPDATE ON public.doc_gen_documentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_alcada_guarda();

-- ── Entrada do ofício (revisão r1) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_doc_gen_trava_entrada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_cliente  boolean := current_user IN ('authenticated', 'anon')
                          AND COALESCE(current_setting('orcacloud.alcada_servidor', true), '') <> 'on';
    v_emitindo boolean := COALESCE(current_setting('docgen.emitindo', true), '') = 'on';
BEGIN
    -- 1. Em aprovação só pela RPC de envio (fn_alcada_enviar zera a cadeia: a aprovação dada a
    --    um texto anterior não conta para o texto de agora).
    IF v_cliente AND NEW.approval_status = 'PENDENTE'
       AND (TG_OP = 'INSERT' OR OLD.approval_status IS DISTINCT FROM 'PENDENTE') THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: o ofício vai para aprovação só pelo botão "Enviar para aprovação". Recarregue a tela e tente de novo.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Nasce rascunho, sem número: número e emissão só pela função de emissão.
    IF TG_OP = 'INSERT' AND NOT v_emitindo
       AND (NEW.status IS DISTINCT FROM 'RASCUNHO' OR NEW.numero IS NOT NULL
            OR NEW.emitido_em IS NOT NULL OR NEW.emitido_por IS NOT NULL) THEN
        RAISE EXCEPTION 'O documento nasce como rascunho: o número sai só pela emissão.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.fn_doc_gen_trava_entrada() FROM PUBLIC, anon;

-- Nome depois de trg_doc_gen_edital_assembleia (frente do edital): lá, a mensagem dela vem antes.
DROP TRIGGER IF EXISTS trg_doc_gen_trava_entrada ON public.doc_gen_documentos;
CREATE TRIGGER trg_doc_gen_trava_entrada BEFORE INSERT OR UPDATE ON public.doc_gen_documentos
    FOR EACH ROW EXECUTE FUNCTION public.fn_doc_gen_trava_entrada();

COMMIT;
