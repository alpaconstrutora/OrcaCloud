# PLANO — Privatização de Buckets de Storage (public=true → signed URLs)

> Origem: rollout de segurança RLS anon (migrations 20270208000001-3). Ao mapear
> o storage, descobrimos que vários buckets são `public=true` — arquivos
> **legíveis por qualquer um com o path da URL, sem autenticação**, independente
> de policy RLS. Isso é exposição maior que as policies anon já removidas.
> Documento de referência de memória: `project_rls_anon_rollout.md`.

## Por que `public=true` é o problema

Bucket público serve objetos via URL pública **sem checar RLS nem sessão**. Basta
conhecer/adivinhar o path (que costuma vazar em logs, no DOM, no histórico do
navegador, em prints, ou é sequencial/derivável). Policy RLS **não protege** um
bucket público na leitura — só a flag `public=false` + signed URL protege.

## Sequência SEGURA por bucket (ordem importa — não inverter)

Virar um bucket privado **quebra imediatamente** toda leitura via `getPublicUrl`.
Por isso, por bucket:

1. **Garantir policy `SELECT` (authenticated/org-scoped)** no bucket — senão, ao
   privatizar, nem o usuário logado lê. (Vários já têm; ver tabela.)
2. **Trocar todos os call sites de leitura** de `getPublicUrl` → `createSignedUrl`
   (TTL ex. 15 min, como o `documentService` do opura-docs já faz). Gerar a URL
   **no momento da leitura**, não persistir URL no banco.
3. **Deploy do código.**
4. **Só então** aplicar a migration que faz `UPDATE storage.buckets SET public=false`.
5. **Verificar** no app (download/preview) que o fluxo real funciona autenticado.

> Pré-condição que barateia tudo: se o código guarda **path** (não a URL pública
> inteira) no banco, a troca é local (só o call site de leitura muda). Confirmado
> nesse padrão: `boletoService` guarda `documento_path`. Validar por bucket antes.

## Auditoria dos buckets (2026-07-15, contra o remoto)

### 🔴 P1 — Privatizar (sensível: financeiro/fiscal/pessoal)

| Bucket | Objetos | Conteúdo | Policy auth existe? | Leitura hoje (converter) |
|---|---|---|---|---|
| `boletos` | 659 | Boletos bancários | `boletos_storage_all` (revisar escopo) | `boletoService.ts:539` getPublicUrl |
| `fiscal-documents` | 302 | NF-e / XML / DANFE | ✅ `fiscal_docs_select` org-scoped | `nfeService` grava; **checar onde lê** (pode persistir URL) |
| `documents` | 25 | Docs de contrato/cliente | "Public Access" (revisar) | `ClientArea.tsx:266`, `ContractDetailView.tsx:3746` |
| `invoices` | 15 | NF do fornecedor | vários (redundantes) | `invoiceService.ts:122` getPublicUrl ⚠️ tem INSERT anon (fornecedor) |
| `receipts` | 2 | Comprovantes de pagamento | "Authenticated Receipt *" ✅ | `receiptService.ts:53` |
| `credit-analysis` | — | Análise de crédito (pessoal) | **bucket não apareceu em storage.buckets** — verificar existência | `creditAnalysisService.ts:90` |

### 🟡 P2 — Revisar (evidências org-scoped; várias VAZIAS = fácil agora)

| Bucket | Objetos | Nota |
|---|---|---|
| `compliance-evidences` | 0 | **Vazio** → privatizar já, só converter `complianceService.ts:325` |
| `operational-evidence` | 0 | **Vazio** → converter `OperacionalChecklist.tsx:391` / `OperacionalEvidence.tsx:81` |
| `incentive-evidence` | 0 | **Vazio** → converter `LaborIncentivos.tsx:181` / `LaborDocuments.tsx:66` |
| `broker-materials` | 12 | ⚠️ Portal do Corretor (anon token) ESCREVE aqui; leitura pode ser pública por design — decidir |
| `measure-plants` | 1 | Imagem de planta no canvas; anon já removido (mig. 20270208000003) |

### 🟢 Manter público (legitimamente público)

| Bucket | Objetos | Justificativa |
|---|---|---|
| `opportunity-photos` | 1 | Fotos do marketplace público (PublicMarketplaceView) — por design |
| `organization-assets` | 6 | Logo/papel timbrado da org usado em PDFs/gerados — **confirmar que não há doc sensível misturado** |

### Já privados (OK — referência do padrão correto)
`opura-docs` (signed URL 15min), `opportunity-dataroom`, `company-documents`,
`company-certificates`, `condition-evidence`, `services-visits`,
`warranty-evidence`, `document-templates`.

## Fases sugeridas

