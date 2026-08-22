-- ============================================================================
-- Planta Inteligente — a escala DECLARADA da prancha
--
-- Para prancha vinda de PDF, aferir clicando dois pontos é o instrumento
-- errado, e há um caso medido que mostra por quê.
--
-- Em 22/08/2026, num estudo em produção, a aferição saiu em `mm_por_pixel =
-- 17,1789` quando o correto para 1:100 é `16,9333` — 1,45% longa. A causa é
-- banal: a cota declarada era de 1,10 m, que a 1:100 num raster de 150 dpi
-- ocupa 65 px, e o clique caiu em 64. **Um pixel.**
--
-- O efeito não é banal. Gerando paredes da mesma planta, os 1,45% empurram a
-- parede de 20 cm para 20,6 cm — em cima da fronteira do arredondamento para
-- centímetro. Catorze paredes saíram como 21 cm e sete como 20 cm: a MESMA
-- alvenaria em duas linhas de orçamento.
--
-- E o erro não precisava existir. O raster é gerado pelo próprio sistema, a
-- 150 dpi conhecidos; o único desconhecido é o denominador da escala, que está
-- escrito na prancha. Declarado, `mm_por_pixel` sai exato:
--
--     mm_por_pixel = (25,4 / 150) * denominador
--
-- ⚠️ POR QUE UMA COLUNA, E NÃO REAPROVEITAR `calib_*`
--
-- Os campos `calib_p1_px/p2_px/distancia_mm` guardam QUAL COTA FOI CLICADA —
-- é o que permite conferir a aferição depois, e a tela confere de volta. Gravar
-- ali um par sintético para representar uma escala declarada mentiria sobre a
-- origem do número: alguém revisando veria uma cota que ninguém clicou.
--
-- Escala declarada e escala medida são coisas diferentes e ficam em campos
-- diferentes. Quando `escala_desenho` está preenchida, os `calib_*` ficam
-- nulos — e é assim que a tela sabe dizer "escala declarada: 1:100 (exata)"
-- em vez de "aferido em 1,10 m".
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. NUNCA `supabase db push` — o histórico
--    deste projeto tem migrations fora de `schema_migrations`.
-- ⚠️ Aditiva e anulável: toda prancha existente continua válida, com
--    `escala_desenho` nula, significando "a escala veio de aferição por
--    cliques" — que é exatamente o que aconteceu com elas.
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.blueprint_underlays
    ADD COLUMN IF NOT EXISTS escala_desenho INTEGER
        -- 1:1 não é escala de prancha, e denominador acima de 5000 é erro de
        -- digitação (1:1000 virando 1:10000). A faixa não tenta ser exaustiva:
        -- ela só impede o absurdo que produziria uma planta 10× errada sem
        -- ninguém notar.
        CHECK (escala_desenho IS NULL OR (escala_desenho >= 2 AND escala_desenho <= 5000));

COMMENT ON COLUMN public.blueprint_underlays.escala_desenho IS
    'Denominador da escala DECLARADA pelo usuário (100 = 1:100). Só para prancha '
    'vinda de PDF, onde o dpi do raster é conhecido e mm_por_pixel sai exato. '
    'NULO = a escala veio da aferição por dois cliques, e os campos calib_* '
    'dizem qual cota foi clicada. Os dois caminhos são exclusivos de propósito: '
    'guardar uma cota sintética para representar escala declarada mentiria '
    'sobre a origem do número.';

-- ═══ CONFERÊNCIA ════════════════════════════════════════════════════════════
-- Esperado: coluna=1 · com_check=1 · declaradas=0 (nenhuma prancha usa ainda)
SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'blueprint_underlays'
        AND column_name = 'escala_desenho')                                AS coluna,
    (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.blueprint_underlays'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%escala_desenho%')            AS com_check,
    (SELECT count(*) FROM public.blueprint_underlays
      WHERE escala_desenho IS NOT NULL)                                    AS declaradas;
