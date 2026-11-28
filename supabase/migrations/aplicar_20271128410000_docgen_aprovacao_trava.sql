-- ==========================================================================
-- Ofícios: só a aprovação marca o ofício como aprovado (e ofício não nasce emitido)
-- Date: 2026-11-28 (pedido de 27/11/2026; revisões r1, r2 e r3 em 28/11)
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
--   Revisão r2 (28/11) — a mesma porta do 1 pela rejeição. A r1 dizia "o cliente só entra em
--   PENDENTE por fn_alcada_enviar, que zera a cadeia" — falso: o REENVIO
--   (fn_alcada_enviar(…, p_reenvio => true), executável por authenticated) exige só
--   approval_status = 'REJEITADO' e MANTÉM a cadeia, e REJEITADO o cliente gravava direto.
--   Ataque provado com a r1: b aprova o texto X → a troca para Y (RASCUNHO, cadeia [L1 b]) →
--   PATCH {approval_status:'REJEITADO'} → reenvio → PENDENTE [L1 b] → nível 2 sem aprovador →
--   a aprova → APROVADO → OF-0001/2026 emitido com o texto Y, que b não viu. Variantes: APROVADO
--   → REJEITADO direto; PENDENTE com nível 1 dado → REJEITADO direto.
--
--   Revisão r3 (28/11, decisão do usuário) — a porta do MODELO. doc_gen_emitir (e doc_gen_assinar)
--   liam exige_aprovacao/exige_assinatura do modelo ATUAL. Qualquer membro edita modelos (RLS
--   doc_gen_modelos_update: só a organização): desligava a exigência, emitia e religava. Ou trocava
--   o modelo_id do rascunho — modelo_id está fora de v_fora_do_texto, e a FK não olha a RLS, então
--   valia até modelo de OUTRA organização. Provado com a r2: desligar no modelo → emitir →
--   ok:OF-0006/2026 (BEGIN … ROLLBACK).
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
--     • pela API (current_user authenticated/anon, fora das RPCs da alçada; função DEFINER roda
--       como o dono e não conta) a ÚNICA mudança de approval_status aceita é PARA 'RASCUNHO' (o
--       "retirar", e o que fn_doc_gen_congelar faz ao editar um aprovado); INSERT só com
--       'RASCUNHO' (a coluna é NOT NULL DEFAULT 'RASCUNHO' — NULL não chega aqui). PENDENTE,
--       APROVADO e REJEITADO só pelas RPCs: fn_alcada_enviar (o envio zera a cadeia; o reenvio a
--       mantém, mas só existe depois de uma rejeição DE VERDADE, de fn_alcada_rejeitar, e a rodada
--       recomeça no nível 1 depois dela), fn_alcada_aprovar e fn_alcada_rejeitar.
--       Front conferido em 28/11: envia e reenvia por docGenDocumentoService.enviarParaAprovacao
--       → approvalService.submit (o botão "Reenviar" do ofício é o mesmo envio, sem p_reenvio),
--       rejeita por fn_alcada_rejeitar, retirarDaAprovacao grava 'RASCUNHO'.
--     • QUALQUER escritor: INSERT nasce RASCUNHO, sem numero/emitido_em/emitido_por — salvo com a
--       marca da emissão (docgen.emitindo = 'on'). Caminhos que inserem ofício, conferidos em 28/11:
--       só o front (Novo ofício, rascunho). Em main, nenhuma função do banco nem Edge Function faz
--       INSERT em doc_gen_documentos (pg_proc e supabase/); mover_contrato_organizacao só faz
--       UPDATE da organização. A frente feat/edital-assembleia acrescenta _assembleia_edital_criar
--       (SECURITY DEFINER), que insere edital RASCUNHO sem número — passa nas duas regras, e a
--       exigência é preenchida do modelo (DEFINER = servidor, não cliente). A frente feat/edital-assembleia (aplicar_20271127960000) cria
--       trg_doc_gen_edital_assembleia com a mesma regra só para edital (assembleia_id) — nomes não
--       colidem, e o dela ordena ANTES deste ('…edital…' < '…trava…'): no edital, a mensagem
--       dela (HINT edital_invalido) é a que aparece para INSERT emitido. Para INSERT de edital já
--       APROVADO, trg_alcada_guarda (desta migration ou da 915100) dispara antes da dela.
--     Recusas = 42501 (ALCADA_NAO_PERMITE na primeira, como a trava da alçada).
--
--   r3 — a exigência é a do modelo NA CRIAÇÃO, guardada no ofício:
--     • colunas doc_gen_documentos.exige_aprovacao / exige_assinatura (NOT NULL, sem default):
--       preenchidas pelo trg_doc_gen_trava_entrada a partir do modelo no INSERT (o servidor pode
--       mandar o valor; o cliente não — recusa se mandar). Backfill dos existentes pelo modelo
--       (0 ofícios em 28/11; idempotente: só as NULL, com fn_doc_gen_congelar e o updated_at
--       desligados durante o UPDATE — o congelamento recusaria tocar em emitido).
--     • o cliente não muda as colunas; elas só mudam junto com o modelo_id.
--     • modelo_id muda pela API só no rascunho ANTES do envio (status E approval_status =
--       'RASCUNHO') e só para modelo da MESMA organização do ofício (também no INSERT); a
--       exigência é relida do modelo novo. Escolher, no rascunho, outro modelo da organização que
--       não exige é legítimo (visível, antes de qualquer aprovação). ⚠️ Fica a porta de QUEM
--       edita modelos: um membro pode criar/editar um modelo sem exigência e escolher ele antes de
--       enviar — fechar isso é permissão de editar modelos (decisão de produto), não esta trava.
--     • doc_gen_emitir e doc_gen_assinar: reescritas da definição VIVA de 28/11
--       (pg_get_functiondef), mudando só a leitura da exigência (do ofício, não do modelo).
--       Mensagens iguais. REVOKE/GRANT repetidos (ACL viva: authenticated e service_role).
--       ⚠️ A frente feat/edital-assembleia (aplicar_20271127960000) troca doc_gen_emitir por um
--       invólucro de _doc_gen_emitir_nucleo, que lê o modelo: ao rebasear sobre esta, o núcleo tem
--       de ler v_doc.exige_aprovacao/exige_assinatura.
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
--       propósito (current_user é quem escreve); REVOKE de PUBLIC e anon. Nenhuma DEFINER nova;
--       doc_gen_emitir e doc_gen_assinar (DEFINER, recriadas) seguem com a autorização de membro
--       DENTRO delas, como antes, e o REVOKE de PUBLIC/anon repetido.
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
--   doc_gen_emitir / doc_gen_assinar: o corpo de aplicar_20271010000500 (leitura do modelo).
--   As colunas exige_* podem ficar (ninguém mais as lê).
--   (fn_alcada_guarda fica: é a da 915100, e sem gatilho não faz nada)
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ==========================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── r3: a exigência do modelo, guardada no ofício ─────────────────────────────
ALTER TABLE public.doc_gen_documentos
    ADD COLUMN IF NOT EXISTS exige_aprovacao  BOOLEAN,
    ADD COLUMN IF NOT EXISTS exige_assinatura BOOLEAN;
