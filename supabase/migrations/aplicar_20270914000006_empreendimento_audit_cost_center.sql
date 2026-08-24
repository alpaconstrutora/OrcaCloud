-- Aba Vinculações do Empreendimento passou a vincular/criar CENTRO DE CUSTO
-- (`cost_centers_v2.empreendimento_id`, coluna criada em 20270905000024 para o
-- módulo de Condomínios e agora generalizada para qualquer empreendimento).
--
-- O evento precisa de um `entity_type` próprio: 'obra_link' mentiria sobre o que
-- mudou, e o CHECK de `empreendimento_audit_logs` recusa qualquer valor fora da
-- lista. Sem esta migration o vínculo FUNCIONA e apenas o evento de histórico é
-- perdido — a auditoria engole o erro com console.warn por contrato
-- (empreendimentoAuditService), então nada de negócio quebra.

SET lock_timeout = '5s';

ALTER TABLE public.empreendimento_audit_logs
    DROP CONSTRAINT IF EXISTS empreendimento_audit_logs_entity_type_check;

ALTER TABLE public.empreendimento_audit_logs
    ADD CONSTRAINT empreendimento_audit_logs_entity_type_check
    CHECK (entity_type IN (
        'empreendimento','tower','floor','unit','common_area',
        'regulatory_zone','obra_link','area_project','study_link',
        'commercial','rental','proposal','cost_center'));
