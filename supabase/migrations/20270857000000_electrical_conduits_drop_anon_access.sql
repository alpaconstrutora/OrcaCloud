-- Migration: electrical_conduits_drop_anon_access
-- Description: opura_electrical_conduits tem, no banco remoto, uma policy anon
-- "Allow anon all" (FOR ALL TO anon USING (true)) que não existe no arquivo de
-- migration local 20270845000000_opura_electrical_conduits.sql — foi aplicada
-- direto no banco, fora do histórico do repo. A tabela já tem "org_access" para
-- authenticated no mesmo padrão das demais tabelas elétricas; só falta remover
-- o acesso anon irrestrito.

DROP POLICY IF EXISTS "Allow anon all on opura_electrical_conduits" ON public.opura_electrical_conduits;
