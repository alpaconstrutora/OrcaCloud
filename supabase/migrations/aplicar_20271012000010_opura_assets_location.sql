-- Localização do ativo (Comercial › Condomínios › Ativos do edifício)
--
-- Pedido do usuário em 12/10/2026: "na aba Ativos do edifício, crie uma coluna
-- chamada Localização, com campo de texto livre para identificar aonde o ativo
-- está localizado".
--
-- Texto livre de propósito: "Casa de máquinas — cobertura", "Subsolo 2, ao lado
-- da rampa". Não é `tracking_code` (código de rastreio do módulo de Bens) nem
-- `current_project_id` (obra onde o bem de canteiro está alocado) — é onde o
-- equipamento está INSTALADO no prédio, para o zelador e o técnico acharem.
-- Plano: docs/planos/2026-10-12-condominio-ativos-localizacao.md
ALTER TABLE public.opura_assets ADD COLUMN IF NOT EXISTS location text;

COMMENT ON COLUMN public.opura_assets.location IS
    'Onde o bem está instalado, em texto livre (ex.: "Casa de máquinas — cobertura, torre A"). Preenchido na aba Ativos do edifício.';
