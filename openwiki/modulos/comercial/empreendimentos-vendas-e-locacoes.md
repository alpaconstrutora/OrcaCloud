---
type: módulo
title: "Comercial: empreendimentos, unidades, vendas, locações e comissões"
description: Como o lado comercial se organiza — empreendimento com torres/pavimentos/unidades, imóveis comerciais (commercial_properties), negociações (commercial_deals) com fluxo Proposta → Aprovação → Reserva → Contrato → Assinatura → Concluído, parcelas que só existem quando o contrato as gera, o projeto de sistema "Gestão Comercial", comissões de corretor, condomínio e o Imovib.
tags: [commercial, sales, rentals, empreendimento, deals, broker, commission, condominio, imovib]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-29T16:11:22.971Z
sources:
  - id: openwiki-source-c9770279bd0ef433f144acc0
    resource: repo://components/DealModal.tsx
  - id: openwiki-source-9cdad7c293712db2c23021ff
    resource: repo://lib/dealWorkflow.ts
  - id: openwiki-source-f8250e70b0f7fde41fd6048a
    resource: repo://services/brokerService.ts
  - id: openwiki-source-f820acbec7763cd2e43e8bbe
    resource: repo://services/commercialFinanceService.ts
  - id: openwiki-source-ee1a2df649fc8a7b31eadc51
    resource: repo://services/commercialService.ts
  - id: openwiki-source-7678189c8daef1ccd842ad01
    resource: repo://services/contractService.ts
  - id: openwiki-source-6a32b3d7b0246a123ff31fbc
    resource: repo://services/empreendimentoService.ts
  - id: openwiki-source-f736f5a6a05ffaeed2f2f97e
    resource: repo://services/imovibService.ts
  - id: openwiki-source-20ce09cc5c7dd25fd6930bd6
    resource: repo://services/negotiationService.ts
  - id: openwiki-source-aafacaee7ecf697b66026585
    resource: repo://supabase/migrations/20271017500000_comissao_corretor_titulo_e_portal.sql
generated: { by: "claude-code", at: "2026-10-29T16:11:22.971Z" }
---

# Comercial: empreendimentos, unidades, vendas, locações e comissões

## Modelo

```
empreendimentos ─┬ empreendimento_towers ─ empreendimento_floors ─ empreendimento_units
                 ├ empreendimento_common_areas
                 └ empreendimento_regulatory_zones
                         │  (espelho unidade ↔ imóvel: vw_unit_property_map)
commercial_properties ◄──┘   o "imóvel" negociável (venda, locação ou ambos)
        │
commercial_deals ── commercial_deal_units (N unidades por contrato)
                 └─ commercial_deal_buyers (N compradores, mesmo peso)
        │
contracts (contrato de venda / locação) → internal_transactions (parcelas reais)
```

- **Empreendimento** (`services/empreendimentoService.ts`,
  `components/empreendimento/`) descreve a estrutura física: torres,
  pavimentos, unidades, áreas comuns e zonas regulatórias. A Planta Inteligente
  e o Imovib leem dessa estrutura.
- **Imóvel comercial** (`commercial_properties`, via
  `services/commercialService.ts`) é o que entra em negociação, com `purpose`
  `SALE`, `RENTAL` ou `BOTH` e um `status` de estoque (`AVAILABLE`,
  `RESERVED`, vendido/alugado…).
- **Negociação** (`commercial_deals`) liga comprador(es), unidade(s),
  corretor e condições. As unidades **não são coluna** do deal: vivem em
  `commercial_deal_units`; `property_id` guarda a unidade principal e `value` é
  a soma. Compradores ficam em `commercial_deal_buyers`; `client_id` recebe um
  deles só por compatibilidade.

⚠️ `services/negotiationService.ts` **não** é deste módulo: trata das
contrapropostas de **pedido de compra** com fornecedor (Suprimentos).

## Fluxo da negociação (`lib/dealWorkflow.ts`)

| Status | Rótulo |
|---|---|
| `IN_NEGOTIATION` | Proposta |
| `PENDING` | Aprovação |
| `RESERVA` | Reserva (trava a unidade) |
| `CONTRATO` | Contrato gerado |
| `ASSINATURA` | Aguardando assinatura eletrônica |
| `COMPLETED` | Concluído |
| `CANCELLED` | Cancelado / distrato |
| `WAITING_PAYMENT` | legado, normalizado para `RESERVA` |

As transições permitidas estão em `ALLOWED_TRANSITIONS` (avança um passo, pode
voltar um, cancelar de qualquer ponto; cancelado reabre como proposta);
`canTransition`/`validateTransition` as aplicam. A UI é `DealWorkflowBar` +
`DealModal`.

### Uma unidade, um contrato ativo

`commercialService.assertUnitsAvailable(propertyIds, excludeDealId, checkStatus)`
recusa salvar/avançar se qualquer unidade já está em outro deal não cancelado —
pela unidade principal (legado) **ou** por `commercial_deal_units` — e, ao
avançar para Reserva, exige estoque `AVAILABLE`/`RESERVED`. A mensagem nomeia a
unidade em conflito. O banco também trava (índice único por deal + unidade e
trava de unidade única), porque negociação duplicada já nasceu de envio duplo.

