-- ============================================================
-- Limpeza segura dos fixtures do Motor de Areas NBR 12721
-- Remove organizacoes Fixture Areas criadas pelos SQLs de QA.
--
-- Este script usa UUIDs fixos dos fixtures e tambem confere
-- nome/email de teste antes de deletar.
-- ============================================================

BEGIN;

-- Previa: confira antes do DELETE abaixo.
SELECT
    id,
    name,
    email
FROM public.organizations
WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '12121212-1212-1212-1212-121212121212',
    '13131313-1313-1313-1313-131313131313',
    '14141414-1414-1414-1414-141414141414',
    '15151515-1515-1515-1515-151515151515',
    '16161616-1616-1616-1616-161616161616',
    '17171717-1717-1717-1717-171717171717',
    '18181818-1818-1818-1818-181818181818',
    '19191919-1919-1919-1919-191919191919',
    '10101010-1010-1010-1010-101010101010'
)
ORDER BY name;

-- Delete efetivo. area_projects e dados do motor vinculados caem por ON DELETE CASCADE.
DELETE FROM public.organizations
WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '12121212-1212-1212-1212-121212121212',
    '13131313-1313-1313-1313-131313131313',
    '14141414-1414-1414-1414-141414141414',
    '15151515-1515-1515-1515-151515151515',
    '16161616-1616-1616-1616-161616161616',
    '17171717-1717-1717-1717-171717171717',
    '18181818-1818-1818-1818-181818181818',
    '19191919-1919-1919-1919-191919191919',
    '10101010-1010-1010-1010-101010101010'
)
AND (
    name ILIKE 'Fixture Areas%'
    OR email ILIKE 'fixture-areas%@example.test'
)
RETURNING id, name, email;

COMMIT;