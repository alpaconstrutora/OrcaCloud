# Planta Inteligente · 3D — accordion "Componentes" com exibir/ocultar por peça

## Pedido original

Sessão de 01/09/2026, primeira mensagem, transcrita literalmente:

> incorporacao < planta inteligente: Na visualização 3d, incluir accordion componentes e com botão exibir / ocultar em cada um dos componentes

Duas perguntas de escopo foram feitas antes de planejar, e o usuário escolheu:

1. **Granularidade** — olho em cada peça **E** no cabeçalho de cada família
   (Alvenaria / Esquadrias / Estrutura / Fundação).
2. **Escopo no 3D** — a lista cobre **todos os pavimentos visíveis**, agrupada
   família → pavimento → peça (e não só o pavimento ativo).

Decisão derivada, tomada no plano: **só o 3D** ganha a seção. A elevação
continua sem ela — o pedido é explícito quanto à vista, `ElevationCanvas` já tem
toggles próprios (paredes internas, estrutura), e uma terceira régua de
visibilidade ali seria duas fontes para a mesma pergunta.

---

## O problema

Ao entrar na vista 3D o painel lateral **perdia a seção "Componentes"**:
`SECOES_DO_PAINEL` a marcava `naVista: false`, e `secaoVisivel()` só deixava
passar Pavimentos, Quantitativos e Versões. O 3D ficava sem nenhum inventário do
que estava na cena.

E o único controle de visibilidade do 3D eram três chaves globais no `MenuExibir`
(`laje-3d`, `arestas-3d`, `terreno-3d`) mais o checkbox de pavimento inteiro em
`PainelPavimentos`. Não havia como esconder **uma** parede para ver o pilar atrás
dela — que é o gesto para o qual a vista 3D existe.

---

## Itens

### 1. `utils/blueprintComponentes.ts` — inventário por pavimento ✅

Novo `linhasDeComponentesPorNivel(model, levelIds?)` → `BlocoDeNivel[]`
(`{ levelId, nome, linhas }`), ordenado do pavimento mais alto para o mais baixo
(a ordem de `PainelPavimentos`). Pavimento sem peça não vira bloco.

**Chama `linhasDeComponentes` uma vez por bloco** — reuso, não segunda cópia. É
isso que faz a numeração REINICIAR por pavimento: a "Parede 1" da lista é a mesma
"Parede 1" que a planta baixa daquele piso mostra. Numa lista corrida ela viraria
"Parede 12", um nome que nenhuma outra tela usa. Efeito colateral desejado: a
esquadria nunca cai no rótulo `'parede de outro pavimento'`.

**Pronto quando:** testes do item 6 passam. ✅

### 2. `components/blueprint/PainelComponentes.tsx` — o olho ✅

Quatro props novas, **todas opcionais**, para que a planta baixa não mude:
`blocos`, `ocultos`, `onAlternarOculto(ids, ocultar)`, `somenteLeitura`.

- Renderização unificada em família → pavimento → peça. O subcabeçalho de
  pavimento só aparece com **mais de um** bloco (com um piso só, repetir "Térreo"
  dentro de cada família é ruído). Indentação com filete à esquerda
  (`ml-4 border-l`), o vocabulário de nível 2 do §19.2 do guia, na paleta slate
  do módulo.
- Olho `Eye`/`EyeOff` copiado das camadas de `PainelMedicoes` — não se inventou
  um segundo dialeto de visibilidade.
- **Família:** esconde tudo enquanto sobrar uma peça visível; só devolve quando
  todas estão ocultas.
- ⚠️ O olho da família é **irmão** do botão do chevron, nunca filho — botão
  dentro de botão é HTML inválido (o motivo do slot `acoes` em `SecaoAccordion`).
- `somenteLeitura`: some a lixeira e o rótulo deixa de ser `<button>`. No 3D não
  há seleção no canvas nem destaque na cena; um clique sem resposta é o mesmo
  defeito que a seleção tinha quando morava atrás da aba "Ambientes".

**Pronto quando:** `check-ui-standard.sh` sai 0. ✅

### 3. `components/blueprint/BlueprintEditor.tsx` — seção no 3D + estado ✅