## Parcelas: só existem quando o contrato as gera

**Regra:** parcela de venda/locação existe **se e somente se** está em
`internal_transactions`. Nada gera cobrança por varredura ou como efeito de
abrir tela.

- `commercialFinanceService.syncDealToFinance` está **aposentada** (mantida só
  para não quebrar chamadores; não faz nada). Ela materializava parcelas em lote
  ao abrir a Conciliação e o Financeiro do projeto, e parcelas de negócios que
  nem tinham fechado apareciam sozinhas.
- **Venda**: "Lançar no Financeiro" escreve o plano de pagamento (sinal +
  cronograma, com tipo de parcela e forma de pagamento) no `payment_schedule`
  do **contrato**; `contractService.syncContractToFinance` materializa em
  `internal_transactions`. Não existe segundo motor — seria segunda chance de
  duplicar cobrança.
- **Locação**: faturada pela série recorrente do contrato (botão "Gerar
  parcelas", `components/contracts/GerarParcelasSheet.tsx`).
  `syncContractToFinance` recusa contrato de locação original justamente para não
  criar uma segunda série do mesmo aluguel.
- `custom_installments` do deal é só cronograma estrutural para a proposta
  exportada; não aciona o financeiro.

### O projeto de sistema "Gestão Comercial"

As parcelas comerciais ficam penduradas num projeto por organização criado por
`getOrCreateCommercialProject` (`classification: 'OBRA'`,
`isSystemProject: true`). Ele nunca aparece como obra e **seu id nunca é
gravado como `project_id` de lançamento** — ver
[Projetos e classificação](../../conceitos/classificacao-de-projetos.md).

`getConsolidatedVault(userOrganizationIds)` monta, para "Todas as
organizações", um projeto **virtual** só de leitura que mescla os cofres
comerciais **das organizações do usuário** (a versão antiga buscava por nome sem
filtro de organização e vazava dados entre tenants). Cada item carrega
`sourceProjectId` para gravar de volta no cofre real.

`mapReceivableRow` converte a linha de `internal_transactions` em parcela; é a
mesma regra usada pelo Portal do Cliente sobre o que a RPC do portal devolve,
e "pago" segue `tituloEstaPago` (a mesma regra do Portal do Síndico).

## Comissão de corretor

- Corretores em `broker_profiles` (taxa em `commission_rate`; corretor ativo
  também conta como membro da organização para a RLS).
- A comissão é **derivada** da negociação (`commercial_deals.broker_*`) e vira
  um **título a pagar** em `internal_transactions` com
  `reference_id = 'brk-{deal_id}'`, criado/atualizado/cancelado por gatilho
  (`trg_comissao_corretor`).
- `brokerService.listCommissions(orgId, email)` lê pela RPC
  `fn_broker_comissoes_gestor`, que limita "Todas" às organizações de que o
  usuário é membro.
- O Portal do Corretor tem visão própria de comissões; ver
  [Portais externos](../portais/portais-externos.md).

## Locações

`components/RentalsModule.tsx` e `components/rentals/` (renovações, garantias,
espelho de unidades, análise). Cálculos puros em `lib/rental*.ts` (NOI,
vacância, carteira, alocação, espelho de unidades) e serviços
`rental*Service.ts` (precificação, tabela de preços, garantias, vacância).

## Condomínio

`components/condominio/` e `services/condominio*Service.ts`: frações ideais,
rateios (`condominio_rateios` / `condominio_rateio_itens`), cobrança
(`client_charges` → `internal_transactions`), ocupações (`unit_occupancies`),
manutenção, documentos e comunicação. O síndico **nunca entra no app**: gerencia
pelo Portal do Síndico, lendo e agindo por RPC (`sindico_portal_*`).

## Imovib (viabilidade)

`services/imovibService.ts` e `components/Imovib*`: estudos de viabilidade
(blocos, unidades, CAPEX, funding, sensibilidade, fluxo de caixa). Quando ligado
a um empreendimento, o estudo **lê a estrutura dele**
(`utils/imovibEstrutura.ts` → `derivarEstruturaDoEmpreendimento`) em vez de
duplicá-la; o motor de VGV lê o espelho de instâncias de unidade.

## Onde olhar

| Pergunta | Arquivo |
|---|---|
| status/transições do deal | `lib/dealWorkflow.ts` |
| salvar deal, unidades, compradores, trava de unidade | `services/commercialService.ts` |
| cofre comercial, parcelas do deal, consolidação | `services/commercialFinanceService.ts` |
| contrato → `internal_transactions` | `services/contractService.ts` (`syncContractToFinance`) |
| corretores e comissões | `services/brokerService.ts` |
| estrutura do empreendimento | `services/empreendimentoService.ts` |

O caminho do título até o financeiro está em
[Financeiro: títulos e sincronização](../financeiro/titulos-e-sincronizacao.md).
