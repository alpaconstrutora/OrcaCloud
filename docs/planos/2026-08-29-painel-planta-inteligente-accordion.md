# Painel lateral da Planta Inteligente → seções accordion

## Pedido original

Sessão de 2026-08-29. O usuário primeiro perguntou o nome do painel lateral direito
de Incorporação › Planta Inteligente (resposta: o `<aside>` de
`components/blueprint/BlueprintEditor.tsx:2811`, `aria-label="Ambientes derivados"`,
307 px). Em seguida, transcrito literalmente:

> agrupe em componentes accordion o conteudo de:
> 1. PainelPavimentos (topo) — gerencia os níveis/pavimentos da planta
> 2. AbasDoPainel — barra de abas para navegação entre diferentes visualizações
> 3. Conteúdo dinâmico baseado na aba ativa (vetor, medições, orçamento, etc.)

## Decisões tomadas com o usuário (AskUserQuestion, mesma sessão)

1. **Accordion envolve os 3 blocos** — a barra de abas **permanece** como está.
   A alternativa recusada era dissolver as abas em 7 seções empilhadas.
2. **Várias seções abertas ao mesmo tempo** — não é accordion exclusivo. Abrir uma
   não fecha as outras.

Consequência das duas: o `<aside>` deixa de ser "cabeçalho fixo + corpo rolante" e
passa a ser **um único container rolante** com três seções colapsáveis, porque com
Pavimentos e conteúdo abertos juntos a altura somada passa da tela.

## Contexto

Antes desta mudança o `<aside>` era:

```
PainelPavimentos   shrink-0  (sempre visível)
AbasDoPainel       shrink-0  (sempre visível — 6 abas, flex-wrap)
conteúdo da aba    ← cada painel traz seu próprio overflow-y-auto
```

As seis abas (`ABAS`, `BlueprintEditor.tsx:210`) são Ambientes, Do PDF, Medições,
Quantitativos, Orçamento e Versões — reduzidas a Quantitativos+Versões quando o
editor está numa vista (elevação/3D).

## Padrão de UI aplicado

Não há componente accordion reutilizável no app (o `.temp_ag_kit/` não é deste
projeto). O vocabulário vem do **§19.2 do `docs/ui_ux_guia_unificado.md`** — nó de
grupo com `ChevronRight` que gira `rotate-90`, `rounded-[6px]`, `text-sm
font-medium` — e do **§16** (escala compacta). O `Layout.tsx`/`ContextSelector.tsx`
usam o mesmo chevron.

## Itens

### 1. `components/blueprint/SecaoAccordion.tsx` (novo) — ✅ concluído

Seção colapsável genérica do painel: cabeçalho `<button>` com chevron, rótulo,
`contagem` opcional e `acoes` opcional (slot à direita, fora do botão — o
"Adicionar" de Pavimentos não pode disparar o colapso).

Aberto/fechado é **controlado pelo pai** (`aberta` + `onAlternar`), para o estado
morar num lugar só e poder ser persistido.

**Pronto quando:** `npx tsc --noEmit` limpo e a seção abre/fecha no navegador.

### 2. `components/blueprint/PainelPavimentos.tsx` — ✅ concluído

Remover o cabeçalho próprio ("Pavimentos" + botão Adicionar), que passa a ser o
cabeçalho da seção accordion. O botão Adicionar sobe para o slot `acoes` via prop
`onAdicionar`/`adicionando` controlados de fora — senão o pai não consegue
renderizá-lo no cabeçalho.

**Pronto quando:** o painel não desenha mais título próprio e o botão Adicionar
aparece na barra da seção, sem colapsá-la ao ser clicado.

### 3. `components/blueprint/BlueprintEditor.tsx` — ✅ concluído

- `<aside>` vira container rolante único (`overflow-y-auto`, sem `overflow-hidden`).
- Três `<SecaoAccordion>`: `Pavimentos`, `Navegação` e a terceira com o **rótulo da
  aba ativa** (Ambientes / Do PDF / …) — título fixo mentiria quando a aba troca.
- Estado das três em `usePersistedState('blueprint:secoes-abertas', …)`, default
  todas abertas.
- Trocar de aba **abre** a terceira seção — clicar numa aba com a seção fechada não
  pode virar clique sem efeito visível.

**Pronto quando:** `bash scripts/check-ui-standard.sh` nos 3 arquivos,
`npx tsc --noEmit` limpo, e verificação visual no navegador (Playwright com
`serviceWorkers: 'block'`).

### 4. `components/blueprint/AbasDoPainel.tsx` — ✅ concluído (não previsto)

