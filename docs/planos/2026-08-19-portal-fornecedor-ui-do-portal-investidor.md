# Portal do Fornecedor — aplicar o UI/UX do Portal do Investidor

## Pedido original

> Sessão de 2026-08-19, primeira mensagem, transcrita literalmente:
>
> ```
> portal do fornecedor (visão do fornecedor): aplicar UI UX igual ao portal do investidor (visão do investidor)
> ```

Nada mais foi pedido nesta sessão.

## Leitura do pedido

"Visão do fornecedor" = o que o fornecedor vê, ou seja `isPublicExperience`
(link público por token + prévia mobile). A visão do **gestor** sobre o mesmo
módulo (`SupplierPortalManager` → `SupplierDashboard` sem token) fica no padrão
do app, exatamente como o Portal do Investidor separa gestor × investidor.

"Igual" foi lido ao pé da letra, inclusive o acento **coral `#E1553C`** — é uma
linguagem só de "portal externo", não uma cor por portal. O azul/`Supplier
Portal` anterior saiu. Se o usuário preferir um acento por portal, é uma troca
de tokens no `PortalKit`.

## Itens

| # | Arquivo | O que muda | Como sei que terminou | Estado |
|---|---|---|---|---|
| 1 | `components/portal/PortalKit.tsx` | kit promovido de `investor/portal/` para servir os dois portais; docblock atualizado | os 8 arquivos de `investor/portal/*` importam de `../../portal/PortalKit` e o build passa | ✅ |
| 2 | `components/supplier/portal/status.ts` | tons de pílula por status de pedido/cotação/NF + `orderTotal`/`isOpenOrder`/`isNegotiating` | `tsc` limpo; nenhum status do domínio sem tom | ✅ |
| 3 | `components/supplier/portal/PortalOverview.tsx` | `KpiStrip` (5 KPIs reais) + faixa de insight + card com sub-abas Pedidos/Cotações/Notas | print desktop e mobile mostram KPIs e as 3 sub-abas com dado real | ✅ |
| 4 | `components/supplier/portal/PortalOrders.tsx` | tabela com busca persistida, 4 filtros, linha expansível com `DetailField` + ações; cartões no mobile | print `orders_expandido` mostra a linha aberta com os 8 campos e os 2 botões | ✅ |
| 5 | `components/supplier/portal/PortalQuotations.tsx` | tabela de RFQ com prazo relativo ("em 3 dias"/"prazo encerrado") e ação Responder | print `quotations` | ✅ |
| 6 | `components/supplier/portal/PortalNegotiations.tsx` | aba Lances passa a listar **pedidos reais** em `Enviado`/`Em Negociação` | print `negotiations`; nenhum array fixo de exemplo restou no caminho do fornecedor | ✅ |
| 7 | `components/supplier/portal/PortalInvoices.tsx` | envio de NF (drop zone coral) + tabela de notas com vínculo de pedido, ver e excluir (`useConfirm`) | print `documents` | ✅ |
| 8 | `components/SupplierDashboard.tsx` | casca standalone (banner + header + sidebar + barra inferior + sheet "Mais"), título/abas do app escondidos no portal, prévia mobile, estados "Portal em configuração" e "Dados indisponíveis" | prints desktop+mobile das 5 abas; `scrollWidth == clientWidth` (sem scroll lateral) | ✅ |
| 9 | `components/OrderLifeline.tsx`, `components/NegotiationHub.tsx` | prop `accent={'indigo'\|'portal'}`, padrão `indigo` (app inalterado) | prints `orders_logistica` e `negociacao_hub` em coral; nenhum `indigo` literal sobrou nos dois arquivos | ✅ |
| 10 | `App.tsx` (`SupplierPortalTokenGate`) | guard deixa de aplicar `p-4 md:p-6` (a casca é dona do gutter) e o spinner vira coral | sem gutter duplicado no print | ✅ |
| 11 | `docs/ui_ux_guia_unificado.md` | §24 vira "Portais externos" com os dois escopos + caminho novo do kit; §20.2/§20.2.1 atualizadas | seções lidas e coerentes com o código | ✅ |
| 12 | `SupplyChainOrderDetails.tsx` | prop `accent` (44 pontos: header, cards, fluxo de atendimento, itens, painel "Status Interno", Documentos Fiscais) + repasse para `OrderLifeline`/`NegotiationHub` | prints 1440 e 1920 da tela de detalhe e da de rastreio, tudo coral | ✅ (2026-08-20) |
| 13 | `OrderLifeline.tsx` | rótulos deixavam de caber e se sobrepunham abaixo de ~800px: `overflow-x-auto` + `min-w-[760px]` + `px-8` (folga da pílula "Prev:") | print 1440 sem sobreposição | ✅ (2026-08-20) |
| 14 | `SupplyChainOrderDetails.tsx` | remover o card "Fluxo de Atendimento" da tela de detalhe — era a mesma `OrderLifeline` da tela de Logística | a linha do tempo não aparece mais em Detalhes e continua nas DUAS rotas de logística (botão "Rastreio" do cabeçalho e "Logística do pedido" da lista) | ✅ (2026-08-20) |
| 15 | `QuotationResponseForm.tsx` | migrar acento e tirar o overlay de tela cheia | — | ❌ **NÃO FEITO** — ver abaixo |