COMMENT ON COLUMN public.doc_gen_documentos.exige_aprovacao IS
  'O que o modelo exigia na criação (ou na troca de modelo, no rascunho): emitir/assinar exigem APROVADO. Só o servidor grava.';
COMMENT ON COLUMN public.doc_gen_documentos.exige_assinatura IS
  'O que o modelo exigia na criação (ou na troca de modelo, no rascunho): emitir exige todas as assinaturas. Só o servidor grava.';

DO $do$
BEGIN
    IF EXISTS (SELECT 1 FROM public.doc_gen_documentos WHERE exige_aprovacao IS NULL OR exige_assinatura IS NULL) THEN
        -- O congelamento recusaria tocar em emitido, e o rascunho em aprovação; updated_at não é
        -- "alguém editou". Desligados só durante este UPDATE.
        ALTER TABLE public.doc_gen_documentos DISABLE TRIGGER trg_doc_gen_congelar;
        ALTER TABLE public.doc_gen_documentos DISABLE TRIGGER trg_doc_gen_documentos_updated_at;
        UPDATE public.doc_gen_documentos d
           SET exige_aprovacao  = COALESCE(d.exige_aprovacao, m.exige_aprovacao),
               exige_assinatura = COALESCE(d.exige_assinatura, m.exige_assinatura)
          FROM public.doc_gen_modelos m
         WHERE m.id = d.modelo_id
           AND (d.exige_aprovacao IS NULL OR d.exige_assinatura IS NULL);
        ALTER TABLE public.doc_gen_documentos ENABLE TRIGGER trg_doc_gen_congelar;
        ALTER TABLE public.doc_gen_documentos ENABLE TRIGGER trg_doc_gen_documentos_updated_at;
    END IF;
