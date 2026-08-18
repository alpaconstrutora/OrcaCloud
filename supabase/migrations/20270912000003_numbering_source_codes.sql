-- Fecha as lacunas dos códigos-fonte usados como variável na Nomenclatura:
--
-- 1. empreendimentos.code existe mas não tem UNIQUE nem auto-geração — com o
--    {seq} agora reiniciando por combinação de variáveis (decisão de produto
--    de 2026-08-17), dois empreendimentos com o mesmo `code` na mesma
--    organização gerariam números de documento idênticos. Índice único
--    parcial por organização, igual ao padrão já usado em clients/suppliers
--    (20270112000000_add_entity_codes.sql).
-- 2. commercial_deals.code (negociações) tem o mesmo problema: hoje é MAX+1
--    no navegador (commercialService.ts:599-619), sem proteção nenhuma contra
--    corrida. O UNIQUE aqui é rede de segurança; a correção da geração em si
--    é F4 do plano.
-- 3. condominio_rateios não tem coluna de número — ganha `number` (decisão:
--    o documento numerado de Condomínios é o rateio fechado, não a cota da
--    unidade nem um contrato de administração que não existe).
--
-- empreendimento_units NÃO ganha coluna de código aqui: o token {unidade} já
-- usa `empreendimento_units.name` (NOT NULL, formato "101", "202" — ver
-- UnitEditor.tsx) e mudar isso está fora do escopo deste pedido.
--
-- Ver docs/planos/2026-08-17-nomenclatura-slots-configuravel.md.

-- ═══ 1. empreendimentos.code ════════════════════════════════════════════
-- Checagem primeiro: falhar direto no índice dá um erro obscuro ("duplicate
-- key value") sem dizer QUAIS registros corrigir. Aqui a mensagem lista os
-- empreendimentos em conflito antes de tentar criar o índice.
DO $$
DECLARE
    v_dup RECORD;
    v_msg TEXT := '';
BEGIN
    FOR v_dup IN
        SELECT organization_id, code, array_agg(name ORDER BY name) AS nomes, COUNT(*) AS n
        FROM public.empreendimentos
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY organization_id, code
        HAVING COUNT(*) > 1
    LOOP
        v_msg := v_msg || format(
            E'\n  organização %s: código "%s" repetido em: %s',
            v_dup.organization_id, v_dup.code, array_to_string(v_dup.nomes, ', ')
        );
    END LOOP;

    IF v_msg <> '' THEN
        RAISE EXCEPTION
            'Há empreendimentos com o mesmo código na mesma organização — corrija antes de aplicar esta migration (Empreendimentos › Dados Gerais):%',
            v_msg;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_empreendimentos_org_code
    ON public.empreendimentos (organization_id, code)
    WHERE code IS NOT NULL AND code <> '';

-- ═══ 2. commercial_deals.code ═══════════════════════════════════════════
-- organization_id é NULLABLE aqui (20260220000002); COALESCE agrupa os
-- registros órfãos de organização num único namespace, mesmo padrão de
-- clients/suppliers.
DO $$
DECLARE
    v_dup RECORD;
    v_msg TEXT := '';
BEGIN
    FOR v_dup IN
        SELECT COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) AS org,
               code, COUNT(*) AS n
        FROM public.commercial_deals
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY 1, code
        HAVING COUNT(*) > 1
    LOOP
        v_msg := v_msg || format(E'\n  organização %s: código "%s" repetido (%s negociações)', v_dup.org, v_dup.code, v_dup.n);
    END LOOP;

    IF v_msg <> '' THEN
        RAISE EXCEPTION
            'Há negociações com o mesmo código na mesma organização — corrija antes de aplicar esta migration:%',
            v_msg;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_deals_org_code
    ON public.commercial_deals (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
    WHERE code IS NOT NULL AND code <> '';

-- ═══ 3. condominio_rateios.number ═══════════════════════════════════════
ALTER TABLE public.condominio_rateios ADD COLUMN IF NOT EXISTS number TEXT;

COMMENT ON COLUMN public.condominio_rateios.number IS
    'Número do rateio, atribuído no fechamento (status=FECHADO), seguindo a máscara de Configurações do Sistema › Nomenclatura (CONDO_RATEIO).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_condominio_rateios_org_number
    ON public.condominio_rateios (organization_id, number)
    WHERE number IS NOT NULL AND number <> '';
