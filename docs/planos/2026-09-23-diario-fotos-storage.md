# Diário de Obras — mídia (fotos, vídeos, documentos) em Storage

## Pedido original

> Mover para Storage

Sessão de 23/09/2026, em resposta à observação feita ao fim da entrega do
Diário mobile (`docs/planos/2026-09-23-diario-obras-mobile.md`): *"fotos
continuam como data URL dentro do JSONB, igual ao desktop — em campo, com muitas
fotos por dia, o `settings` do projeto vai crescer rápido"*.

## Estado de partida (medido no banco em 23/09/2026)

| | |
|---|---|
| Onde a mídia mora | `projects.settings.diaryEntries[].images/videos/documents` — **base64 (data URL) dentro do JSONB** |
| Volume hoje | 1 projeto, 2 registros, **1 foto** (75 kB) — não há backfill a fazer |
| Quem grava | `ProjectDiaryManager.handleFileUpload` (desktop), `DiaryMobileApp.addFotos` (mobile) |
| Quem lê | `ProjectDiaryManager` (grade de arquivos), `DiaryReportViewer` (relatório para impressão), `DiaryMobileApp` (folha + resumo), `ClientArea` (aba Diário — interno autenticado **e** link público por token) |
| Portal por token | `client_portal_get_data` devolve o `settings` inteiro do projeto vinculado ao cliente — a foto chega ao portal **sem sessão** |

## Decisões

- **Bucket privado `diario-midia`**, `public=false`, 50 MiB, allowlist de MIME
  (imagem, vídeo, PDF/Office; sem `text/html`). Path `{org}/{projeto}/{uuid}.{ext}`
  — o primeiro segmento é a organização porque é isso que as 4 policies
  (`is_org_member((storage.foldername(storage.objects.name))[1]::uuid)`) leem;
  molde: `aplicar_20270919000005_condominio_documentos_upload.sql`.
- **O campo não muda de nome nem de tipo.** `images: string[]` passa a guardar o
  **path** do objeto; `videos` idem; `documents[].url` idem. Nada de coluna nova:
  é JSONB. Resolução para URL assinada acontece **na leitura**, nunca é
  persistida (armadilha F0/F1 da privatização de storage).
- **Data URL antiga continua valendo.** `signDiaryMediaUrls` deixa passar
  `data:`/`http(s):`/`blob:` sem tocar — a única foto existente segue abrindo, e
  qualquer diário exportado/importado antigo também.
