# Estado e continuação — Planta Inteligente e Medição

> Documento de passagem, escrito em 09/08/2026 para abrir uma sessão nova sem
> perder contexto. O que **não** está aqui está nas memórias do projeto
> (`MEMORY.md` e os `project_blueprint_*`).

---

## 1. Onde a coisa está

O módulo **Planta Inteligente** (`blueprint_*`) cobre hoje o caminho inteiro:

> importar planta → aferir escala → traçar paredes → nomear ambiente → publicar
> versão → quantificar → levar ao orçamento da obra → exportar PDF/PNG/DXF/IFC

E ganhou, no fim do dia, a camada de **medição à mão** — as formas traçadas
sobre a planta de fundo, que era o que o Medição Inteligente fazia e a planta
não.

### Épicos do PRD

| Épico | Estado |
|---|---|
| E0 — persistência | ✅ 20/20 contra o banco real |
| E3 — editor | ✅ + orto, arrastar ponta, nome de ambiente |
| E5 parcial — quantitativos | ✅ verificado |
| RF-122 — de-para para o orçamento | ✅ confirmado no navegador |
| E4 — exportação, diff, DXF, IFC, cotas | ✅ PDF e DXF confirmados |
| Planta de fundo calibrada | ✅ código pronto, **não visto no navegador** |
| Medições (formas traçadas) | ⚠️ núcleo pronto, **falta UI** |
| E1/E2 — Digitalizador automático | ✖ travado no bloqueio semântico do Spike C |
| E6 — Gerador | ✖ não existe em lugar nenhum como o PRD define |

---

## 2. O que está pendente, em ordem

### 2.1 Aplicar a migration `aplicar_20270905000014_blueprint_pranchas_camadas.sql`

5 blocos, **um por vez**. O bloco 3 é a FK da prancha — **feche a aba do editor
de plantas antes**, senão dá `40P01`.

Conferência esperada: `sem_unico=1 · colunas=5 · fk_prancha=1 · orfas=0`

### 2.2 Construir a UI das lacunas (é o que falta para poder excluir o Medição)

O banco e a lógica já suportam; falta a tela:

- **Seletor de prancha** na barra do editor. Importar hoje SUBSTITUI; precisa
  passar a ACRESCENTAR, e a barra precisa deixar escolher qual está ativa.
  Ver `useBlueprintUnderlay` — ele ainda busca **uma** prancha
  (`getUnderlay(studyId, levelId)`); precisa listar e ter uma ativa.
- **Filtro de camada** no `PainelMedicoes`, com visibilidade em estado de tela.
  `camadas(formas)` já devolve a lista.
- **Campos do item avulso** (`itemNome`, `itemPreco`) no `PainelMedicoes`, ao
  lado do código de catálogo.

### 2.3 Verificar no navegador

Nada disto foi visto funcionando:

| | |
|---|---|
| Planta de fundo | a imagem aparece no lugar certo? acompanha o zoom colada no desenho? |
| Medições | o traçado segue o cursor? a forma fecha ao clicar no primeiro ponto? |
| **Recalibrar** | as formas se reposicionam sobre o que foi traçado? **é o teste que mais importa** |
| Cotas no PDF | a cadeia soma o total? |
| IFC | abre num visualizador? o `.txt` de cobertura acompanha? |

Já confirmados pelo usuário: exportação PDF (com o canto fechado), DXF no
AutoCAD, orto + arrastar ponta, de-para do orçamento, vínculo com a obra.

### 2.4 Só então: excluir o Medição Inteligente

Com as lacunas fechadas. O acervo é **1 levantamento, chamado "teste"** — não há
dado real em risco. O que remover: `components/MeasureAIModule.tsx`,
`services/measureService.ts`, `types/measure.ts`, a rota em `AppRouter.tsx`
(`case 'measure-ai'`), as entradas em `Layout.tsx` (linhas ~471, ~518, ~909) e as
5 tabelas `measure_*` + bucket `measure-plants`.

**Perda consciente:** a exportação para o orçamento do **ÒPURA Pro**
(`proService`, via `measure_projects.orcamento_id`) NÃO foi replicada na planta.
Se esse caminho for usado, ele precisa entrar antes.

---

## 3. Migrations — o que está aplicado

Prefixo `aplicar_*` = rodada à mão pelo SQL Editor, fora do `schema_migrations`.