Perdeu a `border-b` própria: dentro da `<SecaoAccordion>` ela virava fio duplo com
o separador da seção. Só apareceu no print — o teste mecânico não vê fio duplo.

## Verificação (29/08/2026)

- `npx tsc --noEmit -p .` — limpo.
- `bash scripts/check-ui-standard.sh` nos 4 arquivos — sem violação.
- `npx vitest run __tests__/components/BlueprintEditor.test.tsx
  __tests__/components/PainelParedeSelecionada.test.tsx` — 93/93.
- **Chrome de verdade**, harness temporário do `<aside>` a 307 px (apagado depois),
  Playwright com `serviceWorkers: 'block'`, 6 medições, todas verdes:
  1. nada ultrapassa a borda de 307 px com as três seções abertas;
  2. as 6 abas continuam visíveis, nenhuma cortada — é o defeito histórico deste painel;
  3. colapsar Pavimentos esconde o corpo e mantém o cabeçalho;
  4. multi-aberto de fato: fechar Pavimentos não fecha Navegação nem conteúdo;
  5. trocar de aba com a seção de conteúdo fechada reabre a seção, e o rótulo do
     cabeçalho vira "Medições";
  6. "Adicionar" no cabeçalho abre o formulário **sem** colapsar a seção.
- Sem erro de console.

**Não verificado:** o editor real com um estudo do banco. O harness monta a moldura
(as três seções, o painel de pavimentos e a barra de abas reais) com modelo de
mentira; os seis painéis de conteúdo entram na seção 3 sem alteração, então o que
mudou para eles foi só o container.

---

## Segundo pedido (mesma sessão, 2026-08-29)

Transcrito literalmente:

> desagrupar o grupo navegação e cada itens que estava no grupo gerar accordion
> (ambientes; versoes; orçamento; quantitativo; do pdf; medicoes)

Ou seja: a estrutura que a primeira rodada **recusou** (dissolver as abas em seções
irmãs) passou a ser o pedido. O multi-aberto continua valendo.

### O que mudou

O painel deixou de ter 3 seções e passou a ter **7 irmãs**: Pavimentos, Ambientes,
Do PDF, Medições, Quantitativos, Orçamento, Versões. A barra de abas some do editor
(`AbasDoPainel` **continua existindo** — `docs/spikes/medicoes/main.tsx` ainda a usa).

**Ordem:** mantida a das antigas abas (`ABAS`), não a da lista do pedido — a lista
parecia enumeração, não ordenação. Se a ordem pretendida era a do pedido, é uma
linha em `SECOES_DO_PAINEL`.

### Decisões que o pedido não fixava

1. **Nem todas nascem abertas.** Sete seções abertas dariam uma coluna interminável
   na primeira visita. O padrão (`SECOES_ABERTAS_PADRAO`) abre Pavimentos e
   Ambientes — que é exatamente o que o painel mostrava antes (Pavimentos + a aba
   inicial "Ambientes").
2. **Chave persistida bumpada para `blueprint:secoesDoPainel:v2`.** A forma do
   objeto mudou; reaproveitar a chave faria quem já usou o editor abrir o painel com
   as seis seções novas em `undefined` — todas fechadas, painel aparentemente vazio.
   A leitura ainda mescla com o padrão, então acrescentar seção no futuro não pede
   `:v3`.
3. **A região do "Do PDF" agora morre com a SEÇÃO, não com a aba.** Era
   `aba === 'vetor' && regiaoArmada`; virou `secoes.vetor && …`. Mesma intenção
   (não deixar arraste virar marcação invisível), traduzida para o vocabulário novo.
4. **`secaoVisivel()`** substitui o recorte que a barra de abas fazia em elevação/3D:
   sobrevivem Pavimentos, Quantitativos e Versões; as que editam o modelo somem.
5. **O `<h2>` "Ambientes" interno foi removido** — o cabeçalho da seção já o diz. O
   subtítulo ("Derivados da topologia…") ficou, porque carrega o que o título não diz.

### Itens

- `components/blueprint/BlueprintEditor.tsx` — ✅ `ABAS`/`AbaDoPainel`/`aba`/
  `escolherAba`/`rotuloDaAba` saem; entram `SECOES_DO_PAINEL`, `SecaoDoPainel`,
  `SECOES_ABERTAS_PADRAO`, `secaoVisivel`. As 7 seções no `<aside>`.
- `__tests__/components/BlueprintEditor.test.tsx` — ✅ 6 testes migrados de
  `getByRole('tab')` para o cabeçalho da seção (helper `cabecalhoDaSecao`).
  ⚠️ `role="tab"` **ainda existe na tela** — é o seletor de vista
  (Planta/elevações/3D) — então a busca tem de ser por `button`.