- **Fase 0 — Vazios (risco ~zero): ✅ CONCLUÍDA (2026-07-15).** Privatizados
  `compliance-evidences`, `operational-evidence`, `incentive-evidence` (0
  objetos). Migration `20270208000004_storage_fase0_evidence_buckets.sql`.
  Achados extras corrigidos no mesmo passo (buckets vazios = momento seguro):
  - `operational-evidence` não tinha NENHUMA policy (RLS ligado, zero
    policies) — upload de evidência de OS já estava quebrado em produção
    (por isso 0 objetos). Criadas policies org-scoped SELECT/INSERT/UPDATE/
    DELETE.
  - `compliance-evidences`/`incentive-evidence` tinham escrita
    (INSERT/UPDATE/DELETE) SEM escopo de organização — qualquer empresa
    logada podia escrever/apagar evidência de outra. Substituídas por
    policies org-scoped (`storage.foldername(name)[1]`/`[2]` IN org do
    membro, mesmo padrão do opura-docs).
  - Código convertido de URL-pública-persistida-no-banco para
    path-persistido + signed URL resolvida na leitura:
    `services/complianceService.ts` (`uploadEvidenceFile` retorna path;
    novo `getEvidenceSignedUrl`), `components/ComplianceChecklists.tsx`
    (`<a href>` → botão com resolução assíncrona), `components/LaborIncentivos.tsx`
    (`uploadAttachment` retorna path; `abrirComprovante` helper de módulo),
    `components/OperacionalEvidence.tsx` (resolução em lote via
    `signedUrls` state, pois `<img src>` precisa da URL de forma síncrona;
    `handleDelete` simplificado — `file_url` já é o path).
  - **Correção pós-aplicação:** `OperacionalChecklist.tsx:391` (upload de foto
    do checklist, que grava na MESMA tabela `evidence_files`) tinha ficado de
    fora e continuava com `getPublicUrl` → gravava URL pública quebrada no
    bucket já privado. Corrigido para persistir o `path` (o componente só usa
    `evidence_id` como indicador booleano; não renderiza a imagem). Outros
    consumidores de `evidence_files`: `OperacionalDetail.tsx` só conta (badge);
    `workOrderService.addEvidence` é código morto (sem callers).
  - `npx tsc --noEmit` limpo no projeto inteiro após as mudanças.
- **Fase 1 — Financeiro/fiscal (alto valor):** `boletos`, `fiscal-documents`,
  `receipts`, `invoices`. Um bucket por vez, com a sequência segura. Atenção ao
  `invoices` (fluxo anon do fornecedor: upload pode precisar de signed upload URL
  ou edge function; leitura vira signed).
  - **`receipts` ✅ (piloto dado real, 2026-07-15) — migration
    `20270208000005_storage_fase1_receipts_private.sql` (CRIADA, aguardando
    aplicação).** receiptService já persistia o PATH (photo_path) — só a leitura
    mudou: `SupplyChainOrderDetails.tsx` troca `storageService.getPublicUrl` por
    signed URL 15min resolvida em estado (`receiptPhotoUrls`, helper
    `resolveReceiptPhotos` chamado nos 2 pontos de carga). Migration: remove
    "Public Receipt Access" (role public) + as 3 policies de escrita não-escopadas;
    cria 4 org-scoped via JOIN purchase_orders→organization_members (path keyed
    por orderId); `SET public=false`. tsc limpo.
    ⚠️ Descoberta: `purchase_orders` tem RLS `qual=true` (SELECT/INSERT/DELETE) —
    NÃO é org-scoped nem na camada authenticated (qualquer logado lê/apaga PO de
    qualquer empresa). Dívida separada (camada autenticada, não storage) — anotada,
    não corrigida aqui. Por isso o escopo de org de receipts usa JOIN explícito.
  - Restantes Fase 1: `fiscal-documents`, `boletos`, `invoices` (pendentes).
- **Fase 2 — Documentos:** `documents` (contrato/cliente), `credit-analysis`
  (confirmar existência do bucket antes).
- **Fase 3 — Decisões de produto:** `broker-materials` (corretor escreve anon),
  `organization-assets` (auditar conteúdo).

## Riscos / armadilhas

- **URL persistida no banco:** se algum módulo salvou a URL pública inteira (não
  o path) em coluna, privatizar quebra os registros antigos e exige backfill.
  Verificar por bucket (`boletos` guarda path — OK; validar os demais).
- **`invoices` tem INSERT anon** (fornecedor): privatizar a leitura é ok, mas o
  upload anon precisa continuar funcionando (signed upload URL / edge function).
- **PDFs gerados / e-mails** que embutem URL pública (ex.: boleto enviado por
  e-mail com link direto): signed URL expira (15 min) — para link durável, servir
  via rota autenticada ou signed URL de TTL longo/renovável. Avaliar caso a caso.
- **`organization-assets`** costuma alimentar cabeçalho de documento gerado no
  cliente (`docx`/PDF) — se virar privado, a geração precisa buscar signed URL
  antes de renderizar.
