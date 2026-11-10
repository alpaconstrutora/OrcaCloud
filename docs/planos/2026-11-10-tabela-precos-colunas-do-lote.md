# Tabela de Preços — colunas do Lote (Quadra e Nº do lote)

## Pedido original (10/11/2026)

> venda de ativos > aba tabela de precos: quando to tipo for lote as colunas da tabela deve ser ocultada (Vagas, banheiro, pavimento e posicao) e deve ser exibido (Quadra e Nº do lote)

## Contexto

- A aba (`components/PriceTableManager.tsx`) lista as unidades de um **prédio do Comercial**
  (`commercial_properties` com `type = BUILDING`). O prédio não sabe o tipo do empreendimento.
- O vínculo existe: `empreendimentos.commercial_building_id` (Venda) /
  `commercial_rental_building_id` (Locações) → prédio; `empreendimento_units.commercial_property_id` /
  `rental_property_id` → imóvel da linha. Quadra e lote moram em `empreendimento_units.quadra/lote`.
- "Tipo é lote" = `empreendimento_types.estrutura = 'LOTE'` (PR #281, `estruturaDoTipo()`), nunca o slug.

## Decisões

- Leitura nova `empreendimentoService.loteDoPredio(buildingId, purpose)` — só lê, best-effort:
  prédio sem empreendimento ou falha de leitura → TORRES (a tabela de sempre).
- Colunas `quadra` e `lote` entram no catálogo da tabela; quem decide o que aparece é
  `colunasForaDaTabelaDePrecos(estrutura)` (utils): LOTE esconde Vagas/Banheiros/Pavimento/Posição,
  o resto esconde Quadra/Nº do lote. Vale também para o dropdown de colunas e a largura da tabela.
- Dormitórios fica (não foi pedido). **Revisto no mesmo dia:** o usuário viu a tabela no ar e
  apontou Dormitórios sobrando — saiu também no LOTE (casa/chácara mantêm).
- Mesmo componente serve Locações: lá vale a mesma regra, pelo vínculo de locação.
- Portal do Corretor (`BrokerDevelopments.tsx`, "espelho" das colunas) fica fora: lê por RPC de
  portal e não traz quadra/lote. Anotado no comentário de lá.

## Verificação

- Vitest do helper de colunas.
- Tela: Venda de Ativos › Lote Vale do Sol (quadra ∅, lote 4B) mostra Quadra/Nº do lote, sem
  Vagas/Banheiros/Pavimento/Posição; um prédio de apartamentos segue igual.

## Estado

- [x] Código + testes (tsc 0 erros; Vitest verde)
- [x] Tela conferida (10/11): Lote Vale do Sol → Quadra "—", Nº do lote "4B", sem
  Vagas/Banheiros/Pavimento/Posição, e o menu de colunas mostra só as 13 do lote;
  007 - Bella Vista segue com as colunas de sempre
- [ ] PR mesclado

## Revisão 2 (10/11) — Espelho de Vendas e de Locações do Empreendimento

> voce diz que corrigiu mas nao corrigiu. veja print

O print era Empreendimento › **Espelho de Vendas** — outra tabela, que o #298/#305 não cobriam.
Agora `EspelhoVendasTab` e `EspelhoLocacoesTab` recebem `estrutura` do `EmpreendimentoDetail` e,
no LOTE, trocam Torre/Pav./Dormitórios/Vagas/Banheiros por Quadra/Nº do lote (Torre também sai:
no lote é a torre implícita "Lote", sem informação). Conferido na tela: Lote Vale do Sol (Vendas e
Locações) com Quadra "—"/Nº do lote "4B"; Bella Vista com as colunas de sempre.
