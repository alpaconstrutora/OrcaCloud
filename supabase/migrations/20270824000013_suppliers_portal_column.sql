-- "Meus Fornecedores": campo dropdown "Portais" por fornecedor.
-- Controla em qual portal externo o fornecedor aparece. É a FONTE ÚNICA da verdade
-- (substitui: categoria "Corretor de Imóveis" p/ Portal do Corretor, lista completa
-- p/ Portal do Fornecedor, e workspace explícito p/ Portal do Parceiro).
-- Valores: Nenhum | Portal do Corretor | Portal do Fornecedor | Portal do Parceiro.
-- Coluna simples com default seguro — fornecedores existentes ficam 'Nenhum' e o
-- backfill abaixo repõe quem já tinha vínculo real com cada portal.
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS portal text NOT NULL DEFAULT 'Nenhum';

COMMENT ON COLUMN public.suppliers.portal IS
    'Portal externo em que o fornecedor é exposto. Valores: Nenhum | Portal do Corretor | Portal do Fornecedor | Portal do Parceiro.';

-- Backfill 1: quem já era corretor (categoria "Corretor de Imóveis") vira Portal do Corretor,
-- para não sumir da tabela do Portal do Corretor (broker_profiles).
UPDATE public.suppliers
   SET portal = 'Portal do Corretor'
 WHERE portal = 'Nenhum'
   AND category ILIKE 'Corretor%Im%';

-- Backfill 2: fornecedores com workspace de parceiro existente viram Portal do Parceiro.
UPDATE public.suppliers s
   SET portal = 'Portal do Parceiro'
 WHERE s.portal = 'Nenhum'
   AND EXISTS (
       SELECT 1 FROM public.partner_workspaces w
        WHERE w.supplier_id = s.id
   );

-- Backfill 3: fornecedores com link de acesso ao Portal do Fornecedor já gerado
-- viram Portal do Fornecedor (sinal explícito de que o admin já os habilitou lá).
UPDATE public.suppliers s
   SET portal = 'Portal do Fornecedor'
 WHERE s.portal = 'Nenhum'
   AND EXISTS (
       SELECT 1 FROM public.supplier_portal_tokens t
        WHERE t.supplier_id = s.id
   );
