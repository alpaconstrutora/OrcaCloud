-- ============================================================
-- Hotfix: permitir dados incompletos em rascunho/importacao.
-- O motor validate_area_version deve bloquear calculo/aprovacao com
-- MOTOR_007, MOTOR_011, MOTOR_012 etc., em vez de o INSERT falhar antes.
-- ============================================================

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_version_spaces_private_common_chk;

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_version_spaces_unit_by_use_chk;

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_version_spaces_nonstandard_coefficient_chk;

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_version_spaces_use_class_semantics_chk;

ALTER TABLE public.area_version_spaces
    DROP CONSTRAINT IF EXISTS area_version_spaces_accounting_mode_semantics_chk;

ALTER TABLE public.area_version_spaces
    ADD CONSTRAINT area_version_spaces_use_class_semantics_chk CHECK (
        (use_class = 'private' AND common_division_class = 'not_applicable')
        OR
        (use_class = 'common' AND private_nature = 'not_applicable')
    );

ALTER TABLE public.area_version_spaces
    ADD CONSTRAINT area_version_spaces_accounting_mode_semantics_chk CHECK (
        (ownership_accounting_mode = 'linked_accessory' AND unit_id IS NULL)
        OR
        (ownership_accounting_mode = 'common_area' AND use_class = 'common' AND unit_id IS NULL)
        OR
        (ownership_accounting_mode IN ('direct_unit','autonomous_unit'))
    );

