-- Trigger: block DELETE on purchase_orders when status is finalized
CREATE OR REPLACE FUNCTION public.check_order_can_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('Entregue', 'Recebido', 'Divergência') THEN
    RAISE EXCEPTION 'Pedido com status "%" não pode ser excluído.', OLD.status;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_finalized_order_delete ON public.purchase_orders;

CREATE TRIGGER prevent_finalized_order_delete
  BEFORE DELETE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_order_can_delete();
