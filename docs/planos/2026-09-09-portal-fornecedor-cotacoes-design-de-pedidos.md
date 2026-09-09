# Portal do Fornecedor › Cotações com o design de Pedidos

## Pedido original

> Sessão de 2026-09-09, primeira mensagem:
>
> Portais < Área do Fornecedor < Cotações: implemente em  Cotações: o mesmo design Área do Fornecedor < Pedidos
> nota: todos na visao do Fornecedor (acesso token)

## Diagnóstico (o que estava diferente)

O portal do fornecedor (`SupplierDashboard.tsx` sob `isPublicExperience`, que é
`isPreview || !!portalToken`) tem duas camadas por aba:

| Camada | Pedidos | Cotações (antes) |
|---|---|---|
| **Lista** | `supplier/portal/PortalOrders.tsx` — PortalKit, busca persistida, **chips de filtro**, linha expansível, cartões no mobile | `supplier/portal/PortalQuotations.tsx` — PortalKit, busca persistida, linha expansível, cartões no mobile, **sem chips de filtro** |
| **Detalhe** | `SupplyChainOrderDetails` com `accent='portal'`, dentro do `drillCard` do dashboard — fluxo normal da página, `h1` §20, abas §19.1, escala compacta §16 | `QuotationResponseForm` — **overlay `absolute inset-0 z-[110] bg-black/60`**, `rounded-[3rem]`, indigo fixo, `font-black uppercase tracking-[0.3em]`, `confirm()`/`alert()` nativos |

A distância real está no **detalhe**: a tela de resposta da cotação é a única do
portal que ainda usa o vocabulário antigo (escala grande, indigo, caixa alta) e
a única que abre como modal de tela cheia. O próprio guia já registrava isso:
`docs/ui_ux_guia_unificado.md` §24 — *"Já migrados: `OrderLifeline.tsx`,
`NegotiationHub.tsx` e `SupplyChainOrderDetails.tsx`. **Falta
`QuotationResponseForm.tsx`.**"*

Memórias que pesam aqui: ⚠️ *NUNCA tela cheia para painéis*, ⚠️ *`absolute` no
`<main>` rolável*, ⚠️ *Toast MUDO* (o `useToast` só aparece com o
`<ToastProvider>` — está montado em `index.tsx`, então vale também no guard de
token, que roda fora do `<Layout>`).

## Itens

### 1. `components/QuotationResponseForm.tsx` — reescrever no vocabulário de Pedidos

**O que muda**

- Prop `accent?: 'indigo' | 'portal'` (default `indigo`) + mapa `ACCENTS` no topo
  do arquivo, cada variante escrita por extenso (§24 — o JIT do Tailwind não
  enxerga classe montada em runtime). Mesmo mapa conceitual de
  `SupplyChainOrderDetails.tsx`.
- Sai o overlay `absolute inset-0 z-[110] bg-black/60 backdrop-blur-xl` — a tela
  passa a viver no fluxo normal, como o detalhe do pedido.
- Cabeçalho §20: botão Voltar + `<h1 class="text-3xl font-black tracking-tight">`
  com o número da cotação no acento + subtítulo `mt-1.5` (obra · prazo · status).
- Barra de abas §19.1 (`h-7`, trilho `bg-gray-50`, ativa `bg-white` + cor do
  acento): **Itens e preços · Condições · Negociação**. A aba Negociação só
  aparece quando há contraproposta ou histórico.
- Escala compacta §16 em tudo: containers `rounded-[10px]`, inputs/botões
  `rounded-[6px]`, controles `h-9`.
- Tabela de itens no §6.6/§7: `px-6 py-2` no `<th>`, `px-6 py-2.5` no `<td>`,
  `border-r border-gray-100 last:border-r-0`, `<thead>` sentence case (§6.2),
  tipografia por tipo de dado (valor financeiro é o único `font-medium`).
- Rótulos de campo §21: `text-xs font-semibold text-slate-500` (sai
  `text-[9px] font-black uppercase tracking-widest`).
- Status/pílulas §8: texto colorido simples.
- §14/§13: `useConfirm()` no lugar de `confirm()` e `useToast()` no lugar de
  `alert()`.
- §25: enviar proposta nova fecha; **atualizar** proposta existente permanece na
  tela, com `useUnsavedChanges` + `SaveStatus` e guarda de saída.

**Como sei que terminou**

- `bash scripts/check-ui-standard.sh components/QuotationResponseForm.tsx` → 0
  (ou só achados justificados pelo §24, apontados por escrito).
- `grep -n "absolute inset-0\|rounded-\[3rem\]\|font-black uppercase\|window.confirm\|alert(" components/QuotationResponseForm.tsx` → vazio.
- `npx tsc --noEmit` limpo.

### 2. `components/SupplierDashboard.tsx` — `renderQuotations()` monta o detalhe como Pedidos

**O que muda**

- O `QuotationResponseForm` passa a ser renderizado dentro do mesmo
  `drillCard` + animação de entrada que o `SupplyChainOrderDetails` já usa, e
  recebe `accent={isPublicExperience ? 'portal' : 'indigo'}`.
