# GED — ícone do botão Editar + Gestão de Extensões de Documentos

## Pedido original

Sessão de 2026-09-01, mensagem do usuário transcrita literalmente:

> Gestão de Documentos:
> 1. o icone do botao editar é o mesmo do configuracoes de colunas, altere o icone do botao editar para o lapis ja padrao no app.
> 2. implementar gestão de extensão de documentos: criar novo, excluir, editar e duplicar com upload de ícone para cada tipo de extensão

## Contexto

**Problema 1.** Na tabela do GED o botão "Editar" usava `kind="settings"` → ícone
`Settings` (engrenagem) — o mesmo ícone do `ColumnConfigButton`
(`components/ui/TableUtils.tsx`), poucos pixels acima na mesma tela.

**Problema 2.** "Extensão" não era cadastro: a lista fechada
`pdf/docx/xlsx/dwg/jpg/png` estava repetida em 5 lugares do código
(`executeUpload`, `EXTENSAO_OPTIONS` do módulo, `BatchUploadSheet`,
`DocumentBatchEditModal`, `MIME_BY_EXTENSION` do `documentService`), e o ícone por
extensão era um `switch` de ícones lucide. Nenhuma organização conseguia aceitar
`.rvt`, `.ifc` ou `.dxf` sem alterar código.

## Decisões confirmadas com o usuário (antes de codar)

1. **`Pencil` já era usado por "Anotar"** (`kind="annotate"`) na mesma linha da
   tabela — dois lápis na mesma linha seria trocar um problema por outro. Decisão:
   **"Anotar" passa a usar `Highlighter`** (marca-texto, que descreve melhor
   marcação sobre PDF), liberando o lápis para "Editar".
2. **O catálogo de extensões manda em tudo** — não é decorativo: define as
   extensões aceitas no upload, as opções do select "Extensão do arquivo", o MIME
   gravado ao renomear e o ícone da coluna Documento.
3. **A tela é a 4ª aba do modal "Ajustes do GED"**, ao lado de Tipos de
   Documentos / Disciplinas / Fórmulas de Nomenclatura.

---

## Parte 1 — Ícone do botão Editar ✅ concluída

| Arquivo | O que mudou | Como sei que terminou |
|---|---|---|
| `components/ui/ActionIconButton.tsx` | `annotate` passa de `Pencil` para `Highlighter`; comentário registrando que `Pencil` é exclusivo de `edit` | `Pencil` aparece só em `edit` no `KIND_DEFAULTS` |
| `components/OpuraDocsModule.tsx` | botão de editar metadados: `kind="settings"` → `kind="edit"` (`disabled`/`title` do lock intactos) | linha do documento mostra lápis em Editar e marca-texto em Anotar |
| `PLANO_PADRONIZACAO_BOTOES_ACAO.md` | seção "Riscos/armadilhas": a exceção documentada do GED foi revogada; regra antiga preservada em `<details>` com o motivo da queda | o documento não contradiz mais o código |

`kind="settings"` **continua existindo** — 12 outras telas o usam com semântica
legítima de "Configurações".

## Parte 2 — Catálogo de extensões ✅ concluída

### 2.1 Banco — `supabase/migrations/aplicar_20270918000003_opura_dms_file_extensions.sql`

- Tabela `public.opura_dms_file_extensions` (`organization_id`, `extension`
  com `CHECK (extension ~ '^[a-z0-9]{1,12}$')`, `label`, `mime_type`,
  `icon_path`, `icon_url`, `ativo`, `UNIQUE (organization_id, extension)`).
- RLS idêntica à de `opura_dms_document_types` (`organization_members.email =
  auth.jwt()->>'email'`), **sem policy anon** — as anon do módulo já haviam sido
  removidas em `20270208000001`.
- Seed idempotente das 6 extensões originais para toda organização existente.
- Bucket público `opura-docs-icons` (1 MB, png/jpeg/svg/webp), policies de
  escrita restritas a membros da org pelo 1º segmento do path; leitura pública
  porque `DocumentsTable` também serve o Portal do Parceiro (link sem sessão).
