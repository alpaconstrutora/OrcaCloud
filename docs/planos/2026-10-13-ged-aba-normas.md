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
- [x] Verificação na interface (Playwright, agente-leitura, org Garden Cambuhy SPE, vite da frente na :3100), roteiro com 27 checks, todos OK, 0 erros de console/HTTP:
  - colunas da aba (Código, Órgão, Edição, Situação, Substituída por presentes; Validade, Revisão, Status, Nº fornecedor e Autor ausentes; Código logo após Documento, mesmo com ordem de colunas ANTIGA salva no navegador);
  - formulário: nome automático "ABNT NBR 99999-TESTE:2026", "Data de Publicação", sem Vencimento nem Autor do Projeto;
  - criar → aparece "Em vigor"; editar → "Substituída" + "substituída por";
  - filtro Situação (Cancelada esconde, Substituída mostra);
  - obra no topo: a aba Normas continua listando, e a consulta vai sem `project_id`, enquanto a aba Projetos segue recortada (`project_id=in.`). Esse contraste prova que a obra estava mesmo no topo.
  - Limpeza pelo app no `finally`. No banco: 0 documentos e 0 arquivos de teste restantes.
- [x] Ajuste vindo da prova na tela: as colunas de norma ficavam no fim da tabela, fora da tela a 1600px. Em `COLUMNS` elas passaram para logo depois de "Documento" (`mesclarOrdemDeColunas` encaixa coluna nova ao lado da vizinha da ordem padrão), e "Autor" fica oculto em Normas.
- [x] Re-rodada após o ajuste: tsc rc=0. Suíte 885 arquivos, 8942 = 8908 + 34 pendentes, rc=0; a 1ª tentativa caiu com `# Fatal error` do V8 (Node 24, ver memória) e foi descartada. check-ui-standard, check-origem-do-deploy e check-xss-sinks com rc=0.
- [x] Publicado: `398844cd` em main. Vercel `success`, check-run `ci` `completed/success`, e `conferir-producao.sh` confirma que o domínio serve exatamente `398844c`, com "Substituída por" e "ged-normas-orgaos" no bundle.

---

## Pedido 2 (13/10/2026, mesma sessão c4864451)
> Implementar:  os campos de norma não existem no upload em lote nem na edição em lote. Uma norma enviada em lote entra sem esses dados e precisa ser completada na edição individual.

Frente `ged-normas-lote`.

### Plano 2 (um item por arquivo)
1. **`utils/gedNormas.ts`**: `extrairNormaDoNomeDoArquivo(nome)` deduz órgão, código e edição a partir do nome do arquivo (NBR, NBR ISO, NR, ISO, IEC, IT, ASTM). Pronto quando: testes cobrem cada família, separadores `_ - . espaço`, ano junto e ausente, e nome sem norma (devolve vazio).
2. **`__tests__/gedNormas.test.ts`**: os casos acima. Pronto quando: verde.
3. **`components/documents/BatchUploadSheet.tsx`**, só com `categoria === 'normas'`:
   - Padrões do lote ganham Órgão (datalist), Edição e Situação. Somem Vencimento e Alerta; Emissão vira "Data de publicação".
   - Cada arquivo mostra Código e Edição na própria linha, pré-preenchidos pela extração. A extração nunca sobrescreve o que foi digitado.
   - Ajustes por arquivo: Órgão, Situação, Substituída por.
   - Arquivo sem código fica bloqueado com o motivo e não entra na contagem de prontos.
   - `nome` = `formatarReferenciaNorma(...)`. A detecção de duplicado usa a referência.

   Pronto quando: na tela, enviar 2 PDFs (`NBR 15575-1_2024.pdf`, `NR-18.pdf`) grava os dois com código, órgão, edição e situação certos, conferidos no banco.
4. **`components/documents/DocumentBatchEditModal.tsx`**, quando todos os selecionados são `'normas'`:
   - Ganha Órgão, Edição, Situação e Substituída por; este último só com Situação = Substituída. Situação diferente de Substituída limpa o "substituída por", como na edição individual.
   - Somem Revisão, Alerta, Vencimento e Autor do Projeto; Emissão vira "Data de publicação".
   - Código não é editável em lote, porque é único por norma; a tela diz isso.

   Pronto quando: na tela, editar as 2 normas em lote para Cancelada grava nas duas, conferido no banco.

