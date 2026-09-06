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

### Fase 2 — Catálogo ✅ (05/09/2026)
- [x] `aplicar_20270919000010_blueprint_opening_types.sql` — espelho do
  catálogo de paredes: tabela, índice parcial por org, RLS nas quatro
  operações por `is_org_member`, REVOKE anon, sem FK para `auth.users`.
  `kind` como TEXTO com CHECK (vão livre fora: não há caixilho a catalogar).
- [x] `services/blueprintOpeningTypeService.ts` — `listOpeningTypes(orgId |
  null)` (REGRA #5: `null` = Todas, não bloqueia), `saveOpeningType` (upsert
  por `(organization_id, nome)`: salvar de novo sobrescreve), `deleteOpeningType`.
- [x] Aplicada e conferida: bloco 4 devolveu tabela=1, com_rls=1, policies=4,
  anon_grants=0, fk_auth_users=0. Travas de prefixo e segurança verdes.

### Fase 3 — Editor ✅ (05/09/2026)
- [x] `PainelEsquadria.tsx` (novo, irmão de `PainelCamadasParede`) — nome de
  projeto (vazio REMOVE o tipo), item via `DatabasePickerModal` (só com nome
  dado: item sem nome não é tipo), seletor de tipos salvos **do mesmo kind**
  (aplica em lote), "Salvar tipo" com `useOrgWriteTarget`. Vão livre diz que
  não tem tipo em vez de sumir.
- [x] `PainelParedeSelecionada.tsx` — `esquadriaSlot`, pela razão de `camadasSlot`.
- [x] `BlueprintEditor.tsx` — "Tipo salvo" na barra da abertura: escolhido,
  manda em kind, medidas e esquadria da PRÓXIMA; `aplicarTipoDeEsquadria` é
  um `runBatch` de três comandos — um passo de desfazer.
- [x] Pronto: `__tests__/components/PainelEsquadria.test.tsx` (9 casos);
  `check-ui-standard` limpo nos três.

### Fase 4 — Saídas ✅ (05/09/2026)
- [x] `blueprintIfc.ts` — `IfcDoorType`/`IfcWindowType` **por assinatura, para
  todas** (a porta sem nome ganha "Porta 800×2100"), `IfcRelDefinesByType` por
  grupo, GUID derivado de `studyId + assinatura` (estável entre revisões e o
  mesmo tipo mesmo que a primeira instância seja apagada), item de catálogo em
  `Tag` e `Pset_OpuraPlanta.ItemCode` do tipo. Cobertura: tem tipos de porta e
  janela; não tem de parede.
- [x] `quantities.ts` — `QuantidadeAbertura.nome/assinatura/itemCode`,
  `totais.porEsquadria` (o quadro), política **1.6.0 → 1.7.0** — e a nota
  registra que `telhados` e `escadas` entraram sem bump.
- [x] `blueprintBudget.ts` — `gerarLancamentosDeEsquadrias`: UN → contagem,
  M2 → área dos vãos, outra unidade → divergência; tipo sem item → divergência;
  **tipo sem nome fica fora sem divergência** (ninguém declarou). Terceiro
  bloco em `blueprintBudgetService`.
- [x] `blueprintPlanilha.ts` — aba **Quadro de esquadrias** + colunas
  Esquadria/Item na aba Aberturas.
- [x] `blueprintDiff.ts` — `ABERTURA_TIPO` ("sem tipo → P1 (90843)"), frase
  própria: trocar o tipo sem mexer na medida muda o que se compra.
- [x] Pronto: `__tests__/blueprintEsquadriaSaidas.test.ts` — 11 casos.

### Fase 5 — Verificação ✅ (05/09/2026)
- [x] `tsc --noEmit` limpo.
- [x] Suíte inteira: 2559 passando, 27 puladas (36 casos novos).
- [x] Goldens: bump 0.15.0 com a prova (Fase 1).
- [x] `check-ui-standard` limpo nos três `.tsx` tocados.
- [x] `npm run build`.
- [x] Migration do catálogo aplicada e conferida (bloco 4).

## Estado

Fases 0–5: **feitas**. **Em produção desde 05/09/2026** (`b1a9e6a`, `9e442e7`,
`8c13f79`, `7bc5514`, `b62431d`).

O status consolidado das etapas rumo ao BIM vive em
`docs/planos/2026-09-04-planta-inteligente-identidade-e-ifc.md`.


Pendência de olho, mais leve que a das famílias anteriores (não há orientação
a errar): abrir um IFC com portas num visualizador e conferir que `IfcDoorType`
é aceito com os 13 atributos e que "P1" aparece como tipo agrupando as
instâncias. Se um leitor recusar o arquivo, o suspeito é a contagem de
atributos de `IFCDOORTYPE`/`IFCWINDOWTYPE` em `emitirTiposDeEsquadria`.
