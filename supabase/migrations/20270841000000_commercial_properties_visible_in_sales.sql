-- 20270841000000_commercial_properties_visible_in_sales.sql
--
-- Coluna `visible_in_sales` em commercial_properties: controla se a unidade
-- aparece nas telas de OFERTA (Comercial > Venda de Ativos, Portal do Corretor,
-- seletor de unidades da proposta).
--
-- Motivação: no Espelho de Vendas do Empreendimento, a coluna "Publicar" tem um
-- switch por unidade. Desligar o switch NÃO pode desvincular nem excluir a
-- property — se desvinculasse, republicar criaria um imóvel NOVO no Comercial
-- (id diferente, registro antigo órfão), e "publicar de novo" tem que significar
-- sobrescrever, não duplicar. Então desligar oculta e ligar volta a mostrar,
-- sempre sobre a MESMA property.
--
-- Diferença de `visible_to_broker` (migration 20270822000018): aquele esconde a
-- unidade apenas do Portal do Corretor; este é o corte de oferta interna. O
-- switch do Espelho grava os dois juntos (o Comercial esconde por
-- visible_in_sales; o Portal, cujas RPCs já filtram visible_to_broker, esconde
-- sem precisar reescrever RPC nenhuma).
--
-- DDL: ADD COLUMN com DEFAULT é metadata-only no PG >= 11 (não reescreve a
-- tabela), mas commercial_properties é tabela quente com views/FKs dependentes —
-- aplicar em janela de baixo movimento e nunca junto de outro DDL na mesma
-- transação (ver histórico de deadlock em DDL com FK/view neste schema).

ALTER TABLE public.commercial_properties
    ADD COLUMN IF NOT EXISTS visible_in_sales BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.commercial_properties.visible_in_sales IS
    'Controla se a unidade aparece nas telas de oferta (Venda de Ativos, seletor de unidades da proposta). FALSE = oculta, sem perder o vínculo com empreendimento_units — é o desligado do switch "Publicar" no Espelho de Vendas. Quem esconde do Portal do Corretor é visible_to_broker.';

-- Índice parcial: as consultas de oferta filtram por visible_in_sales <> FALSE,
-- e os ocultos são a minoria — indexar só eles mantém o índice pequeno.
CREATE INDEX IF NOT EXISTS idx_commercial_properties_hidden_in_sales
    ON public.commercial_properties (organization_id)
    WHERE visible_in_sales = FALSE;
