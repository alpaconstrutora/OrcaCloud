# GED — aba "Normas" (ABNT e similares)

## Pedido original
> Gestão de Documentos: crie uma nova aba Chamada normas, dedicacda a normas ABNT e similiares
> Sessão c4864451 · 2026-10-13

## Decisões tomadas com o usuário (2026-10-13)
| Pergunta | Resposta |
|---|---|
| Nível da aba | **Campos próprios de norma**: Órgão, Código, Edição/ano, Situação (Em vigor / Cancelada / Substituída), Substituída por. Situação ocupa o lugar de Validade. |
| Obra no topo filtra? | **Não**: é a biblioteca da organização. O vínculo com obra fica opcional. |
| Quem vê | **Dados Técnicos**: `roles: ['admin','owner','engenheiro']`, como Projetos e Licenças. |

## Contexto
O GED (`components/OpuraDocsModule.tsx`) monta as abas a partir do array `CATEGORIES` (linhas 190–196). Cada aba é um valor de `opura_documents.categoria`. O banco trava esses valores com CHECKs, cujos nomes conferi no remoto: `opura_documents_categoria_check` e `opura_folders_categoria_check`. Hoje nada no sistema funciona como acervo de normas. NBR aparece só como citação dentro de outros módulos (`constants_nbr.ts` guarda coeficientes da NBR 12721, não um catálogo). Os campos de norma entram como colunas próprias. **Correção (13/10, durante a execução):** a tabela TEM um JSONB `metadados` (criado pelos Ofícios em 08/10), que o mapeamento inicial não viu. As colunas próprias foram mantidas mesmo assim: a situação ganha CHECK no banco, e os campos ficam tipados e ordenáveis na tabela.

`listDocuments` não precisa de ramo novo: como `engenharia`, a aba nova lista só linhas reais de `opura_documents`. Edge functions, RPCs de portal e o cron de vencimento só repassam `categoria` e funcionam com qualquer valor.

