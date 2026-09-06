# IFC: guardar o modelo, e importar a estrutura para o desenho

## Pedido original

> como importar ifc?

E, à pergunta sobre qual das duas coisas fazer — **guardar** o IFC por
organização (para a equipe abrir o mesmo modelo e comparar revisões) ou
**importar** a geometria para dentro da Planta Inteligente:

> as duas

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-05. Continua
[[visualizador-ifc]], que abre o arquivo do disco e não guarda nada.

## A medida que decidiu o desenho da PARTE B

Antes de escolher como importar, medi **o que o modelo real do usuário
permite**. É a diferença entre importar com exatidão e importar aproximando:

| representação | quantos |
|---|---|
| `IfcExtrudedAreaSolid` (paramétrica, exata) | **393** |
| `IfcFacetedBrep` (malha) | 55 |

E os perfis das extrusões mapeiam quase um a um no kernel:

| IFC | quantos | vira |
|---|---|---|
| `IFCCOLUMN` + `IfcRectangleProfileDef` | 104 | `Structural` **PILAR** (PONTO, largura × profundidade, rotação) |
| `IFCBEAM` + `IfcRectangleProfileDef` | 200 | **VIGA** (LINHA, 2 pontos + largura) |
| `IFCPILE` + `IfcCircleProfileDef` | 85 | **ESTACA** (PONTO, `circular: true`) |
| `IFCSLAB` + `IfcArbitraryClosedProfileDef` | 10 | **LAJE** (AREA, polígono) |
| `IFCFOOTING` (Brep) | 46 | **nada — recusado** |

**A decisão que sai daí: importar a REPRESENTAÇÃO PARAMÉTRICA, nunca a malha.**

Ler a malha e deduzir "isto parece um pilar de 20×40" produziria número
plausível e errado — que é exatamente o que este projeto combate em toda parte
(`sobreposicao.ts`, a trava de unidade do orçamento, o `DEGENERATE_*` do
kernel). Um `IfcRectangleProfileDef` diz `XDim` e `YDim`: é a medida do
calculista, não uma estimativa.

O que não é extrusão **é recusado e RELATADO**, elemento por elemento, com o
motivo. 46 sapatas não entram — e o usuário sabe quais, em vez de descobrir uma
fundação a menos no orçamento.

## Parte A — Guardar o modelo

### A.1 `digital_files`, o nome que o PRD já decidiu

[[bim-lab-spike]] adotou **Objeto Digital** (`digital_files` → `digital_objects`
→ `digital_object_links`) em vez de uma tabela acoplada a IFC, para poder ligar
DWG, PDF, fotos 360° e nuvens de ponto sem refatorar. Uso o nome desde já; só a
primeira tabela nasce agora — `digital_objects` (o elemento) é da etapa do 4D/5D
e não se decide bem antes de existir uso.

### A.2 Revisão é linha nova, agrupada — nunca `UPDATE`

O usuário disse o que quer: *"comparar a revisão de fevereiro com a próxima que
o calculista mandar"*. Sobrescrever o arquivo destruiria a resposta.

`modelo_grupo UUID` + `revisao INT`: subir "como nova revisão de X" copia o
grupo e incrementa. É o mesmo princípio de `blueprint_snapshots`, e pela mesma
razão — o que foi publicado tem de continuar sendo o que foi publicado.

### A.3 O bucket recortado por organização, nas QUATRO operações

⚠️ Lição de [[project_blueprint_underlay_storage_policies]]: **a tabela estar
recortada por `is_org_member` NÃO recorta o objeto no bucket** — são duas RLS, e
o arquivo mora no objeto. O `blueprint_underlays` nasceu com as três policies
cegas à organização e sem `UPDATE`, e qualquer usuário do SaaS podia ler o
arquivo de qualquer cliente.

Padrão da casa: `public.is_org_member(((storage.foldername(name))[1])::uuid)`,
com o `organization_id` como primeiro segmento do caminho. E a conferência conta
as policies **CEGAS**, não checa se a boa existe — policy permissiva viva ao
lado da restritiva vale em OR e anula a proteção.

### A.4 O que se guarda além do arquivo

Nome, disciplina, `schema_ifc`, contagem de elementos e o sha256 — tudo já
medido na abertura. Guardar o resumo evita reabrir 1,2 MB de WASM só para
mostrar uma lista.

## Parte B — Importar a estrutura

### B.1 UM comando de lote, e o modelo não vira "meio importado"

`ImportarEstruturasIfc` com as peças já traduzidas. Um `applyBatch` do kernel:
ou entra tudo, ou não entra nada, e é **um passo de desfazer**. Metade de uma
importação de 393 peças seria pior que nenhuma.

### B.2 A tradução é PURA e vive fora do React

`utils/ifcParaKernel.ts`: recebe o que o parser leu e devolve
`{ pecas: ComandoAddStructural[]; recusadas: RecusaDeImportacao[] }`. Função
pura, testável contra o arquivo real sem navegador — como `ifcViewerService`
provou ser possível.

