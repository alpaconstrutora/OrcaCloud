# Distribuição automática de tomadas — Fatia 3: Conferência NBR 5410 e ponto de ligação direta

## Pedido original

> Analise estes itens da norma nbr 5410
> [9.5.2.2.1 · 9.5.2.2.2 · 9.5.2.3 · 9.5.3.1 · 9.5.3.2 · 9.5.3.3 — texto da ABNT NBR 5410:2004 colado]

> Aceito o painel, mas também queria a distribuição automática e onde depende
> do projetista, por exemplo em cima da pia do banheiro, eu compreendo que o
> sistema não sabe onde seria, mas o sistema pode inserir uma tomada no
> banheiro e o projetista tem o trabalho apenas de mover para o local adequado.
> Também proponho que além da distribuição automática também tenha um campo
> para que o usuário pode decidir a quantidade de tomadas por ambiente e por
> parede e depois ele move para o local que ele deseja. Avalie

Depois das fatias 1 e 2 publicadas: **"fatia 3"**.

## O que a fatia 3 faz

### O painel "Conferência NBR 5410"

Vive **dentro do Quadro de cargas** (o usuário pediu tudo de elétrica num só
lugar). Sete linhas, uma por regra, cada uma em três estados — **✗ falta ·
⚠ aviso · ✓ atende** — e, ao lado do ✓, o que ficou **fora da avaliação**
("1 ambiente sem tipo", "circuito C1: sem tensão"). Um ✓ que esconde o
não-avaliado é o pior verde que existe.

| Regra | O que confere | Quando não avalia (e diz) |
|---|---|---|
| 9.5.2.2.1 | mínimo por ambiente (motor da fatia 2) | ambiente sem tipo |
| 9.5.2.2.2 | potência mínima: molhados 600 VA nos 3 primeiros (2 se o conjunto > 6), 100 VA nos demais; outros 100 VA — **por viabilidade**, ordenando as declaradas | tomada sem potência (aviso), fora de ambiente, ambiente sem tipo |
| 9.5.2.3 | aquecedor de água em **tomada** (TUG/TUE cujo texto diz chuveiro/aquecedor/boiler/ducha/torneira elétrica) → falta, com a ação **Converter em ligação direta** | só reconhece pelo nome |
| 9.5.3.1 | TUE/ligação direta com I = VA ÷ V **> 10 A** dividindo circuito | sem potência ou sem tensão |
| 9.5.3.2 | circuito que alimenta TUG de cozinha/serviço e mais alguma coisa | ambientes sem tipo |
| 9.5.3.3 | circuito comum (luz + tomada): IB > 16 A; toda a luz num só comum; todas as tomadas (fora 9.5.3.2) num só comum | sem tensão; pontos sem potência fora da soma |
| Sugeridas | tomadas da fatia 1/2 ainda sem posição confirmada | — |

Cada achado tem **ver** (seleciona as peças no desenho). O painel **não
atribui potência, não divide circuito nem escolhe disjuntor** — confere o que
foi declarado. "Somar é registro, decidir é projeto."

### O ponto de ligação direta (9.5.2.3)

Décimo valor de `TIPOS_DE_PONTO_ELETRICO`: **`LIGACAO_DIRETA`** — chuveiro,
aquecedor. Mora no grupo das tomadas (é ponto de força, é ali que se procura),
mas não é tomada:

- símbolo: quadrado com a diagonal (a caixa de ligação), potência embaixo;
- cota usual 2.200 mm; sigla LD;
- IFC: **`IfcJunctionBox.POWER`** — não `IfcOutlet`, que afirmaria uma tomada
  que a norma proíbe ali. Nove atributos; **lido de volta pelo web-ifc** com
  `Name`, `ObjectType` e `PredefinedType` nos campos certos;
- **Converter em ligação direta** = `SetTerminalProps tipoEletrico` —
  posição, potência e circuito ficam.

Kernel **0.24.0 → 0.25.0**: não é campo novo, é valor novo num campo fechado —
mas um kernel anterior **recusa** o payload (`BAD_POINT_KIND`), e é isso que a
versão registra. Goldens provadas neutras antes, recapturadas depois.

## ⚠️ O que o print pegou antes do usuário

A potência do ponto de ligação direta saía em cima, como na tomada — e em
cima já estava "LD · C1": os dois textos um sobre o outro. Foi para baixo,
centrada. A contagem de pixels não teria pegado; olhar pegou.

## Portões medidos no defeito

- `i > 10` → `i > 100` em 9.5.3.1: falha "chuveiro de 5.500 VA dividindo
  circuito".
- Ramo (b) de 9.5.3.3 desligado: falha "toda a iluminação num só circuito".
- 10 A exatos **não** é "superior a 10 A" — teste próprio.

## Verificação

- `npm run typecheck` limpo.
- `blueprintNbr5410Conferencia` 20/20 · `PainelConferenciaNbr` 5/5 ·
  `ifcIdaEVoltaProprio` (IfcJunctionBox lido) · goldens 7/7 ·
  `blueprintPontoEletricoTipos` atualizado para o décimo tipo.
- `check-ui-standard` em `PainelConferenciaNbr`, `BlueprintEditor`,
  `BlueprintCanvas`: sem violação.
- Harness visual `docs/spikes/distribuir-tomadas/` (painel) e
  `docs/spikes/encaixe-osnap/` (símbolo) — olhados em screenshot.
- Suíte inteira e build antes do push.

## Fora de escopo, declarado

- 9.1.4.2 (distância do lavatório) e a nota da varanda (< 2 m²): o sistema
  não sabe onde está o lavatório nem a profundidade útil da varanda.
- Iluminação mínima (9.5.2.1) — não estava nos itens colados; fica para
  quando o usuário mandar o texto.
- Dimensionar disjuntor/seção — projeto, não conferência.
