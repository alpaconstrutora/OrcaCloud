-- Imagem do ativo patrimonial (Gestão de Ativos › Editar Ativo Patrimonial)
--
-- Pedido do usuário em 24/09/2026: o cadastro do bem ganha uma dropzone para
-- carregar a foto, e a tabela de Ativos Patrimoniais ganha a coluna Imagem.
--
-- Guarda o CAMINHO no bucket `organization-assets` (público), não a URL — a URL
-- se reconstrói com getPublicUrl e o caminho sobrevive a troca de domínio do
-- projeto. Mesma convenção de `employee_documents.file_url`.
ALTER TABLE public.opura_assets ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.opura_assets.image_url IS
    'Caminho da foto do bem no bucket organization-assets (asset-photos/<org>/<arquivo>). Não é URL: resolver com getPublicUrl.';