- **Aplicada com `npx supabase db query --linked -f`** (nunca `db push`).
- **Pronto:** verificado de fora — 4 organizações × 6 extensões; bucket
  `opura-docs-icons` `public=t`, limite 1048576.

### 2.2 `services/documentService.ts`

- `OpuraDmsFileExtension`, `DEFAULT_FILE_EXTENSIONS` (piso de segurança) e
  `normalizeExtension()` exportados.
- Bloco "GESTÃO DE EXTENSÕES DE ARQUIVO (GED)": `listFileExtensions`
  (`if (orgId)`, nunca `return []` cedo — REGRA #5), `createFileExtension`
  (mensagem própria para `23505`), `updateFileExtension`, `deleteFileExtension`,
  `uploadFileExtensionIcon` (reusa `storageService.upsertFile`/`getPublicUrl`,
  valida `image/*` e 1 MB) e `removeFileExtensionIcon` (não lança: perder a
  referência do ícone não pode travar a edição da extensão).
- `renameActiveVersionExtension(document, newExtension: string, mimeType?)` — a
  união literal saiu; `MIME_BY_EXTENSION` fica como fallback. Rollback do `move`
  em caso de erro no update permanece.

### 2.3 `components/OpuraDocsModule.tsx`

- `fileExtensions` carregado em `fetchDmsSettings`; derivados `extensaoOptions`
  (dedup por código — em "Todas as Organizações" a mesma extensão vem repetida),
  `allowedExtensions` e `extensionIcons`.
- **Fallback:** catálogo vazio cai em `DEFAULT_FILE_EXTENSIONS` — upload nunca
  fica bloqueado por falta de cadastro.
- Aba **🧩 Extensões**: form (Extensão · Rótulo · MIME com palpite via
  `MIME_GUESS` · Ícone 40×40 no molde do `PhotoCell`) + tabela
  `Ícone | Extensão | Rótulo | MIME | Ações` com `ActionIconButton`
  `edit`/`duplicate`/`delete` (§9.2). Clicar no ícone da linha troca a imagem
  (§7.1, editável inline). Exclusão via `useConfirm()` avisando que documentos já
  enviados continuam existindo.
- **Duplicar** copia rótulo/MIME/ícone para o formulário e deixa o **código em
  branco e focado** — `extension` é a chave única da org, cópia idêntica é
  impossível e sufixar o código geraria extensão inválida.
- Escrita respeita REGRA #5: `activeOrganizationId || settingsOrgId`.
- `executeUpload` e o select "Extensão do arquivo" passam a ler o catálogo; a
  mensagem de erro do upload lista as extensões cadastradas.

### 2.4 `components/documents/BatchUploadSheet.tsx` · `DocumentBatchEditModal.tsx`

- `ALLOWED_EXTENSIONS` → prop `allowedExtensions` (default = lista original).
- `EXTENSAO_OPTIONS` → prop `extensaoOptions` (`{ value, label, mime_type }`);
  `extensaoNova` vira `string` e o MIME do catálogo vai para
  `renameActiveVersionExtension`.
- Ambos recebem `extensionIcons` para a prévia dos arquivos.

### 2.5 `components/documents/DocumentsTable.tsx`

- `renderFileIcon(mime, name, iconByExtension?)` — ícone cadastrado vence; o
  `switch` lucide continua como fallback.
- Prop opcional `extensionIcons` em `DocumentsTableProps`: o GED passa, o Portal
  do Parceiro segue funcionando sem passar.

---

## Verificação executada

- `npx tsc --noEmit` — limpo.
- `bash scripts/check-ui-standard.sh` nos 5 arquivos tocados — exit 0 em todos.
- `npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts` — 17 passes.
- Banco conferido de fora (seed + bucket), como acima.

## Pendente

- Conferência na interface real (skill `rodar-app`): lápis/marca-texto na linha,
  CRUD da aba Extensões, upload de `.ifc` aceito e `.exe` recusado, ícone
  customizado na coluna Documento, e o mesmo com o seletor do topo em "Todas as
  Organizações".
