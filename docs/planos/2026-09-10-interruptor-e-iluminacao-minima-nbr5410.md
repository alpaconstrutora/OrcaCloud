# Interruptor e iluminação mínima (NBR 5410 9.5.2.1)

## Pedido original

> o que falta implementar das fatias e pendencias?
> implemente na ordem sugerida, 1. 2 e 3

Item 2 da ordem que propus: *"interruptor + iluminação mínima 9.5.2.1, que
juntos fecham a prancha elétrica residencial"*. (Itens 1 e 3 — verificação no
app real e o eletroduto em L no 3D — no plano
`2026-09-10-verificacao-no-app-e-area-construida-ponta-solta.md`.)

## A norma aplicada

- **9.5.2.1.1** — em cada cômodo, pelo menos um ponto de luz fixo no **teto**,
  comandado por **interruptor**.
- **9.5.2.1.2** — carga mínima de **100 VA** até 6 m²; acima, **+60 VA a cada
  4 m² inteiros**. 9,9 m² → 100 VA (3,9 m² acima de 6, nenhum bloco inteiro);
  10 m² → 160; 22,52 m² → 340.

Vale para **todo cômodo**, com ou sem tipo — por isso a linha aparece também
no ambiente "a classificar", e é ela que oferece o "Completar" nesse caso.

## O INTERRUPTOR — décimo primeiro tipo de ponto elétrico

Kernel **0.25.0 → 0.26.0** (`INTERRUPTOR` em `TIPOS_DE_PONTO_ELETRICO`; valor
novo num campo fechado, que um kernel anterior recusa — mesma razão do
0.25.0). Goldens provadas neutras antes, recapturadas depois.

- Grupo **próprio**: "Elétrica — interruptores". Os três grupos do pedido eram
  de pontos de *utilização*; o interruptor é o *comando* deles. Teste da
  taxonomia atualizado com essa razão.
- Símbolo NBR 5444: círculo com haste a 45° e o traço da seção. A haste vai
  para **cima e à esquerda** — o print do harness mostrou a haste atravessando
  o rótulo "Int · C1" quando ia para a direita.
- Cota usual 1.100 mm; sigla "Int"; a **letra de comando** (já existente) é o
  que o liga à luminária que ele acende.
- IFC: **`IfcSwitchingDevice.TOGGLESWITCH`**, lido de volta pelo web-ifc com
  `Name`, `ObjectType` e `PredefinedType` nos campos certos.

## A conferência e o "Completar"

- Regra **9.5.2.1** no painel Conferência NBR 5410 (primeira da lista): "sem
  ponto de luz no teto · sem interruptor · 100 VA declarados, mínimo 340 VA".
  Luz sem potência vai para "fora da avaliação" — a soma está incompleta e não
  se afirma déficit.
- Linha **Iluminação** na lista de ambientes: "mín. 340 VA · luz de teto ✓/✗ ·
  interruptor ✓/✗ · N VA declarados — atende/falta".
- **Completar pela norma** agora cobre tomadas **e** iluminação, num lote só:
  - luz de teto sugerida no **meio do cômodo** (`interiorPoint`), na cota do
    pé-direito, com a **carga mínima da norma já declarada** e o rótulo
    "340 VA é o mínimo da norma — confira" (o mínimo é fato da norma, não
    escolha; em branco o ponto nasceria como pendência de "sem potência");
  - interruptor sugerido **junto à porta** (200 mm depois da ombreira, na
    face), ou no meio da parede livre com o rótulo "Posicione junto à porta"
    quando o cômodo não tem porta;
  - os dois com a **mesma letra de comando** — a próxima livre no cômodo.
- `AddTerminal` aceita `potenciaW` (forma do comando, não do canônico).

## Portões medidos no defeito

- `floor` → `ceil` no bloco de 4 m²: falha "100 VA até 6 m²; +60 VA por bloco
  INTEIRO".
- Arandela contada como luz de teto: falham 7 casos.

## Verificação

- `blueprintNbr5410Iluminacao` 15/15 · `DistribuirTomadas` 15/15 ·
  `blueprintNbr5410Conferencia` (oito regras) · `blueprintPontoEletricoTipos`
  (11 tipos, 4 grupos) · `ifcIdaEVoltaProprio` (IfcSwitchingDevice lido) ·
  goldens 7/7.
- `check-ui-standard` em `DistribuirTomadas`, `BlueprintEditor`,
  `BlueprintCanvas`, `MenuComponentes`: sem violação.
- Harness: símbolo do interruptor (`docs/spikes/encaixe-osnap`) e a linha da
  iluminação nos três estados (`docs/spikes/distribuir-tomadas`) — olhados.
- Suíte inteira e build antes do push.

## Fora de escopo, declarado

- Interruptor de duas/três seções, paralelo (three-way) e intermediário: o
  símbolo tem um traço só. Se você mandar o print da NBR 5444 com as
  variantes, entram como `secoes`/`paralelo` no ponto.
- Arandela do banheiro a ≥ 60 cm do box (nota da 9.5.2.1.1): o sistema não
  sabe onde está o box.
