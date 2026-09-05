# Planta Inteligente — TIPOS DE ESQUADRIA (Etapa 2 do roadmap BIM, item 4)

## Pedido original

> concordo

Sessão `b7041736-bf7a-4895-a5ec-193e752d57b7` · 2026-09-05, em resposta à
recomendação dada a *"qual a proxima etapa voce sugere?"*: dos três itens que
restam da Etapa 2, **tipos de esquadria** primeiro, por ser o último que muda o
que o modelo *é* — hoje cada porta é uma instância solta, sem onde dizer que é
uma porta de madeira semi-oca nem que doze delas são a mesma porta — e por ser a
ponte para a Etapa 3: orçamento de esquadria é um quadro, "P1 — 80×210 — 12 un".

Contexto: `docs/planos/2026-09-01-parede-camadas.md` (o catálogo de tipos de
parede, que é o molde) e `docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.

## Decisões de desenho

### 1. O tipo é MOLDE; a esquadria viaja DENTRO da abertura

Mesma decisão do tipo de parede, pela mesma razão: o snapshot é imutável, e um
`opening.tipoId` apontando para uma tabela mutável faria "a porta P1 da revisão
3" mudar de material quando alguém editasse o catálogo hoje. Então a abertura
ganha um **valor** copiado do catálogo:

```ts
esquadria?: { nome: string; itemCode: string; descricao: string }
```

`nome` é como o projeto chama ("P1", "J3"), `itemCode` é o item de catálogo
(SINAPI ou base própria) e `descricao` é cache de rótulo. Apagar um tipo do
catálogo não mexe em planta nenhuma; editar um tipo não reescreve desenho.

**Ausente = sem tipo**, e a chave é omitida do payload — a disciplina de
`camadas`: toda abertura do acervo continua com a forma canônica que tinha.

### 2. O que faz duas portas serem "a mesma" é a ASSINATURA, não um id

`assinaturaDaEsquadria(o) = kind | widthMm | heightMm | esquadria.nome | esquadria.itemCode`.

É o que `assinaturaDasCamadas` já faz pela parede. Serve a três coisas ao mesmo
tempo: agrupar o quadro de esquadrias, emitir **um** `IfcDoorType` por grupo, e
gerar **uma linha** de orçamento por tipo. Sem id, sem tabela de junção, e
sobrevive ao snapshot.

Consequência a documentar: duas portas 80×210 SEM tipo também formam um grupo
("Porta 80×210"). É o correto — é assim que o Revit pensa uma família — e é
melhor do que um IFC em que só as portas nomeadas têm tipo.

### 3. `IfcDoorType`/`IfcWindowType` para TODAS, `IfcRelDefinesByType` por grupo

O receptor filtra por tipo. Um arquivo em que metade das portas tem tipo e a
outra metade não é pior do que um sem tipo nenhum: quem seleciona "P1" acha 8 e
não sabe que faltam 4. A cobertura deixa de dizer "NÃO CONTÉM tipos" e passa a
dizer o que tem (porta e janela) e o que continua faltando (parede).

### 4. Uma linha de orçamento por TIPO, pela unidade do item

`gerarLancamentosDeEsquadrias` espelha `gerarLancamentosDeCamadas`: agrupado
sempre (uma casa tem doze P1, e doze linhas não são uma lista de compras), e a
**unidade do item decide a grandeza** — `UN` leva a contagem, `M2` leva a área
somada, outra unidade é recusada com divergência. Abertura com tipo mas sem
`itemCode` gera divergência "sem item vinculado", como a camada sem material:
some do orçamento, mas não some calada.

O de-para atual (`CONTAGEM_PORTAS`, `AREA_ESQUADRIAS`) continua: ele serve à
planta sem tipos. Cabe ao usuário não mapear os dois na mesma planta — a prévia
mostra os blocos separados, como já faz com camadas × `VOLUME_ALVENARIA`.

### 5. O tipo se APLICA em lote: tamanho, kind e esquadria num passo

Aplicar "P1 — porta 80×210 — item X" numa abertura existente é
`SetOpeningKind` + `SetOpeningSize` + `SetOpeningEsquadria` num `applyBatch`:
um passo de desfazer, como a composição da parede. E na BARRA, escolher o tipo
antes de inserir faz as próximas aberturas nascerem com tudo — é onde o ganho
de fluxo está.

### 6. `KERNEL_VERSION` 0.14.0 → 0.15.0, com a prova

`esquadria` é conteúdo (muda o que se compra) e entra no hash, omitida quando
ausente. Bump e recaptura só depois de confirmar, com a versão revertida e o
campo inteiro no lugar, que os seis goldens voltam byte a byte.

### 7. Sem migration em `blueprint_objects`

A abertura já é explodida com `props` (que passa a carregar `esquadria`) e
`element_uid`. A única migration é o **catálogo**: `blueprint_opening_types`,
espelho de `blueprint_wall_types` (RLS por `is_org_member`, sem `anon`, sem FK
para `auth.users`, UNIQUE por `(organization_id, nome)`).

## Plano — um item por arquivo, com critério de pronto

### Fase 0 — Plano
- [x] Este arquivo (REGRA #6), com o pedido literal.

### Fase 1 — Kernel ✅ (05/09/2026)
- [x] `model.ts` — `Esquadria` (valor), `Opening.esquadria?`,
  `assinaturaDaEsquadria` (kind|largura|altura|nome|item; `descricao` fora),
  `nomeDaEsquadria`, invariante `BAD_ESQUADRIA` (sem nome; em vão livre),
  cópia profunda em `cloneModel`.
- [x] `commands.ts` — `SetOpeningEsquadria` (`null` remove; copia, não
  referencia; `trim`), `AddOpening.esquadria?`. **`DuplicateLevel` e
  `DuplicateEntities` copiavam a abertura por spread raso** — o teste pegou:
  a esquadria saía compartilhada entre original e cópia. Cópia profunda nas
  duas, pela razão de `camadas` em `cloneModel`.
- [x] `canonical.ts` — `esquadria` na geometria, campos um a um, **omitida
  quando ausente**; leitura idem.
- [x] `units.ts` — **0.14.0 → 0.15.0** com a prova: com a versão ainda em
  0.14.0 e o tipo inteiro no lugar, os sete goldens passaram INTACTOS.
- [x] Pronto: `__tests__/blueprintEsquadria.test.ts` — 16 casos.

### Fase 2 — Catálogo
- [ ] `aplicar_20270919000010_blueprint_opening_types.sql` — tabela (`nome`,
  `kind`, `width_mm`, `height_mm`, `sill_mm`, `embutida`, `item_code`,
  `descricao`, `active`), índice, RLS, REVOKE anon. Aplicar com `db query -f`.
- [ ] `services/blueprintOpeningTypeService.ts` — `listOpeningTypes(orgId |
  null)`, `saveOpeningType`, `deleteOpeningType`, colunas nomeadas.
- [ ] Pronto: `migrationsPrefixo` + `segurancaMigrations` verdes; conferência
  do bloco 4 da migration no banco.

### Fase 3 — Editor
- [ ] `PainelEsquadria.tsx` (novo, irmão de `PainelCamadasParede`) — nome do
  tipo, item de catálogo via `DatabasePickerModal`, seletor de tipos salvos
  (aplica em lote), "Salvar como tipo" com `useOrgWriteTarget` (REGRA #5).
- [ ] `PainelParedeSelecionada.tsx` — monta `PainelEsquadria` na seção da
  abertura.
- [ ] `BlueprintEditor.tsx` — na barra da ferramenta `abertura`, o seletor de
  tipo salvo substitui/preenche largura, altura, peitoril e esquadria da
  PRÓXIMA abertura; `adicionarAbertura` passa `esquadria`.
- [ ] Pronto: `check-ui-standard` nos três; teste de componente do painel
  (aplicar tipo dispara os três comandos num lote).

### Fase 4 — Saídas
- [ ] `blueprintIfc.ts` — `IfcDoorType`/`IfcWindowType` por assinatura,
  `IfcRelDefinesByType`, `Name` = nome do tipo, `Tag`/`Pset_OpuraPlanta.ItemCode`;
  `COBERTURA_IFC` atualizada (tem tipos de porta e janela; não tem de parede).
- [ ] `quantities.ts` — `QuantidadeAbertura.esquadria`,
  `totais.porEsquadria: QuantidadePorEsquadria[]` (assinatura, nome, kind,
  medidas, itemCode, quantidade, áreaM2), bump de política de quantidade.
- [ ] `blueprintBudget.ts` — `gerarLancamentosDeEsquadrias`;
  `blueprintBudgetService.ts` soma o terceiro bloco.
- [ ] `blueprintPlanilha.ts` — aba **Quadro de esquadrias** (por tipo) e a
  coluna "Tipo" na aba Aberturas.
- [ ] `blueprintDiff.ts` — `ABERTURA_TIPO` ("P1 → P2", "sem tipo → P1").
- [ ] Pronto: `__tests__/blueprintEsquadriaSaidas.test.ts` — um `IFCDOORTYPE`
  para duas portas iguais e dois para diferentes; `IFCRELDEFINESBYTYPE` liga as
  duas; uma linha de orçamento com quantidade 2 para item em UN e área 3,36 m²
  para item em M2; divergência sem item; quadro agrupa.

### Fase 5 — Verificação
- [ ] `tsc`, suíte, goldens, `check-ui-standard`, build, migration aplicada e
  conferida.

## Estado

- Fase 0: feita.
- Fases 1–5: pendentes.
