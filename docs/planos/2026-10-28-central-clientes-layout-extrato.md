# Central de Clientes — extrato na ordem de cobrança (`/impeccable layout`)

## Pedido original

> /impeccable critique analise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026. Crítica 2 (23/40), P2 "o extrato não leva à
ação e está na ordem errada para cobrar": o 1º vencido era a linha 11 de 53, sem total vencido nem
caminho para Contas a Receber. Escopo **"Tudo"**, ordem **"um de cada vez"**, depois **"siga em frente"**.
4º comando (1º #218, 2º #220, 3º #223).

## Tese espacial (gaveta do extrato)

- Caminho principal: quanto venceu e há quanto tempo → quais parcelas → onde cobrar.
- Lidera o **resumo** da linha clicada (Vencido em vermelho + "há até N dias", A vencer, Recebido —
  os MESMOS números da tabela) com a ação "Cobrar em Contas a Receber"; apoia a lista.
- A lista agrupa por situação, cada grupo com cabeçalho (`scope="colgroup"`: título · quantos · quanto):
  **Vencidos** do mais antigo · **A vencer** do mais próximo · **Recebidos** do mais recente
  (· Devoluções, se houver saída).
- Página do extrato 200 → 500: a ordem é feita no navegador e só vale para o que foi carregado
  (maior linha medida: 53); acima disso a gaveta diz que a ordem vale para os exibidos.

## Decisão registrada

Contas a Receber não aceita filtro pela rota; a busca dela é persistida em
`contasReceberManagerFilters:search`. Escrever ali acoplaria duas telas por um detalhe interno, e os
filtros de data persistidos de lá poderiam esconder a cobrança — a ação só leva à tela, como o atalho
do KPI. **Pendência**: filtro por cliente pela rota em Contas a Receber.

## Estado

- [x] gaveta — navegador (127.0.0.1:3140): "— Sem obra" → "Vencidos · 39 lançamentos · R$ 456.928,58"
  (300 → 18 dias), "A vencer · 10 · R$ 22.885,72" (01/11 → 10/12), "Recebidos · 4 · R$ 4.000,00"
  (07/05 → 09/02); resumo = linha da tabela (vencido R$ 456.928,58 há até 300 dias; a vencer =
  em aberto − vencido). Achado no print: valores do resumo desnivelados (alinhados pela base) → topo.

## Verificação

`tsc` 0, `check-ui-standard` limpo, `detect --scope layout` sem achados, suíte inteira, navegador.
