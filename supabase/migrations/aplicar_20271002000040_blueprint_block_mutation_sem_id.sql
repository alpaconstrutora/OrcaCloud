-- ════════════════════════════════════════════════════════════════════════════
-- Planta Inteligente — gatilho de imutabilidade em tabela SEM coluna `id`
-- (ESTUDO DE MASSA, fase M4 — achado da prova de gravação real, 02/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `fn_blueprint_block_mutation` (foundation, 20270905000000) monta a mensagem com
-- `OLD.id`. Duas tabelas que usam o mesmo gatilho têm a chave em `snapshot_id`,
-- não em `id`:
--   - blueprint_snapshot_topografia  (fase 7, 21/09/2026)
--   - blueprint_snapshot_produto     (M4, 02/10/2026)
-- Nelas o UPDATE já era recusado, mas pelo motivo ERRADO: o plpgsql falha ao
-- resolver `OLD.id` (42703 "record … has no field id") antes do RAISE. O dado
-- fica protegido; o que sai é erro de programação no lugar de
-- "é imutável — publique uma nova versão" (restrict_violation, 23001).
--
-- Correção: ler a chave por `to_jsonb(OLD)`, que não falha quando o campo não
-- existe. Mesma assinatura e mesmo texto da mensagem; nenhum gatilho muda.
-- Função de gatilho (não é SECURITY DEFINER e não é chamável por RPC).

CREATE OR REPLACE FUNCTION public.fn_blueprint_block_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
      'blueprint: % é imutável (tentativa de % em %). Publique uma nova versão.',
      TG_TABLE_NAME, TG_OP,
      COALESCE(to_jsonb(OLD) ->> 'id', to_jsonb(OLD) ->> 'snapshot_id', '?')
      USING ERRCODE = 'restrict_violation';
END;
$$;