END
$do$;

ALTER TABLE public.doc_gen_documentos
    ALTER COLUMN exige_aprovacao  SET NOT NULL,
    ALTER COLUMN exige_assinatura SET NOT NULL;

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
    v_modelo   record;
BEGIN
    -- 1. Pela API, a aprovação só RECUA para rascunho (retirar; editar um aprovado). Enviar,
    --    reenviar, aprovar e rejeitar são das RPCs da alçada — senão uma rejeição forjada abriria
    --    o reenvio, que mantém a cadeia, e a aprovação de um texto anterior contaria no de agora.
    IF v_cliente
       AND ((TG_OP = 'INSERT' AND NEW.approval_status IS DISTINCT FROM 'RASCUNHO')
            OR (TG_OP = 'UPDATE' AND NEW.approval_status IS DISTINCT FROM OLD.approval_status
                AND NEW.approval_status IS DISTINCT FROM 'RASCUNHO')) THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: a situação da aprovação do ofício muda só pelos botões de aprovação (enviar, aprovar, rejeitar). Recarregue a tela e tente de novo.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Nasce rascunho, sem número: número e emissão só pela função de emissão.
    IF TG_OP = 'INSERT' AND NOT v_emitindo
       AND (NEW.status IS DISTINCT FROM 'RASCUNHO' OR NEW.numero IS NOT NULL
            OR NEW.emitido_em IS NOT NULL OR NEW.emitido_por IS NOT NULL) THEN
        RAISE EXCEPTION 'O documento nasce como rascunho: o número sai só pela emissão.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. (r3) A exigência é a do modelo na criação, guardada no ofício. O cliente não a grava;
    --    ela só muda junto com o modelo, e o modelo só muda no rascunho antes do envio, para um
    --    da mesma organização (a FK aceitaria modelo de qualquer organização).
    IF TG_OP = 'INSERT' THEN
        IF v_cliente THEN
            IF NEW.exige_aprovacao IS NOT NULL OR NEW.exige_assinatura IS NOT NULL THEN
                RAISE EXCEPTION 'ALCADA_NAO_PERMITE: a exigência de aprovação e assinatura vem do modelo — não se grava no ofício.'
                    USING ERRCODE = '42501';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM public.doc_gen_modelos m
                            WHERE m.id = NEW.modelo_id AND m.organization_id = NEW.organization_id) THEN
                RAISE EXCEPTION 'O modelo tem de ser da mesma organização do ofício.' USING ERRCODE = '42501';
            END IF;
        END IF;
        IF NEW.exige_aprovacao IS NULL OR NEW.exige_assinatura IS NULL THEN
            SELECT m.exige_aprovacao, m.exige_assinatura INTO v_modelo
              FROM public.doc_gen_modelos m WHERE m.id = NEW.modelo_id;
            NEW.exige_aprovacao  := COALESCE(NEW.exige_aprovacao, v_modelo.exige_aprovacao);
            NEW.exige_assinatura := COALESCE(NEW.exige_assinatura, v_modelo.exige_assinatura);
        END IF;
    ELSIF NEW.modelo_id IS DISTINCT FROM OLD.modelo_id THEN
        IF v_cliente THEN
            IF OLD.status IS DISTINCT FROM 'RASCUNHO' OR OLD.approval_status IS DISTINCT FROM 'RASCUNHO' THEN
                RAISE EXCEPTION 'O modelo do ofício só muda no rascunho, antes de enviar para aprovação.' USING ERRCODE = '42501';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM public.doc_gen_modelos m
                            WHERE m.id = NEW.modelo_id AND m.organization_id = NEW.organization_id) THEN
                RAISE EXCEPTION 'O modelo tem de ser da mesma organização do ofício.' USING ERRCODE = '42501';
            END IF;
        END IF;
        SELECT m.exige_aprovacao, m.exige_assinatura INTO v_modelo
          FROM public.doc_gen_modelos m WHERE m.id = NEW.modelo_id;
        NEW.exige_aprovacao  := v_modelo.exige_aprovacao;
        NEW.exige_assinatura := v_modelo.exige_assinatura;
    ELSIF v_cliente AND (NEW.exige_aprovacao IS DISTINCT FROM OLD.exige_aprovacao
                         OR NEW.exige_assinatura IS DISTINCT FROM OLD.exige_assinatura) THEN
        RAISE EXCEPTION 'ALCADA_NAO_PERMITE: a exigência de aprovação e assinatura vem do modelo — não se grava no ofício.'
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

