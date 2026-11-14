# Venda de Ativos — colunas de peso, Resultados/Simulação na Análise, número do contrato, Tabela de Preços × Espelho

## Pedido original

> 1. Comercial > Venda de ativos > aba unidades do edifício: remover colunas peso posição e peso sol. Essas informações já são contempladas na aba inteligencia.
> 2. Comercial > Venda de ativos > aba negociações > aba resultados e aba simulação: avalie estas abas, deve ser absorvida por comercial > Venda de Ativos > aba análise
> 3. Comercial > Venda de ativos > aba negociações > aba Contrato: o número do contrato não esta sendo gerado automaticamente.
> 4. Comercial > Venda de ativos > aba tabela de preços: existe unidade disponível em tabela de preços mesmo sendo desvinculado em incorporação > empreendimentos > aba espelho de vendas.
> [Request interrupted by user]
> continue

Sessão: e4f9e289-0864-48ef-83d0-8f3602b33ca1 · 14/11/2026

## O que foi medido antes de decidir (14/11/2026, banco de produção, só leitura)

- **Item 3:** os 8 contratos `domain='VENDAS'` têm número (nenhum vazio). O número só
  nasce no botão "Gerar Contrato de Venda" (`DealModal.handleGenerateContract` →
  `contractService.createFromDeal`). As negociações **0007 e 0008** estão na etapa
  `CONTRATO` sem contrato: é nelas que o campo aparece vazio, só com o exemplo "Ex: CV-2026-001".
- **Item 4:** a Tabela de Preços lista **toda filha** do edifício (`parent_id`), sem olhar
  o espelho. Garden Cambuhy: 12 unidades (105–308) existem no espelho com o vínculo
  apagado (`commercial_property_id = null`, o "Desvincular"); outras 12 (005–008,
  405–408, 505–508) nem existem mais no espelho. As 24 seguem no Comercial; **20 estão
  na tabela ativa com `visible_to_broker = true`, e aparecem no Portal do Corretor**.
  Mais 4 unidades **ocultadas** (`visible_in_sales = false`: Estacionamentos e Área Comum)
  estão na tabela, que a aba Unidades já esconde e a Tabela de Preços não.
- **Item 2:** Resultados (`SalesDashboard`) e Simulação comparados com a Análise:
  - já existem na Análise: VGV total, vendido e a vender, negociações por etapa (o funil),
    vendas por mês, distratos, unidades disponíveis;
  - só existem nelas: ranking de corretores, origem das vendas (`origin_channel`) e o
    simulador de esgotamento (velocidade + ajuste de preço);
  - números errados ou inventados: curva "Planejado" (reta `VGV ÷ meses`, sem plano real),
    "Reprovação de crédito" (é a taxa de distrato com outro nome), "SLA" (sempre `---`),
    "Tempo de esgotamento" da Simulação (divide **todas** as unidades, vendidas inclusive).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/11 | Item 3: qual comportamento? | **Gerar ao entrar em Contrato**: salvar a negociação na etapa Contrato cria o contrato sozinho; se faltar comprador/unidade, o campo diz o que falta. |
| 14/11 | Item 2: o que levar para a Análise? | **Os 3 exclusivos**: ranking de corretores, origem das vendas e um cartão de projeção sobre o estoque que resta. Os números inventados não vão. |
| 14/11 | Item 4: até onde corrigir? | **Tabela de Preços + Portal do Corretor + aba Unidades.** |

## Regra do item 4 (uma só, em todas as leituras)

Unidade de um edifício que é o `commercial_building_id` de um empreendimento **só entra na
oferta de venda se alguma unidade do espelho aponta para ela** (`empreendimento_units.
commercial_property_id` ou `rental_property_id` = id). Edifício sem empreendimento
(imóvel avulso do Comercial) não muda. Isso cobre desvincular, unidade apagada do
espelho e republicação. É derivado da leitura, então não depende de cada caminho de
escrita lembrar de apagar um flag.

## Plano

1. **`components/SalesModule.tsx` (item 1).** Sai `position_weight`/`sun_weight` de
   `INVENTORY_COLUMNS`, cabeçalhos, larguras, células, ordenação; `isVisible` passa a
   exigir que a coluna exista (chave antiga salva no navegador não gera `<col>` órfão).
   *Pronto quando:* `grep position_weight\|sun_weight components/SalesModule.tsx` vazio; tsc limpo.
2. **`lib/espelhoDeVendas.ts` (novo, item 4).** Função pura `unidadesForaDoEspelho`
   com a regra acima + teste. *Pronto quando:* teste cobre edifício sem empreendimento,
   unidade vinculada por venda, por locação, desvinculada e unidade avulsa.
