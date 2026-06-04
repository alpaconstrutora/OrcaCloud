-- Expande contract_type para incluir todos os tipos de serviço do PRD
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_contract_type_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_contract_type_check
  CHECK (contract_type IN (
    'Empreitada Global',
    'Empreitada Parcial',
    'Preço Fechado',
    'Preço Unitário',
    'Contrato por Medição',
    'Contrato Recorrente',
    'Manutenção',
    'Prestação de Serviços',
    'Instalação',
    'Reforma',
    'Administração',
    'Subempreitada',
    'Outros'
  ));

-- Expande status para o workflow completo do PRD
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN (
    'Rascunho',
    'Revisão',
    'Enviado',
    'Aprovado',
    'Assinado',
    'Ativo',
    'Concluído',
    'Suspenso',
    'Encerrado',
    'Cancelado'
  ));
