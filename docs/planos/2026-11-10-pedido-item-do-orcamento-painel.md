# Pedido de Compra — "Seleção de materiais da obra" vira "+ Item do orçamento" com painel

## Pedido original
> a secão (Seleção de materiais da obra) inves de ficar sempre visivel ainda mais se for um orçamento que pode ter centenas de itens, é me;lhor ficar oculto e como em aficionar itens avulsos, criar um botão adicionar item do orçamento e então abre-se modal
>
> Sessão e7d28ecc · 2026-11-10

Contexto do mesmo dia: o #311 tirou a tabela "Itens avulsos" repetida da aba Itens do detalhe
(pedido: "Itens do pedido e Itens avulsos nao fica duplicado?") e levou o "+ Item avulso" para a
régua de "Itens do pedido".

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-10 | Onde muda — detalhe do pedido, Novo pedido ou os dois? | **Nos dois.** No Novo pedido, "Itens avulsos" vira "Itens do pedido" (orçamento + avulsos). |
| 2026-11-10 | Composição no painel: insumos logo abaixo ou a janela de insumos? | **Insumos logo abaixo**, como em Solicitação de Compra › "Do orçamento". |

## Plano — um item por arquivo
1. **`lib/orcamentoLinhas.ts`** (+ `__tests__/orcamentoLinhas.test.ts`) — `montarLinhas` sai de
   `SCOrcamentoPicker` sem mudar comportamento; `linhasDoOrcamentoParaPedido` tira serviço de topo,
   marca a composição como título (não se marca), soma comprada/a comprar e marca o que já está no
   pedido. **Pronto quando:** teste verde.
2. **`components/suprimentos/PedidoOrcamentoPicker.tsx`** — `Sheet` 4xl no molde do
   `SCOrcamentoPicker`; só exibe (orçamento, preços e compradas vêm do formulário); vazio com as duas
   causas; erro de gravação aparece no painel. **Pronto quando:** `check-ui-standard.sh` = 0.
3. **`components/SupplyChainOrderForm.tsx`** — sai a tabela de seleção e a janela de insumos
   (`MaterialSelectionModal`); "+ Item do orçamento" ao lado de "+ Item avulso". Embutido: grava na
   hora (`acrescentarAoPedido`, lê o pedido e grava com a versão lida). Novo pedido: lista única
   "Itens do pedido" com Origem; item do orçamento edita no mesmo modal com código/descrição/unidade
   travados (§32). Painel montado só aberto (o Sheet fechado fica no DOM).
   **Pronto quando:** typecheck verde, `check-ui-standard.sh` = 0.
