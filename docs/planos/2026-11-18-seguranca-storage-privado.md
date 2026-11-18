# Segurança — arquivos de RH e de ativo por registro (F9) e bucket `documents` privado

## Pedido original

> Pedido delegado pela sessão que coordena a aplicação da varredura de segurança de
> 15/11/2026 (frente `seguranca-storage-privado`, 18/11/2026). Trecho do escopo,
> transcrito literalmente:
>
> "## Escopo (PR F)
> 1. **F9** (leia F9.md inteiro — duas tentativas rejeitadas e o desenho pedido): fotos e documentos de RH (alteração salarial, atestado, documentos do colaborador) e fotos de ativos são servidos do bucket PÚBLICO `organization-assets` sem autorização. Desenho pedido: chavear por REGISTRO, como `labor-documents` já faz — `labor-photos/<org>/<employee_id>/…` sob a RLS de employees, `asset-photos/<org>/<asset_id>/…` sob a RLS de opura_assets (ou buckets privados equivalentes, o que for mais coerente com o que existe); re-homear uploads "sem-organizacao" ao salvar; mover os objetos existentes por um SCRIPT de dados com service_role que o USUÁRIO roda (escreva o script em scripts/, idempotente, com modo `--ensaio` que só lista o que faria); abrir aba de download de forma síncrona no clique antes de atribuir a URL assinada (bloqueio de pop-up). Não dá para dar acesso por pasta de org compartilhada (employees_org_access tinha falha; já corrigida no #537 — confira a policy atual de employees antes de decidir).
> 2. **Bucket `documents` privado**: depois do F8, falta virar `public = false`. Inventarie TODO leitor (getPublicUrl('documents'…), URLs públicas gravadas em colunas do banco — conte por tabela/coluna com consulta de leitura, ex.: `LIKE '%/storage/v1/object/public/documents/%'`) e troque a leitura por URL assinada no momento de abrir (extraindo o caminho da URL gravada quando a coluna guarda URL inteira). A migration que faz `UPDATE storage.buckets SET public=false WHERE id='documents'` só vai DEPOIS do front no ar — diga isso no cabeçalho e no relatório. Faça o mesmo levantamento para `organization-assets`: o que nele é legitimamente público (logo da empresa em portal/PDF, por exemplo) e o que não é; se o certo for separar em dois buckets, proponha e implemente.
> 3. Teste: unidade para a extração de caminho de URL gravada e para o helper de URL assinada; teste que falha se surgir `getPublicUrl` novo para buckets privados.
> Fora do escopo: outros achados, RLS de tabelas que não sejam storage, portais (a não ser que leiam desses buckets)."

Notas da varredura (fora do git): `C:\D\frentes\security-scan\CLAUDE-SECURITY-20261115-005039\patches\F9.md` e `F8.md`.
Plano-mãe: `docs/planos/2026-11-18-seguranca-fase2-achados-restantes.md` (PR F).

## Levantamento em produção (leitura, 18/11)

### `organization-assets` (público, 10 objetos)

| Pasta | Objetos | Chave do caminho hoje | Referência no banco |
|---|---|---|---|
| `labor-documents/<colaborador>/…` | 6 | colaborador | `employee_documents.file_url` (6 linhas) |
| `labor-photos/<org>/<arquivo>` | 3 | só a org | `employees.avatar_url` (2 linhas; 1 arquivo órfão) |
| `asset-photos/<org>/<arquivo>` | 1 | só a org | `opura_assets.image_url` (1 linha — ativo já mudou de org) |
| `labor-salary-history/<colaborador>/…`, `absences/<org>/<ausência>.<ext>`, `trainings/<org>/<registro>.<ext>` | 0 | registro | o código grava, nenhum arquivo ainda |

Nada no bucket é legitimamente público: não há logo, papel timbrado nem arquivo de portal.
`services_proposals.pdf_storage_path` aponta para o bucket no GED, mas nenhum código grava e
há 0 linhas. **Decisão: um bucket só, privado**, com policies por registro (não vale a pena
separar: não sobra nada público para o bucket "público").

Policies atuais: `Permitir Leitura Pública` (SELECT para `public`), `Permitir Upload…` (INSERT
qualquer autenticado), `Permitir Exclusão…` (DELETE qualquer autenticado).

### `documents` (público, 39 objetos; policies por org do F8 já no ar)

URLs públicas gravadas no banco (`LIKE '%/object/public/documents/%'`, todas as 672 tabelas):

| Tabela.coluna | Linhas |
|---|---|
| `contract_document_versions.url` | 12 |
| `contracts.minuta_versions` (JSONB) | 2 |
| `contracts.signed_contract_url` | 2 |
| `investor_reports.url` | 2 |
| `clients.client_documents` (JSONB, legado sem leitor) | 1 |
| `organization-assets` em qualquer coluna | 0 |

Leitores: inventário no PR (seção Evidence). Portais que leem do bucket: Cliente (minuta e
contrato, por token), Parceiro (PDF do contrato, versões emitidas, NF da medição — por token e
logado sem ser membro) e Investidor (relatórios, por token). Nenhum tinha como assinar
`documents` — daí a Edge Function nova.

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 18/11 | Separar `organization-assets` em dois buckets? | Não: nada nele é público (tabela acima). O bucket inteiro vira privado. |
| 18/11 | Quem lê/grava cada pasta de `organization-assets`? | Chave = id do REGISTRO no caminho, avaliado sob a RLS da tabela dele (nunca a referência gravada em coluna, que quem chama controla). Foto do colaborador: lê quem ENXERGA o colaborador (inclui o compartilhamento `employee_org_shares`); grava/apaga quem é membro da org do colaborador. Documento e anexo salarial: lê e grava só membro da org do colaborador (o compartilhamento existe para pagar a pessoa, não para ver atestado e salário). Atestado e certificado: quem enxerga a ausência/o registro de treinamento. Foto de ativo: quem enxerga o ativo. |
| 18/11 | Foto antes de o registro existir (cadastro novo) | O arquivo fica no navegador (prévia local) e sobe no Salvar, já com o id do registro. Some o `sem-organizacao` e o órfão de quem desiste do cadastro. |
| 18/11 | Coluna que guarda URL inteira | Não se reescreve o banco: o leitor extrai o caminho (`caminhoNoBucket`). Escritor novo grava o CAMINHO. |
| 18/11 | Portais | Edge Function nova `portal-documentos-download`: chama a MESMA RPC que o portal usa, com a credencial de quem chamou, e só assina caminho que aparece na resposta (NF da medição: só se o caminho for do contrato da medição, porque o parceiro grava `invoice_url`). |

## Plano

1. **`supabase/functions/_shared/caminhoNoBucket.ts`** — extrai o caminho de URL pública,
   assinada ou autenticada, ou aceita caminho cru; recusa travessia. *Pronto quando:* teste de
   unidade cobre URL pública/assinada/autenticada/render, `%20`/acento, outro bucket, URL externa,
   `..`/`%2e%2e`.
2. **`lib/storageAssinado.ts` + `hooks/useUrlAssinada.ts` + `components/ui/ImagemAssinada.tsx`** —
   URL assinada na hora de abrir; aba aberta NO clique; `<img>` com cache em memória. *Pronto
   quando:* teste prova que `window.open` acontece antes da assinatura terminar, `opener` zerado
   e, em caso de erro, a aba mostra o motivo em vez de ficar em branco.
3. **F9 no front** — `laborService`, `LaborEmployeeForm`, `LaborDocuments`,
   `LaborEmployeeSalaryHistory`, `assetService`, `OpuraAssetsModule`. *Pronto quando:* nenhum
   `getPublicUrl('organization-assets')`; foto sobe no Salvar com o id no caminho.
4. **`documents` no front** — escritores gravam caminho; todo leitor assina. *Pronto quando:* a
   trava `__tests__/storagePrivadoSemUrlPublica.test.ts` passa e acusa um `getPublicUrl` plantado.
5. **Edge Functions** — `portal-documentos-download` (nova) e `partner-portal-upload` (devolve
   caminho). *Pronto quando:* `assinadoresSemTravessia` passa com a function nova na lista.
6. **Cache do Service Worker** — os dois buckets saem do cache público e as entradas antigas são
   apagadas no boot.
7. **Script de dados** `scripts/storage-rehomear-fotos.mjs` (`--ensaio`). *Pronto quando:* o
   ensaio em produção lista os 3 movimentos esperados.
8. **Migrations** — `aplicar_20271118914000_storage_organization_assets_por_registro.sql` e
   `aplicar_20271118914100_storage_documents_privado.sql`. *Pronto quando:* `segurancaMigrations` e
   `migrationsPrefixo` passam; a primeira aborta se ainda houver foto no layout antigo.

## Ordem de publicação (não inverter)

1. Merge do PR (front no ar).
2. Deploy das Edge Functions `portal-documentos-download` e `partner-portal-upload` (usuário).
3. `node scripts/storage-rehomear-fotos.mjs --ensaio`, depois sem `--ensaio` (usuário).
4. Migration `aplicar_20271118914000_…` (usuário) — `organization-assets` privado.
5. Migration `aplicar_20271118914100_…` (usuário) — `documents` privado.

## Estado

- [x] 1 — `caminhoNoBucket` + casos de borda (aceitos e recusados) em `__tests__/storageAssinado.test.ts`
- [x] 2 — helpers + hook + `ImagemAssinada`; teste prova aba aberta antes da assinatura e motivo na aba em caso de erro
- [x] 3 — F9 no front (foto sobe no Salvar, na pasta do registro)
- [x] 4 — `documents` no front; trava `storagePrivadoSemUrlPublica` acusou um `getPublicUrl` plantado
- [x] 5 — `portal-documentos-download` (nova, com a 2ª conferência: arquivo na pasta do registro) e `partner-portal-upload`
- [x] 6 — cache do Service Worker
- [x] 7 — script com `--ensaio`; plano testado em `__tests__/storageRehomearFotos.test.ts` (rodar exige a service_role: usuário)
- [x] 8 — migrations aplicadas 2× num PostgreSQL 9.6 local com mock do schema: abortam antes do script; A/B/C/anon com o acesso esperado
- [ ] publicação 1–5 (usuário)

## Achados laterais (fora do escopo, não corrigidos)

- `contract_document_versions`: a policy `Users can manage contract document versions` é
  `ALL USING (contract_id IN (SELECT id FROM contracts))` — sob a RLS de `contracts`, o
  PARCEIRO (que enxerga o contrato por `contracts_select_partner`) também insere, altera e
  apaga versões, inclusive emitidas, que o Portal do Cliente mostra. É RLS de tabela (fora deste
  PR). A Edge Function nova não confia nessa coluna: só assina arquivo da pasta do contrato.
- `partner_portal_set_measurement_invoice` grava qualquer texto em `invoice_url`. Idem: a function
  só assina NF em `invoices|measurements/<contrato da medição>/`.
