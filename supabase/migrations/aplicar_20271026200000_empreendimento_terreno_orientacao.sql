-- Empreendimento › Terreno: para onde a FRENTE do lote está voltada e onde ele fica (26/10/2026).
-- Plano: docs/planos/2026-10-26-planta-empreendimento-tres-etapas.md, etapa 3.
--
-- A Planta Inteligente cria o lote pela ficha ("Construir pelo Empreendimento") e até aqui não sabia a orientação
-- (o lote entrava com a frente para o sul do desenho, com aviso) nem as coordenadas (insolação e IFC sem lugar).
--
-- Só colunas novas, anuláveis, sem default, sem FK e sem view: DDL no módulo Empreendimento com FK/VIEW já
-- deadlockou (40P01) com o app ativo. ADD COLUMN sem default é só metadado.

ALTER TABLE public.empreendimentos ADD COLUMN IF NOT EXISTS terreno_frente_azimute numeric;
ALTER TABLE public.empreendimentos ADD COLUMN IF NOT EXISTS terreno_latitude numeric;
ALTER TABLE public.empreendimentos ADD COLUMN IF NOT EXISTS terreno_longitude numeric;

COMMENT ON COLUMN public.empreendimentos.terreno_frente_azimute IS
  'Para onde a frente do lote (o lado da rua) está voltada: azimute em graus a partir do norte, sentido horário (0 = norte, 90 = leste).';
COMMENT ON COLUMN public.empreendimentos.terreno_latitude IS 'Latitude do terreno em graus decimais (negativa ao sul).';
COMMENT ON COLUMN public.empreendimentos.terreno_longitude IS 'Longitude do terreno em graus decimais (negativa a oeste).';
