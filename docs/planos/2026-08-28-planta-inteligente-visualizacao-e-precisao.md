# Planta Inteligente — legibilidade da cota, controles de exibição e precisão do mover

## Pedido original

Sessão de 2026-08-28, transcrito literalmente:

> Incorporação < Planta inteligente:
> 1. Cotas está na cor cinza e dificulta a leitura
> 2. Opção de exibir e ocultar preenchimento de ambiente (cor azul claro)
> 3. Opção usar cores diferentes para cada ambiente
> 4. Opção de exibir e ocultar grid
> 5. Atualmente a precisão da ferramenta mover depende do zoom. Implemente opção de ser definido também manualmente

### Decisões tomadas na mesma sessão

Perguntado sobre quatro pontos em aberto, o usuário escolheu:

1. **Menu "Exibir ▾" + Precisão inline.** A barra já tinha 11 controles e quebrava
   em duas linhas; os quatro toggles novos somados aos quatro existentes a levariam
   a três. Os toggles de visualização passam a morar num popover; o seletor de
   precisão fica inline, ao lado de "Grade". (Recusado: acrescentar tudo inline.)
2. **Paleta automática** para as cores por ambiente — determinística, sem
   persistência. (Recusados: cor manual por ambiente, que exigiria persistir um
   `spaceId → cor` de chave instável, já que o ambiente é DERIVADO da geometria; e
   cor por faixa de área, que deixa vizinhos de área parecida quase iguais.)
3. **O passo manual vale só para MOVER** — arraste de seleção, de vértice, de ponta
   de divisa e setas do teclado. Traçar parede nova continua no passo da Grade.
   (Recusado: um número só mandando em tudo.)
4. **Escurecer a cota por padrão + toggle "Alto contraste"** (dentro do menu Exibir),
   para quem trabalha sobre planta de fundo escaneada carregada.

---

## Contexto — por que mudar

Os cinco itens são de uso real do desenho, e três deles são a mesma falha de
fundo: **o editor decide sozinho o que aparece, e não diz que decidiu.**

1. **Cota ilegível.** O número saía em `#64748b` (slate-500) com fundo branco a 88%.
   Sobre a grade clara passa; sobre planta de fundo escaneada, que é exatamente
   quando a cota importa (conferir o desenho contra a cota do projetista), não.
2. **Preenchimento sem chave.** O `for` que pinta os ambientes era incondicional. Não
   havia como olhar só a geometria.
3. **Uma cor só para todos os ambientes.** Cômodos vizinhos não se distinguiam de
   relance — e `Space` não tem tipo/uso no modelo, então não havia nada de que puxar
   uma cor.
4. **Grade sem liga/desliga.** Só existia seletor de passo.
5. **Precisão amarrada ao zoom.** O passo de encaixe era
   `passoGradeMm ?? passoAdaptativo(vista.escala)`. Em "Grade: automática" (o padrão),
   afastar a vista fazia o passo virar 500 mm ou 1 m, e o arraste passava a andar de
   metro em metro **sem nada na tela dizendo por quê** — o usuário lê como imprecisão
   da ferramenta, não como uma escolha do sistema.

---

## O que muda

### 1. Cota legível — `components/blueprint/BlueprintCanvas.tsx`

Antes de mexer na cor, **desacoplar a divisa**: `COR_COTA` também pintava o traço das
divisas não-TERRENO. Nasce `COR_DIVISA` com o valor antigo, para a divisa não mudar de
cor de carona.

Duas constantes viram quatro, separando **texto** de **linha** — que é a convenção de
prancha (linha fina e clara, número escuro):

| Constante | Valor | Onde |
|---|---|---|
| `COR_COTA_TEXTO` | `#1e293b` slate-800 | rótulo de eixo, texto da cadeia |
| `COR_COTA_TEXTO_INTERNA` | `#475569` slate-600 | "livre X,XX m", texto da cota de ambiente |
| `COR_COTA_LINHA` | `#64748b` slate-500 | traço da cadeia de cota |
| `COR_COTA_LINHA_INTERNA` | `#94a3b8` slate-400 | traço da cota de ambiente |

`escreverRotulo` ganha `fundoAlpha` opcional no fim (default sobe de 0,88 para 0,94) e
`rotuloDoTraco` repassa. Parâmetro no fim = os demais chamadores (nome de ambiente,
medição, HUD) seguem intactos.

**Alto contraste** (prop `cotaAltoContraste`, default `false`): texto preto, fundo do
rótulo opaco, linha de cota em `#334155`. Resolvido em consts no topo do efeito de
desenho, não com `if` espalhado por chamada.

**Pronto quando:** com "Medidas" e "Cotas" ligados sobre uma planta de fundo
escaneada, o número se lê sem zoom; e ligar "Alto contraste" dá preto sobre branco
opaco.

### 2–4. Preenchimento, cores e grade — mesmo arquivo

Três props novas, no padrão das existentes (declaração → default → dep-list do efeito):

