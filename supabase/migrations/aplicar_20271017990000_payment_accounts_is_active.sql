-- Minha Organização › Contas de Pagamento: ativar / desativar conta
--
-- Pedido do usuário em 17/10/2026: "implementar na coluna ação seletor para
-- ativar e desativar conta".
--
-- Conta desativada NÃO é conta excluída: o histórico (lançamentos, extratos,
-- conciliações) continua apontando para ela. Desativar só tira a conta dos
-- seletores de uso novo (pedido, contrato, alocação de dívida); a tela de
-- cadastro continua listando todas, com o interruptor.
--
-- Aditiva e idempotente: DEFAULT true => toda conta existente segue ativa, e
-- reexecutar não faz nada. Sem policy nova (a coluna herda a RLS da tabela) e
-- sem função nova (REGRA #7 não se aplica).

ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.payment_accounts.is_active IS
    'false = conta desativada: some dos seletores de uso novo, mas o histórico segue apontando para ela. Não é exclusão.';
