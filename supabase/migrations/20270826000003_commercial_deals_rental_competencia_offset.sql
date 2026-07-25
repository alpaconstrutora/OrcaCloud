-- Defasagem (em meses) entre a competência do aluguel e o vencimento da parcela,
-- por contrato de locação. Usada só no regime de COMPETÊNCIA para datar os tributos
-- gerados (services/taxPayableService.ts): fato gerador = mês do vencimento recuado
-- por N meses. Postecipado (aluguel do mês vence no mês seguinte) = 1; 0 = mesmo mês
-- do vencimento; negativo = antecipado.
--
-- Coluna nullable, sem default e sem FK → alteração metadata-only (não reescreve a
-- tabela nem pega lock pesado em commercial_deals). Idempotente.
ALTER TABLE commercial_deals
    ADD COLUMN IF NOT EXISTS rental_competencia_offset_months smallint;

COMMENT ON COLUMN commercial_deals.rental_competencia_offset_months IS
    'Locação: defasagem em meses entre competência do aluguel e vencimento (1=postecipado, 0=mesmo mês, <0=antecipado). Só regime de competência.';
