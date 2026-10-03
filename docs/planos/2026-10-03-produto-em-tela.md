# Produto do Estudo de Massa: de gaveta para tela

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026. Pedido, literal:

> aba Terreno › menu Massa ▾ › Produto: o drawer produto deve ser transformado em tela

(Veio logo depois da explicação dos avisos do Gerar massa — "O estudo não tem produto…" e "Nenhum cenário tem VGV…" —
que mandam preencher o Produto.)

## O que foi feito

- `PainelProduto` → `TelaProduto` (mesmos campos, mesmo `useBlueprintProduto`, mesma gravação). Layout de página:
  card do produto (semente, nome, padrão CUB, meta — 4 por linha no desktop), tipologias na largura toda, e
  "Hipóteses do pavimento" e "Financeiro" em dois cards lado a lado (empilham abaixo de `xl`).
- Editor: `produto` sai das tarefas (gaveta) e entra nas telas (`telaAberta`), com o cabeçalho padrão das telas
  (Voltar ao editor · Planta Inteligente · Terreno). Abrem a tela: Terreno › Massa ▾ › Produto; "Editar o produto" e
  "Editar hipóteses" da gaveta Estudo de massa (que fecha); o atalho do Gerar massa.
- Os textos que diziam "gaveta Produto" passaram a dizer onde a tela fica (Terreno › Massa › Produto).

## Verificação

- Teste de editor novo: a tela abre (sem diálogo, editor escondido), tem os quatro blocos, "Voltar ao editor" devolve
  o editor e a gaveta do Estudo de massa leva à tela. O teste M2 (semente → 80 unidades) passou a usar a tela.
- Prints da tela no app real.