- `SECOES_DO_PAINEL` ganhou o eixo `no3d` (só `componentes: true`). `secaoVisivel`
  passou a consultar dois conjuntos derivados (`SECOES_NA_VISTA`, `SECOES_NO_3D`)
  em vez de `.find()` — com a tabela `as const`, encadear `secao?.naVista || …`
  estreita a união a cada operando até o compilador perder a propriedade
  seguinte (`TS2339: 'no3d' does not exist on type 'never'`).
- `ocultosNo3d`: **`useState`, não `usePersistedState`**, pela mesma razão já
  documentada em `camadasOcultas` — são ids de peça, e id não sobrevive a troca
  de branch nem a publicação de versão. Persistido, apontaria para peças que não
  existem mais e faria o usuário abrir outro estudo com metade do desenho
  escondido sem lembrar de tê-lo escondido.
- `alternarOcultoNo3d(ids, ocultar)` em **lote**: o clique em "Alvenaria" numa
  planta de quarenta paredes seria quarenta `setState` em sequência.
- `componentesDo3d` só calcula quando `vista === '3d'`.
- Call site bifurca por `em3d`; no cabeçalho da seção entra **"Mostrar tudo"**
  (slot `acoes`), só quando há algo escondido.

**Pronto quando:** em 3D o accordion aparece; em Frente/Fundos/Lateral não. ✅

### 4. `Blueprint3DTab.tsx` + `Blueprint3DViewer.tsx` — filtrar a cena ✅

`ocultos?: Set<string>` atravessa a aba e chega ao viewer. Três filtros:

1. paredes — `!escondida(w.id)`;
2. estruturas — `!escondida(s.id)`;
3. aberturas — `perfil.furos` filtrado dentro de `geometriaDaParede`.

Dep dos memos é `chaveOcultos` (o conteúdo do Set ordenado e concatenado), o
mesmo idioma do `levelIds?.join(',')` que o arquivo já usava — `Set` tem
identidade nova a cada alternância.

⚠️ **Decisão de projeto:** esconder uma esquadria **fecha o vão** (a esquadria É
o vazio), mas esconder uma peça **estrutural some só com a malha dela — o rasgo
que ela abriu na parede FICA**. O rasgo não é consequência de o pilar estar
desenhado; é consequência de `cedeSobreposicao`, que é decisão de QUANTITATIVO.
Refechar a parede junto faria o 3D mostrar alvenaria que a medição diz não
existir — a mesma divergência que `perfilDaParedeComVaos` já documenta ter sido
reportada com print em 01/09/2026, só que ao contrário. Esconder é ver menos,
não medir diferente. Conferido no par de prints do item 7.

**Não** foram tocados: o memo de enquadramento (a câmera pularia a cada olho
clicado) e o memo da laje (não lê `ocultos`; a dep só causaria recomputo à toa).

### 5. Guia de UI

O gatilho da REGRA #1 (tabela / KPI / toolbar / busca / badge / coluna de ações /
modal / célula editável inline) **não se aplica** — a mudança é de painel lateral
dentro de um editor de canvas. Lidas e seguidas as seções que valem: §16 (escala
compacta, `rounded-[6px]`) e §19.2 (nó de grupo: `ChevronRight` + `rotate-90`;
sub-nível indentado com filete). Nenhum padrão novo precisou ser criado, então o
guia não foi alterado.

### 6. `__tests__/blueprintComponentes.test.ts` ✅

Novo `describe` com modelo de três pavimentos (um deles vazio): ordem top-down,
numeração reiniciando por piso, esquadria no bloco da parede hospedeira, recorte
por `levelIds`, e `undefined` = todos. **11 testes no arquivo, todos passando.**

O viewer não ganha teste unitário — é `@ts-nocheck`, e o cabeçalho dele já diz
que a validação é o harness do item 7.

### 7. `docs/spikes/blueprint-3d/` — regressão visual ✅

`main.tsx`: param `?ocultar=pilares|esquadrias|paredes`, que monta o `Set` a
partir do modelo fixo (`paredes` esconde METADE — com a cena vazia o par on/off
provaria só que a tela apagou). A barra do topo mostra `OCULTOS: n`.

