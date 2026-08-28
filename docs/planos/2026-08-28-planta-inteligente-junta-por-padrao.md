# Planta Inteligente — manter a junção por padrão ao mover parede

## Pedido original

Sessão de 2026-08-28, primeira mensagem, transcrita literalmente:

> incorporacao < planta inteligente: Atualmente ao mover uma parede que está
> conectada, o padrão é desconectar e um aviso para conectar ponta solta.
> Desfazendo uma conexão que já existia. Por padrão é melhor manter conectado e
> usar stretch. qual sua avaliacao a respeito?

### Decisões tomadas na mesma sessão

Perguntado sobre a semântica e o escopo, o usuário escolheu:

1. **Junta rígida** — a vizinha mantém a própria direção; nunca é entortada para
   acompanhar. (Alternativas recusadas: manter a translação crua de hoje;
   apenas inverter o padrão sem mudar a conta.)
2. **Corpo + alça da ponta** — os dois gestos passam a preservar a junção.
   (Alternativa recusada: só o arraste do corpo.)

---

## Contexto — por que mudar

`modoMover` nascia em `'MOVER'`: o bloco andava rígido e o que encostava nele
desencostava. O usuário só descobria pelo aviso âmbar "N ponta(s) solta(s)" no
painel lateral, e tinha de acionar "Conectar automaticamente" para desfazer o
estrago.

A inversão é conceitual: **a conexão é intenção, o comprimento da vizinha é
consequência.** O padrão antigo descartava a intenção para preservar a
consequência. E o custo do erro é assimétrico — quando o anel abre,
`recomputeSpaces` perde o ambiente e junto vão área, perímetro, rótulo e o
de-para do orçamento pendurado nele, sem erro nenhum na tela.

Mas inverter a chave sozinha não resolvia: o `ESTICAR` de então tinha três
buracos que virariam a nova falha padrão.

1. **T continuava desencostando** — a vizinhança era casada por coordenada exata
   (`pointKey`), e ponta que morre no meio do corpo da outra não é vértice de
   ninguém.
2. **Enviesava vizinha ortogonal** — a vizinha era transladada pelo mesmo delta;
   bastava deslizar uma parede ao longo de si mesma para as perpendiculares
   virarem diagonal. Pior que desencostar: o anel continua fechado, nenhum
   diagnóstico dispara, e a área sai calculada num cômodo torto.
3. **Vizinha que colapsa abortava o gesto** — comprimento zero →
   `DEGENERATE_WALL` → nada acontecia.

---

## A regra, como ficou

São **duas** regras, porque são dois gestos com significados diferentes.

### Arrastar o CORPO — a junta é RECONSTRUÍDA

Cada ponta presa de vizinha não selecionada anda pela **componente de `delta`
paralela ao eixo da própria vizinha** (`componenteNoEixo`). Projetada no próprio
eixo, a vizinha só pode mudar de **comprimento**, nunca de direção.

| Gesto | Vizinhas perpendiculares | Junta |
|---|---|---|
| Parede arrastada **perpendicular** a si (o caso comum) | mudam de comprimento, seguem a 90° | preservada |
| Parede arrastada **paralela** a si | não se mexem | canto em L solta (geometricamente forçado) — sinalizado; T sobre corpo longo sobrevive |
| Arraste **diagonal** | seguem só na componente delas | preservada onde alcança, sinalizada onde não |

Exceção: vizinha presa pelas **duas** pontas (ponte entre dois selecionados)
translada pelo `delta` cheio — está sendo carregada entre dois hospedeiros que
andam juntos.

### Arrastar a ALÇA — a junta ANDA JUNTO

O vértice **é** a junta, então ela segue o vértice: toda ponta que estava nele
vai para o lugar novo (a vizinha pode girar, e é o certo — ela tem de alcançar a
junta), e toda ponta que repousava no **corpo** da parede movida desliza pelo
próprio eixo até o corpo novo (`cantoEntreEixos`), sem sair do prumo.

### Detecção e tolerância

"Presa" cobre vértice compartilhado **e** encosto em T, pela mesma conta
(`projecaoNoSegmento`, extraída de `encostosSemJuncao`). A régua é
`DEFAULT_TOLERANCE_MM` (5 mm) — a do **arranjo planar**, que é a autoridade sobre
quem está ligado a quem. Meia espessura é a régua das ferramentas de *reparo*,
generosas de propósito; um gesto de arraste não pediu conserto.