-- ── r3: emitir e assinar leem a exigência do OFÍCIO (definição viva de 28/11; só isso muda) ──
CREATE OR REPLACE FUNCTION public.doc_gen_emitir(p_documento_id uuid, p_values jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_doc       public.doc_gen_documentos%ROWTYPE;
    v_slots     JSONB;
    v_prefix    TEXT;
    v_separator TEXT;
    v_padding   SMALLINT;
    v_year_suf  BOOLEAN;
    v_values    JSONB;
    v_sigla     TEXT;
    v_org_code  TEXT;
    v_data      DATE;
    v_ano       INTEGER;
    v_token     TEXT;
    v_parts     TEXT[] := '{}';
    v_scope     TEXT;
    v_seq       INTEGER;
    v_numero    TEXT;
    v_exige_apr BOOLEAN;
    v_exige_ass BOOLEAN;
    v_faltam    TEXT;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Autorização AQUI DENTRO (REGRA #7): membro da organização do documento.
    IF NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = v_doc.organization_id
          AND (m.user_id = auth.uid() OR m.email = auth.jwt() ->> 'email')
    ) THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    -- Idempotente: segundo clique devolve o mesmo número.
    IF v_doc.status <> 'RASCUNHO' AND v_doc.numero IS NOT NULL AND v_doc.status <> 'CANCELADO' THEN
        RETURN v_doc.numero;
    END IF;
    IF v_doc.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'Só rascunho pode ser emitido.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(btrim(v_doc.assunto), '') = '' OR v_doc.destinatario_snapshot IS NULL THEN
        RAISE EXCEPTION 'Documento sem assunto ou sem destinatário — não pode ser emitido.' USING ERRCODE = '22023';
    END IF;

    -- F4: aprovação e assinatura. Revisão r3 (28/11): o que o modelo exigia na CRIAÇÃO do ofício,
    -- guardado nele — não o modelo de agora, que qualquer membro edita.
    v_exige_apr := v_doc.exige_aprovacao;
    v_exige_ass := v_doc.exige_assinatura;
    IF v_doc.approval_status = 'PENDENTE' THEN
        RAISE EXCEPTION 'O ofício está em aprovação — aguarde a decisão para emitir.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_exige_apr, false) AND v_doc.approval_status <> 'APROVADO' THEN
        RAISE EXCEPTION 'Este modelo exige aprovação antes da emissão.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_exige_ass, false) THEN
        SELECT string_agg(s ->> 'nome', ', ') INTO v_faltam
          FROM jsonb_array_elements(COALESCE(v_doc.signatarios, '[]'::jsonb)) s
         WHERE NOT EXISTS (
            SELECT 1 FROM public.doc_gen_assinaturas a
             WHERE a.documento_id = v_doc.id AND a.versao = v_doc.versao AND a.member_id::text = s ->> 'memberId'
         );
        IF v_faltam IS NOT NULL THEN
            RAISE EXCEPTION 'Falta a assinatura de: %.', v_faltam USING ERRCODE = '22023';
        END IF;
    END IF;

    -- Máscara da organização, ou o padrão do catálogo (services/documentNumbering/catalog.ts — OFICIO).
    SELECT slots, prefix, separator, seq_padding, year_suffix
      INTO v_slots, v_prefix, v_separator, v_padding, v_year_suf
      FROM public.document_numbering_settings
     WHERE organization_id = v_doc.organization_id AND doc_type = 'OFICIO';
    IF NOT FOUND THEN
        v_slots := '["PREFIX", "DEPARTAMENTO"]'::jsonb;
        v_prefix := 'OF';
        v_year_suf := true;
        -- Separador e dígitos valem para a PÁGINA inteira de Nomenclatura (decisão de
        -- 2026-08-30): sem linha salva do Ofício, seguem os da organização — senão a
        -- tela mostraria OF-ENG-0001/2026 e a emissão daria OF-ENG-001/2026.
        SELECT separator, seq_padding INTO v_separator, v_padding
          FROM public.document_numbering_settings
         WHERE organization_id = v_doc.organization_id
         ORDER BY updated_at DESC
         LIMIT 1;
        v_separator := COALESCE(v_separator, '-');
        v_padding := COALESCE(v_padding, 3);
    END IF;

    -- Códigos que o banco resolve sozinho; o resto vem do cliente (só entra no texto do número).
    v_values := COALESCE(p_values, '{}'::jsonb) - 'DEPARTAMENTO' - 'ORGANIZACAO';
    IF v_doc.department_id IS NOT NULL THEN
        SELECT NULLIF(btrim(sigla), '') INTO v_sigla FROM public.company_departments WHERE id = v_doc.department_id;
        IF v_sigla IS NOT NULL THEN v_values := v_values || jsonb_build_object('DEPARTAMENTO', upper(v_sigla)); END IF;
    END IF;
    SELECT NULLIF(btrim(code), '') INTO v_org_code FROM public.organizations WHERE id = v_doc.organization_id;
    IF v_org_code IS NOT NULL THEN v_values := v_values || jsonb_build_object('ORGANIZACAO', v_org_code); END IF;

    -- Data automática = a da emissão (fuso de Brasília).
    v_data := COALESCE(v_doc.data_documento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    v_ano := EXTRACT(YEAR FROM v_data)::INTEGER;

    -- Escopo do contador = combinação das variáveis da máscara (+ o ano, se reinicia por ano).
    FOR v_token IN SELECT jsonb_array_elements_text(v_slots)
    LOOP
        IF v_token NOT IN ('EMPTY', 'PREFIX') AND COALESCE(v_values ->> v_token, '') <> '' THEN
            v_parts := v_parts || (v_values ->> v_token);
        END IF;
    END LOOP;
    IF v_year_suf THEN v_parts := v_parts || v_ano::TEXT; END IF;
    v_scope := array_to_string(v_parts, '|');

    v_seq := public.fn_next_document_seq(v_doc.organization_id, 'OFICIO', v_scope);
    v_numero := public.fn_format_document_number(v_slots, v_values, v_prefix, v_separator, v_seq, v_padding, v_year_suf, v_ano);

    PERFORM set_config('docgen.emitindo', 'on', true);
    PERFORM set_config('docgen.evento_dados', jsonb_build_object('numero', v_numero)::text, true);
    UPDATE public.doc_gen_documentos
       SET status = 'EMITIDO',
           numero = v_numero,
           data_documento = v_data,
           emitido_por = auth.jwt() ->> 'email',
           emitido_em = NOW()
     WHERE id = v_doc.id;
    PERFORM set_config('docgen.emitindo', 'off', true);
    PERFORM set_config('docgen.evento_dados', '', true);

    -- A versão salva que vira o documento oficial fica congelada.
    UPDATE public.doc_gen_documento_versoes
       SET congelada = true
     WHERE documento_id = v_doc.id AND versao = v_doc.versao;

    RETURN v_numero;
END;
$function$;

REVOKE ALL ON FUNCTION public.doc_gen_emitir(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_emitir(UUID, JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.doc_gen_assinar(p_documento_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_doc     public.doc_gen_documentos%ROWTYPE;
    v_membro  RECORD;
    v_exige   BOOLEAN;
    v_quando  TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_doc FROM public.doc_gen_documentos WHERE id = p_documento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Autorização AQUI DENTRO (REGRA #7): quem assina é o membro da sessão.
    SELECT m.id, COALESCE(NULLIF(btrim(m.name), ''), split_part(m.email, '@', 1)) AS nome, m.email
      INTO v_membro
      FROM public.organization_members m
     WHERE m.organization_id = v_doc.organization_id
       AND (m.user_id = auth.uid() OR lower(m.email) = lower(auth.jwt() ->> 'email'))
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sem acesso a esta organização.' USING ERRCODE = '42501';
    END IF;

    IF v_doc.status <> 'RASCUNHO' THEN
        RAISE EXCEPTION 'O ofício já foi emitido — a assinatura é antes da emissão.' USING ERRCODE = '22023';
    END IF;
    IF v_doc.approval_status = 'PENDENTE' THEN
        RAISE EXCEPTION 'O ofício está em aprovação — assine depois da decisão.' USING ERRCODE = '22023';
    END IF;
    -- Revisão r3 (28/11): a exigência guardada no ofício, não a do modelo de agora.
    v_exige := v_doc.exige_aprovacao;
    IF COALESCE(v_exige, false) AND v_doc.approval_status <> 'APROVADO' THEN
        RAISE EXCEPTION 'Este modelo exige aprovação antes da assinatura.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_doc.signatarios, '[]'::jsonb)) s
         WHERE s ->> 'memberId' = v_membro.id::text
    ) THEN
        RAISE EXCEPTION 'Você não é signatário deste ofício.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.doc_gen_assinaturas (documento_id, organization_id, member_id, nome, email, versao)
    VALUES (v_doc.id, v_doc.organization_id, v_membro.id, v_membro.nome, v_membro.email, v_doc.versao)
    ON CONFLICT (documento_id, member_id, versao) DO NOTHING
    RETURNING assinado_em INTO v_quando;

    IF v_quando IS NULL THEN
        -- Segundo clique: devolve a assinatura que já existe.
        SELECT assinado_em INTO v_quando FROM public.doc_gen_assinaturas
         WHERE documento_id = v_doc.id AND member_id = v_membro.id AND versao = v_doc.versao;
        RETURN v_quando;
    END IF;

    INSERT INTO public.doc_gen_eventos (documento_id, organization_id, tipo, dados, autor)
    VALUES (v_doc.id, v_doc.organization_id, 'ASSINADO',
            jsonb_build_object('nome', v_membro.nome, 'versao', v_doc.versao), v_membro.email);
    RETURN v_quando;
END;
$function$;

REVOKE ALL ON FUNCTION public.doc_gen_assinar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doc_gen_assinar(UUID) TO authenticated, service_role;

COMMIT;
