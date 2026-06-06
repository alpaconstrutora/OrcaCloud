-- Fix: trigger prevent_owner_self_remove disparava durante CASCADE DELETE do espaço.
-- Quando task_spaces é excluída, o CASCADE deleta task_space_members — incluindo
-- o owner. O trigger via OLD.role = 'owner' AND OLD.user_id = auth.uid() levantava
-- a exceção, impedindo a exclusão do espaço.
-- Solução: verificar se o espaço ainda existe. Se não existir, é um cascade legítimo.

CREATE OR REPLACE FUNCTION public.prevent_owner_self_remove()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Só bloqueia remoção direta do owner (não cascade originado de DELETE em task_spaces)
    IF OLD.role = 'owner' AND OLD.user_id = auth.uid() THEN
        IF EXISTS (SELECT 1 FROM public.task_spaces WHERE id = OLD.space_id) THEN
            RAISE EXCEPTION 'O owner não pode remover a si mesmo do espaço.';
        END IF;
    END IF;
    RETURN OLD;
END;
$$;
