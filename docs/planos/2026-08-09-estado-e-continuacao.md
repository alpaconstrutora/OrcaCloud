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
| Planta de fundo calibrada | ✅ **verificada com projeto real** — 0,3–0,6% contra a área do projetista |
| Medições (formas traçadas) | ✅ núcleo + UI + verificadas no navegador |
| E1/E2 — Digitalizador automático | ✖ travado no bloqueio semântico do Spike C |
| E6 — Gerador | ✖ não existe em lugar nenhum como o PRD define |

---

## 2. O que está pendente, em ordem

### 2.1 Aplicar a migration `aplicar_20270905000014_blueprint_pranchas_camadas.sql`

5 blocos, **um por vez**. O bloco 3 é a FK da prancha — **feche a aba do editor
de plantas antes**, senão dá `40P01`.

Conferência esperada: `sem_unico=1 · colunas=5 · fk_prancha=1 · orfas=0`

✅ **APLICADA em 09/08/2026**, com `sem_unico=1 · colunas=5 · fk_prancha=1 ·
orfas=2`.

As **2 órfãs** são medições que não acharam prancha — permitido (forma traçada
sem fundo), mas elas expuseram um buraco na UI da mesma sessão: com o filtro
`f.underlayId === ativaId`, uma órfã ficava invisível assim que houvesse uma
prancha, **e sem nenhum controle para religá-la**. Corrigido: forma sem prancha
aparece em TODAS, marcada como "sem prancha" na linha — do contrário pareceria
que a mesma medição foi traçada uma vez por prancha.

Para saber o que são as duas:

```sql
SELECT m.id, m.nome, m.tipo, m.level_id, m.created_at,
       (SELECT count(*) FROM public.blueprint_underlays u
         WHERE u.study_id = m.study_id) AS pranchas_do_estudo
  FROM public.blueprint_measurements m
 WHERE m.underlay_id IS NULL;
```

### 2.1.1 `aplicar_20270905000015` — policies de storage do fundo · ✅ APLICADA

Aplicada em 09/08/2026: `policies=4 · cegas=0 · com_update=1`.

A conferência de 09/08 mostrou **1 estudo, 0 pranchas, 2 medições**: prancha
nunca foi importada, e o bucket `blueprint_underlays` está vazio. Foi por isso
que dois defeitos do bloco 5 da `000009` nunca apareceram.

1. **Não há policy de UPDATE**, e `uploadUnderlay` sobe com `upsert: true`. O
   caminho vem do sha256 do arquivo, então reimportar o MESMO documento cai no
   mesmo objeto e precisa de UPDATE. Sem ela, dá 403 num ponto em que ninguém
   suspeitaria de permissão de storage.
2. **As três policies são cegas à organização** — `USING (bucket_id = …)` deixa
   qualquer usuário autenticado do SaaS ler, gravar e apagar a planta de fundo de
   qualquer cliente. A TABELA está recortada por `is_org_member`; o OBJETO, que é
   onde o desenho mora, não. O caminho é `{organization_id}/{study_id}/{sha}.png`,
   então o recorte sai do primeiro segmento.

Conferência esperada: `policies=4 · cegas=0 · com_update=1`.

`cegas` é o número que importa: conferir só que a policy boa existe não bastaria,
porque a antiga poderia estar viva ao lado dela valendo em OR — foi assim que o
`TEMP_BYPASS` vazou `internal_transactions` para `anon`.

### 2.1.2 Conferir com dado real — ✅ FEITO em 09/08/2026

Rodado pelo usuário no navegador, sobre um PDF de projeto real
(`PROJETO INICIAL-REGULARIZACAO`), duas páginas como duas pranchas.

**A precisão bate com o projeto.** As áreas traçadas foram conferidas contra a
área que o próprio projetista escreveu na planta:

| forma | medida | a planta declara | erro |
|---|---|---|---|
| SALA 301 | 19,38 m² | `a=19.49 m²` | 0,56% |
| SALA 203 | 17,64 m² | `a=17.58 m²` | 0,34% |

O resíduo é o clique no canto, não a conta.

**As duas aferições concordam entre si.** Cotas diferentes da mesma planta —
5,52 m e 14,15 m — deram 16,90 e 16,94 mm/px: 0,24% de diferença, e as duas em
1:100. É a conferência que o `AVISO_RASTER` pede, e ela passou.

