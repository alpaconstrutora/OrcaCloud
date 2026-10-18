# Asaas — segurança: chaves PIX protegidas e titular conferido

## Pedido original

Sessão de 18/10/2026 (Claude Code, VS Code). Depois da análise "analise do ponto de vista
de segurança se nosso app está seguro para trabalharmos com o asaas", o usuário respondeu,
literal:

> de acordo com os 6 itens recomendados. e sim pode comecar pelos itens 1 e 2

Os 6 itens recomendados (análise conferida no banco, no código e nos segredos, 18/10/2026):

1. Só proprietário/administrador grava chave PIX de fornecedor e colaborador; toda troca fica
   registrada (quem, quando, antes/depois).
2. Validação de saque compara o CPF/CNPJ do titular da chave (informado pela Asaas) com o do
   favorecido cadastrado; diferente → recusa, salvo conta marcada "titular diferente autorizado".
3. Quarentena: chave criada/trocada há menos de 24 h só paga com confirmação do outro administrador.
4. Remover o usuário `admin@admin.com` e o e-mail dele de 16 políticas em 11 tabelas.
5. Webhook consulta a Asaas antes da baixa; remover a chave global antiga e o caminho de reserva.
6. Painel da Asaas (do usuário): 2FA de todos, acesso mínimo, troca de chave na saída de alguém.

## Contexto (medido em 18/10/2026)

- `supplier_bank_accounts`: política ALL para qualquer membro, para qualquer logado se a linha
  não tem organização (0 linhas assim hoje) e para o e-mail `admin@admin.com`. Sem auditoria.
- `employee_bank_accounts`: política ALL para quem enxerga o colaborador. Sem gatilho nenhum.
  A ficha grava pela RPC INVOKER `save_employee_bank_accounts`, que regrava TODAS as contas a
  cada salvamento — e quem cuida do RH é membro, não administrador.
- Alpa: 2 administradores, 4 membros. Cenário de desvio: membro troca a chave do fornecedor pela
  dele; administrador paga vendo nome do cadastro e chave mascarada; a validação aprovava porque
  a chave conferia com o cadastro.
- O pedido de validação de saque da Asaas traz `bankAccount.cpfCnpj` (titular resolvido pela
  chave). `supplier_payments.beneficiary_document` é REGRAVADO com o documento resolvido logo
  depois do POST — não serve de referência; precisa de coluna própria.

## Decisões de desenho

- **Item 1 por gatilho, não por política**: a trava olha O QUE mudou. Membro segue salvando a
  ficha do colaborador; criar, trocar ou apagar chave PIX, banco/agência/conta, titular ou a marca
  "titular diferente autorizado" exige `is_org_manager` da organização da linha. Servidor/cron
  (`auth.uid()` nulo) segue livre. Trocar a conta principal e desativar conta não são travados
  (não redirecionam pagamento: a PIX escolhe entre chaves já cadastradas).
- Auditoria única `conta_bancaria_auditoria` (fornecedor e colaborador): antes/depois só dos campos
  sensíveis, autor pelo e-mail do token; RLS SELECT só gestor. FK sem cascade.
- A política de `supplier_bank_accounts` perde o `organization_id IS NULL` e o `admin@admin.com`
  (o item 4 trata as outras 15).
- **Item 2**: `supplier_payments.favorecido_documento_esperado` = documento da ENTIDADE (fornecedor,
  colaborador, sócio; no avulso, o digitado) — nunca o da conta bancária, que quem troca a chave
  também trocaria. `titular_diferente_autorizado` = cópia da marca da conta no disparo. A validação
  recusa PIX cujo titular difere do esperado, sem documento esperado, ou sem titular informado pela
  Asaas — salvo a marca. `pix_quote` já mostra o bloqueio "favorecido sem CPF/CNPJ".

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1a | Migration: colunas `titular_diferente_autorizado` (contas), `favorecido_documento_esperado` + `titular_diferente_autorizado` (supplier_payments), tabela de auditoria, gatilho trava+auditoria nas duas tabelas, política de `supplier_bank_accounts` sem as brechas, RPC do colaborador grava a marca | aplicada; prova em bloco desfeito: membro troca chave → recusa; membro salva ficha sem mudar conta → passa; gestor troca → passa e audita | ✅ `aplicar_20271018460000` aplicada. Prova (desfeita): membro troca chave fornecedor RECUSOU · muda observação passou · salva ficha sem mudar conta passou · troca chave colaborador RECUSOU · marca titular RECUSOU · gestor troca fornecedor e colaborador passou · 2 linhas de auditoria com antes/depois/autor |
| 1b | Telas: marca "titular diferente autorizado" e aviso de quem altera, nas contas do fornecedor e do colaborador | `check-ui-standard` | ✅ exit 0 nos dois (de quebra: `confirm()` nativo da desativação de conta do fornecedor virou `useConfirm`) |
| 2 | `utils/asaasSaque` (titular), `pixFavorecido`, `asaas-payment` (grava esperado/marca, bloqueio), `asaas-saque-validacao` | testes; deno check; prova sem dinheiro | ✅ `asaasSaque.test.ts` com 4 casos de titular (chave trocada recusa mesmo igual ao cadastro; marca libera; sem documento/sem titular recusa); 35 testes Asaas verdes; deno check; `asaas-payment` e `asaas-saque-validacao` republicadas (401 sem credencial). `pix_quote` mostra o bloqueio "Favorecido sem CPF/CNPJ" |
| 3–6 | Depois de 1 e 2 | — | ⏳ |
