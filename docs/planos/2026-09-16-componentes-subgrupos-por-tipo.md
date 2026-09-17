# Planta Inteligente — Painel Componentes: subgrupos por tipo

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> 47. Painel lateral < componentes < Estrutura: implementar subgrupos (laje; viga; pilar), faça o mesmo para os demais componentes

## O que mudou

O gerenciador "Componentes" (`components/blueprint/PainelComponentes.tsx`) listava cada família
corrida — Estrutura com 16 pilares, 7 vigas e 4 lajes numa lista só de 27 linhas. Agora cada
família se divide em **subgrupos por TIPO do catálogo**, recolhíveis, com contagem e ícone:
Estrutura › Pilar · Viga · Laje; Esquadrias › Porta · Janela · Vão livre; Fundação › Estaca ·
Bloco · Viga de fundação; Instalações › Eletroduto · Água fria …; e também Alvenaria › Parede
(a árvore é a mesma em toda família — previsível). No 3D empilhado (vários pavimentos) o
subgrupo fica dentro do bloco do pavimento.

- Subgrupo = `fichaDoComponente(chave)` (nome + ícone) — sem segunda tabela. A ficha ganhou
  `ordem` (posição no catálogo): é a ordem dos subgrupos (Pilar antes de Viga antes de Laje,
  como o menu oferece).
- Nome acessível explícito `"Pilar: 16 peças"` — "Parede" + "2" leria "Parede 2", o mesmo nome
  da segunda parede.
- No 3D, o **olho do subgrupo** alterna todas as peças do tipo (`onAlternarOculto(ids, …)`).
- Recolhido/aberto no mesmo `Set` das famílias, chave `família/pavimento/tipo`; nascem abertos.
- De quebra: a contagem do cabeçalho do acordeão "Componentes" agora inclui água de telhado,
  escadas e instalações — mostrava 79 ao lado de um corpo que dizia 161 peças.

## Verificação

- `__tests__/components/PainelComponentes.test.tsx` (+3, 10): ordem e contagem dos subgrupos em
  todas as famílias; recolher um subgrupo esconde só as peças dele; olho do subgrupo no 3D.
- `tsc` ✅ · `check-ui-standard.sh` ✅ · suíte 328 arquivos / 4324 testes ✅ · build ✅.
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 14, 0 erros JS) na
  planta do usuário: subgrupos "Parede: 7 peças", "Porta: 4", "Janela: 2", "Pilar: 16",
  "Viga: 7", "Laje: 4", "Estaca: 16"…; Pilar recolhido; no 3D o olho de "Laje" oculta as 4
  lajes de uma vez. Capturas `out-sub/sub-0{1,2,3}-*.png`.

## O olho também na planta baixa (16/09/2026)

> os botoes de exibir e ocultar presente nos componentes na visualizacao 3d devem estar disponivei na visualiuzacao em planta

O conjunto de ocultos (`ocultosNoDesenho`, antes `ocultosNo3d`) passou a valer nas DUAS vistas —
é a mesma peça. `BlueprintCanvas` ganhou a prop `ocultos`: filtra `paredesReais`, aberturas
(`aberturasVisiveis`, inclusive no acerto do clique), estruturas, águas, escadas, trechos,
terminais e quadros — só desenho e acerto de clique; modelo, quantitativo e ambientes não mudam.
⚠️ A prévia do arraste continua usando TODAS as paredes do nível (`paredesTodasDoNivel`): a junção
com uma parede escondida existe, e calcular sem ela faria a prévia divergir do commit. Peça
escondida sai da seleção. "Mostrar tudo" no cabeçalho do acordeão aparece nas duas vistas.
Rótulos dos olhos: "Ocultar X no desenho".

Prova: editor (+1, 92: olho na planta, ocultar deseleciona, olho do tipo, Mostrar tudo) ·
painel (10) · suíte 328/4325 · tsc · build. App real na planta do usuário (escritas bloqueadas,
0 erros JS): 184 olhos na planta; "Ocultar Pilar" + "Ocultar Viga" somem do desenho 2D (ficam
blocos e baldrames tracejados) e o 3D abre sem pilares e vigas — mesmo conjunto. Capturas
`out-oc/oc-0{1,2,3}-*.png`.