**O recorte por prancha funciona:** cada uma mostra só a forma traçada nela, com
o aviso "1 medição fora da lista".

**RECALIBRAR — a prova que motivou a `000014`:**

| | antes | depois | |
|---|---|---|---|
| SALA 203 (recalibrada de 14,15 para 28,30 m) | 17,64 m² | **70,49 m²** | acompanhou |
| SALA 301 (outra prancha) | 19,38 m² | **19,38 m²** | **não se mexeu** |

Previsto 70,56; a diferença de 0,1% é o arredondamento para milímetro inteiro em
`regravarPontos`.

**Defeito encontrado e corrigido na hora:** o seletor mostrava
`PROJETO INICIAL-REGULARIZ…` nas duas entradas. A página, que é o que distingue,
estava no FIM do nome — exatamente onde a truncagem corta. Passou para a frente
(`p.3 · PROJETO…`), e o nome completo foi para o `title`.

**Continua não testado:** reimportar o MESMO arquivo (é o que exercita a policy
de UPDATE da `000015`; páginas diferentes geram objetos diferentes no bucket) e a
exportação em PDF depois da correção do espelho vertical.

#### O roteiro, para quem precisar repetir

Cada passo existe porque prova uma coisa que nenhum teste prova:

| # | Fazer | O que só isto prova |
|---|---|---|
| 1 | Importar uma prancha | o upload chega ao bucket e a URL assinada volta — o par de policies da `000015` |
| 2 | Aferir com uma cota conhecida | o `calibrar` grava a ENTRADA, e o resumo confere a distância de volta |
| 3 | Traçar uma área sobre a planta | a forma nasce com `underlay_id` e `camada` — as colunas da `000014` |
| 4 | **Importar uma segunda prancha** | importar ACRESCENTA. Se a primeira sumir, o `upsert` sobreviveu em algum lugar |
| 5 | Aferir a segunda com outra cota | duas aferições coexistem — era o que a chave única proibia |
| 6 | Traçar uma forma na segunda | idem, ligada à prancha certa |
| 7 | Alternar entre as duas no seletor | cada prancha mostra só o que foi traçado nela |
| 8 | **Recalibrar SÓ a segunda** | **o que motivou a `000014`**: a forma da segunda se reposiciona, a da primeira NÃO se mexe |
| 9 | Item avulso com nome e preço, e enviar ao orçamento | o código determinístico chega na linha; reenviar não duplica |

O passo 8 é o único que não tem como ser conferido por inspeção — os dois
desenhos precisam estar na tela ao mesmo tempo, e o erro aparece como contorno
no lugar errado com o número certo ao lado.

Se algo falhar, a primeira suspeita é a policy do bucket (403 no upload ou
imagem que não carrega) e a segunda é coluna faltando (erro citando
`underlay_id`, `camada`, `nome` ou `ordem`).

### 2.2 Construir a UI das lacunas — ✅ FEITO em 09/08

- **Seletor de prancha** — `useBlueprintUnderlay` lista (`listarUnderlays`),
  guarda a ativa e ACRESCENTA ao importar. O rótulo do botão mudou de "Trocar
  fundo" para "Acrescentar prancha", e o seletor só aparece a partir da segunda.
  A prancha nasce com o nome do arquivo mais a página (`planta.pdf · p.3`).
- **Filtro de camada** — `PainelMedicoes` lista as camadas em uso com olho de
  visibilidade e contagem; `camadasOcultas` é `Set` no `BlueprintEditor`, estado
  de tela. **Esconder não é apagar:** o painel recebe `formas` (visíveis) e
  `todas`, e o total e o envio ao orçamento contam as duas.
- **Campos do item avulso** — nome e preço aparecem SÓ sem código de catálogo, e
  a linha mostra o código determinístico que sairá (`MED-…`).
- O canvas passou a desenhar só as formas da prancha ativa. Não é cosmético: as
  coordenadas de uma forma só valem sob a aferição da prancha em que foi traçada.

### 2.3 Verificar no navegador — ✅ FEITO, com um defeito encontrado

`docs/spikes/medicoes/` — harness com o `BlueprintCanvas` de produção e uma
imagem de fundo fabricada com um retângulo em pixels conhecidos. A forma medida
é traçada exatamente sobre esse retângulo: se o fundo está no lugar, as duas
caixas coincidem na tela.

