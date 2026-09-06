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

Fases 0–6: **feitas**. **Em produção desde 05/09/2026** (`b614cc6`, `cd86ae0`,
`eef870a`, `2b4ed73`).

✅ **Usada de verdade em 06/09/2026**: o usuário traçou um corte no app e
confirmou que funciona — traçar, abrir a vista, ajustar pelas pontas.

### "Inverter o lado" era inalcançável (06/09/2026)

O usuário não encontrou o botão. Ele existia — no painel "Corte selecionado" —
e mesmo assim era quase impossível chegar nele, por quatro coisas somadas:

1. criar um corte pula para a VISTA do corte, e o painel só existe na Planta;
2. na planta a marca é a **última** na prioridade de clique (ela cruza a planta
   inteira; vir antes faria clicar em qualquer parede pegar o corte) — então um
   corte traçado só por cima da construção não se seleciona de jeito nenhum;
3. o painel mora dentro da seção **Componentes**, quase sempre recolhida;
4. e o lado errado só se percebe **olhando** o corte, onde não havia o botão.

Corrigido pondo "Inverter o lado" na barra da vista de corte, ao lado de
"Enquadrar" — onde a necessidade aparece. O do painel continua: quem está na
planta ajustando a marca também quer virá-la de lá.

Provas em `__tests__/components/BlueprintEditor.test.tsx` (3 casos): o botão
existe e está habilitado na vista do corte, clicar não derruba a vista, e na
Planta ele não está na barra. É a classe que aquele arquivo persegue — ação
oferecida que não se alcança —, e nenhum teste de unidade a veria, porque
`SetCorteProps` sempre funcionou.

### Inverter na planta, e o quadro que não seguia (06/09/2026, segunda rodada)

Dois retornos do usuário depois de publicar o botão:

**1. "Inverter também na planta 2D."** A barra da vista de corte tinha o botão; a
da planta, não — e é na planta que se vê a MARCA com as setas e se percebe que
apontam para o lado errado. Agora aparece lá também, ligado ao corte
**selecionado** (nunca a "o último": com dois cortes, adivinhar qual virar erra
em silêncio). Para selecionar, clique na marca num trecho FORA da construção —
ela é a última na prioridade de clique porque cruza a planta inteira.

**2. "Ao inverter, o corte não aparece; tenho que sair da vista e voltar."**
Defeito, e o MESMO do enquadramento 3D de 05/09: o conteúdo se move e o quadro
não segue. `projetarCorte` recalculava certo — o efeito que enquadra em
`ElevationCanvas` é que não dependia de nada do corte. Medido: inverter leva a
caixa de `u ∈ [−75, 5075]` para `[−5075, 75]`, e a interseção com o quadro
antigo é de 150 mm numa largura de 5150 — **menos de 3%**. Por isso o sintoma
não é "ficou torto", é "sumiu". Sair e voltar remonta o componente, e o primeiro
tamanho válido reenquadra.

Corrigido pondo os mesmos campos de que a projeção depende (`corte.id`,
`olharPara`, as duas pontas) nas dependências do efeito de enquadramento — e não
`projecao` inteira, senão mover uma parede puxaria a câmera de quem está olhando
uma fachada. Travado em `__tests__/blueprintCorte.test.ts`.

### ✅ Frente FECHADA (06/09/2026)

O usuário inverteu na tela e confirmou: espelha para o lado certo. Isso fecha a
**orientação**, que era o risco concentrado desta frente — `olharPara` estava
provado só por teste, e nenhum teste diz se a convenção (`ESQUERDA` = normal
esquerda de `a → b`) é a que quem desenha espera.

Fases 0–6 feitas, em produção, e as três verificações de olho fechadas: traçar e
ver, alcançar o "Inverter", e a orientação. Nada do corte segue aberto.

O E2E com credencial segue aberto para todas as frentes — ver
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.
