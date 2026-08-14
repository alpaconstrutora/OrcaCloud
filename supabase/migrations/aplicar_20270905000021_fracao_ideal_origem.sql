-- ============================================================================
-- Fração ideal — de onde ela veio, e por que isso não pode se perder
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
--        (seção "O diferencial não vale para retrofit")
--
-- A FRAÇÃO IDEAL TEM DUAS ORIGENS, E ELAS NÃO SE EQUIVALEM:
--
--   MOTOR      escrita reversa do motor de áreas NBR 12721. É DERIVADA: uma
--              versão nova recalcula e sobrescreve, e isso é correto.
--   CONVENCAO  transcrição da convenção de condomínio REGISTRADA. É um fato
--              jurídico, não um cálculo: só muda por averbação em cartório.
--
-- Sem a marca de origem as duas viram o mesmo número, e o motor passa a poder
-- sobrescrever silenciosamente uma fração registrada — trocando o que está no
-- cartório por uma conta. Num rateio de condomínio isso não aparece como erro
-- de sistema: aparece como boleto errado, meses depois.
--
-- Verificado em 14/08/2026: o piloto `010 - Galeria Altavista` tem 12 unidades
-- e ZERO com fração, porque em prédio entregue a fração está na convenção e
-- não no motor. Esta migration é o que torna esse caminho possível.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ.
-- ============================================================================

-- ═══ BLOCO 1 — a coluna ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_units
  ADD COLUMN IF NOT EXISTS fracao_ideal_origem TEXT
      CHECK (fracao_ideal_origem IS NULL OR fracao_ideal_origem IN ('MOTOR', 'CONVENCAO')),
  -- Rastro da transcrição: qual convenção, e quando foi transcrita. Sem isso,
  -- daqui a dois anos ninguém sabe de que documento aquele número saiu.
  ADD COLUMN IF NOT EXISTS fracao_ideal_fonte TEXT,
  ADD COLUMN IF NOT EXISTS fracao_ideal_transcrita_em DATE;

COMMENT ON COLUMN public.empreendimento_units.fracao_ideal_origem IS
  'MOTOR = derivada do motor de áreas NBR 12721, recalculável. CONVENCAO = '
  'transcrita da convenção REGISTRADA, só muda por averbação. NULO = fração '
  'ainda não informada. O motor NUNCA sobrescreve CONVENCAO (ver o trigger).';

COMMENT ON COLUMN public.empreendimento_units.fracao_ideal_fonte IS
  'De QUAL documento a fração foi transcrita (ex.: "Convenção registrada sob '
  'nº 12.345, 2º RI de Campinas"). Texto livre de propósito: o formato do '
  'registro varia por cartório.';

-- ═══ BLOCO 2 — backfill: o que já existe veio do motor ══════════════════════
-- Toda fração gravada até aqui veio da escrita reversa (era o único caminho
-- que existia). Marcá-la como MOTOR é o retrato fiel do passado — deixar NULO
-- faria o trigger do bloco 3 tratá-la como indefinida.
SET lock_timeout = '5s';

UPDATE public.empreendimento_units
   SET fracao_ideal_origem = 'MOTOR'
 WHERE fracao_ideal_decimal IS NOT NULL
   AND fracao_ideal_origem IS NULL;

-- ═══ BLOCO 3 — a trava: o motor não sobrescreve a convenção ═════════════════
-- A camada de aplicação já filtra (areaEngineService pula as unidades com
-- origem CONVENCAO e as reporta). Este trigger é a rede: se um caminho novo
-- esquecer o filtro, ele FALHA ALTO em vez de trocar em silêncio o número do
-- cartório por uma conta.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_fracao_ideal_protege_convencao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF OLD.fracao_ideal_origem IS DISTINCT FROM 'CONVENCAO' THEN
        RETURN NEW;
    END IF;

    -- A fração não mudou: passa (o UPDATE é de outra coluna qualquer).
    IF NEW.fracao_ideal_decimal IS NOT DISTINCT FROM OLD.fracao_ideal_decimal
       AND NEW.fracao_ideal_thousandths IS NOT DISTINCT FROM OLD.fracao_ideal_thousandths THEN
        RETURN NEW;
    END IF;

    -- Mudou e continua sendo transcrição: é uma correção de transcrição, ou uma
    -- averbação nova. Legítimo — quem edita a convenção é quem manda.
    IF NEW.fracao_ideal_origem = 'CONVENCAO' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Unidade % tem fração ideal transcrita da CONVENÇÃO (%). O motor de áreas não sobrescreve documento registrado — só muda por averbação, pela tela de Frações.',
        OLD.name, COALESCE(OLD.fracao_ideal_fonte, 'fonte não informada');
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_fracao_ideal_protege_convencao() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_fracao_ideal_protege_convencao ON public.empreendimento_units;
CREATE TRIGGER trg_fracao_ideal_protege_convencao
    BEFORE UPDATE OF fracao_ideal_decimal, fracao_ideal_thousandths, fracao_ideal_origem
    ON public.empreendimento_units
    FOR EACH ROW EXECUTE FUNCTION public.fn_fracao_ideal_protege_convencao();

-- ═══ BLOCO 4 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho.
-- Esperado: colunas=3, trigger=1, marcadas_motor = quantas já tinham fração

SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='empreendimento_units'
      AND column_name IN ('fracao_ideal_origem','fracao_ideal_fonte','fracao_ideal_transcrita_em')) AS colunas,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_fracao_ideal_protege_convencao')                AS trigger,
  (SELECT count(*) FROM public.empreendimento_units WHERE fracao_ideal_origem='MOTOR')               AS marcadas_motor,
  (SELECT count(*) FROM public.empreendimento_units WHERE fracao_ideal_origem='CONVENCAO')           AS marcadas_convencao;

-- ═══ BLOCO 5 — teste da trava (opcional, desfaz sozinho) ════════════════════
-- Prova que o motor não passa por cima da convenção. Troque o id e rode inteiro:
-- o segundo UPDATE tem de falhar com "O motor de áreas não sobrescreve
-- documento registrado".
--
-- BEGIN;
--   UPDATE public.empreendimento_units
--      SET fracao_ideal_decimal = 0.0833, fracao_ideal_origem = 'CONVENCAO',
--          fracao_ideal_fonte = 'teste'
--    WHERE id = '<unidade>';
--   -- simula a escrita reversa do motor:
--   UPDATE public.empreendimento_units
--      SET fracao_ideal_decimal = 0.09, fracao_ideal_origem = 'MOTOR'
--    WHERE id = '<unidade>';
-- ROLLBACK;