- A lista interna (`!isPublicExperience`) ganha estados de vazio/carregando já
  existentes — sem alteração de comportamento.

**Como sei que terminou**

- Bloco de detalhe da cotação idêntico em estrutura ao de `renderOrders()`
  (`drillCard` + `animate-in fade-in slide-in-from-right-4 duration-500`).
- `npx tsc --noEmit` limpo.

### 3. `components/supplier/portal/PortalQuotations.tsx` — paridade de lista com `PortalOrders`

**O que muda**

- Chips de filtro persistidos (`supplierPortal:filterQuotations`), desktop ao
  lado da busca e mobile rolando sob o título — mesmo desenho de `PortalOrders`:
  **Todas · Aguardando resposta · Respondidas · Encerradas**.
- Contagem no subtítulo passa a refletir o filtro ativo, como em Pedidos.

**Como sei que terminou**

- Diff estrutural entre `PortalQuotations` e `PortalOrders` reduzido aos campos
  de domínio (RFQ/prazo vs. pedido/valor).
- `bash scripts/check-ui-standard.sh components/supplier/portal/PortalQuotations.tsx`
  → só os achados de §24 (pílula de status do `StatusPill`), justificados.

### 4. `docs/ui_ux_guia_unificado.md` §24 — tirar a pendência

**O que muda**: a frase *"Falta `QuotationResponseForm.tsx`"* passa a listá-lo
entre os migrados.

**Como sei que terminou**: `grep -n "Falta .QuotationResponseForm" docs/ui_ux_guia_unificado.md` → vazio.

## Estado — 4 de 4 itens concluídos (2026-09-09)

| Item | Estado | Evidência |
|---|---|---|
| 1. `QuotationResponseForm.tsx` | ✅ | `check-ui-standard.sh` exit 0; `grep` de `absolute inset-0`/`rounded-[3rem]`/`alert(`/`confirm(` só acha as chamadas de `useConfirm()` |
| 2. `SupplierDashboard.renderQuotations()` | ✅ | `SupplierDashboard.tsx:1024-1042` — `drillCard` + `animate-in fade-in slide-in-from-right-4 duration-500` + `accent` |
| 3. `PortalQuotations.tsx` | ✅ | chips desktop/mobile idênticos aos de `PortalOrders.tsx` |
| 4. Guia §24 | ✅ | `grep -n "Falta .QuotationResponseForm" docs/ui_ux_guia_unificado.md` → vazio |

**Verificação na interface de verdade** (Playwright, portal por token do
fornecedor MCC, servidor da própria frente em `:3112` — porta conferida no log
do `npm run dev`, não presumida):

- lista de Cotações com os 4 chips presentes e a busca ao lado, igual à de Pedidos;
- tela de responder abre no fluxo da página — `document.querySelectorAll('.bg-black\\/60').length === 0`;
- `scrollWidth - clientWidth === 0` (sem scroll lateral);
- abas Itens e preços / Condições / Negociação trocam o conteúdo; botão Voltar
  retorna à lista;
- zero `pageerror`, zero `console.error`, zero HTTP 4xx/5xx do PostgREST.

Suíte cheia: **218 arquivos, 3376 testes, 0 falha**. `npx tsc --noEmit` limpo.
`npx vitest run __tests__/orgContextGuard.test.ts` → 14 passando.

## Item 5 (pedido posterior, mesma sessão) — "Sugerido" que repetia o campo

> Pedido: **corrigir**, sobre a observação de que a linha "Sugerido: R$ x"
> aparecia mesmo quando o valor sugerido era igual ao preenchido.

Eram **duas regras diferentes** para a mesma coisa, e é daí que vinha o ruído:

| Marca | Regra antiga | Consequência |
|---|---|---|
| Destaque âmbar do campo (itens) | sugerido ≠ valor **do campo** | correta |
| Dica "Sugerido: …" (itens) | qualquer contraproposta com aquele código | aparecia sempre, mesmo igual |
| Destaque âmbar + dica (condições) | contraproposta ≠ **resposta original salva** | discordava do campo depois de o formulário ser pré-preenchido com a contraproposta |

Agora uma função só (`diverge(sugerido, atual)`) governa **destaque e dica**, nos
7 campos de condição e no preço unitário de cada item: sem divergência, nenhuma
das duas marcas aparece. `undefined`/`null`/`''` também não contam como sugestão.

**Como sei que terminou** — medido no portal por token, com o campo sendo editado
ao vivo:

| Estado | dicas "Sugerido" | campos âmbar |
|---|---|---|
| campo == sugerido (1,90) | **0** | **0** |
| campo alterado para 99 | **1** ("Sugerido: R$ 1,90") | **1** |
| campo de volta em 1,90 | **0** | — |

`npx tsc --noEmit` limpo · `check-ui-standard.sh` exit 0 · suíte cheia 3376/3376.

## Fora de escopo (dito explicitamente)

- Visão do **gestor/comprador** sobre cotações (`SupplyChainQuotationList`,
  `SupplyChainQuotationComparison`) — o pedido é a visão do fornecedor.
- Mudanças no serviço/RPC de cotação (`quotationService`,
  `supplierPortalTokenService`) — nenhuma linha de dado muda.
