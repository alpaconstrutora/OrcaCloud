# Estudo de massa: de gaveta para tela

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026, logo depois de o Produto virar tela. Pedido, literal:

> drawer Estudo de massa — envelope legal e indicadores também deve ser transformado em tela

## O que foi feito

- `PainelEstudoDeMassa` → `TelaEstudoDeMassa` (mesmas seções: envelope legal, massa desenhada, produto e eficiência,
  insolação, financeiro, envio ao Empreendimento, hipóteses). Os cartões de indicador ficam 4 por linha no desktop
  (2 no estreito); o parágrafo de abertura virou o subtítulo do cabeçalho da tela.
- Editor: `massa` sai das tarefas e entra nas telas. Abrem a tela: Terreno › Massa ▾ › Estudo de massa e "Ver o
  estudo de massa" do painel do bloco.
- O que mexe no desenho volta ao editor, como a tela Quantitativos: clicar num bloco (seleciona e abre o painel dele),
  "Desenhar bloco" (liga a ferramenta), "Declarar o entorno" (abre a gaveta de insolação). "Editar o produto" leva à
  tela Produto. Lançar núcleo continua na tela.
- A insolação COMPLETA da massa, que só rodava com a gaveta aberta, passou a rodar com a tela aberta (inclusive a
  dependência do `useMemo`, que ainda apontava para a gaveta e deixava a seção vazia).

## Verificação

- Teste novo: tela abre (sem diálogo, editor escondido), Voltar ao editor, "Desenhar bloco" fecha a tela e arma a
  ferramenta. M1 passou a ir ao desenho pela linha e voltar por "Ver o estudo de massa"; os demais testes do estudo
  (M2–M6) passaram a procurar a tela.
- Prova no app real com estudo descartável (lote + bloco + produto): a tela com os indicadores, a insolação e o
  financeiro; clicar no bloco volta ao desenho com o painel dele.