### B.3 O pavimento: `IfcBuildingStorey` → `Level`, casando por COTA

O modelo tem 5 pavimentos; o desenho do usuário tem os dele. Importar criando
pavimentos novos duplicaria o térreo. A regra: casa por `elevationMm` dentro de
uma tolerância; sem correspondente, **o usuário escolhe** — criar ou jogar no
pavimento ativo. Adivinhar aqui é criar um "Térreo (2)" que ninguém pediu.

### B.4 Unidades e origem

O IFC declara a unidade de comprimento (`IfcUnitAssignment`); o kernel é
milímetro inteiro. A conversão é explícita e o fator entra no relatório — um
modelo em metros importado como milímetros é uma casa de 6 metros virando 6
quilômetros, e o `assertIntegerMm` do kernel recusaria com uma mensagem que não
explica a causa.

A origem vem de `GetCoordinationMatrix`, como no visualizador.

### B.5 O que a importação NÃO faz

Não importa parede, esquadria, telhado nem escada — o modelo do usuário não os
tem, e escrever tradução sem arquivo para provar é escrever no escuro. Fica
declarado no relatório: "este arquivo tem só estrutura".

Não preserva o `GlobalId` como `uid` do kernel **nesta fase**: `uid` é
identidade do desenho do usuário, e amarrá-la ao GUID de terceiro faria a
re-importação de uma revisão colidir com peças que ele editou à mão. O vínculo
com o arquivo de origem é assunto do Objeto Digital, não do kernel.

## Plano — um item por arquivo, com critério de pronto

