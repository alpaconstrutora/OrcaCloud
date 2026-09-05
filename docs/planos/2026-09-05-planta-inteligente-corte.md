# Planta Inteligente — VISTA DE CORTE (Etapa 2 do roadmap BIM, item 2)

## Pedido original

> vista de corte,

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-05, em resposta a
*"qual a próxima fase?"* — respondida com os cinco itens que restam da Etapa 2 e
a recomendação do corte, por ser o único DESENHO que falta no conjunto (há
planta, quatro elevações e 3D) e porque o telhado, recém-entregue, acabou de lhe
dar conteúdo: é no corte que a inclinação e o pé-direito se leem na mesma imagem.

Contexto: `docs/planos/2026-09-04-planta-inteligente-telhado.md` e
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.

## Decisões de desenho

### 1. O corte é PERSISTIDO, no payload canônico

Família `sections: Corte[]` no kernel, dentro do hash. Não é estado de tela nem
tabela ao lado, e a razão é o SNAPSHOT: ele é imutável e reprodutível, e uma
linha de corte fora do payload faria "o corte AA da versão 3" mudar de lugar
quando alguém movesse a linha hoje. O desenho publicado deixaria de ser o
desenho publicado.

É também o que a elevação NÃO precisou: a direção dela é DERIVADA da divisa de
frente. Onde cortar é escolha, e escolha do usuário é conteúdo.

### 2. UM SEGMENTO RETO, não polilinha

Corte em desvio (o que atravessa a porta aqui, dá um passo, e a janela ali) é
prática corrente no Brasil, e fica **de fora**: o desdobramento dos trechos num
desenho só é ambíguo (onde o degrau aparece?), e um desdobramento errado produz
um corte plausível. Um segmento cobre o estudo preliminar, que é o escopo.

### 3. O PLANO É INFINITO; o segmento é a MARCA

Classificar pelo plano infinito é a regra simples e é o que "corte" significa.
O segmento desenhado em planta é a marca com as setas e a letra — ele diz ONDE
o plano passa, não até onde ele corta.

### 4. Três destinos para cada peça, decididos pela PEGADA

Para cada parede, peça estrutural e água, o mínimo e o máximo da profundidade
sobre os vértices da pegada em planta:

| | destino |
|---|---|
| mín < 0 < máx | **CORTADO** — o plano atravessa; sai cheio |
| mín ≥ 0 | **ATRÁS** — sai como elevação |
| máx ≤ 0 | **NA FRENTE** — descartado (é a metade que se remove) |

Classificar pelo CENTRO seria mais barato e erraria justamente na peça longa e
quase paralela ao plano, que é onde o corte decide.

### 5. `olharPara` explícito, e não a ordem dos pontos

Inverter a vista trocando `a` e `b` espelharia o desenho da esquerda para a
direita junto. Com o campo explícito, o botão "inverter" troca só o lado.

Convenção: `olharPara: 'ESQUERDA'` → `d` é a normal esquerda de `a → b`, e daí
`u = direitaDe(d)` cai exatamente sobre `a → b`. A vista para a direita espelha,
que é o correto.

### 6. Reaproveitar a projeção da elevação, sem duplicá-la

`projetarElevacao` ganha uma `base` opcional nas opções. Com ela, `projetarCorte`
usa a MESMA máquina para o que está atrás do plano, e só acrescenta a
classificação e a geometria do que é cortado. Uma segunda projeção divergiria da
primeira no dia em que uma das duas fosse corrigida.

### 7. `KERNEL_VERSION` 0.12.0 → 0.13.0, com a prova

`sections` é conteúdo e entra no hash, omitido quando vazio (disciplina de
`structures` e `roofs`). Bump e recaptura de goldens **só depois** de confirmar,
com a versão revertida, que os seis payloads voltam byte a byte.

## Plano — um item por arquivo, com critério de pronto

