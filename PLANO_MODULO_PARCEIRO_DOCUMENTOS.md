# Plano — Conectar Portal do Parceiro com Gestão de Documentos (ÒPURA Docs)

## Diagnóstico: a conexão já existe (nível básico)

Diferente de outros portais (ex: Portal do Cliente, que usa um array JSON solto em
`settings`/bucket `documents` — sem tabela própria nem RLS granular), o **Portal do
Parceiro é o único precedente que já consome o módulo formal `opura_documents`**:

- Tabela ponte `partner_shared_documents (partner_workspace_id, document_id → opura_documents, shared_by, shared_at)`
  — `20261219000000_create_partner_workspace.sql`.
- RLS extra em `opura_documents` (`docs_select_partner`) e `storage.objects` bucket
  `opura-docs` (`storage_docs_select_partner`), liberando leitura só do que foi
  explicitamente compartilhado.
- `partnerService.listSharedDocuments/shareDocument/unshareDocument` (`services/partnerService.ts:308-353`).
- UI: `PartnerWorkspaceManager.tsx` (aba "Documentos GED", lado interno — compartilhar/
  remover) e `PartnerPortal.tsx` (aba "Documentos", lado externo — listar/baixar).

O que falta não é a ponte em si, e sim **fechar os gaps de usabilidade e completude**
que fazem esse elo parecer "meio-feito". Este plano ataca esses gaps, em ondas
independentes (cada uma shippable sozinha).

## Onda 1 — Compartilhar direto do módulo de Documentos (hoje é via mão única)

Hoje só dá pra compartilhar um documento com um parceiro entrando em
**Suprimentos → Parceiros → workspace → aba Documentos → "Compartilhar Arquivo"**
(`PartnerWorkspaceManager.tsx:604-637`), escolhendo de um `<select>` plano com
**todos** os documentos da org (sem filtro por categoria/projeto/fornecedor).
Quem está no `OpuraDocsModule.tsx` olhando o documento não tem nenhuma ação de
"compartilhar com parceiro" ali.

- Adicionar ação "Compartilhar com Parceiro" no card/linha de documento do
  `OpuraDocsModule.tsx` (menu de ações, ao lado de aprovação/versões).
- Modal lista só os `partner_workspaces` ativos da org (`partnerService.listWorkspaces`),
  não os documentos — inverte o fluxo (mais natural: "estou vendo o doc, escolho o parceiro").
- Reusa `partnerService.shareDocument(workspaceId, documentId, sharedBy)` — nenhuma
  mudança de schema.

## Onda 2 — Filtrar o seletor de documentos por relevância ao fornecedor

O `<select>` de "Compartilhar Arquivo" em `PartnerWorkspaceManager.tsx:611-624` traz
`opura_documents` sem filtro algum. `opura_documents` já tem coluna `supplier_id`
(preenchida quando o doc nasce vinculado a um fornecedor — contratos, notas, etc. via
`documentService.uploadNewDocument`). Dá pra melhorar sem schema novo:

- Filtrar/ordenar o select priorizando `supplier_id = workspace.supplier_id` ou
  `project_id` em obras onde esse fornecedor tem contrato ativo (`contracts` já
  relaciona `supplier_id` + `project_id`).
- Agrupar por categoria (`juridico`, `engenharia`, `compliance`, `financeiro`,
  `comercial`) no dropdown para não virar uma lista única gigante conforme a org cresce.

## Onda 3 — Notificação ao compartilhar (hoje é silencioso)

`shareDocument` insere na ponte mas não dispara nada — o parceiro só descobre o
documento novo se entrar no portal e olhar. Já existe o padrão de notificação em
`documentService.submitForApproval` (via `notificationService.sendNotification`) e
já existe realtime habilitado para `partner_messages`/`partner_requests`.

- Em `partnerService.shareDocument`, após o insert, disparar
  `notificationService.sendNotification` para os `partner_users` ativos do workspace
  (mesmo padrão de link `#/...` usado no fluxo de aprovação).
- Opcional: registrar em `opura_document_audit_logs` a ação de compartilhamento
  (o enum de `action` em `documentService.logDocumentAction` precisa ganhar um valor
  novo, ex. `'compartilhado_parceiro'`).

## Onda 4 — Navegação por pasta no lado do parceiro (hoje é grid plano)

`opura_folders` já existe (pastas virtuais por categoria/projeto) e o Portal do Cliente/
GED interno navega por elas, mas `PartnerPortal.tsx` (aba Documentos, linha 459-503) e
`PartnerWorkspaceManager.tsx` (linha 385-433) mostram os documentos compartilhados
sempre em grid plano, sem respeitar a estrutura de pastas do doc original.

- Baixo esforço, cosmético: agrupar visualmente os `sharedDocs` por `document.categoria`
  na aba Documentos do parceiro (não precisa navegação de pastas completa — é
  visualização, não temos hierarquia própria do parceiro).

## Onda 5 (mais ousada, avaliar necessidade real antes) — Parceiro enviar documento de volta

Hoje o parceiro só **recebe**. O fluxo de "Solicitações" já tem tipo `DOCUMENTACAO`
("Envio de Documentação") mas a solicitação (`partner_requests`) não tem upload de
arquivo — só texto. Se o objetivo for fechar o ciclo (parceiro anexa nota fiscal,
ART, contrato assinado, etc.), isso é feature nova, não conexão:

- Adicionar `attachment_path`/`attachment_paths[]` em `partner_requests` (migration).
- Upload para bucket `opura-docs` num path isolado por parceiro (nova RLS de INSERT
  para `partner_users`, hoje só existe SELECT).
- Ao anexo ser aprovado/processado, opcionalmente promover para um `opura_documents`
  formal (ligando `supplier_id`/`contract_id`) — decisão do time interno, não automática.
- **Não implementar por padrão** — só entrar no roadmap se o usuário confirmar que
  precisa desse caminho reverso; é a onda de maior risco (RLS de escrita externa).

## Ordem recomendada

1 → 3 → 2 → 4. Onda 5 fica em espera (PRD à parte) por mexer em RLS de escrita para
usuário externo, que é a superfície de maior risco de segurança do módulo.

## Verificação

- `tsc --noEmit` antes de qualquer push (build quebra com qualquer erro TS, ver
  `RUNBOOK_DEPLOY.md`).
- Testar com um workspace de parceiro ativo real: compartilhar pela Onda 1, conferir
  que RLS (`docs_select_partner`) ainda restringe a leitura só ao documento
  compartilhado (não abre a org toda).
- Onda 3: conferir que a notificação chega só para `partner_users` com `is_active = true`
  do workspace certo (não vazar para outros parceiros).
