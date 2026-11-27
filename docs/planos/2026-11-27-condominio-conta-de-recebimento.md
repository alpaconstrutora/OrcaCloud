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
- [x] PR + CI + publicação — PR #788, todos os jobs verdes (o leve caiu 1× em `PortalHelpSettings`, de outro módulo, passou 3/3 local e na nova rodada); squash `c418db6`; CI de `main` verde; domínio serve `c418db6`.
- [ ] Conferir na tela publicada (Bella Vista › Financeiro): a faixa "Nenhuma conta Asaas…" com "Cadastrar conta" (Chrome desconectado em 27/11).

---

## 2ª parte — campo para ESCOLHER a conta (27/11/2026, mesma sessão)

A 1ª parte respondeu outra coisa: mostrava a conta, não deixava escolher. Pedidos, literais:

> Vou fazer a mesma pergunta novamente. Aonde no comercial > condominio eu seleciono a conta para transações?

> a pergunta e a mesma!

> o que diabos entao voce implementou?

> Vou te pedir novamente e voce vai me dizer o que voce entendeu,
> Desfaça o que voce fez.
> depois em comercial > condominio : voce vai emprementar um campo para eu selecionar uma conta que ja existe cadastrada em minhas > organizaçào > contas .
>
> isso ja foi implementado inumeras vezes por todo app. Campo para selecionar uma conta. Nao estou entendendo por que voce se confundiu duas vezes

Respondi o que entendi e perguntei onde fica o campo e para que serve a conta:

> 1. mantenha #788.
> 2. sim
> 1. Onde fica o campo: na ficha do condomínio.
> 2. Para que serve a conta: vale para tudo do condomínio

### Desenho

- `empreendimentos.condominio_payment_account_id`; campo "Conta" na Ficha (seção "Conta do condomínio"), `<select>`
  com as contas de Minha Organização › Contas que o usuário enxerga, agrupadas por organização (mesmo serviço do
  campo "Conta" do centro de custo, `listPaymentAccounts`). Achado: os lançamentos dos condomínios JÁ usam contas de
  outras orgs (Sicredi da Alpa, Itaú do Altair, Sicredi do Garden) e as orgs dos condomínios não têm conta própria —
  listar só as da org do condomínio daria lista vazia.
- Grava por `condominio_salvar_ficha`. Conta de outra org passa a atender a org do condomínio
  (`payment_account_organizations`): sem isso o Portal do Síndico e a emissão recusariam a conta.
- "Vale para tudo": gatilho `trg_condominio_conta_padrao` (BEFORE INSERT em `internal_transactions`) — lançamento NOVO
  na org do condomínio sem conta recebe a do condomínio. Só na org do condomínio (o centro de custo pode estar no
  mesmo empreendimento da obra). Conta escolhida não é tocada; lançamentos antigos não mudam.

### Itens

- [x] Migration `aplicar_20271127950100_condominio_conta_da_ficha` APLICADA (27/11). Prova em bloco desfeito (14/14):
  de fora, conta inativa e valor inválido recusados; salvar o Sicredi da Alpa grava e cria o vínculo; cota com o
  centro de custo do condomínio e lançamento sem centro → Sicredi; conta escolhida (Itaú) mantida; lançamento na org
  da construtora sem conta continua sem; "Nenhuma" limpa; multa intacta. ACL: a função do gatilho sem
  `authenticated`/`anon`.
- [x] Tela: campo na Ficha (desligado com o motivo quando o condomínio não tem org própria); `utils/contaDoCondominio.ts`
  (`contaDoCondominio.test`, 2); `condominioFichaConta.test` (2). Testes do condomínio 19 arquivos / 299 verdes.
  tsc 0; `check-ui-standard` 0.
- [ ] PR + CI + publicação.
