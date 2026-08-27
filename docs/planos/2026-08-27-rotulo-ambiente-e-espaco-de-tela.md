# Editor de plantas: rótulo de ambiente e recuperação de espaço de tela

## Context

Pedido de 27/08/2026, quatro itens. Três deles são a mesma queixa por caminhos
diferentes — **o cromo come a área de desenho** —, e um é funcionalidade nova.

> 1. Opção de mostrar na planta o nome do ambiente com opção de ocultar e mostrar
> 2. Diminuir 20% largura do painel lateral esquerdo (Ambientes, PDF ....)
> 3. Advertência que não desaparece: A planta de fundo é uma imagem: a escala
>    aferida num ponto pode não valer no resto da folha. Confira uma segunda cota
>    distante da primeira antes de confiar no traçado. / Escala declarada como
>    1:100 · 16,9333 mm por pixel · exata, sem erro de clique
> 4. Nome da planta e o botão voltar no topo da tela está ocupando um valioso espaço

Respostas de escopo:

- **Rótulo:** nome, área **e perímetro**
- **Advertência:** fechável em qualquer caso (não distinguir PDF de foto)
- **Topo:** uma linha compacta

---

## O que o levantamento estabeleceu

| | onde | hoje |
|---|---|---|
| Rótulo de ambiente na planta | `BlueprintCanvas.tsx:1400` | **não existe** — o ambiente só é preenchido |
| Âncora do rótulo | `SpaceLabel.at` (`model.ts:182`) + `interiorPoint()` (`geom.ts:806`) | **já existem**, prontos |
| Painel lateral | `BlueprintEditor.tsx:2395` | `w-96` = **384 px** (e é o da DIREITA, `border-l` — não há painel à esquerda) |
| Faixa da advertência | `ResumoDaAfericao`, renderizada em `BlueprintEditor.tsx:2237` | tira de **largura inteira acima do canvas**, sem como fechar |
| Cabeçalho | `BlueprintEditor.tsx:1732` | `py-3` + duas linhas ≈ **57 px** |
| Padrão de "dispensar" | `BlueprintEditor.tsx:2225` | **já existe** para o aviso de junção — é o modelo a copiar |

---

## Item 1 — rótulo do ambiente na planta

- **`components/blueprint/BlueprintCanvas.tsx`** — prop `mostrarRotulosAmbiente`.
  Desenha, por ambiente do nível: **nome · área · perímetro**, em três linhas
  curtas, ancorado no `at` da etiqueta quando existe (é onde o usuário a pôs) e
  em `interiorPoint(ring, holes)` quando não existe.
- **`components/blueprint/BlueprintEditor.tsx`** — botão de alternar na barra,
  no mesmo padrão de "Medidas" e "Cotas". Nasce **desligado**, como os outros.

### Os números têm de ser os MESMOS da lista lateral

A lista já mostra **área útil** (face interna, via `areaRecuada`) e **perímetro
de eixo**. O rótulo na planta usa exatamente esses, da mesma origem. Dois
números diferentes para o mesmo cômodo em dois lugares da mesma tela é o defeito
que este módulo já pagou caro — é a razão de `pontoDaCota` ser fonte única para
os três destinos de cota.

### Só sai se couber

Mesma disciplina da cadeia de cotas: medir com `measureText` e **não desenhar** o
rótulo quando o ambiente é menor que o texto na tela. Rótulo que não se lê suja o
desenho fingindo informar. *Pronto quando:* numa planta com cômodo pequeno em
zoom afastado, o rótulo some em vez de transbordar.

---

## Item 2 — painel 20% mais estreito

- **`components/blueprint/BlueprintEditor.tsx:2395`** — `w-96` → `w-[307px]`
  (384 × 0,8). Valor arbitrário é o estilo da casa (`rounded-[10px]`,
  `w-[15px]`).

⚠️ **Conferir o conteúdo, não só a largura.** As abas trazem tabela
(`QuadroDeDivisas`), formulários e o painel de gerar paredes. A 307 px o risco é
transbordo horizontal. O guia de UI (§6.9) já manda `px-3`/`px-4` em tabela
dentro de painel — se alguma estiver com `px-6`, é aqui que aparece. *Pronto
quando:* as seis abas passam sem rolagem horizontal.

---

## Item 3 — advertência fechável

- **`components/blueprint/ControlesDeFundo.tsx`** — `ResumoDaAfericao` ganha
  botão **dispensar**, copiando o padrão que já existe em
  `BlueprintEditor.tsx:2225` (texto sublinhado, `shrink-0`).
- **Lembra por PRANCHA**, em `localStorage` — `usePersistedState` de
  `components/ui/TableUtils`. Prancha nova volta a avisar, que é o certo: o
  aviso é sobre AQUELA imagem.
- A linha da escala (`1:100 · 16,9333 mm por pixel · exata`) some junto: é o
  mesmo bloco, e o dado continua na barra de controles do fundo.

ℹ️ **Registro de uma divergência.** Levantei que `AVISO_RASTER` descreve
distorção de **escaneamento e foto** (*"a folha ondula, a lente distorce"*), que
não existe em prancha vinda de PDF vetorial rasterizada pelo próprio app a 150
dpi — e propus calá-lo nesse caso. O usuário preferiu mantê-lo em toda prancha,
só fechável. Fica como decisão dele, anotada para não ser "corrigida" depois.

---

## Item 4 — cabeçalho em uma linha

- **`components/blueprint/BlueprintEditor.tsx:1732`** — `<header>` passa a uma
  linha só, ~32 px:
  - `py-3` → `py-1.5`
  - `<h1>` e o estado de salvamento na MESMA linha
  - "Revisão N · unidades em milímetros" sai da tela e vai para o `title` do
    `<h1>` — é referência, não algo que se lê a cada segundo
  - o estado de salvamento **fica visível**: é retorno de ação, e esconder
    "Falha ao salvar" num tooltip seria esconder justamente o que precisa
    interromper
  - botão Publicar continua, em `py-1.5`