| Migration | Estado |
|---|---|
| `000000` fundação do kernel | ✅ |
| `000001` errcode de publicação | ✅ |
| `000002` cascade do snapshot | ✅ |
| `000003` quantitativos | ✅ |
| `000004` remove FKs para `auth.users` | ✅ |
| `000005` de-para do orçamento | ✅ |
| `000006`–`000008` | **de outra frente** (Contas a Pagar), não mexer |
| `000009` plantas de fundo | ✅ |
| `000010` bucket do Medição privado | ✅ |
| `000011` `organization_id` no Medição | ✅ |
| `000012` policy só por organização | ✅ |
| `000013` formas medidas | ✅ |
| `000014` pranchas, camadas, item avulso | ⚠️ **PENDENTE** |

---

## 4. Armadilhas que custaram tempo hoje — não redescobrir

**O SQL Editor roda o script inteiro como UMA transação.** Um erro no bloco 3
desfaz o bloco 1. Foi assim que uma coluna "sumiu" depois de criada. Sempre um
bloco por vez, esperando o *Success*.

**FK para tabela EM USO deadlocka — não só `auth.users`.** A `000013` caiu por
causa de `blueprint_studies`, quente porque o editor estava aberto no navegador.
Criar a tabela sem a FK e acrescentá-la em bloco próprio, com o app fechado.

**`MIN()` não existe para `uuid`.** Com `HAVING COUNT(DISTINCT)=1`, usar
`(array_agg(DISTINCT ...))[1]`.

**JSONB não preserva ordem de chave.** Comparar payload que passou por JSONB tem
de ser valor a valor, nunca por `JSON.stringify`.

**`flex-1` não encolhe abaixo do conteúdo** (`min-width: auto`). Foi assim que
duas abas sumiram: existiam no DOM, achá­veis por `getByRole`, e não apareciam.
Barra com muitos itens precisa de grade ou `flex-wrap`.

**jsdom não faz layout.** Recorte, arraste e posição de imagem só se verificam em
navegador de verdade — harnesses em `docs/spikes/`.

**Medição que não reprova o caso errado não mede nada.** Aconteceu quatro vezes
hoje: teste que aprovava o código defeituoso, harness que aprovava os dois
layouts, leitura de pixel na região errada. Sempre reintroduzir o defeito e
conferir que REPROVA.

**Regra de geometria duplicada diverge.** A regra de ponta livre tinha cópia no
renderizador; a exportação nasceu sem ela e o canto ficou certo na tela e aberto
no papel. Geometria mora no kernel.

---

## 5. Decisões estruturais que não devem ser desfeitas

**Duas verdades empilhadas, nunca fundidas.** Ambiente **DERIVADO** do arranjo
planar (recalculável, com hash) × forma **MEDIDA** à mão (afirmada). A linha de
orçamento diz qual é qual. Foi por isso que a medição não entrou em
`model.spaces`.

**A escala é ENTRADA, nunca resultado.** Na exportação, quando não cabe, recusa e
sugere — nunca encolhe. No DXF, 1:1 em milímetro real.

**A unidade da medição vem do TIPO da forma** (polígono m², linha m, ponto un).
Não há mapeamento livre, logo não há como errar — copiado do Medição, que era
melhor que o de-para nesse ponto.

**A aferição guarda a ENTRADA**, não só o `mm_por_pixel`: os dois pontos clicados
e a distância declarada, para outra pessoa poder conferir.

**Id determinístico em tudo que vai ao orçamento.** `bp:{studyId}:...` e, no item
avulso, código derivado do nome. O Medição usa `crypto.randomUUID()` e
`MED-{aleatório}`, e por isso duplica linha a cada exportação.

**Nunca FK para `auth.users`** — e `ON DELETE SET NULL` apagaria autoria.

---

## 6. Aberto em outros módulos (levantado, não resolvido)

**`utils/geometry/roomDetection.ts` (Projetos Elétricos) é um SEGUNDO arranjo
planar**, mais frágil que o kernel e é o que está em produção: opera em pixels,
`O(n²)`, **não trata cruzamento no meio da parede** (está escrito no código), sem
testes. Fazê-lo chamar o kernel dá corte por interseção e milímetro inteiro de
graça.

**Dois escritores em `projects.budget`** com convenções incompatíveis — o do
Medição gera id aleatório. Unificar no `aplicarNoOrcamento`, que substitui por
prefixo sem tocar linha alheia.

**Planta AI v1 (`plant_*`)**: `plantaAiEngine.ts` tem 212 linhas e trata o
terreno como retângulo. Entrega o *trabalho* "estudar aproveitamento", **não** é
o E6 do PRD.

---

## 7. Como retomar

Frase sugerida para abrir a sessão nova:

> Continue o módulo Planta Inteligente a partir de
> `docs/planos/2026-08-09-estado-e-continuacao.md`. Próximo passo: a UI das
> lacunas (seletor de prancha, filtro de camada, item avulso), item 2.2.

O código está todo em `main`, último commit `87d61f0`. CI: **1106 testes**,
`tsc` limpo, build ~15 s.
