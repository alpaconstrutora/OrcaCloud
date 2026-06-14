-- Adiciona status 'Minuta' ao workflow de contratos
-- Rascunho = interno; Minuta = visível ao cliente para considerações
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN (
    'Rascunho',
    'Minuta',
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