- **Portal por token** não tem sessão nem é membro da org → edge function
  `client-portal-diary-download`, no molde da `client-portal-condominio-download`:
  chama a **mesma RPC** que o portal chama (`client_portal_get_data`), com a
  credencial do chamador, e só assina os paths que estão na lista que voltou.
  A autorização não é reescrita (REGRA #7, pergunta 3).
- Cliente **logado** (preview interno autenticado) e todo o resto do app
  assinam direto pelo `supabase.storage` — a policy de leitura é `authenticated`
  + membro da org.

## Itens — 9 de 9 concluídos em 23/09/2026

### 1. ✅ `supabase/migrations/aplicar_20270919000055_diario_midia_storage.sql`
Bucket + 4 policies org-scoped + bloco de conferência.
**Pronto quando:** aplicada com `db query -f`; conferência devolve
`bucket_privado=1, policies_org=4, policies_anon=0`; `segurancaMigrations.test.ts`
e `migrationsPrefixo.test.ts` verdes.

### 2. ✅ `services/diaryMediaService.ts` (novo)
`isDiaryStoragePath`, `buildDiaryMediaPath`, `uploadDiaryMedia`,
`signDiaryMediaUrls` (lote; passthrough para data URL; via edge function quando
há `portalToken`), `removeDiaryMedia`.
**Pronto quando:** `__tests__/diaryMediaService.test.ts` verde.

### 3. ✅ `hooks/useDiaryMediaUrls.ts` (novo)
`useDiaryMediaUrls(refs, portalToken?) → Record<ref, url>` — passthrough
síncrono para o que não é path, assinatura em lote para o que é.
**Pronto quando:** as quatro telas abaixo renderizam a foto a partir do mapa.

### 4. ✅ `components/ProjectDiaryManager.tsx`
Upload → Storage (foto, vídeo, documento); grade de arquivos lê pelo hook;
estado "Enviando…"; org resolvida por `settings.organizationId` → prop
`organizationId` → `projectService.loadProject`.
**Pronto quando:** enviar uma foto grava um **path** em `images` (não `data:`)
e ela aparece na grade.

### 5. ✅ `components/DiaryMobileApp.tsx`
`addFotos` → Storage; folha e resumo leem pelo hook; botão "Enviando…".
**Pronto quando:** harness Playwright intercepta `POST storage/v1/object/diario-midia/...`
e o PATCH do projeto leva o path.

### 6. ✅ `components/DiaryReportViewer.tsx`
Registro fotográfico lê pelo hook.

### 7. ✅ `components/ClientArea.tsx`
Aba Diário (tabela, cards, modal — fotos, vídeos e documentos) lê pelo hook, com
`portalToken` quando é o link público.

### 8. ✅ `supabase/functions/client-portal-diary-download/index.ts` (novo)
`{token, storagePaths[]}` → valida pela RPC do portal → assina só o permitido.
**Pronto quando:** publicada (`supabase functions deploy`) e provada de fora:
OPTIONS 200; POST com token falso 403; path fora da lista 403.

### 9. ✅ Verificação
`tsc`, `check-ui-standard.sh` nos arquivos tocados, `orgContextGuard`,
`segurancaMigrations`, `migrationsPrefixo`, suíte completa; harness Playwright
do mobile e do desktop com o storage interceptado.

## Como foi verificado (23/09/2026)

- Migration **aplicada no remoto** com `db query -f`; conferência devolveu
  `bucket_privado=1, policies_org=4, policies_anon=0`. Antes de aplicar o banco
  não tinha nem bucket nem policy (0/0) e `is_org_member` existia.
- Edge function **publicada** (`supabase functions deploy`) e provada de fora:
  OPTIONS 200 · POST sem credencial 401 (gateway) · token falso 403 (gate
  próprio) · token real + path fora da lista 403 ("Arquivo não disponível para
  este acesso") · body vazio 400. Não há prova positiva end-to-end porque nenhum
  registro em produção tem path de bucket ainda (só data URL).
- Tela vista de verdade (harness isolado + Playwright, PostgREST e Storage por
  stub, nada gravado), mobile e desktop: foto antiga em data URL renderiza sem
  assinar; foto em bucket renderiza pela URL assinada; assinatura em lote leva
  só paths; upload vai para `POST /object/diario-midia/{org}/{projeto}/{uuid}.png`;
  o PATCH do projeto grava o PATH (nunca base64 novo); documento abre por link
  assinado; remover foto salva → objeto órfão sai do bucket; data URL nunca vai
  para `remove()`.
- Guardas: `tsc` limpo; `check-ui-standard`, `check-system-projects`,
  `check-project-classification` limpos nos 4 componentes; `check-xss-sinks`
  limpo; `orgContextGuard` 14/14; `segurancaMigrations` e `migrationsPrefixo`
  verdes (a migration nasceu `000030`, colidiu, passou por `000040` — também
  tomado — e ficou `000055`, primeiro livre).

## Publicação (23/09/2026)

- Commit `eba67207` em `main` (push direto, REGRA #8). Suíte completa na frente:
  442 arquivos / 5104 testes verdes; `verificar:build` limpo.
- Ordem respeitada: migration aplicada e function publicada ANTES do push do
  frontend — o app novo já encontrou bucket e function no ar.
- Provado de fora com `conferir-producao.sh "Falha ao enviar a foto"`: texto
  novo presente no bundle servido (outra frente já tinha empurrado `85ac9a8`
  em seguida; o "faltam 1 commit" é ela, não este).
