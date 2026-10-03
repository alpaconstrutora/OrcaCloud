# Pendências do Estudo de Massa — lacunas, opcionais e defeitos achados no caminho

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026, depois de o roadmap M1–M6 do
`2026-10-01-estudo-de-massa.md` fechar. Pergunta do usuário: *"O que falta implementar do plano e pendências ?"* —
respondida com a lista abaixo (lacunas do plano, opcionais, defeitos de outras áreas registrados e não corrigidos).
Pedido, literal:

> Corrigir todos na ordem que você achar melhor

## Ordem escolhida (e por quê)

Primeiro o que entrega número errado ao usuário sem aviso, depois o que quebra edição, depois o que completa o
ciclo, por último os opcionais de conveniência e o maior de todos.

1. [x] **CUB no Estimador e no CNO** — número errado em silêncio.
2. [x] **`RemoveLevel` com loteamento e grupos** (+ desagrupar apagando as cópias, achado ao investigar).
3. [x] **Vagas reais na garagem/subsolo** a partir do estudo de massa.
4. [x] **Outorga onerosa**: "CA máximo com outorga" como campo da zona, e o estudo mostra o potencial adicional.
5. [x] **Abrir na aba Terreno** — o estudo de massa (ver registro: não há item de menu "Estudo de Massa" desde a M1).
6. [x] **Bloco em L, U, T ou H** no pavimento tipo e na planta das unidades.

## 1. CUB no Estimador e no CNO (03/10/2026)

**O defeito.** `cub_parametric_data` grava as colunas `pp_4_n`, `csl_8_n`, `cal_8_a`… O `parametricService` montava
o nome pela chave do padrão ("PP-N" → `pp_n`, "CSL8-N" → `csl8_n`): para PP-*, CSL* e CAL* a coluna não existia. Nas
quatro leituras: o orçamento paramétrico saía vazio; o total caía no valor estimado; o histórico e a comparação
regional pediam a coluna no `select` e levavam 400 do PostgREST (tela vazia). Tudo em silêncio.

**Achado ao investigar — a simulação de INSS do CNO nunca leu o CUB:** o formulário manda `com_desoneracao` e o mês
como `AAAA-MM`; o banco grava "Com Desoneração" e `MM/AAAA`; e há 5 linhas por (UF, mês, encargos) — uma por natureza
e a "Total" —, então o `maybeSingle()` falharia mesmo casando. A conta usava SEMPRE os R$ 2.500 fixos.

**O que mudou.**
- `services/cubService.ts`: `colunaDoPadraoCub` (o mapa explícito que já existia, `COLUNA_DO_PADRAO_CUB`, agora a
  fonte de todos os leitores), `mesDe` aceita os dois formatos, `encargosDoCub`, `linhaDoMesOuAnterior` (a tabela é
  esparsa: o mês pedido, senão o anterior mais recente, senão o mais recente).
- `services/parametricService.ts`: as quatro leituras pela coluna certa; padrão desconhecido = sem tabela (nunca nome
  montado).
- `services/cnoService.ts` + `components/OpuraCnoModule.tsx`: lê a "Total" da UF com os encargos certos e o mês pedido
  ou anterior; o resultado diz de onde veio ("tabela 01/2025 · Com Desoneração" ou "estimativa fixa").

**Pronto quando** (feito): `__tests__/cubColunaDoPadrao.test.ts` (7) — todo padrão do app tem coluna e ela existe no
banco; orçamento, total, histórico e regional com PP/CSL/CAL leem a tabela; CNO com `com_desoneracao` + `AAAA-MM` lê
a "Total" do mês anterior e diz qual; UF sem tabela diz "estimativa fixa". **5 dos 7 falham sem a correção.**

## 2. `RemoveLevel` com loteamento e grupos; desagrupar (03/10/2026)

**Os defeitos (reproduzidos antes de corrigir).**
- Remover um pavimento com quadra/lote/via/área pública era RECUSADO: "Quadra qdr_0001: pavimento inexistente".
- O mesmo com a origem ou uma instância de grupo (E2.3) no pavimento: "Grupo …: pavimento inexistente".
- **Achado ao investigar:** "Desagrupar (as cópias ficam)" APAGAVA as cópias quando havia outro grupo no modelo (4
  paredes → 3) — a sincronização da cauda as via como órfãs. O pavimento tipo da massa (M6b+) nasce com vários grupos:
  desagrupar um apagaria as unidades iguais dele.