## Propriedades também no 3D (16/09/2026)

> No modo de visualização em planta ao clicar em um componente estrutural é possível editá-lo no painel lateral, porém não consigo fazer o mesmo no modo de visualização em 3d. Implemente

A cena 3D já selecionava (clique na peça → `selecionar`, a mesma seleção da planta) e destacava
em azul, mas a metade de baixo do painel (Propriedades) era gateada por `!emVista` e não abria.
Agora abre na planta E no 3D (`(!emVista || em3d)`): os painéis de peça (estrutura, parede,
escada, água, trecho, quadro…) só dependem do modelo, então editar largura, cota, rótulo ou
"cede o volume" muda a cena na hora. A lista de Componentes no 3D deixou de ser só leitura: a
linha seleciona (e a lixeira exclui), como na planta. Elevação e corte seguem sem propriedades —
não há clique em peça ali.

Prova: editor (+1, 93: no 3D, clicar "P1 · Pilar" na lista abre Propriedades; trocar o rótulo
para P7 renomeia a linha) · suíte 328/4326 · tsc · build. App real na planta do usuário
(escritas bloqueadas, 0 erros JS): pela lista, P3 acende na cena e "Propriedades C-340C · P3 ·
Pilar · 0,185 m³" abre com Tipo/Seção/Largura/Profundidade/Altura/Cota/Rótulo; clique na cena
numa parede abre "PAREDE SELECIONADA". Capturas `out-p3d/p3d-0{1,2}-*.png`.

## Escape limpa a seleção no 3D (16/09/2026)

> ao clicar em um componente, este fica selecionado e quando clico na tecla ESC a seleção se desfaz. O mesmo comportamento não acontece na visualização 3D.

`Blueprint3DTab` (fora do `lazy`, para valer desde o primeiro quadro) ganhou um invólucro focável
(`tabIndex=0`, `data-testid="cena-3d"`): clicar na cena dá o foco a ele (o canvas WebGL não é
focável; o foco sobe) e `Escape`, com algo selecionado, chama `onSelecionar([])` — o mesmo gesto
do canvas 2D. Só age com seleção, para não engolir o Escape de um diálogo por cima.

Prova: editor (+1: selecionar no 3D pela lista → Escape na cena → sem Propriedades, linha
despressionada) · app real na planta do usuário (clique na cena abre Propriedades; Escape fecha;
foco em `cena-3d`; 0 erros JS, escritas bloqueadas) · suíte 330/4361 · tsc · build.

## Propriedades em Sheet ao selecionar pela lista (17/09/2026)

> painel lateral < componentes < ao clicar em um componente o Propriedades deve abrir em Modal para melhorar visualização

Selecionar pela LISTA de Componentes (clique ou duplo clique) abre as propriedades num `Sheet` modal
(size="lg", título "Propriedades", subtítulo com o rótulo da peça); selecionar pelo desenho segue na metade de
baixo do painel lateral, olhando o desenho ao lado. Um JSX só (`paineisDaSelecao`) alimenta os dois lugares —
duas cópias divergiriam no primeiro campo novo. O Sheet fecha pelo X/Esc (a peça continua selecionada, e as
propriedades voltam para o painel), quando a seleção esvazia ou quando uma tarefa abre.

Prova: 5 testes do editor passaram a achar `propriedades-sheet` quando selecionam pela lista · suíte 332/4393 ·
tsc · `check-ui-standard.sh` · build · app real (duplo clique em P3 → Sheet com o painel completo; Esc fecha e P3
segue selecionado). Captura `out-ps/ps-01-sheet.png`.

### Fechar o Sheet desmarca a peça (17/09/2026)

> esta abrindo drawer porem continua abrindo no proprio painel lateral e nao fecha mais

Ao fechar o Sheet (X/Esc) a peça continuava selecionada e as propriedades reapareciam na metade de baixo do painel
lateral, sem jeito de sumir a não ser clicando no vazio do desenho. Agora fechar DESMARCA (`fecharPropriedades`):
quem veio pela lista volta para a lista, sem propriedades em lugar nenhum. Enquanto o Sheet está aberto, o painel
lateral não mostra Propriedades (medido no app real: 0 regiões; após Esc: sheet 0, P3 desmarcado, painel 0).

