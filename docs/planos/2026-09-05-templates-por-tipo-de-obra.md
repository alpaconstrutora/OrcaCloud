# Templates por Tipo de Obra — reconectar o módulo à obra

## Pedido original

Sessão de 2026-09-05.

> engenharia < Templates por Tipo de Obra: verifique este módulo. Esta conectado a obras?

Resposta da verificação (resumo): sim, o elo existe e é `projects.settings.tipoObra`,
mas 11 das 15 obras estão sem esse campo, a personalização por organização **nunca
gravou** (erro `42P10` no `upsert`), o editor recebe `orgId` pelo padrão proibido da
REGRA #5 e o ProjectModal mostra documentação de uma constante hard-coded em vez do
template. Segundo pedido, na sequência:

> corrija seguindo sua recomendacao

A recomendação dada, nesta ordem: (1+2) migration do índice único + tirar o `id` do
draft; (3) `useOrgContext`/`useOrgWriteTarget` no editor; (4) ProjectModal lendo
`required_docs` do template em vez da constante.

## Diagnóstico (o que foi medido, não inferido)

| # | Defeito | Evidência |
|---|---|---|
| 1 | `saveOrgTemplate` faz `upsert(..., { onConflict: 'tipo_obra,org_id' })`, mas o único índice de org (`idx_org_templates`) **não é unique** | `ON CONFLICT (tipo_obra, org_id)` no banco remoto devolve `ERROR: 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`; e `select ... where org_id is not null` devolve **0 linhas** desde 2026-05 |
| 2 | O draft do editor clona o template de sistema **com o `id` dele** (`{ ...sys, org_id: orgId }`) | `ProjectTypeTemplateEditor.tsx:91`. Se o item 1 fosse "consertado" trocando o conflito para `id`, o save faria UPDATE na linha de sistema e a sequestraria para uma organização |
| 3 | `<ProjectTypeTemplateEditor orgId={activeOrganizationId \|\| ''} />` | `AppRouter.tsx:1193` — o padrão proibido da REGRA #5. Em "Todas as organizações" o editor não lista tipo nenhum (o `useEffect` só roda `if (orgId)`) e o save gravaria `org_id: ''` → `22P02` |
| 4 | O ProjectModal mostra "Documentação exigida" a partir de `REQUIRED_DOCS_BY_TYPE`, constante no próprio arquivo | `ProjectModal.tsx:166` e `:1675`. Editar o template não muda o que o formulário da obra mostra |

## Itens

Um item por arquivo. Cada um diz o que muda e como sei que terminou.

### 1. `supabase/migrations/aplicar_20270919000008_project_type_templates_unique_org.sql` (novo)

**Muda:** cria `UNIQUE INDEX ... (tipo_obra, org_id) NULLS NOT DISTINCT` — índice
**cheio**, não parcial. Parcial não serve: a inferência de arbiter do Postgres só casa
um índice parcial se o `INSERT` repetir o predicado no `ON CONFLICT ... WHERE`, e o
PostgREST não emite esse `WHERE`. `NULLS NOT DISTINCT` (PG 15+; o banco está em 17.6)
faz o índice cobrir também as linhas de sistema (`org_id IS NULL`).

Sem `CREATE POLICY` nem `CREATE FUNCTION` → a REGRA #7 não se aplica (nada a revogar).

**Pronto quando:** no banco remoto, dois `INSERT ... ON CONFLICT (tipo_obra, org_id) DO
UPDATE` seguidos para a mesma org deixam **1** linha, sem erro.

### 2. `services/projectTypeTemplatesService.ts`

**Muda:** `saveOrgTemplate` descarta `id` e `org_id` do objeto recebido e monta a linha
explicitamente (`tipo_obra`, `org_id` do parâmetro, os 4 blocos JSON). Assinatura passa
a receber `orgId` separado do template, para que não exista caminho em que o `id` de
sistema chegue ao `upsert`.

**Pronto quando:** `npx tsc --noEmit` passa e o corpo do upsert não tem `...template`.

### 3. `components/ProjectTypeTemplateEditor.tsx`