**O que mudou** (`utils/blueprintKernel/commands.ts`; formato do payload igual, sem bump).
- `RemoveLevel` leva quadras, lotes, vias e áreas públicas do piso; lote de outro piso que apontava para quadra dali
  fica sem quadra (como `DeleteQuadra`).
- Grupo com a ORIGEM no piso some e as cópias dele nos outros pisos ficam LIVRES; instância no piso sai do grupo.
- O conjunto das cópias conhecidas no comando ficou mutável: desagrupar e a origem que some LIBERAM as cópias.
- Bundle da `planta-api` regerado (mesmo kernel na API).

**Pronto quando** (feito): `__tests__/blueprintRemoveLevelLoteamentoEGrupos.test.ts` (6) — loteamento sai e lote de
outro piso perde a quadra; origem no piso → cópias livres e editáveis; instância no piso sai; desagrupar com outro
grupo mantém as cópias livres e o outro grupo intacto; excluir com cópias apaga só as dele.

## 3. Vagas reais na garagem (03/10/2026)

**A lacuna.** A M6 previa "vagas reais via `planejarVagas` no bloco garagem"; o estudo só CONTAVA as vagas (M2,
`vagasQueCabem`, num modelo provisório).

**O que entrou.**
- `utils/blueprintGaragemDaMassa.ts` (puro): `lancarGaragem(model, bloco)` — um pavimento por pavimento do bloco de
  GARAGEM ("1º subsolo" o mais perto do solo, "térreo (garagem)", "Nº pav (garagem)"), com as 4 paredes do contorno e as
  vagas do lançador da E2.5 CONFIRMADAS (PCD e idoso nos mínimos, numeradas `S1-12`). Bloco girado: planejado no quadro
  alinhado ao lado mais longo (o mesmo da contagem da M2 — o número lançado é o contado) e devolvido por rotação rígida.
  Uid determinístico por pavimento: não lança duas vezes. Fora, dito na mensagem: pilares, rampa e acesso (o número é o
  teto; a gaveta de Vagas refaz contornando os pilares).
- Painel do bloco: com uso Garagem, a seção "Garagem" com "Lançar as vagas" (e o pavimento tipo não aparece — garagem
  não tem); depois "Vagas já lançadas em N pavimento(s)", botão desligado com o motivo.

**Pronto quando** (feito):

| Portão | Resultado |
|---|---|
| `__tests__/blueprintGaragemDaMassa.test.ts` (4) | 2 subsolos em −6 e −3 m com 4 paredes; vagas = as da M2, confirmadas, com PCD e idoso, todas dentro do contorno, `S1-…`; a lista de uma vez dá o mesmo modelo; lançar de novo recusado; bloco não-garagem recusado; girado 30° dá o mesmo número, dentro do contorno girado |
| Teste de editor "estudo de massa (garagem)" | o painel oferece; lançar → "Vagas lançadas: 2n em 2 pavimento(s) (2º subsolo: n; 1º subsolo: n)"; depois "já lançadas" e o botão desligado |

## Prova dos itens 1–3 (03/10/2026)

| Portão | Resultado |
|---|---|
| `tsc` · `check-ui-standard` (OpuraCnoModule, PainelBlocoSelecionado, BlueprintEditor) · org guard · XSS | 0 · 0 violações · ok · ok |
| Suíte cheia (JSON, `pending` = 0) | 680/680 arquivos · 7.097 testes = 7.063 ok + 34 pulados · 0 falhas. ⚠️ Uma rodada anterior acusou "list.sort is not a function" no teste da M6b: foi a suíte rodando ENQUANTO eu alterava arquivos da frente; com o código parado não voltou. E o contador aceitava `pending` (117 testes não rodados numa rodada com worker caído) — corrigido para exigir `pending = 0` |
| Build | ok |
| App real (logado, RLS de verdade) — CUB | comparação regional PP-N 01/2025: MG 2.535,68 · RJ 2.472,57 · SC 2.392 · SP 2.254 · ES 2.106,80 (antes: 400 e vazio); total PP-N MG 100 m² = R$ 253.568 (tabela, não estimado); orçamento CSL8-N com as 4 naturezas; histórico CAL8-N com 13 meses; **CNO com o formulário padrão (MG, "2026-02", sem desoneração): CUB R$ 3.027,37, "tabela 01/2026 · Sem Desoneração"** (antes: 2.500 fixos) |
| App real — garagem (estudo descartável "ZZ TESTE … prova garagem", 30 × 40 m, 2 subsolos) | o painel oferece (sem o pavimento tipo); lançar → "90 em 2 pavimento(s) (2º subsolo: 45; 1º subsolo: 45) — 1 PCD e 3 idoso"; depois "já lançadas", botão desligado; **no banco**: os 2 pavimentos em −6 e −3 m, 4 paredes e 45 vagas confirmadas cada; 0 erros. No desenho: fileiras com circulação, PCD/idoso no começo, `S1-1…45` |
| Limpeza | estudo apagado pelo id + `name LIKE 'ZZ TESTE%'`; estudos 73 · ramos 73 · produtos 0 · entornos 0 · ZZ 0, iguais aos de antes |