3. **`services/commercialService.ts` (item 4).** `listProperties` (sem `includeHidden`)
   corta também a unidade fora do espelho. Cobre aba Unidades, cards, Análise e Portal
   do Corretor no modo logado, que leem daqui. Falha na consulta do espelho = não corta (avisa no console).
   *Pronto quando:* a aba Unidades do Garden Cambuhy não lista 105–308 nem 005–008/405–408/505–508.
4. **`services/commercialPriceTableService.ts` (item 4).** `getTableItems`,
   `listBuildingUnits` e `createDraftFromActive` cortam oculta (`visible_in_sales = false`)
   e fora do espelho. *Pronto quando:* a Tabela de Preços do Garden Cambuhy não mostra as 24 + 3 ocultas.
5. **Migration `aplicar_…_portal_corretor_unidade_fora_do_espelho.sql` (item 4).**
   Função `fn_unidade_fora_do_espelho_de_vendas` + a regra em `fn_broker_portal_get_units`
   e `fn_broker_portal_get_price_table` (esta também corta `visible_in_sales = false`).
   Partir da definição VIGENTE no banco, conferida com o arquivo mais recente.
   *Pronto quando:* aplicada, e a RPC pelo link do corretor não devolve as 20.
6. **`components/DealModal.tsx` (item 3).** Ao salvar uma negociação de VENDA na etapa
   `CONTRATO` sem contrato vinculado, gera o contrato (mesmo `handleGenerateContract`).
   Falta de comprador/unidade vira o motivo no campo. *Pronto quando:* salvar 0007 na
   etapa Contrato faz o número aparecer no campo, sem clicar em Gerar.
7. **Análise (item 2): `lib/salesAnalysis.ts` + `components/sales/SalesAnalysisOverview.tsx`.**
   Ranking de corretores (pelas negociações: quantas, vendidas, VGV vendido), origem das
   vendas (`origin_channel`) e cartão de projeção (velocidade + ajuste de preço sobre as
   unidades disponíveis e o VGV a vender do recorte). *Pronto quando:* os três aparecem
   na leitura Comercial, com recorte por empreendimento.
8. **`components/SalesModule.tsx` (item 2).** Saem as abas Resultados e Simulação do
   edifício (tipo, lista, render, estado da simulação). `SalesDashboard.tsx` e
   `salesDashboardService.ts` são removidos se não tiverem outro uso (inventário antes).
   *Pronto quando:* edifício mostra 6 abas; aba salva `dashboard`/`simulation` no navegador cai em Unidades.

## Estado

- [x] 1. Colunas de peso removidas
- [x] 2. Regra pura do espelho + teste (`lib/espelhoDeVendas.ts`, `__tests__/espelhoDeVendasForaDoEspelho.test.ts`)
- [x] 3. `listProperties` corta fora do espelho (`services/unidadesForaDoEspelhoService.ts`)
- [x] 4. Tabela de Preços corta oculta e fora do espelho
- [x] 5. Migration do portal: **APLICADA em 14/11/2026**. Medido depois: a regra corta 25 imóveis
      (24 do Garden Cambuhy + 1 do Bella Vista); a tabela ativa do Garden, pelos filtros da
      RPC, passou de 34 itens para 14 (as 14 unidades do espelho). Não deu para chamar a RPC
      com token: a organização não tem link de corretor ativo.
- [x] 6. Contrato gerado ao salvar na etapa Contrato (ou Assinatura), só venda. Não conferido
      na tela: salvar 0007/0008 cria contrato de verdade em produção, então fica para o usuário.
- [x] 7. Ranking, origem e projeção na Análise (`__tests__/salesAnalysisCorretorOrigemProjecao.test.ts`)
- [x] 8. Abas Resultados e Simulação removidas; `SalesDashboard.tsx` e `salesDashboardService.ts`
      apagados (nenhum outro uso, só comentários).

## Achados para o usuário decidir (fora do escopo)

- Negociações **004 (unidade 007)** e **006 (unidade 406)**, Pendentes, em unidades que já
  saíram do espelho do Garden Cambuhy. Com o item 4 elas somem da aba Negociações **do
  edifício** (seguem na lista geral). Cancelar ou religar a unidade.

## Verificação

- `npx tsc --noEmit` e a suíte (`npm run test`), `check-ui-standard.sh` nos `.tsx` tocados.
- Tela: Garden Cambuhy › Unidades, Tabela de Preços; Portal do Corretor pelo link; negociação 0007 › aba Contrato.