### Fase 1 — Kernel ✅ (05/09/2026)
- [x] `model.ts` — `Corte` (a, b, `olharPara`, `rotulo`), `sections`, `findCorte`,
  invariantes `DEGENERATE_SECTION` e `BAD_SECTION_SIDE`, uid na trava.
  **Sem `levelId`**: o plano atravessa a edificação inteira, e por isso
  `RemoveLevel` NÃO leva corte junto (travado por teste).
- [x] `commands.ts` — `AddCorte` (letra A, B, C sozinha), `SetCorteProps`,
  `MoveCorteVertex`, `DeleteCorte`.
- [x] `canonical.ts` — `sections` na geometria (omitida quando vazia) e em
  `identity`. `identity.ts` — prefixo `S`.
- [x] `units.ts` — **0.12.0 → 0.13.0** com a prova: com a versão ainda em 0.12.0
  e todo o corte no lugar, os goldens passaram INTACTOS.

### Fase 2 — Projeção ✅ (05/09/2026)
- [x] `blueprintElevation.ts` — `base` opcional em `projetarElevacao`. É por ela
  que o corte reaproveita a projeção INTEIRA em vez de reimplementá-la.
- [x] `utils/blueprintCorte.ts` (novo) — `baseDoCorte`, `classificarNoCorte`,
  `trechosCortados`, `projetarCorte`, e a face inclinada da água.
- [x] Pronto: `__tests__/blueprintCorte.test.ts` (19 casos), valores à mão.

**Duas armadilhas que os testes pegaram, e que não eram óbvias:**

1. **O eixo `u` tem de ser ABSOLUTO.** A primeira versão media `u` a partir de
   `corte.a`, e `projetarElevacao` mede a partir da origem do mundo. Os dois
   saíam no mesmo quadro deslocados um do outro por `origem · u` — um número
   qualquer. A profundidade continua sendo medida a partir do plano; são coisas
   diferentes, e agora está escrito no código.
2. **`-0` invisível** na base, a mesma armadilha que `blueprintElevation` já
   documentava.

### Fase 3 — Renderer e editor ✅ (05/09/2026)
- [x] `ElevationCanvas.tsx` — aceita uma projeção de corte e pinta os cortados
  cheios, **por cima de tudo e fora da ordenação de profundidade**: a face
  cortada É o plano, e o que sobrou está atrás dele. Entrar na fila de
  profundidade seria pedir a um empate que decidisse o que já está decidido.
  Traço grosso, que numa prancha é o que distingue corte de vista.
- [x] `SeletorDeVista.tsx` — `VistaBlueprint` ganha `` `corte:${id}` ``, e com
  isso a vista sobrevive ao recarregamento sem uma segunda variável de estado.
  Os cortes entram DEPOIS das seis fixas, para que a lista não reordene as
  vistas de sempre a cada corte novo.
- [x] `BlueprintCanvas.tsx` — a MARCA em planta: traço-ponto, setas no sentido
  do olhar, letra em círculo nas duas pontas, alças para arrastar.
  Hit test do corte é o ÚLTIMO da prioridade de seleção: a linha atravessa o
  desenho inteiro, e vir antes faria ela roubar cliques de parede.
- [x] `hooks/useBlueprintEditor.ts` — ferramenta `corte` (dois cliques, com orto
  pelo mesmo caminho da viga).
- [x] `PainelCorteSelecionado.tsx` (novo) — letra, inverter lado, ver, excluir.
  **Sem campos de coordenada**: a linha se ajusta arrastando as pontas na
  planta, que é onde se enxerga o que ela atravessa.

Duas decisões de fiação que não estavam no plano e ficaram:

1. **Traçar um corte já ABRE a vista dele.** Um corte não é peça que se admira
   em planta — quem acabou de escolher por onde o plano passa está perguntando
   o que aparece ali.
2. **Apagar o corte que está sendo visto cai de volta na planta**, em vez de
   deixar o editor numa vista sem objeto.

