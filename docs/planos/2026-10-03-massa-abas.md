# Estudo de massa em abas

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026, logo depois de o Estudo de massa virar tela. Pedido, literal:

> a tela Estudo de massa ficou longa e meio confusa. seria uma boa ideia agrupar assuntos em abas?

Proposta em duas opções; resposta do usuário: **"5 abas, Hipóteses à parte"**.

## O que foi feito

`TelaEstudoDeMassa` ganhou a barra de abas canônica (`TabsBar`, §19.1), logo abaixo do cabeçalho:

| Aba | Seções |
|---|---|
| Lei e massa | Envelope legal · A massa desenhada (indicadores + tabela por bloco) |
| Produto | Produto e eficiência (unidades, privativa, eficiência, vagas, tabela, lançar núcleo) |
| Insolação | Sol nas fachadas, lote livre, vizinhos, tabela por bloco |
| Financeiro | Pré-viabilidade (VGV, obra, margem) · Enviar ao Empreendimento |
| Hipóteses | O que não conta no CA |

- Sem bloco (ou sem produto, no Financeiro), a aba mostra um estado vazio (§12) dizendo o que falta; o Financeiro
  oferece "Editar o produto".
- A aba escolhida fica guardada neste navegador (`usePersistedState`, `blueprint:massa:aba`): clicar num bloco (que
  leva ao desenho) e voltar não devolve à primeira aba.
- Nenhum cálculo mudou; só a disposição.

## Verificação

- Teste novo: as 5 abas na ordem, uma seção por aba, os estados vazios sem bloco, e a aba sobrevivendo a ir ao
  desenho e voltar. Os testes do estudo (M2, M3, M5b, Produto em tela) passaram a clicar na aba certa.
- Prints de cada aba no app real.
