# Unidades no pavimento pela Posição e Orientação do Empreendimento (28/10/2026)

## Pedido original

> "para posicionamento das unidades na planta inteligente, deve-se usar as informações em incoporacap > empreendimento
> > torres e unidades > secão unidades : Colunas (posição e orientação)"

## Antes

A arrumação Automática do 3D (PR #208) punha as unidades:

- pelo número: 101 sobre 201;
- em duas fileiras equilibradas pela área.

As colunas Posição (Frente/Lateral/Fundos) e Orientação (sol: Norte/Sul/Leste/Oeste) do cadastro só apareciam no
painel. O Garden tem as duas preenchidas em quase todas as unidades.

## Regra

- **Referências da planta**, uma por bloco:
  - **Frente do lote:** `frenteDoLote`, na ordem divisa marcada Frente → testada do loteamento → lado da via. Vale o
    segmento mais perto do bloco, apontando **para fora** (para a rua).
  - **Norte:** `georreferencia.rotacaoNorteDeg`; sem ela, +Y.
- **Direção de cada unidade:**
  - Frente = para a rua;
  - Fundos = o oposto;
  - Lateral = perpendicular. O lado é o que o sol diz; sem sol que decida, alterna um de cada lado;
  - Orientação = o ponto cardeal.
  - Com as duas preenchidas, vale a soma. Opostas se anulam e geram aviso: "Unidade 101: posição Frente e sol Norte
    apontam para lados opostos nesta planta — confira o cadastro".
  - Sem frente no lote: a Posição é ignorada, com aviso para marcar a divisa de Frente. O sol continua valendo.
- **Vagas do andar:** as mesmas de antes, uma ou duas fileiras ao longo do lado maior. Cada vaga dá para o lado da
  sua fileira mais a sua ponta.
  - As unidades com direção, na ordem do número, ficam cada uma com a vaga livre que mais combina.
  - As sem direção ocupam as vagas que sobram.
  - A área de cada fatia continua proporcional à área privativa.
- **Quando vale:**
  - só na arrumação **Automática**;
  - "Ordem do Empreendimento" (a manual) não muda;
  - sem Posição e Orientação em nenhuma unidade do andar, vale a regra de antes.

## Mudança

- `utils/blueprintUnidadesNoPavimento.ts`:
  - `direcoesDasUnidades` e `fatiasPorDirecao`, novas;
  - `arrumarUnidades(unidades, modo, ref?)` devolve `direcoes` e `avisos` na Automática;
  - o fatiamento por fileiras foi extraído e é o mesmo de `fatiasPorArea`.
- **Editor:** `referenciasDosBlocos` (frente e norte por bloco). O 3D usa `fatiasPorDirecao` quando há direções.
- **Painel:**
  - a dica da Automática diz a regra nova;
  - os avisos do pavimento aparecem em âmbar (`avisos-das-unidades`).

## Verificação

- **Testes:**
  - `blueprintUnidadesNoPavimento` (+8): direções, aviso de opostos, sem frente, Frente e Fundos nas duas fileiras,
    frente no lado comprido, Lateral nas pontas, Lateral com sol, `arrumarUnidades`;
  - painel (+1).
- **Mecânicas:** tsc; check-ui-standard; suítes da massa e do painel (812); `BlueprintEditor.test.tsx` sozinho
  (284/284).
- **Dados do Garden** (28/10/2026):
  - Torre A, 1º andar: 101 Frente/Leste, 102 Frente/Oeste, 103 Lateral/Sul, 104 Lateral/Norte;
  - Torre B, 1º andar: 105/106 Lateral, 107/108 Fundos.