### Estado 2
- [x] 1. `extrairNormaDoNomeDoArquivo`. Entre os casos de teste estão os 6 nomes de arquivo REAIS de normas enviadas em lote na Alpa às 19:52 de 13/10, pela versão em produção e sem os campos de norma.
- [x] 2. Testes: 33/33.
- [x] 3. Upload em lote: padrões (Órgão, Edição, Situação), Código e Edição na linha do arquivo, ajustes por arquivo, bloqueio sem código, nome = referência.
  - **Extra:** corrigido o "Cannot update a component while rendering" que já existia no envio. `notify` era chamado dentro do atualizador de `setItems`; agora o resumo vem do retorno de `runQueue`.
- [x] 4. Edição em lote: Órgão, Edição, Situação e Substituída por; aviso de que o código não se edita em lote; sem Revisão, Alerta, Vencimento e Autor.
- [x] Prova na tela (Playwright, agente-leitura, org Garden, vite da frente), 28 checks OK e 0 erros de console/HTTP:
  - lote com 3 PDFs: `NBR 99997-1_2024` → ABNT/NBR 99997-1/2024; `NR-98` → MTE (NR), vencendo o padrão ABNT; o 3º ficou bloqueado até digitar o código;
  - banco conferido pela API: 3 normas `em_vigor`, sem validade;
  - edição em lote para Substituída (+ substituída por + edição 2025): conferido nas 3, com o código de cada uma preservado;
  - edição para Cancelada: limpou o "substituída por" e manteve a edição;
  - limpeza pelo app; consulta direta ao banco depois: 0 documentos e 0 arquivos de teste, e as 6 normas reais da Alpa intactas.
- ⚠️ **Incidente na prova (registrado):**
  - Na 1ª rodada a marca do roteiro (`9999`) não pegava "NR-98" e uma norma de teste ficou no banco.
  - Ao corrigir, um patch em Python falhou sem gravar e o comando seguinte rodou o roteiro antigo: mais 3 criadas, e de novo sobrou uma "NR-98".
  - As duas "NR-98" (org Garden) foram excluídas pelo app, com o arquivo no Storage, por um roteiro restrito ao nome exato. Conferido no banco.
  - Nada da Alpa foi tocado.
- [x] Publicado: `b4db3d27` em main. Vercel `success`, `ci` `completed/success`, e `conferir-producao.sh` confirma que o domínio serve `b4db3d2`, com "Informe o código da norma" e "O código não se edita em lote" no bundle. Suíte antes do push: 886 arquivos, 8973 = 8939 + 34 pendentes, rc=0; duas tentativas anteriores caíram com Fatal error do V8 e foram descartadas.
- [x] **Backfill autorizado pelo usuário ("sim", 13/10/2026):** as 6 normas reais da Alpa receberam órgão/código/edição deduzidos do nome do arquivo (`extrairNormaDoNomeDoArquivo`). UPDATE por id, só onde `norma_codigo IS NULL`; o `RETURNING` confirmou 6 linhas.
  - Ids: `546ac41f…`, `4c1a3e63…` (NBR 6492), `31621064…` (NBR 13532), `a84056ba…` (NBR 16280), `b56c2bce…` (NBR 6118), `fa4ae4ea…` (NBR 6122, edição 2010).
  - Nome do documento e situação NÃO foram alterados: o arquivo não informa a situação.
  - Reverter = voltar os três campos para NULL nesses ids.
  - NÃO feito: excluir a NBR 6492 duplicada (`4c1a3e63…`, "(1)"). É irreversível e depende de pedido explícito.

---

## Pedido 3 (13/10/2026, mesma sessão c4864451)
> Faltou coluna Edição / ano

**Causa** (confirmada no banco): `user_table_column_preferences` de `altair.rosa@…` guarda `["nome","descricao","autor","status","actions","extensao"]`, de antes da aba Normas. `applyColumnPreference` aplica a lista salva e não conhece colunas novas. Resultado: nenhuma coluna de norma aparecia para quem usou "Salvar como padrão". Defeito meu: o comentário do código já descrevia o problema, e eu não tratei. Na prova original eu partia de navegador limpo e, por isso, não vi.

**Correção** (`OpuraDocsModule.tsx`): preferência salva sem NENHUMA `norma_*` recebe as 5 como visíveis. Elas só aparecem na aba Normas (`hiddenColumnsForTab`). Quem esconde uma e salva mantém a escolha. Custo aceito: esconder as cinco de uma vez não persiste. Também: cabeçalho "Edição" virou "Edição / ano", como no formulário.

**Prova** (Playwright, leitura da preferência interceptada no navegador, sem gravar nada): Normas mostra Documento | Código | Órgão | Edição / ano | Situação | Substituída por…; NBR 6122 mostra ABNT e 2010; Projetos continua sem colunas de norma. Suíte 8973 = 8939 + 34, rc=0; tsc rc=0.