### Fase 0 — Plano e medida
- [x] Este arquivo (REGRA #6), com o pedido literal.
- [x] A medida de representação (tabela acima), que decidiu a Parte B.

### Fase 1 — Guardar (Parte A) ✅ (05/09/2026)
- [x] `aplicar_20270919000017_digital_files_ifc.sql` — tabela `digital_files`
  (o nome que o PRD do Objeto Digital já decidiu) e bucket `bim_files`, ambos
  com RLS nas QUATRO operações, o do bucket recortado por `is_org_member` sobre
  o primeiro segmento do caminho.
- [x] **A conferência estava errada e o número errado era o tranquilizador.**
  Contou 3 de 4 policies de objeto porque `qual` é NULL em policy de INSERT, e
  `NULL || with_check` não casa com LIKE nenhum — dizia que faltava uma policy
  quando as quatro estavam lá e recortadas. Corrigida com `COALESCE` nos dois
  lados; reconferida em `obj_policies=4 · cegas=0`.
- [x] `services/digitalFileService.ts` — listar, subir (com `modelo_grupo` e
  `revisao`), baixar, apagar. **Apagar remove o objeto só quando nenhuma outra
  revisão o aponta**: o caminho vem do sha256, então duas revisões de um arquivo
  idêntico compartilham o objeto — e o oposto do que a `blueprint_underlays`
  faz, que nunca apaga e acumula órfãos.
- [x] `BimViewerModule` — biblioteca da organização no painel, "Guardar",
  "nova revisão de…" por modelo, e apagar com confirmação.
- [x] **Abrir do disco continua sem consequência**: olhar o arquivo de alguém
  não enche o storage. Guardar é um segundo gesto, explícito.
- [x] Migration aplicada e conferida; tsc, suíte (2654), check-ui e build limpos.

### Fase 2 — Traduzir (Parte B, sem tocar no editor) ✅ (05/09/2026)
- [x] `services/ifcParametricoService.ts` — lê `IfcExtrudedAreaSolid`, os três
  perfis, o `IfcBuildingStorey` de cada peça e a matriz do produto.
- [x] `utils/ifcParaKernel.ts` — a tradução pura, com as recusas nomeadas.
- [x] **Provado contra o modelo real**: 393 traduzidas, **0 recusas de
  tradução**, 55 recusas de leitura com motivo. Por tipo: 104 PILAR, 200 VIGA,
  85 ESTACA, 4 LAJE.
- [x] **Conferido à mão contra o arquivo**: P1 tem `XDim=20 YDim=40 depth=340`
  em CENTÍMETRO e saiu **200 × 400 × 3400 mm**; a estaca E1 de raio 12,5 saiu
  ⌀250 mm com `circular: true`; a viga VB1 saiu 200 de largura por 400 de
  altura. A conversão de unidade está certa.

**A armadilha das três conversões, medida:** o arquivo está em CENTÍMETRO, o
mundo do `web-ifc` é METRO e o kernel é MILÍMETRO. A matriz do parser já carrega
o cm→m, então a regra virou: todo ponto nasce em unidade de arquivo, passa pela
matriz e só então vira milímetro. Misturar dimensão de perfil (cm) com posição
de matriz (m) daria um prédio 100× menor **no lugar certo** — plausível.

**O que a sondagem do datum respondeu** (e que a Fase 3 precisava): a
`Elevation` do `IfcBuildingStorey` e o Y da geometria estão na MESMA referência
depois do cm→m — Superior declara 7,80 m e sua geometria vai até 7,74; Caixa
d'Água declara 9,30 e vai até 9,15. Não há offset escondido entre os dois, então
casar pavimento por cota é viável. Ainda assim a Fase 3 usa a CONTENÇÃO do IFC
(`IfcRelContainedInSpatialStructure`, que cobre 449 de 449) como fonte, e a cota
só para sugerir o par — contenção é declaração, cota é inferência.

### Fase 3 — Importar (Parte B, no editor) ✅ (05/09/2026)
- [x] **Sem comando novo no kernel.** `runBatch` com N `AddStructural` já é
  atômico (`applyBatch` trabalha sobre cópia e propaga a exceção) e já é UM
  passo de desfazer. Um `ImportarEstruturasIfc` seria a segunda cópia de regras
  que `AddStructural` já tem — e obrigaria a bump de `KERNEL_VERSION` e
  recaptura de goldens por nada.
- [x] `components/blueprint/PainelImportarIfc.tsx` — escolher do disco ou da
  biblioteca, prévia por tipo, **casamento de pavimentos** e o relatório de
  recusas ANTES de confirmar.
- [x] Seção "Do IFC" no painel do editor, logo depois de "Do PDF": é a mesma
  família — trazer para dentro o que outra pessoa desenhou. Nasce fechada,
  porque importar é gesto ocasional.
- [x] **O casamento é sugerido pela COTA, nunca pelo nome**, com tolerância de
  meio metro; fora dela a tela pergunta em vez de escolher. "Térreo" do
  calculista e "Térreo" do desenho podem estar em cotas diferentes, e o acerto
  aparente do nome esconderia meio metro.
- [x] **O fator de unidade é DEDUZIDO**, comparando a cota declarada do
  pavimento com a cota real das peças dele. Uma constante escrita à mão seria a
  quarta unidade da conta — e a terceira já quase custou um prédio 100× menor.
- [x] A importação **nasce selecionada**: 393 peças novas invisíveis no meio do
  desenho seriam impossíveis de conferir.
- [x] Pronto: `__tests__/ifcParaKernel.test.ts` — 11 casos. Os oito primeiros
  rodam sempre (peça montada à mão com a matriz real do P1); os do modelo real
  só com `IFC_REAL` apontando para o arquivo, porque ele é do cliente e não
  entra no repositório.

### Fase 4 — Verificação ✅ (05/09/2026)
- [x] `tsc`, suíte (2664), `check-ui-standard`, build, migration aplicada e
  conferida.

## Estado

Fases 0–4: **feitas**. **Em produção desde 05/09/2026** (`626c5d0`, `80cc12d`,
`5bf947b`).

O status consolidado das etapas rumo ao BIM vive em
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.


✅ **Usada de verdade em 06/09/2026**: o usuário importou um modelo e 440
componentes entraram num estudo, que abriu na vista 3D. A cadeia ponta a ponta
— arquivo, tradução, `applyBatch`, publicação, desenho — está confirmada fora
do teste.

### A distância até o desenho — investigada em 06/09/2026, suspeita REFUTADA

A hipótese registrada aqui era que `traduzirPecas` estivesse perdendo a
`GetCoordinationMatrix` do arquivo. **Não estava.** Medido no próprio modelo
(Igreja Divino, AltoQi Eberick, 449 produtos):

- `GetCoordinationMatrix` é a **identidade** — translação (0,0,0), escala 1.
  Aplicá-la não mudaria um milímetro;
- as peças ocupam de 0,15 m a 19,93 m em X e de −19,93 m a −0,75 m em Z. O
  prédio nasce no **canto da origem do próprio IFC**, e a tradução o entrega
  fiel.

Ou seja: não havia defeito de tradução. O que faltava era que a tela **não
dizia onde as peças iriam cair**, e não havia como escolher. Corrigido:

- `caixaDasPecas`, `caixaDoDesenho` e `deslocamentoDaImportacao` em
  `utils/ifcParaKernel.ts` (puras, 8 casos em `__tests__/ifcAncoragem.test.ts`);
- a tela mostra a pegada e a distância até o centro do que já está desenhado,
  **antes** de confirmar, e oferece três âncoras: manter as coordenadas do
  arquivo (padrão, fiel), encostar na origem, centralizar no desenho;
- o lote NÃO entra na caixa do desenho — ele costuma ser muito maior que a
  construção, e centrar por ele jogaria o modelo para o meio do terreno;
- `__tests__/components/PainelImportarIfc.test.tsx` (4 casos) verifica a tela
  com o parser dublado: o que ela mostra e o que ela manda para o kernel.

⚠️ Também aberto: se o **casamento de pavimento** acertou o andar. Se as peças
entrarem um andar fora, é o `select` de pavimento, não a tradução.
