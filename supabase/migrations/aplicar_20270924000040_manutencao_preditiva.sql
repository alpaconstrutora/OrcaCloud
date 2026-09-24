-- Gestão de Ativos › Manutenções: "Calibração" vira "Preditiva"
--
-- ⚠️ JÁ APLICADA no banco remoto em 24/09/2026, sob o número 20270924000020 —
-- outra frente publicou esse mesmo prefixo enquanto esta trabalhava, e quem
-- chegou depois é quem move. Não rode de novo por causa do número novo; de
-- qualquer forma o UPDATE é idempotente (só toca linhas com 'calibracao').
--
-- Pedido do usuário em 24/09/2026. O que o módulo acompanha é a manutenção
-- baseada na condição do bem (preditiva), não o ato de aferir instrumento.
--
-- `opura_asset_maintenances.type` é VARCHAR(50) sem CHECK — quem valida o
-- vocabulário é o `MaintenanceType` do TypeScript. Por isso o renome é só de
-- dado: nenhuma constraint a recriar.
--
-- Medido antes de aplicar: 0 linhas com 'calibracao' (só 'corretiva', 1 linha).
-- O UPDATE fica assim mesmo, para pegar registro criado entre a medição e o
-- deploy; sem ele uma ordem sobreviveria com um tipo que a tela não sabe rotular.
UPDATE public.opura_asset_maintenances
   SET type = 'preditiva'
 WHERE type = 'calibracao';

COMMENT ON COLUMN public.opura_asset_maintenances.type IS
    'Tipo da ordem: preventiva | corretiva | preditiva. ''calibracao'' foi renomeado para ''preditiva'' em 24/09/2026.';
