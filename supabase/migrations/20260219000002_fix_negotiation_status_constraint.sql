-- Update negotiation_status constraint to include 'Nova Proposta'
ALTER TABLE quotation_responses DROP CONSTRAINT IF EXISTS quotation_responses_negotiation_status_check;

ALTER TABLE quotation_responses ADD CONSTRAINT quotation_responses_negotiation_status_check 
CHECK (negotiation_status IN ('Original', 'Contraproposta', 'Nova Proposta', 'Aceita', 'Recusada'));