### Fase 4 — Saídas ✅ (05/09/2026)
- [x] `blueprintExport.ts` — `enquadrarElevacao` e `desenharElevacao` aceitam as
  duas projeções, e as faces cortadas saem por cima com traço de 0,5 mm contra
  os 0,1–0,35 mm da vista. **`vazio` passou a considerar os cortados**: um corte
  rente à parede dos fundos não tem parede atrás nenhuma, e recusar a prancha
  por isso seria recusar o desenho certo.
- [x] `PranchaExport` ganha `` `corte:${id}` ``, com `rotuloDaPrancha` levando a
  LETRA para o carimbo. No PNG o `:` vira `-`: dois-pontos é ilegal em nome de
  arquivo no Windows e o download sai sem nome.
- [x] `blueprintDxf.ts` — camadas `CORTE-PAREDES/ESTRUTURA/TELHADO/ABERTURAS`,
  **separadas** das `ELEVACAO-*` porque o DXF não carrega espessura por si:
  quem plota escolhe por camada, e numa camada só o corte se leria como
  elevação. A MARCA (`PLANTA-CORTE`) sai **sempre**, mesmo sem a vista pedida —
  uma planta que esconde por onde o corte passa está incompleta.
- [x] `blueprintDiff.ts` — `CORTE_ADICIONADO/REMOVIDO/MOVIDO/LADO`, todas com
  `pesoM2` **zero**. É afirmação, não omissão: mover um desenho não move um
  metro quadrado, e com peso a mudança de corte subiria na ordenação por
  relevância e empurraria para baixo a parede que mudou o orçamento.
  Inverter o lado é frase própria — a linha ficou onde estava.
- [x] Pronto: `__tests__/blueprintCorteSaidas.test.ts` (11 casos).

### Fase 5 — Persistência ✅ (05/09/2026)
- [x] `aplicar_20270919000007_blueprint_corte.sql` — `object_type` aceita
  `'SECTION'`; a RPC explode `payload->'sections'` com `element_uid` lido de
  `identity.sections`. Texto da função tirado do ARQUIVO anterior, nunca de
  `pg_get_functiondef` (que corrompe acento).
- [x] **`level_index` fica NULL**, e não é esquecimento: o plano atravessa a
  edificação inteira, e `Corte` não tem `levelId`. Gravar um pavimento
  inventaria um vínculo que o modelo recusa, e "o que existe no térreo"
  passaria a devolver um corte que também é do primeiro andar.
- [x] **`length_mm` fica NULL** pelo mesmo motivo de `area_mm2` na água: hoje só
  a parede preenche essa coluna, e quem a soma está somando metros lineares de
  alvenaria. A linha tem comprimento, mas não é construção.
- [x] Aplicada e **provada contra o banco real**: publicação de um payload
  0.13.0 com dois cortes pela RPC, em transação abortada. Voltou
  `SECTION[0] uid=70384ff1 rotulo=A lado=ESQUERDA nivel=NULO comp=NULO` e
  `SECTION[1] uid=42889d2d rotulo=B lado=DIREITA`, com os uids batendo com
  `identity.sections` na ordem canônica. Zero resíduo conferido depois.

### Fase 6 — Verificação ✅ (05/09/2026)
- [x] `tsc --noEmit` limpo.
- [x] Suíte inteira: 2480 passando, 27 puladas.
- [x] Goldens intactos (o bump para 0.13.0 saiu na Fase 1, com a prova).
- [x] `check-ui-standard` limpo nos seis `.tsx` tocados.
- [x] `npm run build`.
- [x] Migration aplicada e conferida de fora.

## Estado

Fases 0–6: **feitas**. Pendem as duas verificações de olho que já valem para a
identidade e para o telhado (ver
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`): rodar o E2E
com credencial e abrir o app. Para o corte, o risco concentrado é o mesmo do
telhado — a ORIENTAÇÃO: `olharPara` produz o desenho certo em teste, mas só o
olho confirma que "inverter" espelha para o lado que o usuário esperava.