`passeio.mjs`: cinco cenas novas, em pares on/off como o do lote.

---

## Verificação executada (01/09/2026)

| O quê | Resultado |
|---|---|
| `npx tsc --noEmit -p .` | ✅ limpo nos arquivos desta frente |
| `npx vitest run` (suíte inteira) | ✅ 118 arquivos, 2246 testes, 2 skipped |
| `npx vitest run __tests__/blueprintComponentes.test.ts` | ✅ 11 testes |
| `check-ui-standard.sh` em `PainelComponentes.tsx` | ✅ exit 0 |
| `check-ui-standard.sh` em `BlueprintEditor.tsx` | ✅ exit 0 |
| `node docs/spikes/blueprint-3d/passeio.mjs` | ✅ sem erro de console, chunk three lazy |
| Prints `ocultar-esquadrias-off` × `ocultar-esquadrias` | ✅ 4 ocultos, os dois vãos somem e a alvenaria fecha |
| Prints `ocultar-off` × `ocultar-pilares` | ✅ o pilar some e **o corte na parede permanece** |

⚠️ **Cold start do Vite:** a primeira execução do `passeio.mjs` estourou o
timeout de 30 s no `page.goto` da PRIMEIRA cena (que é pré-existente). Não era
defeito: o Vite ainda pré-empacotava o chunk do three. Quente, o passeio passa em
~2,5 s por cena. Uma sondagem à parte confirmou que `networkidle`,
`serviceWorkers:'block'` e `load` carregam igual, sem erro de console — ou seja,
não é o caso de PWA que a memória documenta.

### Verificação na interface real ✅ (01/09/2026, skill `rodar-app`)

Estudo "Planta 01/09/2026" da Alpa Construtora — 1 pavimento (Térreo), 47 peças
(39 paredes + 8 esquadrias). **17 asserções, todas verdes, nenhum erro de console
ou de rede** fora do ruído conhecido da Central de Controle (`57014 statement
timeout` nas três RPCs de aprovação/conciliação).

| # | Verificação | Resultado |
|---|---|---|
| 1 | 3D mostra a seção **Componentes** | ✅ "Componentes 47", famílias Alvenaria 39 e Esquadrias 8 |
| 1 | olho em cada peça **e** em cada família | ✅ 49 botões = 47 peças + 2 famílias |
| 2 | olho de **uma** parede | ✅ só ela some da cena; o resto do desenho fica idêntico (prints 04 × 05) |
| 2 | o olho alterna de estado | ✅ vira "Exibir Parede 1 no 3D" |
| 5 | olho da família **Alvenaria** | ✅ as 39 somem de um clique; linhas esmaecidas, olho cortado |
| 6 | **"Mostrar tudo"** | ✅ devolve tudo, e o próprio botão some quando não há nada escondido |
| 8 | elevação (**Frente**) | ✅ **não** mostra Componentes |
| 9 | planta baixa, antes e depois | ✅ sem olho (0), com lixeira (39), seção presente — **nada mudou** |
| 10 | console e rede | ✅ limpo |

Prints em `c:/tmp/pwtest/v3d-*.png`.

⚠️ **Não exercitado nesta rodada:** o subcabeçalho por pavimento e o item "7.
desmarcar um pavimento tira o bloco da lista" — o estudo disponível tem **um só
pavimento**, e o subcabeçalho é suprimido de propósito nesse caso. Essa parte
está coberta pelos testes de unidade do item 6 (três pavimentos, um deles vazio),
mas ainda não foi vista na tela. Vale conferir quando houver um estudo de dois
pavimentos — criar um só para o teste mexeria em dado real do usuário.

---

## Nota sobre a árvore de trabalho

Durante este trabalho a árvore continha mudanças de **outra frente** (fiscal,
contratos, partner, condomínio). `components/condominio/PortalCondominoAdmin.tsx`
passou a acusar 5 erros de TS às 19:58 — **depois** de um typecheck limpo às
19:55 —, alterado por outra sessão. Não foi tocado nem consertado aqui.
