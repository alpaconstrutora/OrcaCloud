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
