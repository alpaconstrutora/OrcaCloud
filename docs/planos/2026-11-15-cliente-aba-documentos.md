# Meus Clientes › aba Documentos, ligada ao Comercial

## Pedido original (15/11/2026, sessão Claude Code no VS Code)

> minha organização > meus clientes:
> 1. Criar aba documentos onde o usários pode fazer upload dos documentos relacionados com o cliente. criar tabela com a funcionalidades ja amplamente usadas no app.
> 2. os documentos devem estar conectados com o módulo comercial. documentos adicionados diretamente no módulo comercial ficam automaticamente disponivel no meus clientes. Então a casa dos documento ficam em meus clientes. comercial apenas os usa.
> e conectar com comercial

Decisões do usuário (AskUserQuestion, mesma sessão):
- **Comercial: o checklist vira arquivo.** Cada item do checklist da negociação mostra se o cliente já tem aquele documento em Meus Clientes. Quando tem, o ✓ é automático e o clique abre o arquivo. Item pendente ganha "Enviar", e o arquivo é gravado no cliente. A marcação manual continua valendo.
- **Documentos do contrato ficam fora de Meus Clientes.** Minutas, contrato assinado e laudo de crédito continuam só no contrato. A aba mostra apenas os documentos pessoais do cliente.

## Contexto

Hoje o cadastro do cliente (`components/ClientForm.tsx`) tem três abas e nenhuma guarda arquivos. O comercial (`components/DealModal.tsx:104-125` e `:3504-3590`) tem um checklist de documentos por comprador, gravado em `commercial_deals.doc_checklist`, mas ele é só marcação manual. O usuário marca "RG ✓" e não fica arquivo nenhum. Se o mesmo cliente compra de novo, tudo recomeça do zero.

**Onde o arquivo mora: no GED, não numa tabela nova.** A tabela `opura_documents` já tem `client_id` com FK para `clients` (`20261122000000_opura_docs.sql:29`). `documentService.uploadNewDocument` já grava essa coluna e aceita `opcoes.metadados`. No banco há hoje 110 documentos, nenhum com `client_id`, e não há índice nessa coluna (conferido em 15/11). Assim, "Meus Clientes é a casa" quer dizer: a aba é a vista dos documentos `client_id = X`, e o comercial lê e grava exatamente a mesma coisa. O GED continua sendo o armazenamento, com versionamento, auditoria, URL assinada e alerta de vencimento (`fn_opura_docs_vencimento_alerts`).

