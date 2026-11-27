# Condomínio › Financeiro: conta de recebimento visível

## Pedido original

Sessão do Portal do Síndico (G3–G7), 27/11/2026, depois de eu dizer que a G2c precisa de uma conta Asaas no
CNPJ do condomínio e de explicar onde se cadastra a chave (Minha Organização › Contas):

> nao foi essa minha pergunta
> Obviamente me refereia a onde no comercial > condomnio eu seleciono uma conta bancaria?

Respondi que no Condomínio não existe lugar de escolher: a emissão dos boletos (Financeiro › rateio ›
"Emitir boletos no Asaas") usa sozinha a conta Asaas ativa da organização do condomínio (ou a de outra
organização marcada "Atende também" para ele), e que hoje nem o Bella Vista nem o Galeria Altavista têm
conta. Ofereci: *"posso colocar na aba Financeiro do condomínio um quadro 'Conta de recebimento' que mostra
qual conta Asaas o condomínio vai usar (ou avisa que não há nenhuma, com o atalho para cadastrar)"*.

> sim

## Desenho

- **Fonte da resposta:** RPC `condominio_conta_recebimento(p_org)` (SECURITY DEFINER, membro da org ou
  superadmin). Não `asaasContaService.contaDaOrg`: no navegador `fn_conta_asaas_da_org` roda com a RLS de
  `payment_account_gateway` e o 2º passo (`fn_orgs_atendidas_pela_conta`) olha `auth.role()` — a conta
  emprestada de uma org de que o usuário não é membro some, e o quadro diria "sem conta" enquanto a emissão
  (service_role) usaria uma. Para org de condomínio a conta emprestada é só vínculo explícito
  (`fn_sindico_conta_atende`, o "atende todas" não alcança condomínio desde 21/10).
- **Tela:** primeira linha do cartão "Despesas vêm de…" (acima das abas — nada abaixo de tabela):
  "Boletos saem pela conta **X**" (+ "(Asaas de teste — sandbox)", + "emprestada de **Org**") com "Ver contas",
  ou o aviso âmbar com "Cadastrar conta" → Minha Organização › Contas (mesmo caminho da Conciliação).
- **"Emitir boletos no Asaas"** desligado com o motivo quando não há conta ou há mais de uma.

## Itens

- [x] Migration `aplicar_20271127950000_condominio_conta_recebimento` APLICADA (27/11). Prova em bloco desfeito
  (Bella Vista): sem conta → `conta: null` + `orgNome`; de fora e org nula recusados; conta da construtora
  emprestada com o administrador só membro do condomínio → achada (`fn_conta_asaas_da_org` com o mesmo
  usuário devolveu vazio — a trava); conta própria → `propria: true`, sandbox; duas próprias → a frase da
  recusa da emissão. ACL sem `anon`.
- [x] `utils/contaDeRecebimentoCondominio.ts` (motivo) + `condominioCobrancaService.contaDeRecebimento`;
  `contaDeRecebimentoCondominio.test` (4).
- [x] `FinanceiroTab`: faixa + Emitir desligado com o motivo; `condominioContaDeRecebimento.test` (2): sem conta
  (faixa, botão desligado com o mesmo motivo, atalho para Contas) e conta emprestada em sandbox. tsc 0;
  `check-ui-standard` 0.
- [ ] PR + CI + publicação.
- [ ] Conferir na tela publicada (Bella Vista › Financeiro): a faixa "Nenhuma conta Asaas…" com "Cadastrar conta".
