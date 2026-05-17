-- Add advanced financial variables to imovib_studies
ALTER TABLE public.imovib_studies 
ADD COLUMN tax_rate numeric DEFAULT 4.0,           -- e.g. 4.0% RET
ADD COLUMN brokerage_fee numeric DEFAULT 6.0,      -- e.g. 6.0% commission
ADD COLUMN financing_percent numeric DEFAULT 0.0,  -- e.g. 80.0% of construction financed
ADD COLUMN financing_rate_annual numeric DEFAULT 10.0; -- e.g. 10.0% per year from the bank
