-- Empreendimento de unidade única (09/11/2026).
-- Pedido: "quando o empreendimento for um lote a unidade é o próprio lote. torres unidades deve ser
-- adaptada" — e Chácara e Casa Residencial seguem a mesma regra.
-- Plano: docs/planos/2026-11-09-empreendimento-unidade-unica.md.
--
-- O catálogo de tipos não tinha atributo de comportamento (só nome/slug/cor), e o slug não serve
-- para reconhecer o tipo: o de "Casa Residencial" é `teste`, e o mesmo slug se repete em cada org.
-- `estrutura` diz como a aba de unidades do empreendimento se monta:
--   TORRES        torres → pavimentos → unidades (o de sempre)
--   LOTE          a unidade é o próprio terreno (área e testada vêm do Terreno)
--   IMOVEL_UNICO  uma unidade sobre o terreno (casa, chácara)
-- Os dois últimos guardam uma torre implícita com uma unidade: o resto do sistema (Espelho de
-- Vendas, Comercial, Condomínio, Portal) continua lendo unidade dentro de torre.
-- LOTEAMENTO continua TORRES: quadra → torre e lote → unidade já vêm da Planta (B3).
-- Sem policy nem função (REGRA #7 não se aplica). Idempotente.

ALTER TABLE public.empreendimento_types
  ADD COLUMN IF NOT EXISTS estrutura text NOT NULL DEFAULT 'TORRES';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empreendimento_types_estrutura_check') THEN
    ALTER TABLE public.empreendimento_types
      ADD CONSTRAINT empreendimento_types_estrutura_check CHECK (estrutura IN ('TORRES', 'LOTE', 'IMOVEL_UNICO'));
  END IF;
END $$;

-- Só onde ainda está no padrão: rodar de novo não desfaz uma escolha feita na tela.
UPDATE public.empreendimento_types SET estrutura = 'LOTE'
 WHERE estrutura = 'TORRES' AND slug = 'lote';

UPDATE public.empreendimento_types SET estrutura = 'IMOVEL_UNICO'
 WHERE estrutura = 'TORRES' AND (slug = 'chacara' OR name ILIKE 'casa residencial');
