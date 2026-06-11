-- Security fix: enable RLS on cub_parametric_data
-- Tabela de referência CUB sem RLS desde 20260220000001.
-- Sem RLS qualquer usuário com a anon key pode escrever/apagar dados de referência.
-- Política: leitura para todos (authenticated + anon); escrita bloqueada para não-service-role.

ALTER TABLE public.cub_parametric_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cub_parametric_data_read_all"
ON public.cub_parametric_data
FOR SELECT
USING (true);
