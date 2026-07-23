-- Campo estruturado de disciplina no documento, desacoplado do nome do
-- arquivo. Sem FK (mesmo padrão solto de opura_folders.disciplines) para
-- não exigir lock_timeout/NOT VALID em opura_documents (tabela viva, lida
-- constantemente pela UI com RLS ativa) — ver 20270716000004/20270822000003
-- para o motivo (deadlock 40P01 ao adicionar FK em tabela quente).
ALTER TABLE public.opura_documents
  ADD COLUMN IF NOT EXISTS discipline_code TEXT;

COMMENT ON COLUMN public.opura_documents.discipline_code IS
  'Código da disciplina (opura_dms_disciplines.code), escolhido explicitamente no upload/edição — não é extraído do nome do arquivo.';
