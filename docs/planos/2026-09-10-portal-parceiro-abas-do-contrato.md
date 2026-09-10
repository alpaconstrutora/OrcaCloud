# Portal do Parceiro — abas do contrato que faltavam (visão do app e do parceiro)

**Frente:** `parceiro-contrato-abas`
**Data do pedido:** 10/09/2026

---

## Pedido original

Mensagem do usuário, transcrita literalmente:

> Faltam abas no portal do parceiro (visão do app e visão do parceiro)
> suprimentos < Contratos:
> 1.	Itens do contrato
> 2.	Execução e Entrega
> 3.	Riscos e conformidade
> 4.	Aditivos (va/pr)
> 5.	Medições (m/f)
> 6.	Retenção de garantia
> 7.	Penalidades

Duas perguntas antes de codar, porque mudavam o trabalho:

| Pergunta | Resposta |
|---|---|
| "Riscos & Conformidade" tem a avaliação INTERNA do parceiro (classificação de risco, risco trabalhista, divergências × orçamento). O parceiro vê o quê? | **Não criar no portal do parceiro.** Fica só na visão do app. |
| Na visão do app, como entregar as abas? | **Abrir o `ContractDetailView` que já existe** (11 abas, com edição), embutido no workspace. |

---

## O que já existia (medido, do `origin/main`)

**Referência** (`ContractDetailView.tsx`, contrato não recorrente): Resumo ·
Itens do Contrato · Execução & Entrega · Riscos & Conformidade · Aditivos
(VA/PR) · Medições (M/F) · Financeiro · Retenção de Garantia · Penalidades ·
Avaliação de Desempenho · Emissão.

**Portal do parceiro** (`PartnerPortal.tsx`, detalhe do contrato): Visão Geral ·
Itens · Aditivos · Medições. Faltavam, do pedido: **Execução & Entrega,
Retenção de Garantia, Penalidades** (Riscos ficou fora por decisão acima).

**Visão do app** (`PartnerWorkspaceManager.tsx`, sub-aba Contratos): cards com
número, vigência, valor e "Ver PDF". **Nenhum detalhe.** Faltavam todas.

**Gêmeas que já estavam lá:** no portal, o modo token lia
`partner_portal_get_contract_detail` (RPC) e o modo app lia `contractService`
direto — dois caminhos para o mesmo dado. É o padrão que quebrou Documentos e
Financeiro; esta frente funde os dois num núcleo.

---

## Itens

### 1. `supabase/migrations/aplicar_20270921000003_partner_contract_detail_nucleo.sql`

**O que muda**
- Núcleo `partner_ws_contract_detail(p_ws, p_contract_id)` — sem grant —
  devolve `items`, `addendums`, `measurements`, `precedent_conditions`,
  `document_requirements`, `acceptances`, `retention` (ledger por
  `fn_contract_retention_ledger` + `releases`) e `penalties`, numa chamada.
- `partner_portal_get_contract_detail(p_token, p_contract_id)` — **reescrita
  como casca** do núcleo (era corpo próprio, com só 3 coleções).
- `partner_get_contract_detail(p_workspace_id, p_contract_id)` — casca do app,
  nova, por `partner_can_access_workspace`.
- REGRA #7: REVOKE literal nas três.

**Como sei que terminou**
- [x] As três funções no banco; núcleo `{postgres, service_role}` só; casca do
      app `authenticated`; casca do link `anon + authenticated`.
- [x] `segurancaMigrations.test.ts` → 2 passed.
- [x] Núcleo devolve as 8 coleções para o contrato Nº 010 (1 item, retenção 0)
      e devolve **NULL para contrato de outro fornecedor**.

### 2. `lib/contractLabels.ts` (novo) + `ContractDetailView.tsx`

**O que muda** — os mapas de rótulo que eram `const` locais do
`ContractDetailView` (tipo/status de penalidade, fase de documento, tipo de
recebimento, tipo de liberação) passam a viver num módulo exportado; o
`ContractDetailView` importa de lá. O portal usa os MESMOS mapas — uma
penalidade "Moratória" não pode virar outra palavra no portal.

