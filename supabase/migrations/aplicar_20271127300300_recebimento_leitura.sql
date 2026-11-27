-- aplicar_20271127300300_recebimento_leitura.sql
--
-- Recebimento mobile, Fase 2 (docs/planos/2026-11-27-recebimento-mobile.md).
-- Prova: scripts/teste-recebimento-nucleo.sql.
--
-- Leitura do Recebimento mobile — UMA regra, dois chamadores:
--   núcleos `_recebimento_listar_de(p_user, p_org)` e `_recebimento_abrir_de(p_user, p_order)`;
--   app logado: `recebimento_listar(p_org)` / `recebimento_abrir(p_order)` (auth.uid());
--   link `/celular`: `celular_recebimento_*` (migration 300400).
--
-- Escopo: as orgs de que o usuário é membro E em que pode pedir
-- (`fn_pode_criar_pedido_de`); `p_org` recorta pelo seletor do topo (REGRA #5;
-- NULL = "Todas"). Nunca uma org de que ele não é membro.
--
-- Grupos da lista (decisões de 27/11: CIF recebe já "Em Trânsito"):
--   a_conferir  CIF em Em Trânsito/Entregue; FOB em Entregue (retirado)
--   a_retirar   FOB em Enviado/Confirmado/Separação/Em Trânsito
--   a_caminho   CIF em Confirmado/Separação (só leitura)
--   conferidos  Recebido/Divergência dos últimos 30 dias
--
-- O saldo de cada item NÃO é calculado aqui: "abrir" devolve os itens do pedido
-- e as conferências, e a tela/Edge calculam com lib/recebimento.ts (uma regra).
--
-- ⚠️ Aplicar à mão, da pasta de uma frente LIGADA ao projeto. Depois da 300200.

