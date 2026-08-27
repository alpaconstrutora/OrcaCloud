# Consolidar "Qualidade & Entrega" dentro de "Pós-Obra & Garantia"

> Sessão de 2026-08-26.

## Pedido original

Mensagem 1 (transcrita literalmente):

> Verifique o módulo Qualidade & Entrega, parece uma duplicação do módulo Pós-Obra & Garantia

Mensagem 2, após o diagnóstico e a recomendação em três passos (transcrita literalmente):

> Pode seguir com sua recomendaçao. nao precisa chegar o banco de dados

**Leitura do "não precisa checar o banco":** o passo 1 da recomendação era contar
linhas em `construction_conditions` para decidir entre "aposentar" e "manter os
dois e ligar". Dispensada a checagem, o plano tem de ser **correto nos dois
cenários**: nada é apagado, e a migração de dados roda igual — se a tabela
estiver vazia migra 0 linhas, se tiver dados migra todas.

---

## Diagnóstico (verificado no código em 2026-08-26)

`20260708000000_create_warranty_module.sql:4` declara: *"Padrão: clone adaptado de
20260514000000_create_quality_module.sql"*. Os dois módulos compartilham:

| | Qualidade & Entrega | Pós-Obra & Garantia |
|---|---|---|
| Raiz | `construction_conditions` (+8 tabelas) | `warranty_claims` (+4) |
| Estados | 10, `DETECTED→…→CLOSED` | 10, `ABERTO→…→ENCERRADO` |
| `severity` | `baixa/media/alta/critica` | idêntico |
| `ResponsibleParty` | 5 valores | idêntico (enum duplicado em `types/warranty.ts`) |
| Evidência | bucket `condition-evidence`, SHA-256 + geo | bucket `warranty-evidence` |
| Log append-only | `condition_events` | `warranty_claim_events` |

`types/warranty.ts:6` importa `ActorReference` de `types/quality.ts` — a linhagem
é explícita.

### Os dois defeitos que decidem o caso

1. **Não há ponte entre os módulos.** `construction_conditions` só aparece em
   `services/qualityConditionService.ts` e na edge function
   `quality-sla-enforcement`. Nenhuma FK liga condição a chamado.
2. **Qualidade nunca funcionou.** `condition_taxonomy_systems` e
   `condition_taxonomy_pathologies` foram criadas **sem seed** (o comentário da
   migration diz "seed via painel admin", e o painel não existe — nenhum INSERT
   nessas tabelas em todo o repo). Logo `classify_condition` sempre estoura
   `P0004` (`20260514000001:299-307`), e toda condição fica presa em `DETECTED`.
   `warranty_terms`, por contraste, nasceu com 9 linhas da NBR 17170.