## 4. Outorga onerosa (03/10/2026)

**A lacuna.** As duas tabelas da zona (`empreendimento_regulatory_zones`, `regulatory_map_zones`) têm `ca_basico` e
`ca_maximo`; o editor só lia o máximo. A outorga é a faixa entre os dois.

**O que entrou.**
- Migration `aplicar_20271003000010_blueprint_urban_context_ca_basico.sql` (APLICADA e conferida em
  `information_schema`): `blueprint_study_urban_context.coeficiente_basico numeric`. Só uma coluna — sem policy nem
  função (REGRA #7 não se aplica).
- `utils/blueprintZonaUrbanistica.ts`: `ca_basico` lido em `ValoresDaZona.coeficienteBasico` (campo
  `coeficiente_basico`, "coeficiente básico (sem outorga)"); texto ilegível vai para os não aplicados; mudar na zona é
  deriva (ajustado à mão, não).
- `hooks/useBlueprintZonaUrbanistica.ts`: carrega, aplica e grava o básico; `ajustarCoeficienteBasico` marca MANUAL.
- `utils/blueprintMassa.ts`: `MedidaDaMassa.outorga = { caBasico, basicoM2, maximoM2, sujeitaM2 }` — a computável acima
  de lote × CA básico; `null` sem básico ou sem lote. O VALOR da outorga (fórmula municipal) continua fora, como o plano
  original registrou; aqui a área, que é o que a fórmula pede.
- Painel do lote (Terreno): linha "Coeficiente básico (sem outorga)" — passar dele é ÂMBAR (aviso), não vermelho — e
  "Acima do básico, a área depende de outorga onerosa". Gaveta do estudo de massa: cartão "Sujeita a outorga".
- **Achado e corrigido junto:** o painel do lote ainda dizia "Um nível desenhado: o coeficiente ainda não soma
  pavimentos" — FALSO desde a M1, que passou o aproveitamento a somar todos os pavimentos e a massa
  (`aproveitamentoDoEstudo`). Agora diz o que a conta faz.

**Pronto quando** (feito): `__tests__/blueprintOutorgaDaMassa.test.ts` (5) — lê o básico ao lado do máximo; ilegível é
dito; deriva só do que veio da zona; 6 pav × 600 m² em 1.200 m² com básico 2 → 2.400 de direito e 1.200 sujeitos;
dentro do básico, 0; acima do máximo o CA acusa; sem básico, `null`. `__tests__/components/PainelTerrenoOutorga.test.tsx`
(2) — âmbar e o aviso acima do básico, sem o texto falso; digitar o básico chama o ajuste.

## 5. O estudo de massa abre no Terreno (03/10/2026)

**O que o item era.** O plano da M1 previa "ao abrir a Planta Inteligente pelo item 'Estudo de Massa', a aba preferida
é Terreno". Mas a M1 decidiu NÃO criar esse item de menu (um módulo, um item) — então não há de onde vir a preferência.
O equivalente útil: o ESTUDO DE MASSA em fase inicial (tem blocos e nenhuma parede) abre na aba Terreno, onde mora o
grupo Massa — abrir em Arquitetura escondia tudo.

**O que entrou.** `BlueprintEditor`: uma vez por abertura do ramo, na planta, se o modelo tem blocos e nenhuma parede,
a aba vai para Terreno; depois manda a escolha da pessoa (salva como sempre).

**Pronto quando** (feito): teste de editor "estudo de massa abre no Terreno" — só blocos → Terreno; escolher outra aba
vale; com uma parede → a aba salva (Arquitetura).

## Prova dos itens 4–5 (03/10/2026)

| Portão | Resultado |
|---|---|
| `tsc` · `check-ui-standard` (PainelTerreno, PainelEstudoDeMassa, BlueprintEditor) · org guard · XSS | 0 · 0 violações · ok · ok |
| Suíte cheia (JSON, `pending` = 0) | 682/682 arquivos · 7.105 testes = 7.071 ok + 34 pulados · 0 falhas |
| Build | ok |
| App real (estudo descartável "ZZ TESTE … prova outorga": lote 40 × 60, torre 30 × 16 × 10, nenhuma parede; a aba salva no navegador forçada para Arquitetura antes) | 5/5: **abriu na aba Terreno**; no painel do lote, CA básico 1,5 e máximo 3 digitados → "Acima do básico, a área depende de outorga onerosa" e sem o texto falso; **no banco** `coeficiente_basico` 1,5, `coeficiente_max` 3, origem MANUAL; a gaveta: "Sujeita a outorga 1.200,00 m² · acima do CA básico 1,50 (3.600,00 m² de direito)"; 0 erros |
| Limpeza | estudo apagado (o contexto urbano vai junto); estudos 73 · ramos 73 · contextos 1 · ZZ 0, iguais aos de antes |

## 6. Bloco em L, U, T ou H (03/10/2026)

**A lacuna.** A M6a dividia só bloco retangular ("divida L, U e H em blocos retangulares"), e a M6b gerava a planta no
quadro do BLOCO retangular.

**O que entrou.**
- `utils/blueprintPavimentoOrtogonal.ts` (puro), para contorno ORTOGONAL (lados em dois eixos perpendiculares):
  - grade das linhas dos vértices → célula com vizinho nos dois eixos é NÓ, as outras formam as ASAS; junção que não
    é retângulo é recusada com o motivo; contorno fora de dois eixos (trapézio) também;
  - um corredor por asa (central se cabem duas unidades + corredor; senão lateral, do lado de dentro), avançando no
    nó até cruzar os das outras asas;
  - núcleo no nó com mais asas, na parte livre SEM fachada (o canto de dentro do L), com escada, elevadores e o hall;
  - o resto são peças (faixas das asas e partes dos nós) encadeadas em CAMINHOS (preferindo seguir reto); a peça de
    canto é partida em reto-antes / dobra / reto-depois; cada cadeia recebe unidades (repartição pela capacidade com
    rebalanceamento) e é cortada pela área alvo — a dobra nunca é cortada, e a unidade de canto pode sair em L com duas
    fachadas; cadeia sem fachada nenhuma vira área comum; unidade fora de ±25 % do alvo é dita;
  - montagem: paredes pelas bordas entre regiões numa grade só (junções em T exatas), porta de cada região no trecho
    mais longo que encosta no corredor, unidades (E2.2), núcleo, cópias vivas — no formato da divisão retangular
    (esquema `ASAS`); `dividirPavimentoDoBloco` / `montarPavimentoTipoDoBloco` escolhem o caminho (editor e envio ao
    Empreendimento passam por eles).
- `utils/blueprintPlantaDaUnidade.ts` — a planta de cada unidade no QUADRO DELA (`quadroDaUnidade`: a fachada principal
  embaixo, quadro destro, para dentro; fachada parcial vale), para qualquer forma; o grupo das iguais pela composição
  dos dois quadros (`instanciaEntreUnidades`: giro de 90° entre asas, espelho X/Y, ou nada) com a conferência de
  precisão nos cantos (≤ 1,5 mm, `erroDaInstanciaMm`); as paredes internas sempre passam 3 mm do encontro; anel com
  agulha (bico de ~5 mm do bloco girado) é limpo; unidade em L fica aberta, dito.

**Achados no caminho (todos com teste).**
1. **O desempenho da planta num bloco grande**: a do H (24 unidades, 8 pavimentos) levava 22–40 s — ~690 comandos, e
   cada um refazia a cauda do kernel num modelo de 1.600 paredes. Três correções no KERNEL (o formato do payload não
   muda; goldens verdes):
   - **lote atômico**: `AddWalls`, `AddOpenings`, `PlaceSpaceLabels` — N peças num comando, uma cauda só (os corpos
     de `AddWall`/`AddOpening`/`PlaceSpaceLabel` extraídos e reusados; a recusa em pavimento cópia vale item por item);
   - **memória do arranjo**: o arranjo é função pura dos segmentos do nível — memorizado pela assinatura; a cópia viva
     reaproveita o do tipo;
   - **tocador do diff**: a sincronização tocava a lista de mudanças com `includes` (O(n²)) — agora com um conjunto.
   A planta do H caiu para ~2,4 s (26 comandos); no app real, a do L leva ~6 s com a aplicação no editor.
2. **Vitest × Node 24**: com a carga da planta do H, o worker do Vitest cai (falha de segmentação) — o mesmo script no
   Node direto roda limpo. A medição foi feita no Node; a suíte fecha.
3. **Grupo no H**: a cópia girada 90° ficava 0,5 mm fora (centro em meio milímetro) e as junções não fechavam ("8 de 11
   cômodos") — daí o avanço de 3 mm sempre e a conferência de precisão por igual (a que não fecha fica com planta
   própria, sem derrubar o grupo inteiro).

**Pronto quando** (feito):

| Portão | Resultado |
|---|---|
| `__tests__/blueprintPavimentoOrtogonal.test.ts` (13) | quadro ortogonal (girado dá o mesmo; trapézio não é); contorno da união em L; L, U, T e H: esquema `ASAS`, todas as unidades da M2 numeradas na ordem do produto, corredores numa rede só, núcleo encostado no corredor, unidade de canto, área média 85–130 % do alvo; degrau vira nó + asas; trapézio recusado com o motivo; montagem de L, H, L girado 30° e T girado 30°: cada unidade fecha o ambiente, porta para cada uma, circulação e núcleo nomeados, 6 cópias com as paredes; planta do L: 13 unidades, janelas só na fachada, cômodos fechados, grupos repetida e espelhada, lista de uma vez = o mesmo modelo, < 40 comandos; H: grupo GIRADO 90°, só a unidade em L fica aberta |
| `__tests__/blueprintKernelLoteAtomico.test.ts` (4) | o lote = os unitários em sequência (paredes, aberturas, ambientes, nomes, cópias); recusa em pavimento cópia item por item; lote vazio; a etiqueta do lote renomeia (não empilha); a memória do arranjo devolve o mesmo, com o id do pavimento pedido e objetos novos |
| `__tests__/blueprintPlantaDaUnidade.test.ts` (+3) | o quadro da unidade (fachada embaixo, asa vertical, em L e sem fachada abertas) e a instância entre quadros (repetida, 180°, espelho X, espelho Y, giro de 90°, girado 30° repetida; girado com espelho não dá) |
| Teste de editor "estudo de massa (bloco em L)" | o painel propõe "asas (L, U, T, H) … 13 unidade(s)"; montar; 13 sem planta; gerar → "Plantas geradas: 13 unidade(s)" com grupos; depois "todas já têm" |
| `tsc` · `check-ui-standard` · org guard · XSS | 0 · 0 violações · ok · ok |
| Suíte cheia (JSON, `pending` = 0) | 684/684 arquivos · 7.127 testes = 7.093 ok + 34 pulados · 0 falhas |
| Build · harness `docs/spikes/massa/medir.mjs` | ok · 41/41 |
| App real (estudo descartável "ZZ TESTE … prova bloco em L": lote 60 × 60, Torre L de asas de 16 m, 8 pav) | 7/7: o painel propõe o pavimento tipo em asas com 13 unidades; montar (0,5 s); gerar as plantas (6 s) → 13 unidades, 122 cômodos, 4 grupos; **no banco**: 13 unidades com todos os cômodos fechados (8 nos 2 dorm., 11 nos 3 dorm.), núcleo e circulação nomeados, 6 cópias com as paredes do tipo, 28 janelas todas na fachada; 0 erros. No desenho: as duas asas com unidades dos dois lados, o núcleo no canto de dentro do nó |
| Limpeza | estudo apagado; estudos 73 · ramos 73 · produtos 0 · contextos 1 · ZZ 0, iguais aos de antes |
