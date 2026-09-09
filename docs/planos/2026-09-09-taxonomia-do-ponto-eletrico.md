# A taxonomia do ponto elétrico

## Pedido original

> Os pontos elétricos de dividem em 3 grupos:
> 1. Pontos de Iluminação (Luz): Teto; Parede (Arandelas) Piso/Jardim
> 2. Pontos de Tomada: TUG (Tomadas de Uso Geral); TUE (Tomadas de Uso Específico)
> 3. Especiais/Dados: Tomadas específicas para telefone, antena de TV, rede de
>    computadores (internet) ou conectores USB

## O que existia

**Um** item no menu — "Ponto elétrico" — e um campo `tipo` de **texto livre** no
painel. Não havia classificação: não dava para agrupar, contar por família nem
escolher a entidade IFC certa.

## A decisão central: campo FECHADO

`tipo` continua sendo o texto do projetista ("TUG cozinha", "arandela da
varanda") — é como ele chama a peça, e ninguém deve ter de escolher entre
escrever o que quer e ser contado direito.

`tipoEletrico` é a **classificação**, e precisa ser fechada porque dela saem os
grupos, as somas por família e a entidade IFC. ⚠️ Com texto livre, **"TUG", "tug"
e "Tomada de uso geral" seriam três famílias** — e a contagem sairia plausível e
errada, que é o pior jeito de errar.

Os nove tipos e os três grupos vivem em **um lugar só**: `TIPOS_DE_PONTO_ELETRICO`
no kernel e as tabelas de `blueprintRede`. O menu de inserir é **derivado** deles,
não escrito à mão — repetir os nove itens criaria uma segunda lista que envelhece
sozinha no dia em que alguém acrescentar um tipo.

## Onde a classificação vale

| lugar | o que muda |
|---|---|
| **Menu de inserir** | nove itens, em "Elétrica — iluminação", "— tomadas", "— especiais e dados" |
| **Cota inicial** | vem do TIPO: luz de teto em 2.800, TUG em 300, TUE em 1.200 |
| **Inventário** | a chave da linha é a classificação → o ponto cai no grupo dela |
| **Painel da peça** | seletor "Tipo do ponto", antes de circuito e potência |
| **Desenho** | a sigla ao lado do ponto, junto do circuito: `TUG · C1` |

## ⚠️ "A classificar" é estado legítimo, e visível

Todo ponto desenhado antes desta data está sem classificação, e quem desenha
rápido classifica depois. Ele cai no grupo **"Elétrica — a classificar"**, que
existe por dois motivos:

- filá-lo em "tomadas" afirmaria uma decisão que ninguém tomou;
- deixá-lo sem ficha o poria na lista **sem grupo** — que é exatamente o defeito
  relatado horas antes, de volta pela outra ponta.

No desenho ele aparece como `? · ?`, em âmbar: não sei o que é, não sei quem
alimenta.

## Kernel

`0.21.0 → 0.22.0`. Campo omitido no canônico quando ausente, e a neutralidade foi
**provada antes do bump**: com a string ainda em `0.21.0` e a taxonomia inteira no
lugar, as goldens passaram e as contagens de ambientes seguiram idênticas.

A invariante recusa duas coisas: tipo inventado, e tipo elétrico num ponto de
outra disciplina — um ralo com "TUG" seria um dado impossível que ninguém veria.

## O IFC: cada ponto na entidade que lhe cabe

Até aqui **todo** ponto saía como `IfcFlowTerminal` genérico: uma luminária, uma
tomada e um ponto de rede chegavam indistinguíveis no modelo do calculista.

### ⚠️ São DUAS entidades, não três — eu tinha dito errado

Anunciei `IfcCommunicationsAppliance` para telefone/TV/rede. Está errado: ele é o
**aparelho** — o roteador, o modem, a impressora de rede. O ponto na parede é uma
**tomada**, e o `IfcOutlet` tem `.TELEPHONEOUTLET.`, `.DATAOUTLET.` e
`.AUDIOVISUALOUTLET.` exatamente para isso.

| classificação | entidade | PredefinedType |
|---|---|---|
| iluminação (teto, arandela, piso) | `IfcLightFixture` | `.USERDEFINED.` + `ObjectType` |
| TUG, TUE | `IfcOutlet` | `.POWEROUTLET.` |
| telefone | `IfcOutlet` | `.TELEPHONEOUTLET.` |
| antena de TV | `IfcOutlet` | `.AUDIOVISUALOUTLET.` |
| rede | `IfcOutlet` | `.DATAOUTLET.` |
| USB | `IfcOutlet` | `.USERDEFINED.` + `ObjectType` |
| sem classificação, ou outra disciplina | `IfcFlowTerminal` | — |

### ⚠️ O enum só afirma o que a norma sabe dizer

**TUG e TUE são NBR 5410, não IFC.** O `IfcOutletTypeEnum` tem `.POWEROUTLET.`,
que é verdade para os dois; a distinção vive no `ObjectType`, que é o campo que a
norma reserva para o tipo particular. Emitir um enum que não existe seria mentir
com aparência de padrão.

**Teto, arandela e piso, idem**: o enum de luminária fala de fotometria
(`.POINTSOURCE.`, `.DIRECTIONSOURCE.`) e o desenho não sabe a fotometria. Vai
`.USERDEFINED.` com o `ObjectType` — o caminho que a própria norma indica para o
que o enum não alcança.

**USB** não existe no enum: é tomada de energia e de dados ao mesmo tempo, e
escolher um dos dois afirmaria o que ninguém sabe.

### ⚠️ E foi MEDIDO, não suposto

A lição do `IfcDistributionBoard` — legal pela norma, achado pelo parser e
impossível de desserializar, porque só existe a partir do IFC4 ADD2 — foi
aplicada **antes** de publicar: emiti uma de cada e li de volta com o `web-ifc`.
As duas são IFC4 de origem, têm nove atributos, e `Name`, `ObjectType` e
`PredefinedType` chegam nos campos certos.

⚠️ E a casa de prova ganhou um ponto CLASSIFICADO de propósito: sem isso o
portão nunca tocaria nas entidades novas e as aprovaria sem nunca as ter
emitido — já aconteceu duas vezes, com o quadro e com o circuito.

## Verificação

1. `npx vitest run __tests__/blueprintPontoEletricoTipos.test.ts` — 10 casos.
2. Goldens em `0.21.0` antes do bump; depois `0.22.0` e recaptura.
3. `bash scripts/check-ui-standard.sh` nos `.tsx`.
4. Suíte cheia e `npm run build`.
5. ⏳ **Falta o que só quem usa vê**: inserir uma arandela e uma TUG e conferir
   que caem em grupos diferentes na lista.
