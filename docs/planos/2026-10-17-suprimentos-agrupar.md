# Suprimentos — "Agrupar" em Contratos, Cotações, Pedidos, Recebimento e Almoxarifado

## Pedido original
> aplicar agrupamento também em :
> 1. Suprimentos > Gestão de Contratos
> 2. Suprimentos > Cotações de Suprimentos
> 3. Suprimentos > Pedidos de Compra
> 4. Suprimentos > Gerenciamento de Recebimento
> 5. Suprimentos > Gestão de Almoxarifado
>
> Sessão: 6480dfb9-9abe-4ab4-adce-d776e13c7443 · 17/10/2026. Mesmo recurso de
> `docs/planos/2026-10-15-financeiro-agrupar-propagacao.md` e
> `docs/planos/2026-10-17-agrupar-cadastros-ativos-documentos.md` (guia de UI §6.12).

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | Quais tabelas | Contratos (`SupplyChainContractList`), Cotações (`SupplyChainQuotationList`), Pedidos (`SupplyChainOrderList`), Recebimento (`SupplyChainReceiptManager`) e, no Almoxarifado (`InventoryModule`), as abas **Saldos**, **Itens** e **Movimentos**. |
| 17/10/2026 | O que fica de fora no Almoxarifado, e por quê | **Posição Líquida** e **Lead Time** são cálculos (relatório); **Transferências**, **Almoxarifados** e **Requisições** são cartões, não tabelas — não há linha de grupo para intercalar. |
| 17/10/2026 | Telas com grade/lista | Agrupar só no modo lista (a grade não tem linha de grupo). |
| 17/10/2026 | Total do grupo | Onde a tabela tem valor em dinheiro (contratos, cotações, pedidos, saldos, movimentos), o cabeçalho soma esse valor; nas demais, só a contagem. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `components/SupplyChainContractList.tsx` | Agrupar | teste de tela |
| `components/SupplyChainQuotationList.tsx` | Agrupar | teste de tela |
| `components/SupplyChainOrderList.tsx` | Agrupar (com seleção: Shift+clique sobre as linhas da tela) | teste de tela |
| `components/SupplyChainReceiptManager.tsx` | Agrupar | teste de tela |
| `components/InventoryModule.tsx` + `components/inventory/StockItemsTab.tsx` | Agrupar em Saldos, Itens, Movimentos | teste de tela |
| `docs/ui_ux_guia_unificado.md` §6.12 | lista de telas | seção atualizada |

## Estado
- [x] Contratos — Status, Fornecedor/Cliente, Obra, Empreendimento, Início da vigência (mês), Centro de Custo, Plano de Contas; total = valor atual; escolha guardada por domínio (o componente serve também Serviços/Locação/Vendas)
- [x] Cotações — Status, Obra, Empreendimento, Prazo final (mês); só contagem
- [x] Pedidos — Status, Fornecedor, Obra, Empreendimento, Centro de Custo, Plano de Contas, Data do pedido (mês); total = valor efetivo; "selecionar todos" ignora grupo recolhido (provado nas duas direções)
- [x] Recebimento — Status logístico, Fornecedor, Obra, Empreendimento, Previsão (mês); só contagem
- [x] Almoxarifado — Saldos (Almoxarifado, Insumo; total = valor em estoque), Movimentos (Tipo, Almoxarifado, Insumo, Data por mês; total = valor), Itens (Categoria, Marca/modelo, Fornecedor padrão, Origem, Situação; só contagem)
- [x] testes: `__tests__/components/SuprimentosAgrupar.test.tsx` (7)
- [x] guia §6.12
- [x] conferência visual — preview local, login de leitura, dados reais: Contratos, Cotações, Pedidos, Recebimento e Almoxarifado › Itens com colSpan = células da linha; recolher/expandir todos ok; 0 escritas, 0 erros. Saldos e Movimentos vazios para o usuário de leitura → cobertos por teste. Script `c:/tmp/pwtest/suprimentos-agrupar.js`
- [x] publicado em `17c1f728`; domínio carimbado com o commit e os 7 seletores nos chunks servidos; CI `ci` success (o `blueprintCasaAutomatica.test.ts` que caiu na suíte local — frente da Planta, worker do Node instável — passou na CI)

## Verificação
1. Testes de tela + `check-ui-standard.sh` em cada arquivo.
2. Playwright com o usuário de leitura em cada tela/aba: Agrupar › opções, recolher, recolher/expandir todos.
