# Planta Inteligente — platô desenhado, ajustado no 3D (reel "Terrain Modification Tool")

## Pedido original

> assista este video : https://www.instagram.com/reel/DgGT-Gsop9O/

Sessão 66201aaa-7041-468a-b159-bfddc8fb9dfb · 25/11/2026.

O reel (Hektar, 12,7 s, "Coming soon: Terrain Modification Tool! — Explore cut and fill, optimize mass
balance, and understand how terrain modifications impact your design early in the process"): um polígono
azul sobre o terreno 3D; arrastar os cantos muda a forma, arrastar uma seta sobe/desce o platô com a cota
ao vivo ("45.7 m"); o terreno em volta se refaz na hora, com o talude e as curvas de nível contornando o
platô.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 25/11 | O platô desenhado é o mesmo de hoje (um por estudo, de onde saem volumes e orçamento) ou vários soltos? | "um só platô, o mesmo de hoje" |
| 25/11 | Como construir: A tudo no 3D · B desenhar na planta, ajustar no 3D · C só planta e painel | "opcao B" |

## Intenção

Estudar corte e aterro desde o primeiro desenho, do jeito do vídeo: mexer no platô e VER o terreno
responder — talude, curvas e o saldo de volume — sem sair do 3D. O platô é o MESMO que já alimenta os
volumes e o orçamento (uma verdade só): mexer nele no 3D é mexer no estudo.

## O que existe hoje (lido em origin/main, 25/11)

- **A conta toda já existe** (`utils/blueprintTopografiaAnalises.ts`): `terraplenagemComTalude` (platô de
  cota única ou inclinado, talude por aresta, banquetas, via de serviço, muro de arrimo, volumes com
  empolamento/contração, bota-fora/empréstimo), `cotaDeEquilibrio`, e `cotaDeProjeto(grade, anel, cota,
  parametros, inclinacao)` — a cota da superfície de PROJETO em qualquer ponto (dentro do anel, a do platô;
  fora, o talude até encontrar o terreno). Custo: O(nós × arestas do anel) fora do anel.
- **O platô** (`hooks/useBlueprintTerraplenagem.ts`, tabela `blueprint_study_terraplenagem`, um por estudo):
  `base: 'ENVELOPE' | 'LOTE' | 'CASA'`, `cotaPlatoM` (`null` = cota de equilíbrio), `inclinacao`,
  `parametros`, e `anel_plato` (JSONB, ≥ 3 pontos) — o anel EM USO: o `premissa` do hook grava nele o
  anel da casa (`'CASA'`) ou o anel em uso de qualquer outra base (envelope/lote), então ele é
  sobrescrito a cada troca de base (achado da revisão do desenho, 25/11).
  Grava com respiro de 500 ms. O anel em uso é resolvido no editor (`anelDoPlato`, `BlueprintEditor.tsx`
  ~5801) e a conta é `terraplenagemCalc` (~5820).
- **Banco:** `CHECK (base IN ('ENVELOPE','LOTE','CASA'))` — confirmado no banco remoto em 25/11.
- **Painel:** `SecaoTerraplenagem` em `components/blueprint/PainelTopografia.tsx` (~1949): botões
  "No envelope" / "No lote inteiro" / "Sob a casa" (este só aparece quando há casa) e o campo
  "Cota do platô (m)".
- **2D:** o canvas pinta corte/aterro por célula (`ladoDaCelula`) e os muros. Ferramentas de polilinha
  fora do kernel (`perfil`, `drenagem`, `eixo-via`): `Tool` em `hooks/useBlueprintEditor.ts`, coleta de
  pontos e fechamento em `BlueprintCanvas.tsx` (~10885 move, ~11682 clique, ~11834 duplo clique), callback
  ao editor (`onPerfilTracado`…).
- **3D:** mostra só o terreno NATURAL (`relevo3d = malhaDaGrade(v.grade)`) e as curvas GRAVADAS da versão.
  Nada do platô aparece. Peças de arraste prontas: `ArrastarNoPiso` + `pontoNoPlanoHorizontal` +
  `deslocamentoDoArrasteNoPiso` (arraste num plano horizontal, trava 90° com Shift, Esc cancela) e
  `PivotControls` só no eixo Y + `deltaVerticalMm` (a seta verde do "Elevar", com valor ao vivo no `onDrag`).
- **Medido (11/09):** o motor inteiro (TIN, curvas, terraplenagem, malha 3D…) roda em 70 ms a 40 mil nós
  (`TETO_DE_NOS`), 230 ms a 162 mil. A terraplenagem sozinha NÃO foi medida.

## Objetivos

1. **Platô desenhado:** 4ª forma do platô, **"Desenhado"**. Ferramenta "Platô" na planta (aba onde hoje
   está a Terraplenagem): clica os cantos, fecha no 1º vértice ou com duplo clique (≥ 3 pontos), com o
   encaixe e a trava de 90° das outras ferramentas. Grava `base = 'DESENHADO'` e o anel numa coluna
   PRÓPRIA, `anel_desenhado` — trocar para lote/envelope/casa e voltar não perde o desenho. O botão
   "Desenhado" do painel só aparece quando há desenho guardado.
2. **Partir do que existe:** um botão "Editar contorno" no painel copia o anel em uso (envelope, lote ou
   casa) para "Desenhado" — dá para começar do lote e ajustar.
3. **3D mostra o terreno modificado:** com a Terraplenagem à vista (o mesmo `mostrarTerraplenagem` do 2D),
   o relevo do 3D é a superfície de PROJETO (`cotaDeProjeto` avaliada em cada nó → uma `GradeDeElevacao`
   de mesmo espaçamento) e as curvas de nível são as DELA (`gerarCurvasNosNiveis` nos mesmos níveis da
   versão). Desligada, o terreno natural, como hoje. Vale em todos os estilos (Maquete inclusive); o hover
   das curvas acende as curvas da superfície que está à vista.
4. **Editar no 3D, como no vídeo** (só com base Desenhado):
   - o platô aparece como polígono **azul translúcido** na cota dele;
   - **alça em cada canto**: arrastar move o canto num plano horizontal na cota do platô (Shift = trava
     90°; Esc cancela e volta ao de antes);
   - **seta vertical** no centro: sobe/desce a cota (passo 5 cm), com o rótulo da cota ao vivo
     ("45,70 m", `formatarCotaM`);
   - **ao vivo:** terreno, talude e curvas se refazem durante o arraste;
   - **grava ao soltar** (um `save` por gesto, não por quadro).
5. **Saldo de volume à vista no 3D:** um selo com corte, aterro e saldo (m³) da conta que JÁ existe —
   "mass balance" do vídeo —, atualizado junto.

## Fora do escopo (não-objetivos)

- Vários platôs; platô com furo; editar talude/banqueta/muro no 3D (seguem no painel).
- Desenhar o platô no 3D (decisão B: desenha na planta).
- Editar os cantos na planta 2D depois de desenhado (v1: edita no 3D ou redesenha).
- Ctrl+Z do platô (ele não é peça do kernel; v1: Esc cancela o arraste; o painel volta a envelope/lote).

## Anti-objetivos (falharia mesmo "funcionando")

- O 3D mostrar uma terraplenagem e o orçamento outra — tudo sai do MESMO `terraplenagemCalc`/platô.
- Gravar no banco a cada quadro do arraste.
- Arrastar e o 3D travar: se a conta não couber num quadro, degrada (abaixo), nunca congela.
- A cota digitada no painel e a da seta divergirem.

## Restrições

- **Migration** (pequena, reversível): o CHECK de `base` passa a aceitar `'DESENHADO'` e entra a coluna
  `anel_desenhado JSONB` (mesmo CHECK de ≥ 3 pontos do `anel_plato`). Pela REGRA #8 /
  auto mode, eu escrevo o arquivo e o usuário aplica (`db query -f` é barrado para mim). Até aplicar, gravar
  "Desenhado" falha no banco: o hook já degrada (`persistenciaIndisponivel`) — a tela tem de dizer o motivo.
- Sem dependência nova.
- Planta inclinada (`inclinacao`): a seta move a cota do CENTRO (a inclinação fica); o polígono azul
  acompanha o plano inclinado.
- Platô fora do relevo (canto fora da grade): permitido, mas a conta só vale onde há cota — o selo avisa.

## Abordagens consideradas

| | Como | Troca | Escolha |
|---|---|---|---|
| A | Tudo no 3D: desenhar clicando no relevo, alças e seta | mais parecido com o vídeo; desenhar com precisão em perspectiva num terreno inclinado é difícil, perde encaixe/trava | — |
| **B** | **Desenhar na planta (encaixe, trava 90°, ou partir do lote/envelope/casa); ajustar cantos e cota no 3D, ao vivo** | precisão no 2D, a experiência do vídeo no 3D (o vídeo mostra justamente a EDIÇÃO) | **escolhida pelo usuário** |
| C | Só planta + painel; 3D só mostra | menor esforço; nada se arrasta no 3D — longe do vídeo | — |

## O "como" já decidido

- Um platô, o de hoje: `base` ganha `'DESENHADO'`; o desenho mora em `anel_desenhado` (próprio), e com essa
  base o `anel_plato` (anel em uso) é uma cópia dele, como nas outras bases.
- A superfície de projeto vem de `cotaDeProjeto` nos nós — nenhuma conta nova de terraplenagem.
- Arraste dos cantos = padrão `ArrastarNoPiso`; seta = `PivotControls` só Y (como o "Elevar").

## Minhas decisões (o usuário não opinou; corrigíveis)

- O 3D troca para a superfície de projeto pela MESMA chave da Terraplenagem do 2D (Exibir), para os dois
  mostrarem a mesma coisa.
- **Desenho guardado à parte** (revisão, ponto 1): coluna `anel_desenhado`, para não perder o trabalho do
  usuário quando o `anel_plato` é sobrescrito por outra base ou pelo "Lançar" da casa.
- **Cota em equilíbrio durante o arraste** (ponto 2): arrastar um CANTO com a cota em equilíbrio
  (`cotaPlatoM = null`) congela a cota no início do gesto e recalcula o equilíbrio ao soltar — o polígono
  não sobe e desce sozinho embaixo do mouse. Usar a SETA torna a cota explícita (como digitar no painel).
  Volta ao equilíbrio: apagar o campo no painel (como hoje) ou o botão "Equilíbrio" no selo do 3D. O
  rótulo mostra "45,70 m · equilíbrio" quando for o caso.
- **Platô inclinado** (ponto 3): o giro segue em torno do centro do anel (como hoje); mover um canto move
  o centro e o plano todo se ajusta — é o que a conta do orçamento faz, e o arraste MOSTRA isso ao vivo
  (terreno e selo de volumes). Não muda o modelo de dados.
- **Talude/muro por lado** (ponto 4): mover um canto (mesmo número de lados) mantém os lados. Redesenhar
  com OUTRO número de lados zera `taludePorAresta` para o padrão e o painel avisa "Os muros e taludes por
  lado voltaram ao padrão (o contorno mudou de N para M lados)".
- **Ctrl+Z da casa** (ponto 5): o RESTAURAR do platô anterior só age se a base ainda for `'CASA'`; se o
  usuário já passou para Desenhado (ou outra), desfazer a casa não mexe no platô. O desenho, guardado em
  coluna própria, nunca é apagado por esse caminho.
- **Muros no 3D** (ponto 6): já são desenhados (`extrasDoRelevo.muros`). Com a superfície de projeto à
  vista eles continuam do platô ao terreno natural (fora do muro o terreno não é tocado) e são refeitos
  junto no arraste (`murosDeArrimo3d`, barato).
- Seta com passo de 5 cm (o campo do painel já usa 0,05).
- **Degradação ao vivo:** se a superfície de projeto + curvas passar de ~33 ms (um quadro a 30 fps) no
  terreno do estudo, durante o arraste usa uma grade 2× mais rala e refaz a cheia ao soltar. A medição
  vai no plano antes de prometer "ao vivo" sempre.
- Mudar o anel ou a cota no 3D escreve no mesmo hook do painel (o campo da cota mostra o valor novo).

## O que fica para quem constrói

- Onde exatamente mora o botão da ferramenta "Platô" na faixa e o ícone.
- O desenho do selo de volumes (seguir o guia de UI; números com `tabular-nums`).
- A chave de memo da superfície de projeto (anel + cota + parâmetros + inclinação + versão da topografia).
- Testes: puro primeiro (grade de projeto, ferramenta de polígono fechando, arrastes), harness do 3D com
  portão por imagem, prova logada em produção no fim.

## Plano (fases, 1 PR cada)

- [ ] P0 — Medir: `cotaDeProjeto` em todos os nós + `gerarCurvasNosNiveis` a 10/40/160 mil nós (decide a
  degradação). Pronto quando: números no plano.
- [ ] P1 — Migration (`'DESENHADO'` + `anel_desenhado`) + hook (`definirAnelDesenhado`, ramo do `premissa`,
  trava do RESTAURAR da casa, zerar talude por lado ao mudar o número de lados) + painel ("Desenhado",
  "Editar contorno", aviso dos lados) + ferramenta "Platô" na planta. Pronto quando: teste do hook grava base/anel; teste do
  canvas fecha o polígono; migration aplicada pelo usuário e conferida no banco.
- [ ] P2 — 3D com a superfície de projeto (relevo + curvas) e o selo de volumes. Pronto quando: harness
  mostra o platô "escavado" com talude e curvas contornando; o selo bate com o painel.
- [ ] P3 — Edição no 3D (polígono azul, alças, seta, ao vivo, grava ao soltar, Esc). Pronto quando: portão
  do harness arrasta um canto e a seta e o terreno muda; um save por gesto; prova logada em produção.

## Estado

- Revisão do desenho por um construtor (25/11): 6 pontos, todos decididos acima ("Minhas decisões").
- Desenho e plano de execução aprovados pelo usuário em 25/11 ("aprovado"; execução: "Recomendo fazer eu
  mesmo. De acordo").
- [x] P0 — `gradeDeProjeto` (5 testes) e medição (25/11, Vitest no Windows, terreno senoidal, níveis de 1 m):

  | nós | lados | passo | grade | curvas | malha | total |
  |---|---|---|---|---|---|---|
  | 10 mil | 12 | 1 | 4 | 15 | 1 | 20 ms |
  | 40 mil | 4 | 1 | 7 | 48 | 1 | 57 ms |
  | 40 mil | 12 | 1 | 14 | 45 | 1 | 59 ms |
  | 40 mil | 12 | 2 | 3 | 20 | 1 | 24 ms |
  | 160 mil | 4 | 1 | 30 | 283 | 1 | 315 ms |
  | 160 mil | 4 | 2 | 7 | 81 | 1 | 89 ms |

  O gargalo são as CURVAS, não a grade. **Decisão da prévia:** passo = menor inteiro que deixa a grade com
  até ~12 mil nós (`ceil(√(nós / 12 000))`): 10 mil → 1, 40 mil → 2, 160 mil → 4. Ao soltar, grade cheia.
- [x] P1 (código) — Tarefas 1–4: migration `aplicar_20271125100000` + tipos/serviço; hook (`definirAnelDesenhado`,
  `anel_desenhado` sempre gravado, aviso dos lados, restaurar da casa só com base CASA; na leitura com base
  DESENHADO o `anelPlato` fica `null` — senão "Sob a casa" aparecia pelo desenho); painel ("Desenhado",
  "Desenhar platô", "Editar contorno", aviso); ferramenta `plato` na planta (fecha no 1º canto ou duplo clique,
  trava 90°, < 3 distintos não grava). Testes: hook 6 + casa 5, painel 4 (+7 da fase 2), canvas 4; suíte dos
  64 arquivos afetados 693/693; `tsc` 0. Na tela (harness `topografia?desenhar=1`): o contorno desenhado vira
  o platô e o corte/aterro do 2D segue a forma. ⏳ Migration aplicada pelo usuário ANTES do merge.
- [x] P2 — terreno de projeto no 3D: com a Terraplenagem à vista o relevo e as curvas são os da superfície depois
  da obra (`gradeDeProjeto` + `gerarCurvasNosNiveis` nos níveis/mestras da versão), em qualquer estilo; selo
  embaixo à direita com corte/aterro/saldo (`saldoDoPlato`, os números do painel), botão "Equilíbrio" e aviso
  de platô fora do relevo. Prova: harness `terreno-grande-3d?plato=1` (platô escavado, curvas contornando) e o
  hover sobre a superfície de projeto (1281/0). Testes `saldoDoPlato` (2).
- [x] P3 — editar no 3D: polígono azul translúcido, alça por canto (trava 90°, Shift libera), seta da cota
  (passo 5 cm), rótulo "882,20 m" (+ "· equilíbrio"); prévia 1 por quadro com grade rala; um confirmar por gesto;
  Esc desfaz; contorno que se cruza é recusado com aviso. Puros `utils/blueprintPlato3d.ts` (5 testes). Portão
  `docs/spikes/terreno-grande-3d/plato.mjs` ✅: canto muda o anel (1 confirmar), Esc não muda nada e a câmera
  não gira, seta sobe a cota (866 → 882,20; aterro com talude). Dois defeitos que só o portão pegou: alças
  invisíveis (pequenas e brancas) e a órbita girando junto (desligar NO aperto, e após Esc só no pointerup).
  Suíte 67 arquivos 718/718; `tsc` 0.
- [x] Revisão do branch inteiro (revisor novo, 25/11): 2 críticos + 2 importantes corrigidos, cada um com teste
  vermelho → verde: (1) a SETA realimentava a própria posição — a cota da prévia ia e voltava e gravava ~metade
  (portão `plato.mjs` agora exige prévia monotônica; altura do grupo da seta congelada no gesto); (2) o serviço
  quebrava sem a coluna nova — agora repete sem `anel_desenhado` em 42703, a ordem deploy × migration não importa
  mais; (3) a planta gravava contorno que se cruza — recusa com aviso; (4) a prévia rodava a conta cheia, o
  equilíbrio e as curvas desligadas a cada quadro — agora conta rala só para o selo, equilíbrio parado, curvas só
  se visíveis (40 mil nós: 39 → 25 ms por quadro). Suíte 68 arquivos 726/726; `tsc` 0.
- ⏳ Menores da revisão, deixados para depois (cada um com o efeito para quem usa):
  1. Prévia presa se o 3D sair de cena no meio do gesto (camada Terreno oculta, troca de aba) — vale até o próximo
     gesto.
  2. O polígono azul não acompanha uma mudança de INCLINAÇÃO feita com o 3D aberto (as alças acompanham).
  3. Arrastando um canto em equilíbrio, o selo perde "equilíbrio" no gesto e o saldo pula ao soltar.
  4. Usar a seta a partir do equilíbrio grava uma cota fixa (sai do equilíbrio) — esperado, mas sem aviso.
  5. Na grade rala da prévia, a última linha/coluna some quando (n − 1) não divide o passo: o terreno encolhe um
     pouco durante o arraste.
  6. "Parte do platô fora do relevo" só olha os cantos (um lado que cruza um buraco do levantamento não avisa).
  7. Com superfície de projeto e anel da versão < 3 pontos, as curvas do terreno natural assentam na malha de projeto.
  8. Duplo clique com menos de 3 cantos distintos encerra o desenho sem dizer por quê.
  9. `pointercancel` no meio do gesto: a órbita só volta no próximo `pointerup`.
- ⏳ Falta: migration aplicada pelo usuário → merge → prova logada em produção.
- Fora (anotado): o "percorrer" a pé ainda anda no terreno natural, não no de projeto.

---

# Plano de execução (desenho aprovado em 25/11/2026)

> Execução: tarefa por tarefa, teste antes do código. Cada fase (P0–P3) = 1 PR, merge com TODOS os jobs
> verdes, `conferir-producao` depois.

**Objetivo:** platô de forma livre (base `DESENHADO`) desenhado na planta e ajustado no 3D, com o terreno
de projeto, as curvas e o saldo de volume refeitos ao vivo.

**Arquitetura:** a superfície de projeto é uma `GradeDeElevacao` nova (`gradeDeProjeto`, pura, sobre a
`cotaDeProjeto` que já existe) e passa pelo MESMO caminho do terreno natural (`malhaDaGrade`,
`gerarCurvasNosNiveis`, `curvasDeNivel3d`). A edição no 3D não grava durante o gesto: o viewer manda uma
PRÉVIA (anel + cota) ao editor, que a usa no lugar do platô gravado nos memos; ao soltar, o editor chama
os setters do hook (um save).

**Base:** React + three/R3F/drei (já instalados), Vitest, Supabase (migration aplicada pelo usuário).

## Restrições globais

- Um platô por estudo; `base IN ('ENVELOPE','LOTE','CASA','DESENHADO')`; desenho em `anel_desenhado`
  (JSONB, ≥ 3 pontos), mm inteiros do desenho.
- Sem dependência nova; sem `db push`; migration aplicada à mão pelo usuário.
- Passo da seta: 5 cm. Cota no rótulo: `formatarCotaM` + " m".
- Um `save` por gesto (ao soltar). Esc cancela o gesto e volta ao de antes.
- Português em tudo que aparece na tela; botão desligado diz o motivo (`title`).

## Foco de revisão (entradas que os testes das tarefas precisam cobrir)

1. Arrastar um canto até o anel se CRUZAR (gravata) → o soltar é recusado, volta ao anel anterior e avisa
   "O contorno não pode se cruzar" (Tarefa 6: `anelValido`).
2. Fechar o desenho com menos de 3 pontos distintos (cliques repetidos) → não grava (Tarefa 4).
3. Migration ainda não aplicada → gravar `DESENHADO` falha; o painel mostra o motivo
   (`persistenciaIndisponivel`) e a tela não quebra (Tarefa 2).
4. Platô com canto fora do relevo → a superfície de projeto fica `null` ali (sem degrau a zero) e o selo
   avisa "Parte do platô fora do relevo" (Tarefas 0 e 5).
5. Terreno grande (> 40 mil nós) → durante o arraste usa grade rala; ao soltar, cheia — sem congelar
   (Tarefas 0 e 6).

---

### Tarefa 0 (P0): `gradeDeProjeto` + medição

**Arquivos:** `utils/blueprintTopografiaAnalises.ts` (nova função) · teste
`__tests__/blueprintGradeDeProjeto.test.ts` (novo).

**Produz:** `gradeDeProjeto(grade: GradeDeElevacao, anel: Point[], cotaPlatoM: number, parametros:
ParametrosDeTerraplenagem, inclinacao: InclinacaoDoPlato | null, passo = 1): GradeDeElevacao` — mesma
`origem`; com `passo > 1`, grade rala (`espacamentoMm × passo`, nós `0, passo, …`); cota de cada nó =
`cotaDeProjeto(...)(nó)`; nó sem cota natural → `null`.

- [ ] Teste: nó dentro do anel = cota do platô; nó além do talude = cota natural; nó sem dado → `null`;
  `passo = 2` devolve `ceil(n/2)` colunas com as mesmas cotas nos nós coincidentes;
  `volumeEntreSuperficies(natural, projeto)` com corte e aterro no mesmo sentido de `terraplenagemComTalude`.
- [ ] Rodar → falha. Implementar. Rodar → passa.
- [ ] Medir (teste temporário com `performance.now()`, apagado depois): `gradeDeProjeto` +
  `gerarCurvasNosNiveis` + `malhaDaGrade` a 10, 40 e 160 mil nós, anel de 4 e de 12 lados. Anotar no
  Estado e decidir o `passo` da prévia (1 se ≤ 33 ms a 40 mil nós; senão o menor que caiba).
- [ ] Commit `feat(planta): superfície de projeto da terraplenagem como grade (P0)`.

### Tarefa 1 (P1): migration + tipos + serviço

**Arquivos:** `supabase/migrations/aplicar_20271125100000_terraplenagem_plato_desenhado.sql` (novo, no
molde de `aplicar_20271018310000_terraplenagem_base_casa.sql`: BEGIN; `ADD COLUMN IF NOT EXISTS
anel_desenhado JSONB` + COMMENT; CHECK `anel_desenhado IS NULL OR (array e ≥ 3)`; recria
`blueprint_study_terraplenagem_base_check` com `'DESENHADO'`; COMMIT) · `types/blueprint.ts`
(`BlueprintTerraplenagemRow.anel_desenhado`, `base` com `'DESENHADO'`) ·
`services/blueprintTerraplenagemService.ts` (`COLS` e `PremissaDeTerraplenagem` com `anel_desenhado`).

- [ ] Conferir o prefixo listando TODOS os nomes (`ls supabase/migrations | sort`), não só o fim.
- [ ] `npx vitest run __tests__/segurancaMigrations.test.ts` e os testes que importam o serviço → passam.
- [ ] Usuário aplica (`npx supabase db query --linked -f <arquivo>`, da frente); eu confiro no banco: o
  CHECK de `base` lista `DESENHADO` e a coluna existe.

### Tarefa 2 (P1): hook `useBlueprintTerraplenagem`

**Arquivo:** `hooks/useBlueprintTerraplenagem.ts` · teste
`__tests__/components/useBlueprintTerraplenagemDesenhado.test.tsx` (novo, molde do `...Casa.test.tsx`).

**Produz:** `BaseDoPlato` com `'DESENHADO'`; em `Terraplenagem`: `anelDesenhado: Point[] | null`;
`definirAnelDesenhado(anel: Point[]): void` (arredonda a mm, base → `DESENHADO`, persiste; se o número de
lados mudou em relação ao desenho anterior, zera `parametros.taludePorAresta` e liga
`avisoDosLados: { de: number; para: number } | null`); `esquecerAvisoDosLados(): void`. `premissa(...)`:
`anel_desenhado` = o desenho (sempre); `anel_plato` = desenho se `DESENHADO`, casa se `CASA`, anel em uso
senão. `restaurarPlato` só age se a base atual for `'CASA'`.

- [ ] Testes: (a) `definirAnelDesenhado` grava `base: 'DESENHADO'` com `anel_desenhado` = `anel_plato`;
  (b) trocar para `LOTE` e voltar a `DESENHADO` mantém o desenho; (c) redesenhar 4 → 5 lados zera
  `talude_por_aresta` e expõe `avisoDosLados {de: 4, para: 5}`; mesmo número de lados mantém;
  (d) com base `DESENHADO`, `restaurarPlato(...)` não muda nada; (e) `save` rejeitando (migration ausente)
  → `persistenciaIndisponivel` verdadeiro e estado local intacto.
- [ ] Falha → implementar → passa; `useBlueprintTerraplenagemCasa.test.tsx` continua verde.

### Tarefa 3 (P1): editor + painel

**Arquivos:** `components/blueprint/BlueprintEditor.tsx` (`anelDoPlato`: ramo `DESENHADO` →
`terraplenagem.anelDesenhado`; repassar ao painel) · `components/blueprint/PainelTopografia.tsx`
(`SecaoTerraplenagem`: botão "Desenhado" só com `anelDesenhado`; "Desenhar platô" → ferramenta `plato`;
"Editar contorno" → `definirAnelDesenhado(anelEmUso)`, desligado sem anel em uso, com o motivo; aviso "Os
muros e taludes por lado voltaram ao padrão (o contorno mudou de N para M lados)" com "Entendi" →
`esquecerAvisoDosLados`) · teste `__tests__/components/PainelTopografiaPlatoDesenhado.test.tsx`.

- [ ] Testes: sem desenho não há "Desenhado"; "Editar contorno" chama `onEditarContorno`; "Desenhar
  platô" chama `onDesenharPlato`; o aviso mostra N e M e some no "Entendi".
- [ ] Falha → implementar → passa. `bash scripts/check-ui-standard.sh` nos `.tsx` tocados.

### Tarefa 4 (P1): ferramenta "Platô" na planta

**Arquivos:** `hooks/useBlueprintEditor.ts` (`Tool` += `'plato'`) · `BlueprintCanvas.tsx` (o caminho de
`perfil`/`drenagem` em mover/clique/duplo clique/prévia/cursor; FECHA ao clicar no 1º vértice ou no duplo
clique; prop `onPlatoDesenhado?: (anel: Point[]) => void`; descarta < 3 pontos distintos; prévia azul
`#2563eb`) · `BlueprintEditor.tsx` (handler → `definirAnelDesenhado`, `setMostrarTerraplenagem(true)`,
`editor.setTool('selecionar')`) · teste `__tests__/components/BlueprintCanvasPlato.test.tsx` (molde
`BlueprintCanvasCurvaSobOMouse.test.tsx`).

- [ ] Testes: 4 cliques + clique no 1º → 4 pontos; 3 cliques + duplo clique → 3 pontos; cliques repetidos
  (2 distintos) + duplo clique → não chama; trava 90° ligada por padrão, Shift libera.
- [ ] Falha → implementar → passa. **PR P1 (Tarefas 1–4).** Prova no harness `topografia`: desenhar e o
  corte/aterro do 2D seguir o desenho.

### Tarefa 5 (P2): terreno de projeto e selo no 3D

**Arquivos:** `BlueprintEditor.tsx` (memo `superficieDeProjeto3d` quando `mostrarTerraplenagem &&
terrenoAVista && anelDoPlato && cotaDoPlatoM !== null`: `gradeDeProjeto(...)`; `relevo3d` =
`malhaDaGrade(gradeProjeto)`; curvas do 3D = `gerarCurvasNosNiveis(gradeProjeto, v.anel, níveis da
versão, mestra da versão)` assentadas com `amostradorDaMalha(gradeProjeto)`; `relevoChave`/`extrasChave`
com a chave do platô) · `Blueprint3DViewer.tsx` + `Blueprint3DTab.tsx` (prop `saldoDoPlato?: { corteM3:
number; aterroM3: number; saldoM3: number; equilibrio: boolean; foraDoRelevo: boolean } | null` → selo
embaixo à direita; `onEquilibrio?: () => void` → botão "Equilíbrio", desligado com motivo quando já está) ·
harness `docs/spikes/terreno-grande-3d/main.tsx` (`?plato=1`: um platô fixo).

- [ ] Teste puro: `saldoDoPlato(calc: TerraplenagemComTalude, foraDoRelevo: boolean, equilibrio: boolean)`
  em `utils/blueprintTopografiaAnalises.ts` devolve `corteTotalM3`, `aterroTotalM3`, `saldoEmBancoM3`.
- [ ] Portão por imagem no harness: com `?plato=1` o relevo muda dentro do anel e o selo mostra os números.
- [ ] **PR P2.**

### Tarefa 6 (P3): editar no 3D

**Arquivos:** `utils/blueprintPlato3d.ts` (novo, puro) · `Blueprint3DViewer.tsx`, `Blueprint3DTab.tsx`,
`BlueprintEditor.tsx` · testes `__tests__/blueprintPlato3d.test.ts` + portão
`docs/spikes/terreno-grande-3d/plato.mjs`.

**Produz (puro):** `moverCanto(anel: Point[], i: number, destino: Point, orto: boolean): Point[]`
(orto = trava no eixo do vizinho mais próximo, como `travarOrtogonal`); `anelValido(anel: Point[]): boolean`
(`isSimplePolygon` + ≥ 3 distintos); `cotaDaSeta(cotaInicialM: number, dyMundoM: number): number`
(arredonda a 0,05 m).

**Produz (viewer):** prop `platoEditavel?: { anel: Point[]; cotaM: number; cotaZeroM: number; equilibrio:
boolean; cotaEm: (p: Point) => number; onPrevia: (p: { anel: Point[]; cotaM: number } | null) => void;
onConfirmar: (p: { anel: Point[]; cotaM: number | null }) => void } | null` — polígono azul translúcido
(`#2563eb`, opacidade 0,35, `DoubleSide`, sem raycast) seguindo `cotaEm`; alça (esfera) por canto, arraste
no plano horizontal da cota (padrão `ArrastarNoPiso`); `PivotControls` só Y no centróide (`onDrag` →
`onPrevia` com `cotaDaSeta`); rótulo `RotuloDeRede` com `posicaoViva` ("45,70 m", + " · equilíbrio");
`onPrevia` no máximo 1 por quadro; soltar → `onConfirmar` (cota `null` se era equilíbrio e só o canto
mexeu); Esc → `onPrevia(null)`.

**Editor:** `previaDoPlato` substitui anel/cota nos memos (`anelDoPlato`, `cotaDoPlatoM`) enquanto existe,
com a grade rala da Tarefa 0 se a medição pediu; `onConfirmar` → `definirAnelDesenhado` + `setCotaPlatoM`
e limpa a prévia; anel inválido → recusa com o aviso do Foco 1.

- [ ] Testes puros: `moverCanto` move só o i-ésimo; orto alinha ao vizinho; `anelValido` recusa gravata
  e < 3 distintos; `cotaDaSeta` arredonda a 5 cm.
- [ ] Portão `plato.mjs` (Playwright, padrão `hover.mjs`): arrastar um canto e a seta muda os pixels do
  relevo; espião no harness conta 1 `onConfirmar` por gesto; Esc volta à imagem de antes.
- [ ] **PR P3.** Prova logada em produção: desenhar, abrir o 3D, arrastar, conferir o selo × o painel.
