-- Adiciona categoria 'foto' à constraint da tabela opportunity_documents
-- Permite galeria de fotos separada do data room de documentos
-- Date: 2026-11-08

ALTER TABLE public.opportunity_documents
    DROP CONSTRAINT IF EXISTS opportunity_documents_category_check;

ALTER TABLE public.opportunity_documents
    ADD CONSTRAINT opportunity_documents_category_check
    CHECK (category IN ('evte','sondagem','planta','matricula','financeiro','licenca','memorial','outro','foto'));