**Como sei que terminou**
- [x] Os mapas locais saíram do `ContractDetailView` (inclusive o de status de
      penalidade e os ternários de recebimento/liberação); `tsc` limpo.

### 3. `services/partnerService.ts` + `services/partnerPortalTokenService.ts`

**O que muda** — `getContractDetail` nos dois, mesma forma de retorno, cada um
chamando a sua casca; normalização única em `services/partnerContractDetail.ts`.

### 4. `components/partner/PartnerPortal.tsx`

**O que muda**
- Modo app deixa de ler `contractService` e passa a ler a casca (fim das gêmeas).
- Três abas novas no detalhe, **somente leitura**, espelhando os blocos da
  referência:
  - **Execução & Entrega** — Escopo/Dados do serviço (quando há), Pré-mobilização
    (condições precedentes + ordem de início), Matriz Documental (Anexo V:
    documento, fase, SST, Entregue/Vencido/Pendente), Recebimento
    (provisório/definitivo, pendências);
  - **Retenção de Garantia** — retido / liberado / saldo deste contrato + tabela
    de liberações (Tipo · Data · Valor). Sem "Liberar" (é da construtora);
  - **Penalidades** — Tipo · Motivo · Status · Valor. Sem ações.

**Como sei que terminou**
- [x] Tela real pelo link (AFONSO, contrato Nº 005 "Projeto Estrutural"):
      abas `Visão Geral · Itens · Execução & Entrega · Aditivos · Medições ·
      Retenção de Garantia · Penalidades` — **sem Riscos**; RPC na rede
      `partner_portal_get_contract_detail`; Execução com os 3 blocos e as 8
      condições precedentes reais (Pacote assinado, ART/RRT/TRT, SST e equipe…);
      Retenção com 3 cards e **sem botão Liberar**; Penalidades em estado vazio.
      Zero erros de console.
- [x] `__tests__/components/PartnerPortalContratoAbas.test.tsx` — 6 casos:
      as 3 abas existem e Riscos não; link lê a casca do token, app lê a do app,
      **nenhum dos dois toca `contractService`**; matriz documental com
      Vencido/Entregue/Pendente; retenção sem Liberar; penalidades com os
      rótulos compartilhados, inclusive a cancelada.
- [x] `contractService` deixou de ser importado no `PartnerPortal`.

### 5. `components/partner/PartnerWorkspaceManager.tsx`

**O que muda** — na sub-aba Contratos, clicar num contrato abre o
`ContractDetailView` inteiro dentro do workspace, com "Voltar aos contratos".
Zero código de aba duplicado.

**Como sei que terminou**
- [x] Tela real: "Abrir contrato" no card → `ContractDetailView` embutido com
      **11/11 abas**; a própria seta do detalhe volta à lista. Um "Voltar aos
      contratos" que eu tinha posto por cima saiu — dois controles para o mesmo
      salto (§23).

### 6. Verificação

- [x] `tsc` exit 0; `check-ui-standard.sh` limpo em `PartnerPortal.tsx` e
      `PartnerWorkspaceManager.tsx`.
- [x] Suíte: **237 arquivos / 3502 testes, 0 falhas** (baseline antes: 235 /
      3487).
- [x] Servidor novo em 3194 (PID 224960 provado, `127.0.0.1`,
      `serviceWorkers:'block'`), os dois modos.

### O que NÃO foi visto com dado real

Matriz Documental, Recebimento, liberações de retenção e penalidades: a base
inteira tem **zero** linhas em `contract_document_requirements`,
`contract_acceptances` e `contract_retention_releases`, e **uma** penalidade,
de contrato sem portal. Na tela esses blocos aparecem com estado vazio; os
caminhos com dado estão cobertos pelo teste de componente. Condições
precedentes têm dado real (8 por contrato) e apareceram.

---

## Fora de escopo

- "Riscos & Conformidade" no portal do parceiro (decisão do usuário).
- Editar qualquer coisa pelo portal do parceiro — as abas novas são leitura.
- "Avaliação de Desempenho" e "Emissão" no portal (não pedidas).