**Molde a copiar.** A aba Documentos do Empreendimento (#397/#399), formada por `components/empreendimento/DocumentosEmpreendimentoTab.tsx` (tabela "Outros documentos", por volta das linhas 693-750) e `services/empreendimentoDocumentosService.ts`. A dropzone vem de `components/suprimentos/PedidoDocumentos.tsx:426-554` (`EnviarDocumentoSheet`).

**Leitura de código:** sempre de `origin/main` ou da frente. O checkout de integração está 1507 commits atrás.

## Itens

### 0. Frente e plano versionado
- Criar a frente com `git worktree add /c/D/frentes/cliente-documentos -b feat/cliente-aba-documentos origin/main`. Seguir o [index_publicacao_build](memória) para node_modules, tsc e vitest; nunca fazer junção de node_modules.
- Copiar este plano para `docs/planos/2026-11-15-cliente-aba-documentos.md` (REGRA #6).
- **Pronto quando:** o arquivo está commitado na branch.

### 1. Tipos canônicos: `types/clienteDocumentos.ts` (novo)
- Mover `DEAL_DOC_CHECKLIST` do `DealModal` para cá, com o nome `TIPOS_DOCUMENTO_CLIENTE: Record<'PF'|'PJ', {key,label}[]>`. As **mesmas chaves** (`rg_cnh`, `cpf`, …) continuam, porque `doc_checklist` grava essas chaves e o comentário avisa para não renomear.
- Acrescentar o tipo `outro` ("Outro documento"), com rótulo livre.
- Escrever as funções puras:
  - `chaveDoDocumento(doc)`: lê `doc.metadados?.documento_cliente`.
  - `documentoDoItem(docs, clientId, key)`: devolve o mais recente.
  - `situacaoDaValidade(doc, hoje)`: devolve `ok`, `vencendo` ou `vencido`, conforme `data_validade` e `alerta_dias_antecedencia`.
- `DealModal` passa a importar daqui. Remover a constante local.
- **Pronto quando:** `tsc` passa e `__tests__/clienteDocumentos.test.ts` cobre as três funções. O teste inclui o caso em que o mais recente ganha, a data sem validade e o fuso (`YYYY-MM-DD` comparado como data local).

### 2. Service: `services/clienteDocumentosService.ts` (novo, molde do serviço de empreendimento)
- `listar(clientIds: string[])`: uma consulta só em `opura_documents`, com `.in('client_id', ids)` e o embed `active_version:opura_document_versions!fk_active_version(*)`, ordenada por `created_at desc`. O DealModal com vários compradores faz uma chamada só. Abrir a aba **nunca grava nada**.
- `enviar(cliente, arquivo, meta)`: valida o arquivo com o limite de 50 MiB e `EXTENSOES_ACEITAS` (reutilizar as constantes exportadas pelo serviço de empreendimento) e chama `documentService.uploadNewDocument`.
  - Grava `organization_id = cliente.organization_id`. **É a organização do registro, não a do seletor do topo.**
  - Grava também `client_id`, `nome`, `categoria`, `tipo_documento` (rótulo), `data_validade`, `alerta_dias_antecedencia`, `tags: ['cliente', key]` e `opcoes.metadados = { documento_cliente: key }`.
- `atualizar(doc, meta, arquivo?)`: faz UPDATE direto em `opura_documents` aceitando `null`, como `atualizarNoGed`, mesclando `metadados`. Se vier um arquivo novo, ele vira nova versão (como `subirNovaVersao`).
- `excluir(doc)`: chama `documentService.deleteDocument` e repassa a mensagem de documento congelado.
- `urlDoArquivo(path, orgId, docId)`: chama `documentService.generateDownloadUrl`, que registra a auditoria de download.
- **Pronto quando:** `tsc` passa e o teste do item 1 cobre a montagem do payload com `metadados` (função pura extraída).

### 3. Migration de índice: `supabase/migrations/aplicar_2027111599xxxx_opura_documents_client_id_idx.sql`
- Conteúdo: `CREATE INDEX IF NOT EXISTS idx_opura_documents_client_id ON public.opura_documents(client_id) WHERE client_id IS NOT NULL;`. Não cria policy nem função, então a REGRA #7 não se aplica.
- Antes de nomear, conferir o prefixo em todos os nomes (memória de prefixo de migration).
- Aplicar com `npx supabase db query --linked -f`, **nunca** `db push`.
- **Pronto quando:** `SELECT indexdef FROM pg_indexes WHERE indexname='idx_opura_documents_client_id'` devolve uma linha.

### 4. Componente compartilhado: `components/clientes/DocumentosCliente.tsx` (novo)
- Props: `cliente` (`id`, `organization_id`, `type`, `name`), `documentos`, `onChange` e `tipoInicial?`. O componente também exporta `EnviarDocumentoClienteSheet`, para o checklist abrir o envio já com o tipo preenchido.
- **Tabela** (`components/ui/StandardTable.tsx`):
  - `storageKey="cliente:documentos"` e `searchScope={cliente.id}`.
  - Colunas: Nome (ícone por extensão via `renderFileIcon` de `components/documents/DocumentsTable.tsx`), Tipo, Validade (badge vencido/vencendo), Tamanho (à direita) e Enviado em/por.
  - `defaultSort` por data desc. A linha é clicável e abre o arquivo, usando o truque de `window.open` antes do `await`.
  - Ações (`ActionIconButton`): `view` (abrir), `edit`, "Abrir no GED" (`navigateToFocus('opura-docs', id, 'GED_DOCUMENTO')`) e `delete` com `useConfirm`.
  - Busca acoplada (§5.2) e "Enviar documento" (botão primário) em `toolbarRight`.
  - Estado vazio com ícone `FileText`.
- **Sheet de envio e edição:**
  - Dropzone no padrão de `PedidoDocumentos`.
  - Campos h-9: tipo (lista PF/PJ conforme `cliente.type` + Outro, com "Que documento é" no Outro), nome (preenchido com o rótulo do tipo ou o nome do arquivo) e validade. Categoria do GED fixa em `comercial` (decidido na implementação: um campo a menos, e o documento do cliente é sempre comercial).
  - `dirty` ligado. O botão desligado diz o motivo no `title`.
  - O `<form>` da Sheet chama `e.stopPropagation()` no submit. O evento sintético atravessa o portal e, sem isso, chegaria ao `<form id="client-form">`. Todo botão tem `type="button"`, salvo o submit da própria Sheet.
- **Permissão de escrita:** se `cliente.organization_id` não estiver em `useWritableOrganizations()` (caso de cliente compartilhado por `client_org_shares`), "Enviar", editar e excluir ficam desligados com o motivo: "Documentos deste cliente são da organização X".
- **Pronto quando:** `bash scripts/check-ui-standard.sh components/clientes/DocumentosClienteTabela.tsx` sai com 0, depois de conferir cada ❌ antes de tratá-lo como achado.

### 5. `components/ClientForm.tsx`: quarta aba "Documentos"
- Acrescentar `{ id: 'documentos', label: 'Documentos' }` a `CLIENT_TABS` e o subtítulo "Documentos do cliente — os mesmos que o comercial usa nas negociações."
- O conteúdo carrega `clienteDocumentosService.listar([id])` ao entrar na aba e renderiza `DocumentosClienteTabela`.
- Para cliente novo (sem `initialData?.id`), a aba aparece com o aviso "Salve o cliente para anexar documentos", sem tabela.
- Os botões "Salvar alterações" e `SaveStatus` não se misturam com o upload, porque o documento grava na hora.
- **Pronto quando:** `check-ui-standard.sh components/ClientForm.tsx` sai com 0 e, no navegador, o envio de um PDF aparece na tabela e no GED (com filtro por cliente).

### 6. `components/DealModal.tsx`: o checklist lê e grava em Meus Clientes
- Carregar `clienteDocumentosService.listar(idsDosCompradores)` quando a aba Cliente abre e quando os compradores mudam (`buyerClients` ou `selectedClient`).
- Em cada item do checklist (por volta da linha 3504):
  - O item está **atendido** se tem marcação manual (`isOn`) **ou** se `documentoDoItem(docs, pessoa.id, key)` existe. Essa conta é feita na leitura: **não** se grava `doc_checklist` automaticamente.
  - Com arquivo: o item fica verde com o ícone de arquivo, e o clique abre o arquivo. Se estiver vencido, o item fica âmbar com "vencido em dd/mm".
  - Sem arquivo: o clique continua alternando a marcação manual, e ganha o botão "Enviar", que abre `EnviarDocumentoClienteSheet` com `tipoInicial = key`. O arquivo grava no cliente (`client_id = pessoa.id`).
  - O contador `doneCount/items.length` conta os dois tipos de atendimento.
- Abaixo de cada bloco de comprador entra `DocumentosClienteTabela` (todos os documentos daquele cliente, inclusive "Outro"), com a nota "Gravados em Meus Clientes".
- **Pronto quando:** `check-ui-standard.sh components/DealModal.tsx` não piora em relação a `origin/main` e o teste de ponta a ponta do item 7 passa.

## Verificação de ponta a ponta (item 7)
1. `npx vitest run __tests__/clienteDocumentos.test.ts __tests__/orgContextGuard.test.ts` e `tsc`, ambos na frente.
2. `bash scripts/check-org-selector-guard.sh`, porque o código decide a organização de escrita.
3. No navegador, seguindo o [index_harness_navegador](memória):
   - (a) Em Meus Clientes, num cliente PF, enviar um RG com validade. Ele aparece na tabela, e ao abrir a URL assinada é servida.
   - (b) Numa negociação desse cliente, aba Cliente: "RG / CNH" já aparece ✓ com arquivo, sem nenhum clique.
   - (c) Ainda na negociação, enviar o "Comprovante de renda". Voltar a Meus Clientes e conferir que ele está lá.
   - (d) Na negociação com dois compradores, cada bloco mostra só os documentos do seu cliente.
   - (e) Num cliente de outra organização, só leitura: "Enviar" desligado e com o motivo.
   - (f) No GED, os dois documentos aparecem.
4. Conferir no banco: `SELECT nome, client_id, metadados FROM opura_documents WHERE client_id IS NOT NULL`.

## Fora do escopo (decidido)
- Minutas e versões de contrato, contrato assinado (ZapSign) e laudo de crédito continuam só no contrato.
- O checklist da análise de crédito (`deal_credit_analysis.checklist`, com chaves próprias) não é unificado agora.
- O JSONB legado `clients.client_documents` não é usado nem migrado.

## Andamento (15/11/2026)

- Item 0 ✅ frente `C:\Drentes\cliente-documentos`, branch `feat/cliente-documentos`.
- Item 1 ✅ `types/clienteDocumentos.ts` + `__tests__/clienteDocumentos.test.ts` (12 testes verdes).
- Item 2 ✅ `services/clienteDocumentosService.ts` (tsc exit 0, 0 erros).
- Item 3 ✅ índice aplicado; `pg_indexes` devolve `CREATE INDEX idx_opura_documents_client_id … WHERE (client_id IS NOT NULL)`.
- Item 4 ✅ `components/clientes/DocumentosCliente.tsx` (tabela + Sheet) — check-ui-standard exit 0.
- Item 5 ✅ aba Documentos no `ClientForm` — fica FORA do `<form id="client-form">` (o `<form>` continua montado, escondido), para o Enter da busca não submeter o cadastro. check-ui-standard exit 0.
- Item 6 ✅ `components/clientes/ChecklistDocumentosCliente.tsx`, usado pelo `DealModal` no lugar do checklist manual; `DEAL_DOC_CHECKLIST` saiu do DealModal. check-ui-standard exit 0.
- Achado no caminho: `StandardTable` (autoajuste, Anterior, Próxima) e `ColumnConfigButton` (`TableUtils.tsx`, 4 botões) não tinham `type="button"` — dentro do `<form>` da negociação, clicar neles gravaria a negociação. Corrigido na primitiva, sem mudança visual.
- Item 7: vitest + tsc + check-org-selector-guard ✅; navegador — pendente.
