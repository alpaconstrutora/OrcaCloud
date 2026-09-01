# Planta Inteligente — por que o snap "só funcionou num canto"

## Pedido original

> existem um estudo aberto. fiz um teste com snap posicionando pilar nas paredes, porem funcionou apenas no canto inferior direito. verifique por que as outras não funcionou

Sessão: `173a7f9b-72cd-49d6-972f-e29192178ac2` · 2026-09-01

Continuação de
[`2026-08-31-conexao-automatica-entre-pecas.md`](2026-08-31-conexao-automatica-entre-pecas.md).

## Diagnóstico — o rascunho do estudo aberto

Lido direto do banco (`blueprint_branches.draft_payload`, branch
`99d7a8be…`, salvo em 2026-09-01 00:36): **33 paredes e 7 estruturas**.

Distância do ponto de conexão mais próximo de cada peça até um ponto de parede:

| peça | mais perto de uma PAREDE |
|---|---|
| pilar #0 | 55,4 mm |
| pilar #1 | 43,1 mm |
| pilar #2 | 46,7 mm |
| laje #3 | 75,0 mm |
| viga #4 | 2,2 mm |
| pilar #5 | 51,0 mm |
| pilar #6 | 47,2 mm |

**Nenhuma encostou.** E entre PEÇAS: `#3 ↔ #6 = 0,0 mm` e `#4 ↔ #5 = 0,0 mm` —
coincidência exata, e nenhuma das duas em múltiplo da grade, então só podiam vir
do encaixe. O par `#4 ↔ #5` (viga↔pilar) fica em x ≈ 26 900, y ≈ −38 000: o
**canto inferior direito** da planta. Era esse o "funcionou".

### Duas causas, não uma

1. **Parede não tinha ponto de conexão.** A primeira versão só olhava concreto
   com concreto — decisão registrada como limitação conhecida no plano anterior.
   Encostar pilar em parede não tinha em que grudar.

2. **Arrastar um pilar pelo meio é pegá-lo pela ALÇA.** O centro de uma peça de
   PONTO *é* o vértice dela, então o gesto entra em `movendoEstrutura` (arraste
   de vértice) e nunca passou pela conexão — que só existia no arraste do
   conjunto. Quem agia era o ímã do CURSOR, e ele encaixa o **centro**: o pilar
   ia parar centrado no canto da parede, meia seção dentro do concreto dela.
   Parecia "o snap não pegou".

   Esta segunda causa contradiz a decisão do plano anterior ("arrastar vértice
   não conecta"). A razão continua valendo para **viga e laje** — ali o vértice
   remodela a peça, a seção gira e os cantos não acompanham por translação. Numa
   peça de PONTO o vértice é a peça inteira: mover é translação rígida, e a
   conexão vale igual.

## O que mudou

### 1. `utils/blueprintConexao.ts` ✅

- `pontosDeConexaoDaParede(paredes, w)` — as duas pontas do eixo e os quatro
  cantos do corpo, com a extensão de mitra (`extensaoDeCanto`), a mesma dupla
  que o traçado e o `capturar` já usam. Canto sem mitra ficaria dentro do
  concreto na junção, e o ímã puxaria para um ponto que não está na tela.
- **O par que já estava junto não conta.** Sem isso, empurrar uma parede de
  contorno fechado por um passo da grade seria desfeito na hora: ela divide as
  pontas e os cantos mitrados com as vizinhas, então metade dos pontos dela
  nasce coincidente e o arraste pareceria travado.
- Pré-filtro por caixa envolvente: com parede na conta a lista deixou de ser uma
  dúzia de pontos, e isto roda a cada movimento do ponteiro.

### 2. `components/blueprint/BlueprintCanvas.tsx` ✅

- `conexoesDasParedes` em memo **próprio**, refeito só quando a geometria muda:
  cada canto consulta `extensaoDeCanto`, que varre o nível — a lista sai em
  O(n²), barata por edição e cara por clique de seleção;
- arraste de vértice de peça de **PONTO** passa pela conexão, e ela **substitui**
  o ímã do cursor ali (somados, o ímã pousaria o centro no primeiro ponto que
  achasse, o par ficaria a distância zero e o canto nunca ganharia);
- a parede selecionada mostra os **círculos** dos cantos, como o concreto já
  mostrava — ela participava da conexão sem dizer por onde;
- **prévia da peça em arraste**: parede e divisa já tinham a sua; estrutura não
  tinha nenhuma. Arrastar um pilar não mostrava nada até soltar, o que é metade
  da confusão do relato.

### 3. Conferência ✅

`docs/spikes/conexao-automatica/` ganhou o caso do usuário: pilar arrastado pela
alça até o canto de uma parede de eixo 7015 e espessura 300 (canto em
**(6865, 8000)**, fora da grade). O pilar parou em (6965, 8200) — canto sobre
canto —, e não em (7000, 8200), que é a resposta da grade.

Os quatro casos anteriores continuam passando, e o passeio de
`docs/spikes/encaixe-estrutural/` também.

> **Nota de método:** o harness reprovou de primeira porque o clique caiu na
> ALÇA do pilar e o harness não tinha `onMoveStructuralVertex` — o arraste era
> engolido em silêncio. Foi essa falha que revelou a causa nº 2. Sem reproduzir
> o gesto exato, o diagnóstico teria parado na causa nº 1.

## Resultado

`npx tsc --noEmit` limpo; suíte 2106 passando (3 testes novos); dois passeios
aprovados com print conferido.

## Pendências conhecidas

- **Divisa** continua fora (limite jurídico, não construção).
- **Vértice de viga e de laje** não conecta — ver a razão acima.
- **Sem tecla para desligar** o encaixe no meio do arraste.
