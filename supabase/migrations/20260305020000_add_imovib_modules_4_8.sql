-- Add Revenue and Funding columns to imovib_studies (Sprint 8)

ALTER TABLE public.imovib_studies
    -- Module 4: Revenue profile (Percentages of VGV)
    ADD COLUMN IF NOT EXISTS revenue_downpayment_percent numeric DEFAULT 10,
    ADD COLUMN IF NOT EXISTS revenue_construction_percent numeric DEFAULT 20,
    ADD COLUMN IF NOT EXISTS revenue_handover_percent numeric DEFAULT 70,
    ADD COLUMN IF NOT EXISTS default_rate_percent numeric DEFAULT 3, -- InadimplÃªncia
    ADD COLUMN IF NOT EXISTS cancellation_rate_percent numeric DEFAULT 5, -- Distratos
    
    -- Module 8: Funding structure
    ADD COLUMN IF NOT EXISTS funding_equity_percent numeric DEFAULT 100, -- Default 100% equity
    ADD COLUMN IF NOT EXISTS funding_debt_percent numeric DEFAULT 0, -- Plano EmpresÃ¡rio / SFH ProduÃ§Ã£o
    ADD COLUMN IF NOT EXISTS swap_financial_percent numeric DEFAULT 0, -- Permuta Financeira (% VGV Retido)
    ADD COLUMN IF NOT EXISTS swap_physical_percent numeric DEFAULT 0; -- Permuta FÃ­sica (% VGV Cedido / Unidades)
