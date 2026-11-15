-- ÒPURA Pro público — "Baixar meus dados" e "Excluir minha conta" (15/11/2026).
-- Plano: docs/planos/2026-11-14-opura-pro-publico.md (seção "Minha conta").
--
-- Por que existe: o Pro vai ser aberto de graça a autônomos de fora (LGPD, art. 18: acesso,
-- cópia e eliminação). "Baixar meus dados" roda inteiro no navegador, pelo RLS do próprio usuário
-- (não precisa de função). Aqui ficam as duas exclusões:
--
--  1. pro_apagar_meus_dados()  — SECURITY INVOKER (passa pelo RLS pro_*_user_access): apaga os
--     serviços, orçamentos, clientes e ajustes do Pro de quem chama. A conta continua. É o que a
--     conta INTERNA (Alpa) usa — ela não pode ser excluída por aqui.
--
--  2. pro_excluir_minha_conta() — SECURITY DEFINER: apaga a linha de auth.users de quem chama;
--     o resto vai em cascata (pro_config/pro_clientes/pro_orcamentos → pro_servicos, profiles,
--     sessões e identidades do auth). Só aceita conta criada pelo Pro E sem vínculo nenhum:
--      - user_metadata.origem = 'pro' (marca de origem; o usuário consegue editá-la, por isso
--        NÃO é a trava — é só o primeiro filtro);
--      - nenhuma linha em organization_members;
--      - a TRAVA: nenhuma linha, em NENHUMA tabela do public que aponte para auth.users (fora as
--        do próprio Pro e profiles), com o id de quem chama. Varrido pelo catálogo, então tabela
--        nova com FK para auth.users entra sozinha. Sem isso, um corretor/funcionário que pusesse
--        origem='pro' em si mesmo apagaria, em cascata, registros da empresa.
--     Fotos e assinatura do Pro ficam dentro das linhas (data URL) — não há arquivo no storage.
--
-- Regra #7 do CLAUDE.md: REVOKE de PUBLIC e anon; GRANT só a authenticated; a autorização mora
-- dentro da função (auth.uid()). Aplicar com `npx supabase db query --linked -f <este arquivo>`
-- (nunca db push). Idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.pro_apagar_meus_dados()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  n_servicos int;
  n_orcamentos int;
  n_clientes int;
  n_config int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre de novo para continuar.' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.pro_servicos
   WHERE orcamento_id IN (SELECT id FROM public.pro_orcamentos WHERE user_id = v_uid);
  GET DIAGNOSTICS n_servicos = ROW_COUNT;

  DELETE FROM public.pro_orcamentos WHERE user_id = v_uid;
  GET DIAGNOSTICS n_orcamentos = ROW_COUNT;

  DELETE FROM public.pro_clientes WHERE user_id = v_uid;
  GET DIAGNOSTICS n_clientes = ROW_COUNT;

  DELETE FROM public.pro_config WHERE user_id = v_uid;
  GET DIAGNOSTICS n_config = ROW_COUNT;

  RETURN jsonb_build_object(
    'servicos', n_servicos,
    'orcamentos', n_orcamentos,
    'clientes', n_clientes,
    'config', n_config
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pro_apagar_meus_dados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_apagar_meus_dados() TO authenticated;


CREATE OR REPLACE FUNCTION public.pro_excluir_minha_conta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_ref record;
  v_tem boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre de novo para continuar.' USING ERRCODE = '28000';
  END IF;

  SELECT u.raw_user_meta_data->>'origem' INTO v_origem FROM auth.users u WHERE u.id = v_uid;
  IF v_origem IS DISTINCT FROM 'pro' THEN
    RAISE EXCEPTION 'Esta conta não foi criada pelo ÒPURA Pro e não pode ser excluída por aqui.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = v_uid) THEN
    RAISE EXCEPTION 'Esta conta faz parte de uma empresa no ÒPURA e não pode ser excluída por aqui.'
      USING ERRCODE = '42501';
  END IF;

  -- A trava: qualquer registro fora do Pro ligado a esta conta impede a exclusão.
  FOR v_ref IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.connamespace = 'public'::regnamespace
       AND c.conrelid NOT IN ('public.pro_config'::regclass, 'public.pro_clientes'::regclass,
                              'public.pro_orcamentos'::regclass, 'public.profiles'::regclass)
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', v_ref.tabela, v_ref.coluna)
      INTO v_tem USING v_uid;
    IF v_tem THEN
      RAISE EXCEPTION 'Esta conta tem registros no ÒPURA fora do Pro e não pode ser excluída por aqui.'
        USING ERRCODE = '42501', DETAIL = format('%s.%s', v_ref.tabela, v_ref.coluna);
    END IF;
  END LOOP;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pro_excluir_minha_conta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_excluir_minha_conta() TO authenticated;