### Nunca abortar

Ponta que colapsaria a vizinha fica onde está e entra em `soltas`. O gesto
inteiro nunca mais é derrubado por causa de uma vizinha.

---

## O que mudou, arquivo a arquivo

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintKernel/geom.ts` | `projecaoNoSegmento` e `componenteNoEixo` novos | ✅ `encostosSemJuncao` passou a usar a primeira; 217/217 sem alterar expectativa |
| `utils/blueprintKernel/arrangement.ts` | `encostosSemJuncao` usa `projecaoNoSegmento` | ✅ conta não duplicada |
| `utils/blueprintKernel/model.ts` | `pontasDeslocadas` com a regra nova e retorno `{destinos, soltas}`; `pontasNoVerticeMovido` nova | ✅ testes abaixo |
| `utils/blueprintKernel/commands.ts` | `TranslateEntities.arrastarVizinhas` → `manterJuncoes`; `MoveVertex.manterJuncoes?` (padrão `false`) | ✅ chamadores crus inalterados, provado por hash |
| `utils/blueprintKernel/index.ts` | exporta o que a UI usa | ✅ nada importa módulo interno |
| `components/blueprint/BlueprintEditor.tsx` | `modoJuncao: 'MANTER'\|'SOLTAR'`, padrão `MANTER`, persistido; botão; `moverSelecao`/`moverPonta`; `esticarParede` passa a usar o kernel | ✅ 80/80 nos componentes |
| `components/blueprint/BlueprintCanvas.tsx` | prop `manterJuncoes`; anel âmbar tracejado nas juntas que vão soltar, durante o arraste | ✅ harness |
| `components/blueprint/PainelSelecaoMultipla.tsx` | vocabulário novo | ✅ 194/194 |

### Fora de escopo, de propósito

- **Selecionados andam sempre rígidos.** Ponta de parede *selecionada* que
  repousava no corpo de uma *não selecionada* solta ao sair de cima dela.
  Adaptar o selecionado quebraria a garantia de que o comprimento é preservado e
  as aberturas não saem de posição.
- `conectarAgora`, `encostosSemJuncao`, `cantosEncostados`, ferramenta Juntar e a
  lista de vãos ficaram como estavam. Continuam cobrindo o que sobra — só que
  agora sobra bem menos.

### ⚠️ Mudança de comportamento que vale conferir em planta real

Uma **divisa colinear** com a parede movida, num deslocamento perpendicular aos
dois, **não acompanha mais** — antes ela acompanhava e virava diagonal. Uma
divisa é linha de escritura: entortá-la em silêncio é pior que soltá-la, porque o
anel continua fechado e nenhum diagnóstico dispara. Agora a ponta fica e o
desencosto é reportado. O teste
`a divisa entra na MESMA conta das paredes — e uma divisa COLINEAR não é entortada`
trava esse comportamento; o irmão dele prova que a divisa **perpendicular**
continua acompanhando.

---

## Verificação

Estado em 2026-08-28, tudo executado:

- ✅ `npx vitest run` — 1686 passaram, 24 puladas, 88 arquivos. Inclui
  `blueprintKernelGoldens`, que prova que nenhuma planta existente mudou de hash
  sem intenção.
- ✅ `npx tsc --noEmit` — limpo.
- ✅ `bash scripts/check-ui-standard.sh` nos três `.tsx` — sem violação (REGRA #1).
- ✅ `docs/spikes/mover-selecao/medir.mjs` — **6 medições em Chrome de verdade**:
  `laço discrimina · soltar é rígido · manter puxa a vizinha · medição anda
  junto · T acompanha sem torcer · anel avisa no arraste · anel discrimina`.
  As duas últimas leem **pixel do canvas com o botão do mouse ainda apertado** —
  prévia que só se pode conferir depois de soltar não serve de aviso. E o anel
  aparece no canto que solta e **não** no que sobrevive.
- ✅ `docs/spikes/arrastar-ponta/medir.mjs` — 5 medições: `arrastou · trava
  funciona · trava discrimina · sem o modo, solta · com o modo, mantém`.
- ✅ `__tests__/components/BlueprintEditor.test.tsx` — o botão da barra nasce em
  "Manter junções" com `aria-pressed=true`, e a chave alterna para "Soltar".

### No app de verdade (Incorporação › Planta Inteligente)

Roteiro Playwright com Chrome do sistema, login real da conta de leitura, numa
planta de rascunho criada para o teste e **apagada no fim** — o editor faz
autosave 1500 ms depois de cada gesto, então arrastar parede numa planta do
usuário GRAVA. Sala 5 paredes com divisória em **T** no meio, dois ambientes:

- ✅ a chave **nasce em "Manter junções"** (`aria-pressed=true`)
- ✅ o T fecha dois ambientes: 40,15 m² e 42,70 m²
- ✅ **arrastar a parede de cima perpendicular a si**: os dois ambientes
      SOBREVIVEM, sem aviso de ponta solta, e as áreas mudam coerentemente
      (40,15 → 46,75 · 42,70 → 49,73)
- ✅ **Ctrl+Z** devolve exatamente o estado anterior, num passo
- ✅ **encurtar pelo painel** (11,65 m → 11,25 m) numa parede que hospeda o T:
      continua com 2 ambientes, sem ponta solta — o caminho `esticarParede`
- ✅ a escolha **SOLTAR sobrevive ao recarregar** (`localStorage` = `"SOLTAR"`;
      reaberto o editor, o botão volta como Soltar). Padrão devolvido a MANTER.
- ✅ nenhum erro de JS, console ou 4xx/5xx do PostgREST fora do ruído conhecido
      da Central de Controle (`57014 statement timeout`)

Ainda não exercitado: planta **importada de PDF**, com dezenas de paredes e
junções já reparadas pelo passe automático. O comportamento é o mesmo por
construção, mas a escala não foi medida.

---

## Adendo — escolher qual ponta anda (28/08/2026, mesma sessão)

### Pedido original

> quando eu seleciono uma parede e altero o seu comprimento no painel direto
> digitando o valor que eu desejo, como eu escolho qual extremidade da parede
> deve ser aplicada a nova medida?

Não dava. A ponta era decidida pela regra automática de `esticamento`
(12/08/2026): anda a LIVRE quando só uma está livre; senão anda a FINAL (`b`).
Numa parede com os dois cantos fechados isso sempre puxava a final — e "final"
é a ordem em que a parede foi desenhada, informação que **não aparece na tela
depois**. O painel anunciava a escolha, mas não deixava mudá-la.

### O que foi feito

- `esticamento` passa a ser **padrão, não sentença**: `ancoraManual` (guardado
  como `{ wallId, end }`, para a escolha morrer sozinha ao trocar de parede, sem
  `useEffect` de limpeza) sobrepõe a regra.
- Painel: dois botões **Início / Fim** ao lado do campo Comprimento, o em vigor
  marcado com `aria-pressed`. `title` de cada um diz a consequência daquela
  ponta — "ponta livre, nada mais se mexe" ou "ponta presa, o canto vai junto".
- **Passar o mouse acende a ponta no desenho** (`destaqueDePonta` no canvas,
  disco na cor de seleção com contorno branco). Sem isso os botões seriam duas
  palavras sem referente — é justamente a informação invisível que motivou o
  pedido. Desenhado a partir do modelo já deslocado, para não apontar o vazio
  durante um arraste.

### Verificação

- ✅ `npx vitest run` — 1691 passaram, 24 puladas; 5 casos novos em
  `PainelParedeSelecionada.test.tsx` (botões, `aria-pressed`, callback, hover,
  `title` por ponta, ausência sem parede selecionada)
- ✅ `tsc --noEmit` limpo; `check-ui-standard.sh` sem violação
- ✅ **No app, medindo pixel do canvas** numa planta de rascunho descartada:
  retângulo com os dois cantos da parede presos, padrão vem "Fim"; encurtar 1 m
  com **Fim** move um lado e deixa o outro parado, com **Início** move o lado
  OPOSTO — a prova de que o controle não é enfeite
- ✅ o disco de destaque cai em pontas DIFERENTES: "Início" em x=1069, "Fim" em
  x=488, numa parede que vai de x=483 a x=1074

⚠️ Nesse retângulo "Início" ficou à DIREITA: as paredes que o Retângulo gera
correm no sentido do anel, então `a` não é o extremo esquerdo. Os rótulos são
fiéis ao modelo; quem resolve a ambiguidade é o destaque no desenho.