## Execução
- Frente isolada (REGRA #8): `bash scripts/nova-frente.sh ged-aba-normas`. O checkout de integração está sujo, com arquivos de outras frentes.
- Primeiro passo na frente: copiar este plano para `docs/planos/2026-10-13-ged-aba-normas.md` (REGRA #6) e mantê-lo atualizado lá.
- Antes de mexer em tela: ler `docs/ui_ux_guia_unificado.md` inteiro (REGRA #1) e `UI_PATTERNS.md` (REGRA #4).

## Plano (um item por arquivo)

1. **Migration nova** `supabase/migrations/aplicar_2027…_ged_categoria_normas.sql`, com o próximo prefixo livre conferido em `origin/main` na hora.
   - O que muda:
     - DROP + ADD dos dois CHECKs de `categoria`, incluindo `'normas'`.
     - Colunas nullable em `opura_documents`: `norma_orgao`, `norma_codigo`, `norma_edicao`, `norma_substituida_por` (todas TEXT) e `norma_situacao` TEXT com CHECK `IN ('em_vigor','cancelada','substituida')`.
     - Usa `IF EXISTS`/`IF NOT EXISTS` para ser idempotente.
     - Não cria policy nem função, então a REGRA #7 não se aplica. As policies de `opura_documents` continuam valendo para as linhas novas.
   - Aplicação: `npx supabase db query --linked -f <arquivo>`, **nunca** `db push`.
   - Pronto quando: `pg_get_constraintdef` dos dois CHECKs mostra `'normas'` e `information_schema.columns` lista as 5 colunas.

2. **`types/documents.ts`**
   - O que muda: `'normas'` entra na união `OpuraDocumentCategoria`. Os 5 campos `norma_*` entram em `OpuraDocument`, e por consequência em Insert/Update. Novo tipo `OpuraNormaSituacao`.
   - Pronto quando: `npm run typecheck` passa.

3. **`utils/gedNormas.ts`** (novo; rodar `ls` antes do Write)
   - O que muda: arquivo puro com:
     - `NORMA_ORGAOS_SUGERIDOS`: ABNT, ISO, IEC, NR (MTE), IT (Corpo de Bombeiros), ASTM, Concessionária, Outro. São sugestões de datalist, não lista fechada.
     - `NORMA_SITUACOES`, com rótulo e cor de texto por situação. Segue o §8 do guia: cor de texto, sem pílula.
     - `formatarReferenciaNorma(orgao, codigo, edicao)`, que devolve, por exemplo, "ABNT NBR 15575-1:2024".
   - Pronto quando: o teste do item 4 passa.

4. **`__tests__/gedNormas.test.ts`** (novo; rodar `ls` antes)
   - O que muda: testes de `formatarReferenciaNorma` cobrindo campos vazios, edição ausente, órgão já embutido no código e espaços.
   - Pronto quando: `npx vitest run __tests__/gedNormas.test.ts` sai verde.

5. **`services/documentService.ts`**
   - O que muda: o `insert` explícito de `uploadDocument` (~linha 695) passa a gravar os 5 campos `norma_*`. Sem isso eles se perdem: o insert lista as colunas uma a uma. `updateDocument` e `updateDocumentsBatch` já repassam o objeto e ficam como estão.
   - Pronto quando: um documento criado na aba Normas volta do banco com `norma_codigo` preenchido.

6. **`components/documents/DocumentsTable.tsx`**
   - O que muda:
     - Header, classe de célula e `renderDocumentCell` para `norma_orgao`, `norma_codigo`, `norma_edicao`, `norma_situacao` (texto colorido de `NORMA_SITUACOES`) e `norma_substituida_por`.
     - Nova prop `hiddenColumns?: string[]`, que generaliza `showValidade`. A prop antiga fica, porque o Portal do Parceiro usa a tabela.
   - Pronto quando: as colunas de norma aparecem só na aba Normas, e o Portal do Parceiro renderiza igual a antes.

7. **`components/OpuraDocsModule.tsx`** (o grosso)
   - O que muda:
     - `CATEGORIES`: `{ id: 'normas', label: 'Normas', roles: ['admin','owner','engenheiro'], placeholder: 'ex: ABNT NBR 6118, NBR 15575, NR-18, IT 22' }`.
     - `COLUMNS` e `GED_DOC_COL_WIDTHS`: as 5 colunas novas. Uma lista de colunas ocultas por aba alimenta o `DocumentsTable` e o `ColumnConfigButton`:
       - Normas esconde Validade, Nº Doc. Fornecedor e Revisão.
       - As demais abas escondem `norma_*`.
       - Engenharia continua escondendo Validade.
     - **Biblioteca da organização**: com `activeTab === 'normas'`, `fetchDocs`, `fetchFolders` e a criação de pasta (~linha 741) não usam `selectedProjectId`. No upload, `project_id` vem só do campo opcional "Obra" do formulário (~linhas 1879 e 1945), nunca do topo. O seletor de obra do formulário (~linha 3229) fica editável nessa aba.
     - **Formulário de novo documento** (bloco ~2990–3230) e **modal de edição** (~4360, mais o load em ~2157 e o save em ~2225), na aba Normas:
       - Campos Órgão (input com datalist), Código, Edição/ano, Situação (select) e Substituída por. Este último só aparece com Situação = Substituída.
       - Data de vencimento e alerta ficam escondidos, como já acontece em Engenharia (~4373/4384).
       - "Nome" se preenche sozinho com `formatarReferenciaNorma(...)` enquanto o usuário não o editar à mão (feedback "app já tem a informação").
     - **Filtros avançados** (~2664): na aba Normas, "Status de validade" dá lugar a "Situação" (Todas / Em vigor / Cancelada / Substituída) e entra também "Órgão". O filtro roda em `filteredDocuments`, sem query nova.
   - Pronto quando:
     - A aba aparece para quem tem Dados Técnicos e some sem a permissão.
     - Criar, editar e excluir norma funciona em uma organização e também em "Todas".
     - Trocar a obra no topo não muda a lista da aba Normas.
     - `bash scripts/check-ui-standard.sh components/OpuraDocsModule.tsx components/documents/DocumentsTable.tsx` não acusa nada novo.

8. **`components/partner/PartnerWorkspaceManager.tsx`** (238–245)
   - O que muda: `normas: 'Normas'` em `CATEGORIA_LABELS` e `'normas'` em `CATEGORIA_ORDER`. Sem isso, uma norma não aparece no agrupamento do seletor "compartilhar documento".
   - Pronto quando: uma norma aparece no grupo "Normas" ao compartilhar com o parceiro.

### Fora do escopo (registrado, não esquecido)
- `DocumentBatchEditModal` e `BatchUploadSheet` não ganham os campos de norma. O upload em lote na aba Normas grava `categoria='normas'` com os campos de norma vazios, e o preenchimento é feito na edição unitária.
- Os portais exibem a categoria crua ("normas" em minúsculas). É o mesmo comportamento das outras categorias hoje.
- Bug pré-existente achado no mapeamento: a "Distribuição por Categoria" da Saúde Documental conta só a aba carregada por último (`fetchDocs` sempre filtra por `activeTab`). Vale tarefa própria.

## Verificação
1. `npm run typecheck`. O exit se lê por grep, não pelo tail (memória).
2. `npx vitest run __tests__/gedNormas.test.ts __tests__/orgContextGuard.test.ts` e depois a suíte inteira, conferindo `Errors` no JSON.
3. `bash scripts/check-ui-standard.sh` nos .tsx tocados, mais `check-org-selector-guard.sh`.
4. SQL no remoto: os CHECKs e as colunas do item 1.
5. Na interface, com a skill `rodar-app` (Playwright, login real):
   - Abrir Gestão de Documentos › Normas, cadastrar "ABNT NBR 15575-1:2024" com PDF, editar a Situação para Substituída e preencher "Substituída por".
   - Filtrar por Situação e por Órgão.
   - Trocar a obra no topo e conferir que a lista não muda.
   - Testar com o topo em uma organização e em "Todas".
   - Nenhum 4xx/5xx do PostgREST.
6. Publicar: `git push origin HEAD:main`, `bash scripts/conferir-producao.sh "Normas"` e ler o check-run `ci` depois do push.

## Mudanças de rumo durante a execução (13/10/2026)
- **Filtros Situação/Órgão**: o plano previa colocá-los no painel "Filtros". O guia (§5.4) manda filtro de escolha única ser `FilterPopover` na toolbar acoplada, então foram para lá. O "Status de validade" do painel some na aba Normas e também deixa de filtrar nela. Sem isso, um recorte deixado em outra aba esvaziaria a lista sem nada na tela que o explicasse.
- **Coluna Status** também fica oculta em Normas, ao lado de Validade, Nº fornecedor e Revisão. Norma é sempre "Ativo" nesse campo; quem informa o estado dela é a Situação.
- **3º mapa de rótulos**: o `tsc` acusou `components/oficios/rotulos.ts` (`Record<OpuraDocumentCategoria,…>`). Ganhou o rótulo "Normas", mas `CATEGORIAS_GED` (onde se arquiva ofício) não inclui normas, porque ofício não é norma.
- **Autor do Projeto**, Nº fornecedor, Revisão, Vencimento e Alerta ficam ocultos no formulário da aba Normas. Emissão vira "Data de Publicação".

## Estado
- [x] 1. Migration `aplicar_20271013140000_ged_categoria_normas.sql`: **aplicada** no remoto. Os CHECKs com 'normas' e as 5 colunas foram conferidos via `pg_constraint` e `information_schema`.
- [x] 2. `types/documents.ts`: `'normas'`, `OpuraNormaSituacao`, campos `norma_*`.
- [x] 3. `utils/gedNormas.ts`.
- [x] 4. `__tests__/gedNormas.test.ts`: 10/10.
- [x] 5. `services/documentService.ts`: o insert grava `norma_*`.
- [x] 6. `components/documents/DocumentsTable.tsx`: colunas de norma e prop `hiddenColumns`.
- [x] 7. `components/OpuraDocsModule.tsx`: aba, colunas por aba, biblioteca sem obra, formulários, filtros e auto-nome.
- [x] 8. `components/partner/PartnerWorkspaceManager.tsx`: rótulo e ordem.
- [x] 9. `components/oficios/rotulos.ts`: rótulo (item novo, ver acima).
- [x] Typecheck rc=0, com 12 GB pelo PowerShell; com 4 GB o Node cai, como registrado na memória.
- [x] Suíte: 8942 = 8908 aprovados + 34 pendentes, rc=0, sem "Unhandled". `check-ui-standard` sem violação nos 3 .tsx. `orgContextGuard` 14/14. `check-system-projects` e `check-project-classification` com rc=0.
- [ ] Verificação na interface (Playwright, login real): pendente da senha do agente-leitura e da autorização para gravar uma norma de teste.
- [ ] Publicar (`git push origin HEAD:main`) e `conferir-producao.sh "Normas"`, depois ler o check-run `ci`.