### Uma armadilha que este trabalho descobriu

Três testes quebraram com sintoma enganoso ("texto não encontrado",
"aria-expanded errado") e a causa era **estado herdado**: o `localStorage` do jsdom
é o mesmo entre os testes do arquivo, então a seção que um teste abria chegava
aberta no seguinte, e o clique que deveria abrir FECHAVA. Corrigido com
`localStorage.clear()` no `beforeEach` global do arquivo.

### Verificação (29/08/2026)

- `npx tsc --noEmit -p .` — limpo.
- `bash scripts/check-ui-standard.sh` nos 3 arquivos — sem violação.
- `npx vitest run` nos 2 arquivos de teste do editor — **93/93**.
- **Chrome de verdade**, harness temporário do `<aside>` a 307 px (apagado depois),
  Playwright com `serviceWorkers: 'block'`:
  1. as 7 seções existem, **na ordem esperada**;
  2. sem transbordo dos 307 px no padrão E com as 7 abertas ao mesmo tempo;
  3. estado inicial confere: só Pavimentos e Ambientes abertas;
  4. multi-aberto de fato — abrir as 5 restantes mantém as 7 abertas, e fechar
     Medições deixa as outras 6 de pé.
- Sem erro de console.

**Não verificado:** o editor real com um estudo do banco — o harness monta a moldura
com conteúdo de mentira. Os seis painéis reais entraram nas seções sem alteração de
props, então para eles mudou só o container.

---

## Terceiro pedido (mesma sessão, 2026-08-29)

Transcrito literalmente:

> Aplicar Resizable na largura do painel lateral "Ambientes derivados"

### Por que um componente novo, e não `useResizableColumns`

O app já tem régua de redimensionamento em `components/ui/TableUtils.tsx`, mas ela
é de **coluna de tabela**: escreve em `<col data-col-key>` dentro de um `<table>` e
indexa por chave de coluna. Aqui há um alvo só, e ele não é tabela. O que foi
reusado é o **vocabulário** — alça de 7 px, `cursor-col-resize`, azul no hover/ativo,
duplo clique restaura o padrão, largura em `localStorage` — para o gesto ser o mesmo
que o usuário já conhece das tabelas, e não um segundo jeito de redimensionar coisas
neste produto.

### Decisões que o pedido não fixava

1. **Limites 240–560 px** (padrão segue 307). 240 é onde a linha de pavimento
   (rádio + nome + cota + menu) ainda cabe — abaixo disso o painel volta a esconder
   controle, defeito histórico desta coluna. 560 é teto porque a área de desenho é o
   produto da tela; o painel já foi encolhido de 384 para 307 por esse motivo.
   Verificado no navegador que a 240 px nada transborda.
2. **A largura é escrita no DOM durante o arraste**, e só commitada no `mouseup`. Um
   `setState` por `mousemove` re-renderizaria `BlueprintCanvas` a cada pixel. O canvas
   continua acompanhando porque observa o container por `ResizeObserver` — confirmado
   no navegador: alargar o painel em 120 px encolheu o canvas em exatamente 120 px.
3. **Teclado**: a alça é focável (`role="separator"`, `aria-valuenow/min/max`), setas
   ajustam de 16 px e `Home` restaura. O `<aside>` afirma no comentário que o editor é
   navegável por teclado; uma alça só de mouse contradiz isso.
4. **A caixa com a largura envolve o `<aside>`**, e o puxador se ancora nela por
   `absolute`. Dentro do `<aside>` — que rola — o puxador rolaria junto e sumiria.
5. **A largura guardada é limitada na LEITURA também**: se os limites mudarem, um
   valor fora da faixa nova não pode ressuscitar vindo do storage.

### Itens

- `components/blueprint/LarguraDoPainel.tsx` (novo) — ✅ `usePainelRedimensionavel()`
  devolve `{ largura, caixaRef, Puxador }`.
- `components/blueprint/BlueprintEditor.tsx` — ✅ o `<aside>` perde `w-[307px]` e
  ganha a caixa com `style={{ width }}` + `<PuxadorDeLargura />`.

### Verificação (29/08/2026)

- `npx tsc --noEmit -p .` limpo · `check-ui-standard.sh` limpo · 51/51 testes.
- **No app real** (login, estudo do banco), 8 medições, todas verdes:
  padrão 307 · arrastar 120 px alarga para 427 e o canvas encolhe 120 · teto trava em
  560 · piso trava em 240 · **nada transborda a 240 px** · `ArrowLeft` leva a 256 ·
  duplo clique volta a 307 · 397 px sobrevive à recarga (`localStorage=397`).
- Sem erro de console além do ruído conhecido da Central de Controle.