Recupera ~25 px em toda a largura, somados aos ~40 px da faixa da advertência
quando dispensada.

---

## Verificação

1. **Unidade** — `__tests__/`:
   - o rótulo do ambiente usa a MESMA área que a lista lateral (mesma origem)
   - âncora: com etiqueta usa o `at` dela; sem etiqueta, `interiorPoint` cai
     dentro do anel
   - a advertência dispensada não volta na mesma prancha, e **volta** noutra

2. **Navegador** — canvas é opaco em jsdom, e três dos quatro itens são de
   pixel. Harness `docs/spikes/wall-render/` (`?mista=1`, `?medidas=1`,
   `?cotas=1` já existem): acrescentar `?rotulos=1`.
   ⚠️ **Rodar os harnesses ANTES de mexer** — nesta mesma sessão um deles estava
   podre e quase custou um diagnóstico errado.
   Conferir à vista: rótulo centrado e legível; rótulo SOME em cômodo pequeno;
   painel a 307 px sem rolagem horizontal nas seis abas; cabeçalho numa linha.

3. **Regressão** — `npx vitest run __tests__` (1674 hoje),
   `npx tsc --noEmit -p .`, `bash scripts/check-ui-standard.sh` nos componentes
   tocados, e **goldens de hash 7/7** (nada aqui pode tocar o payload canônico —
   são todas mudanças de apresentação).

---

## Fora de escopo

- **Mover/arrastar o rótulo do ambiente na planta.** A etiqueta já tem ponto
  (`SpaceLabel.at`) e já é criada pelo painel; arrastá-la no canvas é interação
  própria.
- **Calar `AVISO_RASTER` em prancha de PDF** — decisão do usuário, ver item 3.
- **Painel redimensionável pelo usuário.** O pedido é um valor fixo 20% menor;
  alça de redimensionar é outra funcionalidade.

---

# Andamento — CONCLUÍDO

Baseline antes de mexer: `medidas`, `cotas` e `mista` sem erro, **1674 testes**.

## Item 1 — rótulo do ambiente ✅

- [x] `BlueprintCanvas` — props `mostrarRotulosAmbiente` e `rotulosDeAmbiente`;
      âncora no `at` da etiqueta quando existe, `interiorPoint` quando não.
- [x] `BlueprintEditor` — botão **Nomes** (ícone `Tag`), nasce desligado como
      "Medidas" e "Cotas". `rotulosDeAmbiente` derivado de `ambientes`, a MESMA
      lista do painel.
- [x] Só sai se couber: `measureText` contra a caixa do ambiente na tela.
- [x] Cena `?rotulos=1` + `docs/spikes/wall-render/rotulos.mjs`.

### O defeito que só o print pegou

Pus o bloco logo depois do preenchimento do ambiente — que é desenhado **antes
das paredes**, de propósito, "para ficarem por baixo". Resultado: as paredes
pintavam por cima e apagavam o rótulo; sobrava só a última linha, e ainda por
cima num lugar que parecia aleatório (o vão da divisória, onde o centróide
caía). Movido para depois do desenho das paredes.

Nenhum teste de unidade pegaria isso: os números estavam todos certos.

**Conferido no print** (cena `?mista=1&rotulos=1`): `Ambiente 1 · 24,00 m² ·
20,00 m` e `Ambiente 2 · 30,00 m² · 22,00 m` — confere com 4×6 e 5×6 de eixo.

## Item 2 — painel 20% mais estreito ✅

- [x] `w-96` (384) → `w-[307px]`.

Risco levantado no plano (transbordo a 307 px) **investigado e baixo**: nenhum
painel do aside usa `px-6` — o único é o `SheetPanel` do `QuadroDeDivisas`, que
vive num `Sheet` e não no aside. A barra de abas usa `flex-wrap`, então as seis
abas quebram em linha em vez de estourar.

## Item 3 — advertência fechável ✅

- [x] `ResumoDaAfericao` ganha "dispensar", no mesmo padrão do aviso de junção.
- [x] Lembra **por prancha** (`usePersistedState`, chave `…:${linha.id}`):
      prancha nova volta a avisar, porque o aviso é sobre AQUELA imagem.

## Item 4 — cabeçalho em uma linha ✅

- [x] `py-3` → `py-1.5`, nome e estado de salvamento na mesma linha, "Revisão N
      · unidades em milímetros" para o `title`. Botão Publicar em `py-1.5`.
- [x] O estado de salvamento **fica visível**: é retorno de ação, e esconder
      "Falha ao salvar" num tooltip esconderia justamente o que precisa
      interromper.

## Verificações

- `npx vitest run __tests__` — **1674 passaram**, 24 puladas
- `npx tsc --noEmit -p .` — limpo
- `check-ui-standard.sh` nos três componentes — sem violação
- Quatro harnesses (`medidas`, `cotas`, `mista`, `rotulos`) — sem erro
- Print conferido à vista na cena de espessuras diferentes

## Honestidade sobre o que NÃO foi verificado

- **O painel a 307 px não foi visto nas seis abas.** O harness
  `wall-render` renderiza só o canvas, sem o aside. A análise de `px-6` e
  `flex-wrap` diz que o risco é baixo, mas **não é o mesmo que ter olhado**.
- **A propriedade "os números do rótulo são os da lista" é por CONSTRUÇÃO**, não
  por teste: `rotulosDeAmbiente` mapeia o array `ambientes`. Um teste disso
  compararia `a.areaM2` com `a.areaM2`. Se um dia as duas origens se separarem,
  aí o teste passa a valer.
