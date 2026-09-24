# Gestão de Ativos — imagem do bem

## Pedido original

> Gestão de Ativos:
> 1. Editar Ativo Patrimonial: criar campo com dropzone area para carregar imagem
> 2. criar coluna imagem na tabela

Sessão de 24/09/2026.

## Decisões

- **Onde guardar o arquivo:** bucket `organization-assets` (público, já usado por
  foto/documento de colaborador). Foto de equipamento não é dado sensível e o
  bucket público dispensa assinar URL a cada render de linha da tabela.
  Caminho: `asset-photos/<organization_id>/<aleatório>.<ext>`.
- **O que a coluna guarda:** o **caminho** no bucket, não a URL. URL de bucket
  público se reconstrói (`getPublicUrl`); caminho gravado sobrevive a troca de
  domínio do projeto Supabase. Mesma convenção de `employee_documents.file_url`.
- **Validação:** `validateImageFile` novo em `lib/mimeValidation.ts` — jpg/png/webp,
  5 MB. Não reuso `validateDocumentFile` porque ele aceita PDF, que não é imagem.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270924000010_opura_assets_image_url.sql` | `ADD COLUMN IF NOT EXISTS image_url text` em `opura_assets` | `db query` devolve a coluna em `information_schema.columns` |
| 2 | `types/assets.ts` | `image_url?: string` em `OpuraAsset` | `npm run typecheck` passa |
| 3 | `lib/mimeValidation.ts` | `validateImageFile` + `IMAGE_ACCEPT_ATTR` | teste novo em `__tests__/mimeValidation.test.ts` passa |
| 4 | `services/assetService.ts` | `uploadImage` / `removeImage` / `imagePublicUrl` | typecheck; upload real grava no bucket |
| 5 | `components/ui/ImageDropzone.tsx` | componente de área de arrastar-e-soltar com prévia e remover | renderiza no drawer |
| 6 | `components/OpuraAssetsModule.tsx` | campo no drawer (criar/editar/duplicar/ver) + coluna `image` na tabela | coluna aparece, imagem sobe e volta ao reabrir o cadastro |

## Estado

- [x] 1–6 implementados
