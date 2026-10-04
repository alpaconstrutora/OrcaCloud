# Contratos › Emissão — "Gerar pelo modelo" grava versão em PDF

## Pedido original

> corrija esses três pontos e mais um, ao clicar em  Emitir Contrato (.docx) ele NAO FOI  para a tabela de documentos como Rascunho como voce disse

Sessão: 96c7e92a-06fb-4a92-b248-08960e4208ee · 2026-10-04, madrugada.

"Esses três pontos" foram listados na resposta anterior, ao explicar o botão:
1. cada clique cria uma versão (Baixar .docx + Baixar PDF = duas versões iguais);
2. o nome "Emitir Contrato (.docx)" confunde — gera e baixa; quem emite é o
   "Emitir" da tabela;
3. "Gerar PDF do sistema" (sem modelo) fica fora do controle de versões.

## Diagnóstico do "mais um" (a versão não aparecia)

Não era a tela: o **bucket `documents` só aceita PDF e imagens** desde
`aplicar_20270918000008_storage_bucket_documents.sql` (auditoria de segurança
C3-07, 18/09/2026). O `.docx` gerado é recusado no upload → `addVersionFromBlob`
lança → toast de erro de 4,5 s, o arquivo baixa mesmo assim e nenhuma versão é
criada. Banco em 04/10: as 4 versões `TEMPLATE_DOCX` existentes são todas
`application/pdf`; nenhuma `.docx`. O mesmo vale para "Subir documento" com
`.docx` (o seletor oferecia DOCX).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-04 | Versão em PDF sempre, ou liberar .docx no bucket? | "Versão sempre em PDF (Recomendado)" — o .docx vira só download para editar; "Subir documento" aceita só PDF; bucket intocado |
| 2026-10-04 | Migration para a origem "Sistema" (PDF do sistema virar versão)? | "Sim, aplicar a migration" |

## Plano

1. **Migration `aplicar_20271004000010_cdv_source_sistema.sql`** — a CHECK de
   `contract_document_versions.source` passa a aceitar `'SISTEMA'`.
   *Pronto quando:* `pg_get_constraintdef` no banco mostra `SISTEMA`.
2. **`types/contracts.ts`** — `DocumentSource` ganha `'SISTEMA'`; tabela mostra
   "PDF do sistema" na coluna Origem.
3. **`components/EmitDocumentModal.tsx`** — com `persistVersion`: botão
   primário **"Gerar versão (PDF)"** (grava UMA versão PDF e baixa) e secundário
   **"Baixar .docx para editar"** (só baixa; diz que não vira versão). Título
   "Gerar documento pelo modelo".
   *Pronto quando:* nenhum caminho grava `.docx` no bucket e um clique = uma versão.
4. **`components/ContractDetailView.tsx`** — botão renomeado para **"Gerar pelo
   modelo"**; "Gerar PDF do sistema" grava versão `SISTEMA` e recarrega a tabela.
   `services/exportService.ts` devolve o Blob do PDF.
5. **`components/contracts/DocumentVersionsPanel.tsx`** — "Subir documento"
   aceita só PDF (com aviso se vier outro tipo).
6. **Verificação** — teste novo (falha no código antigo), `tsc`,
   `check-ui-standard.sh`, suíte, conferência visual.

## Estado

- [x] 1 · migration aplicada e conferida — `pg_get_constraintdef` mostra os 4
      valores com `SISTEMA` (04/10)
- [x] 2 · tipo `SISTEMA` — coluna Origem mostra "PDF do sistema"
- [x] 3 · EmitDocumentModal — "Gerar versão (PDF)" grava 1 versão PDF;
      "Baixar .docx para editar" só baixa e avisa; falha ao gravar mantém o
      painel aberto com o erro (antes fechava e o toast sumia em 4,5 s)
- [x] 4 · ContractDetailView + exportService — botão "Gerar pelo modelo"; PDF do
      sistema grava versão `SISTEMA` e recarrega a tabela
- [x] 5 · Subir documento só PDF — `accept` + conferência por tipo/extensão, com
      o motivo na tela
- [x] 6 · Verificação
  - `tsc` limpo; `check-ui-standard.sh` limpo nos 3 arquivos de tela
  - trava `__tests__/components/GerarPeloModeloVersaoPdf.test.tsx`: 6/6 falham
    no código antigo, 6/6 passam no novo
  - suíte: 7294 = 7260 passou + 34 pulados, 0 falha (JSON conferido); build ok
  - **gravação REAL** autorizada ("Sim, gravar e deixar lá"),
    `c:/tmp/pwtest/gerar-pelo-modelo-real.js`, CTS-018-104-0001: upload Storage
    200, INSERT 201, v3 na tabela, banco: `application/pdf` 2,5 MB, rascunho;
    0 escritas fora do fluxo, 0 erros de console. A v3 ficou no contrato.
  - NÃO exercitado de ponta a ponta: o "Gerar PDF do sistema" (só aparece em
    organização sem nenhum modelo) — coberto pelo teste de código-fonte.

## Lição

Na entrega anterior afirmei que o .docx "ia para a tabela como Rascunho" com
base num roteiro que BLOQUEAVA as escritas — ele provava a leitura, nunca a
gravação, e o bloqueio do bucket passou batido. Gravação só se afirma com
gravação real conferida no banco.
