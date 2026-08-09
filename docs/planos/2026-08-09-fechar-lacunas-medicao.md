# Fechar as lacunas do Medição antes de excluí-lo

## Pedido original

Levantadas as funcionalidades do Medição Inteligente sem equivalente na Planta
Inteligente, o usuário declarou a intenção:

> minha intenção é excluir o módulo medição inteligente

e, diante das opções "fechar a lacuna primeiro" ou "aposentar sem excluir",
respondeu:

> A) Fechar a lacuna primeiro

## As quatro lacunas, e por que a primeira manda

**1. Várias pranchas no mesmo levantamento.** Hoje o `blueprint_underlays` tem
`UNIQUE (study_id, level_id)` — um fundo por nível. Um levantamento que percorre
térreo, cobertura, corte e fachada não cabe. **É o caso comum, não a exceção**, e
é por isso que excluir antes de resolver isto entregaria menos do que o Medição
já entrega.

Isto também conserta um defeito latente: hoje recalibrar transforma **todas** as
medições do nível, inclusive as traçadas sobre outra planta. Com a medição
apontando para a prancha, cada recalibração mexe só no que foi traçado ali.

**2. Camadas.** É como se separa "piso" de "revestimento" num levantamento
grande.

**3. Item avulso com preço.** Hoje o código precisa existir no catálogo. Um item
arbitrado — *"Demolição de alvenaria, R$ 45/m²"* — não tem onde morar.

**4. Exportar para o orçamento do ÒPURA Pro.** Fica de fora: é outro destino, de
outro produto, e o usuário não sinalizou usá-lo. Registrado como perda
consciente.

## Decisões

**A medição pertence à PRANCHA, não só ao nível.** `underlay_id` na medição. Sem
isso, mostrar a prancha B exibiria as formas traçadas na A, em coordenadas que só
fazem sentido sob a calibração da A.

**Camada é um CAMPO, não uma tabela.** `camada TEXT` na medição, e a lista sai
dos valores distintos. Visibilidade e bloqueio ficam no estado da tela, não no
banco: são preferência de quem está olhando, não do levantamento. Uma tabela de
camadas traria três colunas de estado por levantamento para resolver o que um
`Set` na memória resolve.

**Item avulso com CÓDIGO DETERMINÍSTICO.** Quando não há código de catálogo, a
forma carrega nome e preço próprios, e o código gerado vem do nome — nunca
aleatório. O Medição gera `MED-{4 dígitos aleatórios}` e por isso duplica linha a
cada exportação; repetir isso seria importar o defeito junto com a função.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | `blueprint_underlays` sem a chave única | várias pranchas por estudo, cada uma com sua aferição |
| 2 | `nome` e `ordem` na prancha | dá para saber qual é qual |
| 3 | `underlay_id` na medição | trocar de prancha troca as formas visíveis |
| 4 | Recalibrar afeta só a prancha | e não as formas das outras |
| 5 | Seletor de prancha na barra | importar acrescenta, não substitui |
| 6 | `camada` na medição + filtro na tela | esconder um conjunto sem apagá-lo |
| 7 | `item_nome` e `item_preco` | item fora do catálogo chega ao orçamento |
| 8 | Código determinístico do item avulso | reexportar não duplica |

## Fica de fora

- **Destino ÒPURA Pro** — perda consciente, ver acima.
- **Bloqueio de camada persistido** — estado de tela.
- **Exclusão do módulo Medição** — só depois disto, e com o acervo conferido
  (hoje: 1 levantamento, chamado "teste").
