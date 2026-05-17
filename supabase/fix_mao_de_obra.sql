-- Este SQL vai consertar todos os insumos de "MAO DE OBRA" do SINAPI
-- que foram inseridos acidentalmente no banco como "Equipamento".

-- Essa consulta encontra os itens afetados e transforma em 'Mão de Obra'.
UPDATE sinapi_items
SET nature = 'Mão de Obra'
WHERE 
  nature = 'Equipamento' 
  AND (
    category ILIKE '%MÃO DE OBRA%' OR 
    category ILIKE '%MAO DE OBRA%'
  );

-- Caso a tabela de categorias originais se chame `classification`,
-- (A tabela exata varia conforme a versão do seu banco, mas o update acima 
-- já deve cobrir baseado em "category" populada pelo `extract_sinapi.cjs`)

-- Para conferir quantos itens foram alterados, você pode rodar esse select antes:
-- SELECT code, description, category, nature 
-- FROM sinapi_items 
-- WHERE nature = 'Equipamento' 
-- AND (category ILIKE '%MÃO DE OBRA%' OR category ILIKE '%MAO DE OBRA%');