```bash
npx vite --port 3103                       # numa aba
PLAYWRIGHT_CORE=/caminho/node_modules/playwright-core \
  node docs/spikes/medicoes/passeio.mjs http://127.0.0.1:3103
```

**9/9**, e cada conferência tem a versão com o defeito reintroduzido, que TEM de
reprovar:

| Conferência | Certo | Defeito |
|---|---|---|
| fundo no lugar, colado no zoom | 2 px | 36–42 px |
| orientação (marca do topo no topo) | no topo | — |
| traçado segue o cursor / fecha só no 1º ponto | fecha com 4 vértices | clique longe não fecha |
| barra e painel não recortados | nada ultrapassa | painel a 256 px recorta |
| **recalibrar reposiciona** | 2 px | 72 px |

**O defeito:** a planta de fundo saía **espelhada na vertical**.
`BlueprintCanvas.paraTela` somava o Y direto, enquanto o modelo é Y para cima em
todo o resto — a exportação PDF inverte explicitamente, o DXF grava Y cru porque
DXF também é Y para cima, e `blueprintUnderlay` inverte ao converter pixel para
milímetro. Corrigido em `paraTela`/`paraMundo`, mais o sentido do arco da porta e
o enquadramento inicial (a origem agora nasce no rodapé, convenção de CAD).

Só apareceu porque a imagem do harness leva uma marca assimétrica: com o
retângulo simétrico que veio antes, a conferência APROVAVA o código espelhado.

Ainda não visto: **cotas no PDF** (a cadeia soma o total?) e **IFC** (abre num
visualizador? o `.txt` de cobertura acompanha?).

Já confirmados pelo usuário: exportação PDF (com o canto fechado), DXF no
AutoCAD, orto + arrastar ponta, de-para do orçamento, vínculo com a obra.
⚠️ Essas duas confirmações são anteriores à correção do espelho — vale reabrir
uma exportação e conferir a orientação contra a tela.

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
| `000014` pranchas, camadas, item avulso | ✅ 09/08/2026 — `orfas=2`, ver 2.1 |
| `000015` policies de storage do fundo | ✅ 09/08/2026 — `policies=4 · cegas=0 · com_update=1` |

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

A primeira correção foi `grid grid-cols-4`, que resolve o recorte fixando a
largura da coluna — e envelheceu mal: as abas viraram cinco, e a quinta passou a
ficar sozinha numa segunda linha ocupando um quarto da largura. **`flex-wrap` é
a resposta certa**, e é a que o §19.1 do guia de UI já pedia. A barra saiu para
`components/blueprint/AbasDoPainel.tsx`, na anatomia do guia (card, trilho
`bg-gray-50`, aba ativa em `bg-white text-blue-600`), e entrou na conferência de
recorte do `passeio.mjs`.

**jsdom não faz layout.** Recorte, arraste e posição de imagem só se verificam em
navegador de verdade — harnesses em `docs/spikes/`.

**Figura simétrica não denuncia espelhamento.** O harness da planta de fundo
usava um retângulo, e um retângulo virado de cabeça para baixo é o mesmo
retângulo: a conferência aprovava o código espelhado. Uma marca num canto só
resolveu. Vale para toda medição por caixa envolvente — ela prova
ENQUADRAMENTO, nunca ORIENTAÇÃO.

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
> `docs/planos/2026-08-09-estado-e-continuacao.md`. Próximo passo: aplicar a
> migration 000014 e conferir no navegador com dado real, item 2.1.

CI: **1119 testes**, `tsc` limpo.

**O que fica pendente, em ordem:**

1. ~~Aplicar `000014` e `000015`~~ — ✅ 09/08/2026.
2. ~~Conferir com dado real no navegador~~ — ✅ 09/08/2026, ver 2.1.2.
3. **Reabrir uma exportação em PDF** e conferir a orientação depois da correção
   do espelho vertical. As confirmações anteriores olharam o canto fechado, não
   a orientação.
4. **Reimportar o MESMO arquivo** uma vez — é o único caminho que exercita a
   policy de UPDATE da `000015`, e páginas diferentes não servem: elas geram
   objetos diferentes no bucket.
5. **Renomear prancha** — decisão em aberto. O nome automático (`p.3 · arquivo`)
   resolve a ambiguidade, mas "Térreo" e "Cobertura" seriam melhores. Ficou fora
   do escopo de propósito.
6. Só então o item 2.4 — excluir o Medição Inteligente.