**Muda:** (a) deixa de receber `orgId` por prop e lê `useOrgContext()`; (b) em "Todas as
organizações" **não bloqueia a leitura** — mostra os templates do sistema; (c) o save usa
`useOrgWriteTarget()` + `forEachTargetOrg` (`'all-allowed'`: template por tipo de obra é
catálogo), com `{orgTargetModal}` no JSX; (d) o draft clonado do sistema não carrega mais
o `id`.

**Pronto quando:** `npx vitest run __tests__/orgContextGuard.test.ts` passa com o arquivo
**fora** do BASELINE, e o editor lista os tipos com o topo em "Todas".

### 4. `components/AppRouter.tsx`

**Muda:** `<ProjectTypeTemplateEditor />` sem prop.

**Pronto quando:** `grep -n "ProjectTypeTemplateEditor" components/AppRouter.tsx` não
mostra `activeOrganizationId`.

### 5. `services/obraTypeService.ts`

**Muda:** `list(organizationId: string | null)`. Com `null` não aplica o `.or(...)` — a
RLS recorta. Hoje `null` produziria `organization_id.eq.` malformado.

**Pronto quando:** typecheck passa e o editor lista tipos em "Todas".

### 6. `components/ProjectModal.tsx`

**Muda:** carrega o template do tipo selecionado (`projectTypeTemplatesService.getTemplate`)
e usa `template.required_docs` no painel "Documentação exigida"; `REQUIRED_DOCS_BY_TYPE`
vira **fallback** para quando não há template (tipo customizado recém-criado, ou falha de
rede) — não se apaga, para não regredir a tela.

**Pronto quando:** trocar o tipo de obra no formulário troca a lista de documentos, e a
lista bate com o que o editor de templates mostra.

## Fora deste plano (registrado, não feito)

- **11 obras sem `settings.tipoObra`.** É dado, não código: enquanto o campo estiver
  vazio, nenhum dos quatro consumidores do template faz nada para aquela obra. Backfill
  exige decisão do usuário sobre qual tipo cada obra é.
- **Casamento documento↔valor por `includes()` de string** no ProjectOverview
  (`'art'`, `'alvará'`, `'cno'`): documento fora desses três nomes fica "Pendente" para
  sempre. Precisa de uma chave no `required_docs`, o que muda o formato do template.
- **`indicators` são só rótulos** — o ProjectOverview mostra o nome e a unidade do KPI,
  nunca um valor calculado.

## Estado — 2026-09-05

Os 6 itens estão feitos, na branch `feat/templates-tipo-obra`.
A migration **já foi aplicada** no banco remoto (`db query -f`), então o índice
`idx_project_type_templates_tipo_org` existe em produção.

Como cada item foi provado:

| Item | Prova |
|---|---|
| 1 | `SET LOCAL role authenticated` + claims de um membro real, dois upserts seguidos → **1** linha para a org, conteúdo o da segunda gravação, as 7 linhas de sistema intactas com a EAP original. Rolled back |
| 2 e 3 | POST capturado do navegador: `campos: tipo_obra, org_id, eap_phases, required_docs, indicators, checklist_template, updated_at` — **sem `id`** — e `on_conflict=tipo_obra,org_id` |
| 3 | Com o topo em "Todas": a tela carrega (abas de tipo + campos de EAP), e o "Salvar" abre o modal "Selecionar organização". `orgContextGuard` passa com o arquivo fora do BASELINE |
| 4 | `components/AppRouter.tsx` não passa mais prop; baseline 32 → 31 |
| 5 | O editor lista os tipos com org nula |
| 6 | Formulário de obra com um template de org contendo "Laudo de sondagem SPT" e "Anuência do vizinho confrontante": os dois aparecem no painel; "Habite-se", que só existe na constante, **não** aparece |

Suíte completa: 138 arquivos, 2480 testes, 0 falha. `npm run build` OK.
`check-ui-standard.sh` limpo em `ProjectTypeTemplateEditor.tsx` e `AppRouter.tsx`;
em `ProjectModal.tsx` acusa §3 (`searchTerm` com `useState`) — é o buscador do
seletor de cliente **dentro do modal**, pré-existente (está igual em
`origin/main`) e fora do escopo desta correção.

**Não publicado**: o commit está na branch da frente, sem push para `main`.
