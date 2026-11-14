-- Due diligence do terreno: quem conferiu e quando vêm do BANCO, não da tela.
--
-- Revisão das pendências de tela do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md
-- (Fase 5): a tela passou a gravar `checked_by` com o id da sessão, mas a policy de
-- UPDATE só confere a organização — qualquer membro poderia gravar o id de outro
-- usuário e a trilha "quem conferiu" ficaria falsificável. Aqui o gatilho decide:
--   * a situação mudou para algo diferente de 'pendente' → checked_by = auth.uid(), checked_at = now();
--   * voltou a 'pendente' → os dois vazios;
--   * a situação não mudou (só a observação) → os dois ficam como estavam,
--     qualquer que seja o valor mandado pela tela.
-- Aplicar com: npx supabase db query --linked -f <este arquivo>  (nunca db push).

CREATE OR REPLACE FUNCTION public.fn_imovib_land_checklist_conferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'pendente' THEN
            NEW.checked_at := NULL;
            NEW.checked_by := NULL;
        ELSE
            NEW.checked_at := now();
            NEW.checked_by := auth.uid();
        END IF;
    ELSE
        NEW.checked_at := OLD.checked_at;
        NEW.checked_by := OLD.checked_by;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_imovib_land_checklist_conferencia() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_imovib_land_checklist_conferencia ON public.imovib_land_checklist;
CREATE TRIGGER trg_imovib_land_checklist_conferencia
    BEFORE UPDATE ON public.imovib_land_checklist
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_imovib_land_checklist_conferencia();
