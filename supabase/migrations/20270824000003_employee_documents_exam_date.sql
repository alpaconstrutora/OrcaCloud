-- RH → Documentos: data de realização do exame (ex.: ASO), separada do vencimento.
-- Coluna nullable simples, sem FK/constraint — DDL leve, sem risco de deadlock.
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS exam_date DATE;

COMMENT ON COLUMN public.employee_documents.exam_date IS
  'Data de realização do exame/documento (ex.: data do ASO). Distinta de expiry_date (vencimento).';
