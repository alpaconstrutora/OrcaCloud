# Portal do Parceiro — "Convidar integrante" traz o contato cadastrado no fornecedor

## Pedido original

Sessão `61edd96c-0bd1-4786-b550-a4ff23a33593` · 16/10/2026, depois da explicação de como
enviar o convite por e-mail no Portal do Parceiro:

> Em minha organizacao > meus fornecedores > enderecos e contados é o lugar para cadastro.
> Agora no portal do parceiro > Convidar integrante: buscar automaticamente o integrante ja cadastrado em organizacao > meus fornecedores

## O que já existia (conferido no código e no banco em 16/10/2026)

- O cadastro do fornecedor (`components/SupplierForm.tsx`) tem **um** contato: "Nome do
  contato" (aba Dados gerais, `suppliers.contact_name`) e "E-mail" e "WhatsApp / telefone"
  (aba Endereços e contatos, `suppliers.email` / `suppliers.phone`). Não existe tabela de
  vários contatos por fornecedor (no banco só há `crm_contacts`, que é do CRM).
- O workspace do parceiro aponta para o fornecedor (`partner_workspaces.supplier_id`), e a
  tela de gestão (`components/partner/PartnerWorkspaceManager.tsx`) já carrega a lista de
  fornecedores com essas três colunas (`supplierService.listSuppliers`, `SUPPLIER_LIST_SELECT`).
- O painel "Convidar integrante" abria **sempre vazio** — quem convida redigitava nome,
  e-mail e telefone que o app já tinha.
- Regra geral do usuário (10/10/2026): *"se o app já tem as informações não vamos obrigar o
  usuário preencher manualmente"* — preencher sem sobrescrever o que foi digitado, e mostrar
  "Preenchido automaticamente". Molde: `utils/warrantyAutofill.ts`.

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 16/10/2026 | O que é "o integrante já cadastrado"? | O contato do fornecedor do workspace (nome do contato + e-mail + telefone). É o único contato que o cadastro guarda. |
| 16/10/2026 | Preenche sozinho ou pede um clique? | Preenche sozinho ao abrir "Convidar integrante" (regra geral de 10/10). Um cartão acima dos campos mostra de onde veio e oferece "Usar este contato" para voltar a ele depois de editar. |
| 16/10/2026 | E se o contato já é integrante? | Não preenche (o e-mail é único por parceiro); o cartão diz que ele já é integrante. |
| 16/10/2026 | E se o fornecedor não tem e-mail? | Preenche nome e telefone (o e-mail fica para digitar) e o cartão aponta o caminho: Minha organização › Meus Fornecedores › Endereços e contatos. (1ª versão não preenchia nada; ajustado depois de ver no navegador que nome e telefone ali são úteis.) |
| 16/10/2026 | Sem "Nome do contato"? | Medido no banco: **nenhum** dos 11 fornecedores com parceiro tem `contact_name`, e 5 são PF. Fornecedor **PF** usa o próprio nome do fornecedor (é a pessoa); **PJ** deixa o nome vazio e o cartão pede o nome da pessoa — razão social não é nome de integrante. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `utils/partnerConviteContato.ts` (novo) | Funções puras: contato do fornecedor, situação (sem cadastro / sem e-mail / já integrante / disponível) e preencher sem sobrescrever o que foi digitado | teste unitário verde |
| 2 | `__tests__/partnerConviteContato.test.ts` (novo) | Casos: preenche vazio; não sobrescreve digitado; e-mail já integrante (caixa diferente); sem e-mail; sem nome de contato; "Usar este contato" repõe tudo | `npx vitest run` verde |
| 3 | `components/partner/PartnerWorkspaceManager.tsx` | Ao abrir o convite: acha o fornecedor (lista carregada; senão `supplierService.getById`), preenche e marca os campos automáticos; cartão do contato no topo do painel; "Preenchido automaticamente" sob cada campo automático; editar à mão tira o campo do automático | typecheck, `check-ui-standard`, Playwright no painel |

## Estado

- [x] 1 · util puro (`utils/partnerConviteContato.ts`)
- [x] 2 · testes: `__tests__/partnerConviteContato.test.ts` (11) + casos 6–9 em `__tests__/components/PartnerWorkspaceConvite.test.tsx` (o mock de `supplierService` ganhou `getById`; sem ele os testes antigos geravam 2 "Unhandled errors" que derrubariam a CI)
- [x] 3 · painel (`PartnerWorkspaceManager.tsx`): cartão do contato, preenchimento automático, "Usar este contato", leitura pelo id quando o fornecedor não está na lista, resposta atrasada de abertura anterior descartada
- [x] Verificação no navegador (16/10/2026, `C:\tmp\pwtest\parceiro-convite\painel.js`, conta agente-leitura na Alpa, só ABRINDO o painel): Álvaro Esteves Junior (PF) → nome, e-mail e telefone preenchidos (3 "Preenchido automaticamente"); AFONSO H VILELA (PJ) → e-mail e telefone, nome vazio com aviso; Débora Cristina Duarte (PF sem e-mail) → nome e telefone, aviso de e-mail. Sem erro de console nem 4xx/5xx.
- [x] Tipos: checagem por arquivo (o `tsc` desta máquina cai com SIGSEGV) — 0 erros; testes 42/42; `check-ui-standard` sem violação
- [x] Publicação: `main` em `5c682634` (16/10/2026); domínio conferido servindo o commit com "Contato em Meus Fornecedores" no bundle; check-run `ci` verde

## Verificação

1. `npx vitest run __tests__/partnerConviteContato.test.ts __tests__/partnerServiceConvite.test.ts __tests__/orgContextGuard.test.ts`
2. `npx tsc --noEmit -p .` (exit lido por grep, não por tail)
3. `bash scripts/check-ui-standard.sh components/partner/PartnerWorkspaceManager.tsx`
4. Navegador: Portais › Portal de Parceiros › abrir um parceiro cujo fornecedor tem e-mail ›
   Usuários › Convidar Integrante → campos preenchidos com o contato; editar o nome tira o
   "Preenchido automaticamente" só dele; "Usar este contato" repõe. Parceiro cujo contato já
   é integrante → aviso, campos vazios.