CREATE OR REPLACE FUNCTION public._recebimento_listar_de(p_user UUID, p_org UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_orgs  UUID[];
    v_email TEXT;
    v       JSONB;
BEGIN
    SELECT coalesce(array_agg(o), '{}'::uuid[]) INTO v_orgs
      FROM public._celular_orgs_do_usuario(p_user) AS o
     WHERE public.fn_pode_criar_pedido_de(p_user, o)
       AND (p_org IS NULL OR o = p_org);
    IF cardinality(v_orgs) = 0 THEN
        RETURN '[]'::jsonb;
    END IF;
    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = p_user;

    WITH base AS (
        SELECT po.*,
               coalesce(po.organization_id, public._celular_org_do_projeto(p.organization_id, p.settings)) AS org,
               p.name AS obra_nome,
               public.fn_pedido_eh_fob(po.delivery_method) AS fob,
               s.name AS fornecedor_nome,
               lower(s.email) AS fornecedor_email
          FROM public.purchase_orders po
          LEFT JOIN public.projects p ON p.id = po.project_id
          LEFT JOIN public.suppliers s ON s.id = po.supplier_id
         WHERE po.status IN ('Enviado', 'Confirmado', 'Separação', 'Em Trânsito', 'Entregue', 'Recebido', 'Divergência')
    ), classif AS (
        SELECT b.*,
               CASE
                   WHEN (b.fob AND b.status = 'Entregue') OR (NOT b.fob AND b.status IN ('Em Trânsito', 'Entregue')) THEN 'a_conferir'
                   WHEN b.fob AND b.status IN ('Enviado', 'Confirmado', 'Separação', 'Em Trânsito') THEN 'a_retirar'
                   WHEN NOT b.fob AND b.status IN ('Confirmado', 'Separação') THEN 'a_caminho'
                   WHEN b.status IN ('Recebido', 'Divergência')
                        AND coalesce(b.received_at, b.status_updated_at, b.updated_at) > now() - interval '30 days' THEN 'conferidos'
               END AS grupo
          FROM base b
         WHERE b.org = ANY (v_orgs)
           AND b.fornecedor_email IS DISTINCT FROM v_email
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id',            c.id,
               'numero',        c.number,
               'org_id',        c.org,
               'org_nome',      (SELECT o.name FROM public.organizations o WHERE o.id = c.org),
               'obra',          c.obra_nome,
               'fornecedor',    c.fornecedor_nome,
               'status',        c.status,
               'fob',           c.fob,
               'previsao',      c.delivery_date,
               'itens',         CASE WHEN jsonb_typeof(c.items) = 'array' THEN jsonb_array_length(c.items) ELSE 0 END,
               'versao',        coalesce(c.version, 0),
               'grupo',         c.grupo,
               'divergencias_pendentes', (SELECT count(*) FROM public.purchase_discrepancies d
                                           WHERE d.order_id = c.id AND d.status = 'Pendente'),
               'atualizado',    c.status_updated_at)
           ORDER BY CASE c.grupo WHEN 'a_conferir' THEN 1 WHEN 'a_retirar' THEN 2 WHEN 'a_caminho' THEN 3 ELSE 4 END,
                    CASE WHEN c.grupo = 'conferidos' THEN NULL ELSE c.delivery_date END ASC NULLS LAST,
                    c.status_updated_at DESC NULLS LAST, c.id), '[]'::jsonb)
      INTO v
      FROM (SELECT * FROM classif WHERE grupo IS NOT NULL
             ORDER BY CASE grupo WHEN 'a_conferir' THEN 1 WHEN 'a_retirar' THEN 2 WHEN 'a_caminho' THEN 3 ELSE 4 END,
                      status_updated_at DESC NULLS LAST
             LIMIT 200) c;

    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public._recebimento_abrir_de(p_user UUID, p_order UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org UUID;
    v_po  public.purchase_orders;
    v_fob BOOLEAN;
BEGIN
    v_org := public._recebimento_autoriza_de(p_user, p_order);
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_order;
    v_fob := public.fn_pedido_eh_fob(v_po.delivery_method);

    RETURN jsonb_build_object(
        'id',          v_po.id,
        'numero',      v_po.number,
        'org_id',      v_org,
        'org_nome',    (SELECT o.name FROM public.organizations o WHERE o.id = v_org),
        'obra',        (SELECT p.name FROM public.projects p WHERE p.id = v_po.project_id),
        'fornecedor',  (SELECT s.name FROM public.suppliers s WHERE s.id = v_po.supplier_id),
        'status',      v_po.status,
        'fob',         v_fob,
        'previsao',    v_po.delivery_date,
        'versao',      coalesce(v_po.version, 0),
        'notas_recebimento', v_po.receipt_notes,
        'data_retirada', v_po.actual_delivery_date,
        'retirado_por', (SELECT jsonb_build_object('id', e.id, 'nome', e.name) FROM public.employees e
                          WHERE e.id = v_po.retirado_por_employee_id),
        -- Itens do pedido, na ordem (o índice é a chave da conferência).
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'indice',      t.o - 1,
                         'code',        t.e ->> 'code',
                         'description', t.e ->> 'description',
                         'unit',        t.e ->> 'unit',
                         'quantity',    coalesce(nullif(t.e ->> 'quantity', '')::numeric, 0))
                     ORDER BY t.o), '[]'::jsonb)
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_po.items) = 'array' THEN v_po.items ELSE '[]'::jsonb END)
                         WITH ORDINALITY AS t(e, o)),
        -- Quem pode retirar (FOB que ainda pode ser retirado): autorizados primeiro.
        'colaboradores', CASE WHEN v_fob AND v_po.status IN ('Enviado', 'Confirmado', 'Separação', 'Em Trânsito') THEN
                     (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.name, 'cargo', e.role,
                                    'autorizado', a.employee_id IS NOT NULL)
                                ORDER BY (a.employee_id IS NULL), e.name, e.id), '[]'::jsonb)
                        FROM public.employees e
                        LEFT JOIN public.purchase_order_retirada_autorizados a
                               ON a.purchase_order_id = v_po.id AND a.employee_id = e.id
                       WHERE e.status = 'ATIVO'
                         AND (e.org_id = v_org
                              OR e.id IN (SELECT s.employee_id FROM public.employee_org_shares s WHERE s.target_org_id = v_org)))
                     ELSE '[]'::jsonb END,
        'conferencias', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'id',          r.id,
                         'status',      r.status,
                         'recebido_em', r.received_at,
                         'notas',       r.notes,
                         'foto',        r.photo_path,
                         'origem',      r.origem,
                         'recebido_por', coalesce(
                             (SELECT pr.name FROM public.profiles pr WHERE pr.id = r.received_by),
                             (SELECT u.email FROM auth.users u WHERE u.id = r.received_by)),
                         'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                          'indice',      i.order_item_index,
                                          'code',        i.order_item_code,
                                          'description', i.description,
                                          'unit',        i.unit,
                                          'pedida',      i.quantity_ordered,
                                          'recebida',    i.quantity_received,
                                          'problema',    i.issue,
                                          'obs',         i.notes)
                                      ORDER BY i.order_item_index NULLS LAST, i.created_at, i.id), '[]'::jsonb)
                                     FROM public.purchase_receipt_items i WHERE i.receipt_id = r.id))
                     ORDER BY r.received_at, r.created_at), '[]'::jsonb)
                    FROM public.purchase_receipts r WHERE r.order_id = v_po.id),
        'divergencias', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'id', d.id, 'description', d.description, 'unit', d.unit, 'issue', d.issue,
                         'quantity', d.quantity, 'status', d.status, 'notes', d.notes,
                         'resolucao', d.resolution_notes, 'resposta_fornecedor', d.supplier_response)
                     ORDER BY d.created_at, d.id), '[]'::jsonb)
                    FROM public.purchase_discrepancies d WHERE d.order_id = v_po.id),
        'documentos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                         'id', d.id, 'categoria', d.categoria, 'descricao', d.descricao, 'arquivo', d.file_name,
                         'path', d.file_path, 'mime', d.mime_type, 'lado', d.enviado_por_lado,
                         'enviado_por', d.enviado_por, 'criado_em', d.created_at)
                     ORDER BY d.created_at DESC, d.id), '[]'::jsonb)
                    FROM public.purchase_order_documents d WHERE d.order_id = v_po.id)
    );
END;
$$;

-- ── App logado ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recebimento_listar(p_org UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sessão expirada' USING ERRCODE = '42501';
    END IF;
    RETURN public._recebimento_listar_de(auth.uid(), p_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.recebimento_abrir(p_order UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'sessão expirada' USING ERRCODE = '42501';
    END IF;
    RETURN public._recebimento_abrir_de(auth.uid(), p_order);
END;
$$;

-- ── ACL (REGRA #7) ───────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public._recebimento_listar_de(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recebimento_abrir_de(UUID, UUID)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._recebimento_listar_de(UUID, UUID) TO service_role;
GRANT  EXECUTE ON FUNCTION public._recebimento_abrir_de(UUID, UUID)  TO service_role;
REVOKE EXECUTE ON FUNCTION public.recebimento_listar(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recebimento_abrir(UUID)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recebimento_listar(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.recebimento_abrir(UUID)  TO authenticated;