4. **`components/SupplyChainOrderDetails.tsx`** — sem mudança: o ponto `barraItens` (#311) recebe os
   dois botões.
5. **Testes de componente** — `SupplyChainOrderFormItensEmbutido` (painel, item do pedido não
   marcável, composição desdobrada, gravação sem `avulso` com quantidade a comprar) e
   `SupplyChainOrderFormNovoItens` (lista única, edição travada, excluir, `createOrder`).
   **Pronto quando:** verdes junto com os demais testes do formulário.

## Estado
- [x] 1. 5 testes verdes
- [x] 2. `check-ui-standard.sh` = 0
- [x] 3. typecheck verde, `check-ui-standard.sh` = 0
- [x] 4. nada a mudar
- [x] 5. 63 testes verdes (formulário, linhas, Agrupar, preferências, guarda de cinza, guarda de org)
- [x] Conferência em produção (só leitura) depois do merge — #314: painel no detalhe e no Novo pedido

## Correção — 2026-11-10 (painel → tela própria)
> o drawer parece ter ficado pequeno. somente mostra duas colunas. Seria melhor um tela propria? avalie

Avaliação: no print, o auto-ajuste de colunas (↔) levou Descrição a 500px (teto) e empurrou o
resto para fora; mesmo nas larguras padrão a descrição SINAPI sai cortada em ~200px no Sheet de
896px. A regra do `Sheet` (components/ui/sheet.tsx) manda: largura que não basta vira tela in-flow,
nunca painel mais largo nem tela cheia. Usuário escolheu **tela própria**.

6. **`components/suprimentos/PedidoOrcamentoTela.tsx`** (era `PedidoOrcamentoPicker`) — tela no
   fluxo com "← Voltar", título, Cancelar/Adicionar no topo; `StandardTable` na largura da página com
   chave nova de larguras. **`SupplyChainOrderForm`** troca a lista de itens pela tela e avisa o
   detalhe (`onTelaOrcamento`); **`SupplyChainOrderDetails`** esconde "Itens do pedido" enquanto ela
   está aberta. **Pronto quando:** typecheck verde, `check-ui-standard.sh` = 0, testes do formulário
   verdes (+ caso do "Voltar").
- [x] 6. typecheck verde, `check-ui-standard.sh` = 0 nos três `.tsx`, 35 testes verdes

## Correção — 2026-11-10 (mão de obra fora)
> Escondo a mão de obra (Servente, Carpinteiro) dos insumos de composição? Resposta: sim

7. **`lib/orcamentoLinhas.ts`** — `ehMaoDeObra`: categoria "Mão de Obra" ou unidade **H** (no banco
   a `category` dos insumos de composição vem vazia; a mão de obra SINAPI é em hora). Equipamento
   (CHP/CHI) continua. **Pronto quando:** caso novo em `orcamentoLinhas.test.ts` verde.
- [x] 7. teste verde

## Correção — 2026-11-10 (só material)
> Pedidos fica somente com materiais. Mão de obra e horas ( escavadeira e caminhão ) fica em suprimentos > contratos. Esconder também

8. **`lib/orcamentoLinhas.ts`** — `ehHoraDeEquipamento` (CHP/CHI ou categoria Equipamento) e
   `naoEMaterial`; vale para insumo de composição e item de topo; composição sem nenhum insumo de
   material some (título sozinho). **`PedidoOrcamentoTela`** diz "Só materiais. Mão de obra e
   equipamento por hora são contratados em Suprimentos › Contratos." **Pronto quando:** casos novos
   em `orcamentoLinhas.test.ts` verdes.
- [x] 8. 7 testes verdes; formulário 31 verdes

## Correção — 2026-11-10 (composição dentro de composição)
Proposta ao usuário: tirar também os serviços que não são por hora (carga/transporte em caminhão,
montagem de armadura) — "Pode fazer". Antes de aplicar: no orçamento gravado a composição INTERNA
vem **sem os próprios insumos** (ARMAÇÃO DE PILAR sem o aço, ARGAMASSA sem cimento e areia).
Esconder a interna sumiria com o material. Feito o que a intenção pede ("só materiais"): descer.

9. **`lib/orcamentoLinhas.ts`** — `materiaisDaComposicao` (desce nas internas com o coeficiente
   acumulado, até 5 níveis, sem ciclo; mesmo material por dois caminhos soma; interna sem
   detalhamento na base continua marcada "sem detalhamento"), `composicoesInternasAResolver`.
   **`PedidoOrcamentoTela`** busca as internas em `sinapiService.getItemsByCodes` nível por nível e
   depois o preço dos materiais. **Pronto quando:** `orcamentoLinhas.test.ts` e teste de tela
   (argamassa → cimento) verdes.
- [x] 9. 11 + 6 testes verdes; formulário 42 verdes
- Produção (#328, só leitura, PC-008-008-0001): 160 linhas; aço, arame e concreto aparecem; argamassa,
  montagem e transporte não; 0 "sem detalhamento". Sobraram itens por mês.

## Correção — 2026-11-10 (cobrado por mês)
Pergunta: mensalistas (engenheiro, técnico), encargos de mensalista (EPI/ferramentas/seguro/exames/
alimentação/transporte) e locação (container, aprumador) — esconder? Resposta: **"Esconder os três"**.

10. **`lib/orcamentoLinhas.ts`** — `ehCobradoPorMes` (unidade MES ou …XMES) entra em `naoEMaterial`.
    **Pronto quando:** caso novo em `orcamentoLinhas.test.ts` verde (milheiro MIL continua).
- [x] 10. 12 testes verdes

## Verificação
1. typecheck, testes acima, `check-ui-standard.sh` nos `.tsx` tocados; CI (inclui build).
2. Produção, sem gravar: aba Itens do PCO-014-003-0001 com os dois botões; painel com o piso em
   taco desdobrado e o item já no pedido sem checkbox; Novo pedido com obra escolhida abre o painel.