## Pedido de 2026-08-20 (itens 12 e 13)

> `faltou aplicar na página de detalhes do pedido. veja print`
>
> (print da tela `SupplyChainOrderDetails` dentro do portal, ainda em
> indigo/violeta/âmbar.)

Feito com o mesmo padrão de prop `accent` (`'indigo' | 'portal'`, padrão
`indigo`), agora com um mapa de tokens maior: `text`, `icon`, `softBtn`,
`panel`, `chip`, `bar`, `solid`, `onSolid`, `onSolidSecondary`, `doc*`.

**Cores semânticas ficaram como estão** nos dois contextos: emerald de
"Confirmar Pedido", âmbar do painel de Divergências, cor do status do pedido
(`getStatusStyles`) e o azul do toast de informação. O âmbar de "Documentos
Fiscais" **entrou** no acento porque ali ele é decorativo (cor da seção), não
semântico.

## Pedido de 2026-08-20 (item 14)

> `ao clicar em um pedido aparecem dois botões (ver detalhes e logistica do
> pedido. Como temos uma página dedicada a logistica a informacao Fluxo de
> Atendimento que aparece em detalhes do pedido é a mesma que aparece em
> logistica do pedido. Vamos manter na página logistica do pedido e remover da
> página detalhes do pedido`

O card "Fluxo de Atendimento" saiu da tela de detalhe. **Vale também para a
visão interna do comprador** — a duplicação era a mesma lá, e o botão
"Rastreio" do cabeçalho (que não é recortado por `portalToken`) continua sendo
a rota para a linha do tempo nos dois contextos.

Restaram **duas** rotas para a logística, ambas verificadas:
`SupplyChainOrderDetails` em `viewMode === 'logistics'` (botão "Rastreio") e a
tela própria do `SupplierDashboard` (botão "Logística do pedido" da lista).

Junto: o título "Documentos Fiscais" passava por baixo do botão `absolute`
"Anexar NFe" quando a coluna era estreita — ganhou `pr-36`.

## Item 15 — por que ficou de fora

`QuotationResponseForm` é a **mesma tela** do módulo Suprimentos interno e abre
como **overlay de tela cheia** (`absolute inset-0 z-[110] bg-black/60`): no
portal ele engole a casca inteira (sidebar e header somem). Isso contraria
`UI_PATTERNS.md` (painel lateral é o padrão) e já é assim hoje no app — mudar é
decisão de interação, não de cor.

## Efeitos colaterais assumidos (fora de "só UI")

1. **Aba Lances deixou de mostrar dado falso.** A versão anterior renderizava um
   array fixo ("Cimento CP-II 50kg", "Edifício Horizon", lance "R$ 34,50") para
   o fornecedor real no link público. No vocabulário do portal o estado vazio é
   honesto, então a lista passou a vir dos pedidos reais.
2. **Lista de abas vazia agora significa "nenhuma aba".** Era
   `length > 0 ? salvas : todas` — o gestor que desligava todas via o portal
   voltar com TODAS. Alinhado ao `deriveTabIds` do Portal do Investidor; com
   zero abas o fornecedor vê "Portal em configuração".
3. **KPIs da aba Estatísticas passaram a ser reais.** "Negociações Ativas: 12"
   era literal no JSX.

## Verificação executada

- `npx tsc --noEmit` → 0 erros;
- `npx vite build` → ok;
- `bash scripts/check-ui-standard.sh` nos 6 arquivos tocados → 0 violações;
- harness temporário (`__portal-preview.*`, já removido) + Playwright:
  8 prints em `C:/tmp/pwtest/portalfornecedor` (1440×980 e 390×844), sem erro
  de console e sem scroll horizontal.