### Também pelo clique no desenho — Sheet SEM véu (17/09/2026)

> o mesmo comportamento deve ocorrer quando eu clico em um componente na planta

Selecionar pela mão (clique no desenho 2D, na cena 3D ou na lista) abre as propriedades no Sheet
(`selecionarEAbrir`); seleções programáticas (o lote recém-lançado) seguem no painel lateral. Para o desenho
continuar vivo, o `Sheet` ganhou `modal={false}`: sem véu, sem `aria-modal`, painel flutuante com
`pointer-events-auto` — clicar noutra peça troca o conteúdo, clicar no vazio desmarca e fecha, arrastar continua
funcionando, Esc fecha e desmarca. Provado no app real: com o Sheet aberto, um clique no vazio do desenho (ferramenta
Selecionar) fecha o Sheet e desmarca P3; painel lateral sem Propriedades em nenhum momento.

## Seções do painel lateral ordenáveis (17/09/2026)

> implemente sortable no painel lateral (código de referência: lista com alça `GripVertical`, `Sortable` vertical)

Decisão com o usuário: ordenar as SEÇÕES do painel (Pavimentos · Componentes · Ambientes). Com o dnd-kit já do
projeto (o mesmo de `PainelCamadasParede`): `SecaoOrdenavel.tsx` (useSortable, render-prop que entrega a ALÇA já
ligada), `SecaoAccordion` ganha a prop `alca` (à esquerda do chevron, irmã do botão), e o editor renderiza as
seções por `ordemDasSecoes` — persistida em `blueprint:ordemDasSecoes` (preferência de leitura, como o
aberto/fechado), saneada (id desconhecido cai, seção nova entra no fim), filtrada pela vista (`ordemVisivel`).
Sensores: ponteiro (4 px) e teclado (Espaço, setas, Espaço). A régua 4D segue fora das seções.

Prova: editor (+1: ordem salva `[ambientes, nada, pavimentos]` → Ambientes · Pavimentos · Componentes; 3 alças)
· suíte 332/4395 · tsc · `check-ui-standard.sh` · build · app real (arrasto com o mouse: Pavimentos foi para o fim
— `["componentes","ambientes","pavimentos"]` salvo no navegador; 0 erros JS). Captura `out-so2/so-01-antes.png`.

---

## 17/09/2026 — grupos recolhidos por padrão e cabeçalho em uma linha

### Pedido original

> Painel Lateral: 1. desempilhar texto na seção componentes 2. os popover estão por padrão todos expandidos. Por padrão deve ser recolhidos.

### O que mudou

- **Grupos e subgrupos nascem RECOLHIDOS.** O estado passou a ser `abertos` (conjunto
  vazio na montagem) em vez de "recolhidos". Um grupo aparece aberto quando o usuário o
  abriu **ou** quando contém uma peça selecionada (`aberto(chave, ids)`), para a seleção
  feita no desenho/3D continuar visível na lista.
- **Cabeçalho em UMA linha**: "163 peças neste pavimento · 9 famílias", com `truncate`;
  as dicas de uso (clique, Ctrl+clique, olho) saíram do corpo e foram para o `title`.
- Sem persistência: é preferência de leitura da sessão, não do estudo.

### Testes

- `PainelComponentes.test.tsx`: novo teste "nasce RECOLHIDO"; `montar()` expande os grupos.
- `PainelComponentesRede.test.tsx`, `BlueprintEditor.test.tsx` (`abrirComponentes`) e
  `blueprintSobreposicaoUI.test.tsx` (`expandirGrupos`) abrem os grupos antes de clicar em
  linhas — o comportamento testado não mudou, só o ponto de partida.

### Verificação

- `tsc`, `check-ui-standard` (PainelComponentes.tsx), suíte cheia (4396 passando), build.
- App real (vite da frente, escritas bloqueadas: 14): 9 grupos com `aria-expanded=false` ao
  abrir a Planta 14/09/2026; cabeçalho com 16 px de altura e `title` com as dicas.
