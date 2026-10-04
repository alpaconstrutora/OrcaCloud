# Medidas do lote e da massa no desenho

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 04/10/2026, com print do lote + bloco na aba Terreno. Pedido, literal:

> veja print. o desenho gerado atraves do menu terreno Lote e massa nao tem medidas

À pergunta "quais medidas mostrar", o usuário marcou as três: **lados do lote, lados do bloco e afastamentos do bloco**.

## Diagnóstico

- Os lados do lote só ganhavam comprimento com "Medidas das paredes" (Vista › Exibir) — desligado por padrão, com nome
  de parede, e forçado a desligado nas vistas Situação/Implantação. O rótulo saía no lado "padrão" do traço.
- Bloco de massa: nenhum código de medida de lado; nem na prévia ao desenhar.
- O "1,63 m" azul do print é a prévia ao vivo da ferramenta Terreno/Divisa, não uma cota.

## O que foi feito

- `afastamentosDoBloco(pontos, anelDoLote)` (`utils/blueprintMassa.ts`): para cada lado do bloco, a perpendicular para
  fora a partir do meio do lado até a primeira divisa do lote; lado com o meio fora do lote ou encostado na divisa fica
  sem afastamento.
- Canvas: prop `mostrarMedidasLoteMassa` (padrão ligado). Lados do lote (com o papel: "frente 12,00 m") por FORA do lote
  (`ladoDeFora`); lados de cada bloco por fora dele; afastamentos como linha fina tracejada com traços nas pontas e o
  valor no meio — numa passada depois do lote e das divisas, para nada cobri-las; lados do bloco em curso na prévia.
- Vista › Exibir (planta e vistas Situação/Implantação): item **"Medidas do lote e da massa"**, guardado em
  `blueprint:mostrarMedidasLoteMassa`, ligado por padrão, desligado com motivo sem lote nem bloco; também nos modelos
  de vista (`medidasLoteMassa`). "Medidas das paredes" continua mostrando os lados do lote, como antes.

## Verificação

- `afastamentosDoBloco`: bloco 10×20 no lote 12×30 (1/1/4/6 m), sentido do desenho indiferente, lote girado 30°, lado
  fora/encostado sem afastamento, sem lote vazio.
- Canvas (contexto 2D falso): lados do lote com papel, lados do bloco e afastamentos por padrão; o lado do lote ancorado
  por fora; desligado não aparece nada; só "Medidas das paredes" mantém os lados do lote.
- Editor: o item em Vista › Exibir, desligado com motivo sem lote, ligado por padrão com lote, alternando a chave.
- Prova no app real com estudo descartável.