Sinais colaterais: `QualityModule.tsx` usa `<table>` cru sem `TableUtils`
(fora da REGRA #1) e `AppRouter.tsx:1182` passa `activeOrganizationId || ''`
(padrão proibido pela REGRA #5).

---

## Decisão

**Um módulo só: Pós-Obra & Garantia.** Ele já tem o que Qualidade não tem
(cobertura NBR 17170, triagem dentro/fora de garantia, visita técnica, custo,
NPS, SLA) e está dentro do padrão de UI. Absorve de Qualidade as três peças que
tinham valor real e não existiam nele:

1. **Taxonomia controlada** sistema/patologia, com seed de verdade.
2. **Evidência fotográfica na abertura** do chamado (o modal de Garantia não
   anexava nada; o de Qualidade exigia ≥1 foto).
3. **`quality_score`** — nota 0–100 da qualidade do *registro*.

E leva junto, por fidelidade de dados: `origin` (origem provável) e
`asset_floor_plan_ref`.

**Nada é dropado.** As 9 tabelas `condition_*` ficam no banco, marcadas como
legado por `COMMENT ON TABLE`. A reversão é restaurar a rota e o item de menu.

### Escopo explicitamente FORA

- **Contestação e escalonamento** (`condition_contestations`, `ESCALATED`,
  `ResolveEscalationModal`) não são portados. Eram fluxos que nunca chegaram a
  rodar, porque o módulo travava antes, em `DETECTED`. Se forem desejados, viram
  pedido próprio sobre `warranty_claims`.
- **`asset_floor_plan_ref` não ganha UI.** Nunca teve: o `DetectConditionModal`
  capturava geo, nunca ponto em planta. A coluna existe para não perder dado
  migrado, e está documentada como sem interface.
- **A edge function `quality-sla-enforcement`** continua no ar operando sobre
  `construction_conditions` (que passa a ser legado) — vira no-op inofensivo.
  Um cron de SLA para `warranty_claims` é trabalho separado (ver Pendências).

---

## Estado em 2026-08-26

Código: **8 de 8 itens feitos**, `tsc --noEmit` limpo, `vite build` passa,
`check-ui-standard.sh`, `check-system-projects.sh`,
`check-project-classification.sh`, `migrationsPrefixo.test.ts` e
`orgContextGuard.test.ts` verdes.

Deploy: commits `f80a5d4` e `8d12a49` em `origin/main` (Vercel auto-deploy).

Banco: **as duas migrations foram aplicadas em 2026-08-26**, por SQL direto,
como uma transação única montada a partir das duas.

⚠️ **Conferência ainda não vista.** A aplicação foi relatada, não verificada por
mim — o resultado da consulta de conferência (contagens de taxonomia, `pronargs`
de `open_warranty_claim`, `chamados_migrados`) não foi lido. Enquanto ninguém
olhar essa linha ou abrir um chamado na tela, "aplicada" é relato, não fato
verificado. Ver `feedback_nunca_declarar_corrigido_sem_verificar`.

Detalhe cosmético conhecido: os `COMMENT ON TABLE` gravados no banco dizem
"LEGADO (2026-08-24)" porque foram aplicados antes da correção de data abaixo.
Só re-rodar os `COMMENT ON TABLE` do arquivo corrige, se incomodar.

Dois defeitos pré-existentes foram corrigidos de passagem, porque bloqueavam o
que estava sendo construído:

- `qualityConditionService.getTaxonomySystems/Pathologies` pediam as colunas
  `normRef`/`systemCode`, que não existem (são `norm_ref`/`system_code`) — os
  dois selects da taxonomia sempre devolviam erro do PostgREST.
- `warrantyService.uploadEvidence` gravava `getPublicUrl` de um bucket
  **privado**, gerando link que sempre dá 400. Agora guarda o path e assina na
  leitura (`getEvidenceUrl`), aceitando as duas formas para não exigir backfill.

## Itens

### 1. `supabase/migrations/aplicar_20270914000007_consolidar_qualidade_em_garantia.sql`

**O que muda:**
- Seed de `condition_taxonomy_systems` (12 sistemas) e
  `condition_taxonomy_pathologies` (48 patologias), com `norm_ref`.
- `condition_taxonomy_systems.warranty_term_code` → FK para `warranty_terms`,
  para o sistema escolhido sugerir o prazo de garantia.
- `warranty_claims` ganha `taxonomy JSONB`, `origin TEXT` (CHECK dos 6 valores),
  `quality_score JSONB`, `asset_floor_plan_ref JSONB`, `source_condition_id UUID`
  (UNIQUE — chave de idempotência do backfill).
- `fn_warranty_claim_quality_score(p_claim_id, p_organization_id) → JSONB`.
- Trigger recalculando o score em INSERT/UPDATE de `warranty_claims` e em
  INSERT de `warranty_claim_evidence`.
- Backfill `construction_conditions` → `warranty_claims`, com mapa de estados.
- `COMMENT ON TABLE` marcando as 9 `condition_*` como legado.

**Mapa de estados do backfill:**

| Condição | Chamado |
|---|---|
| `DETECTED` | `ABERTO` |
| `CLASSIFIED` | `TRIAGEM` |
| `ACTION_REQUIRED` | `EM_GARANTIA` |
| `IN_REPAIR` | `EM_REPARO` |
| `REPAIRED` | `CONCLUIDO` |
| `VALIDATED`, `CLOSED` | `ENCERRADO` |
| `CONTESTED`, `ESCALATED` | `CONTESTADO` |
| `REOPENED` | `REABERTO` |

**Como sei que terminou:** a migration roda duas vezes seguidas sem erro e sem
duplicar linha (idempotência por `source_condition_id`); um
`SELECT count(*) FROM condition_taxonomy_pathologies` devolve o mesmo número nas
duas rodadas; `npx vitest run __tests__/migrationsPrefixo.test.ts` passa.

> ⚠️ Aplicar por SQL direto no editor do Supabase. **Nunca `supabase db push`** —
> o histórico de `schema_migrations` está furado (`20270208*` fora dele).

### 2. `types/warranty.ts`

**O que muda:** `WarrantyClaim` ganha `taxonomy?`, `origin?`, `quality_score?`,
`asset_floor_plan_ref?`, `source_condition_id?`. `WarrantyClaimInsert` ganha
`taxonomy?` e `origin?`. `ClaimSeverity` e `ResponsibleParty` passam a
reexportar de `types/quality.ts` em vez de redeclarar os mesmos valores.

**Como sei que terminou:** `npx tsc --noEmit` limpo e nenhum enum com valores
repetidos entre os dois arquivos (`grep`).

### 3. `services/warrantyService.ts`

**O que muda:** `open()` passa `taxonomy`/`origin`; novo
`uploadClaimEvidence(orgId, claimId, file)` gravando em `warranty-evidence` +
linha em `warranty_claim_evidence`; `getTaxonomySystems()`/`getTaxonomyPathologies()`
reaproveitando `qualityConditionService` (não duplicar consulta);
`listLegacyConditionEvidence(conditionId)` para o detalhe mostrar as evidências
do registro de origem migrado.

**Como sei que terminou:** abrir chamado com foto grava linha em
`warranty_claim_evidence` e o arquivo aparece no bucket.

### 4. `supabase/migrations/aplicar_20270914000008_open_warranty_claim_taxonomia.sql`

**O que muda:** `open_warranty_claim` recriada com `p_taxonomy JSONB` e
`p_origin TEXT`, validando `pathologyCode` contra a taxonomia controlada quando
informado. `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE TO authenticated`
(regra do repo para RPC nova/recriada).

**Como sei que terminou:** chamada com patologia inexistente devolve `P0004`;
chamada sem taxonomia continua funcionando (campo opcional).

### 5. `components/WarrantyModule.tsx`

**O que muda:**
- Modal "Abrir Chamado": selects Sistema → Patologia (encadeados), select
  Origem provável, e upload de fotos (até 5, com preview e remoção).
- Sistema escolhido preenche `warranty_term_code` sugerido, se ainda vazio.
- Nova coluna `patologia` e nova coluna `quality_score` (barra 0–100) em
  `CLAIM_COLUMNS`, com largura em `CLAIM_COL_WIDTHS` e entrada em
  `CLAIM_COLUMN_HEADERS`/`renderClaimCell`.
- Detalhe do chamado: bloco "Classificação" (sistema/patologia/origem) e, quando
  `source_condition_id` estiver preenchido, bloco "Evidências do registro de
  origem" com URL assinada.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh components/WarrantyModule.tsx`
sai 0, e o checklist de aplicação do guia é listado item a item na resposta ao
usuário (REGRA #1, passo 3).

### 6. `components/AppRouter.tsx`

**O que muda:** remove o `React.lazy` de `QualityModule` e o `case 'quality'`;
`'quality'` passa a cair no mesmo `case` de `'pos-obra'` (não quebra sessão de
usuário com `activeView` persistido em `'quality'`). Some o
`activeOrganizationId || ''` (REGRA #5).

**Como sei que terminou:** `npx vitest run __tests__/orgContextGuard.test.ts`
passa e o arquivo não aparece com violação nova.

### 7. `components/Layout.tsx`

**O que muda:** o `NavDropdown` "Qualidade" com dois filhos vira um `NavItem`
único "Pós-Obra & Garantia" apontando para `pos-obra`; `qualidadeViews`,
`isQualidadeOpen` e o `useEffect` associado saem. A flag de módulo `quality`
continua controlando a visibilidade do item.

**Como sei que terminou:** menu mostra um item só; com o item ativo ele fica
destacado; `npx tsc --noEmit` limpo.

### 8. Remoção da UI órfã

**O que muda:** apagar `components/QualityModule.tsx` e os 11 arquivos de
`components/quality/`. **Ficam**: `services/qualityConditionService.ts` (a
leitura de taxonomia é usada pelo módulo novo), `types/quality.ts` (fonte dos
enums compartilhados) e todas as migrations.

**Como sei que terminou:** `grep -rn "components/quality\|QualityModule"` só
encontra menções em documentação; `npx tsc --noEmit` limpo; build passa.

---

## Pendências deixadas em aberto (não são deste pedido)

- Cron de SLA para `warranty_claims` (hoje só existe o de condições, que fica
  no-op). `sla_deadline` e o KPI `sla_vencidos` já existem — falta o disparo.
- Contestação/escalonamento sobre chamados, se o fluxo fizer falta.
- UI de ponto em planta para `asset_floor_plan_ref`.
- Aposentar as tabelas `condition_*` de vez, depois de um ciclo confirmando que
  o módulo consolidado atende.