| Prop | Default | Efeito |
|---|---|---|
| `mostrarGrade` | `true` | envolve o bloco de desenho da grade |
| `mostrarPreenchimentoAmbientes` | `true` | envolve o `for` que pinta os ambientes |
| `coresPorAmbiente` | `false` | escolhe a cor de cada ambiente em vez da azul única |

⚠️ **Desligar a grade NÃO desliga o encaixe.** O passo continua valendo — é o mesmo
`passoEfetivo` que alimenta `capturar`. Está dito no `title` do item: sem isso o
usuário desenha achando que está livre e o ponto continua grudando, que é pior que
não ter a opção.

**Paleta — novo `utils/blueprintCoresAmbiente.ts`.** Oito tons translúcidos (alfa
0,10: o preenchimento fica ATRÁS das paredes e da planta de fundo, então alfa baixo é
requisito, não estética).

A chave do hash **não é o `id`**. `spc_<nível>_<ordinal>` é atribuído por ordem
canônica em `arrangement.ts`, então acrescentar uma parede no miolo empurra o ordinal
de todos os cômodos seguintes e a planta inteira trocaria de cor num gesto que não
tinha nada a ver com ela. A chave é o **nome**, quando existe, e senão o **primeiro
vértice do anel** — intrínseco ao cômodo, muda só se ele mudar de lugar.

A exportação PDF/SVG **não muda** (segue no cinza `#f2f2f2`): prancha impressa não
herda cor de tela, e oito tons pastéis em impressão P&B viram oito cinzas iguais.

**Pronto quando:** com "Cores" ligado, acrescentar uma parede no miolo e os cômodos
que não mudaram mantêm a cor.

### 5. Precisão do mover, independente do zoom

**`BlueprintEditor.tsx`** — estado `passoMover` em `usePersistedState`
(`blueprint:passoMover`, default `'grade'`) e um `<select>` "Precisão" ao lado de
"Grade": `Igual à grade (X)` · 1 · 5 · 10 · 25 · 50 · 100 · 500 mm · 1 m. 1 mm é o
piso — o kernel só aceita coordenada inteira em mm (`assertIntegerMm`).

**`BlueprintCanvas.tsx`** — prop `passoMoverMm`, e
`const passoDeMover = passoMoverMm ?? passoEfetivo`, consumido por:

- `deltaDoArraste` (arraste da seleção);
- `capturar`, que ganha um 3º **parâmetro** `passoDoEncaixe = passoEfetivo` — parâmetro,
  não dependência, para o `useCallback` não recriar e o traçado continuar no passo da
  grade. Passam `passoDeMover`: o ramo `movendo` (vértice) e o ramo `movendoLimite`
  (ponta de divisa);
- as setas do teclado.

O ímã de `SNAP_PX` fica **intocado**: grudar em canto/ponta que existe tem de vencer o
passo, em qualquer precisão. Não se mexe em `movendoAbertura` (exceção deliberada e já
documentada) nem no laço/região.

O HUD do rodapé passa a mostrar `· mover X` **só quando** a precisão é manual — senão
repetiria o número da grade.

**Pronto quando:** Grade em *automática*, zoom afastado até o HUD dizer `grade 1 m`,
Precisão em `10 mm` → o arraste anda de 10 em 10 mm. Hoje anda de metro em metro.

### 6. Menu "Exibir" — novo `components/blueprint/MenuExibir.tsx`

Popover ancorado (não modal — `UI_PATTERNS.md`), fecha em clique fora e `Esc`. Itens
como `role="menuitemcheckbox"`:

```
Medidas · Cotas · Interna · Nomes
────────────
Grade · Preenchimento dos ambientes · Cores por ambiente
────────────
Cota em alto contraste
```

Os quatro botões que hoje estão na barra **saem dela**. Os comentários longos que
explicam a diferença entre Medidas × Cotas × Interna viram o `title` de cada item —
essa distinção é exatamente o que se erra, e não pode se perder na mudança.

"Cores por ambiente" fica desabilitado quando "Preenchimento" está desligado: não há
o que colorir, e um toggle que não faz nada é pior que um toggle ausente.

Os oito estados de exibição passam a `usePersistedState` (`blueprint:*`), como
`modoJuncao` já fazia. Hoje eles resetam a cada remontagem do editor.

**Pronto quando:** a barra cabe em uma linha em 1440 px, e os toggles voltam como
estavam depois de recarregar a página.

---

## Verificação

1. `npx vitest run __tests__/components/BlueprintEditor.test.tsx __tests__/utils/blueprintCoresAmbiente.test.ts`
2. `bash scripts/check-ui-standard.sh components/blueprint/BlueprintEditor.tsx components/blueprint/MenuExibir.tsx`
3. `npx tsc --noEmit`
4. Na tela (Incorporação › Planta Inteligente › estudo com ambientes derivados), os
   cinco itens do pedido, com o teste de estabilidade de cor (itens 2–4) e o teste de
   zoom afastado (item 5) descritos acima.
