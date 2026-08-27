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

### Conferência feita em 2026-08-26 pelo usuário de leitura (RLS aplicada)

| Item | Resultado |
|---|---|
| Sistemas ativos | **12** ✅ |
| Patologias ativas | **48** ✅ |
| Sistemas sem `warranty_term_code` | **0** ✅ |
| Patologias órfãs (sistema inexistente) | **0** ✅ |
| As 5 colunas novas em `warranty_claims` | respondem ao SELECT ✅ |
| `construction_conditions` visíveis | **1** |
| Chamados com `source_condition_id` | **1** ✅ backfill migrou a única condição |
| Chamados sem `quality_score` | **0** ✅ trigger calculou (scores 30 e 10) |

**O módulo Qualidade tinha exatamente 1 registro em produção**, com
`taxonomy = null` — coerente com o diagnóstico: nunca passou de `DETECTED`
porque a classificação era impossível. Migrou para `ABERTO`, com `origin`
preservada.

### ✅ PARTE 2 aplicada e conferida no banco real (2026-08-26)

Bateria contra a API, com o usuário de leitura. **Nenhum registro foi criado** —
contagem de `warranty_claims` igual antes e depois, e zero chamados
`TESTE-CONFERENCIA*` no banco.

| Teste | Resultado |
|---|---|
| `open_warranty_claim(13)` com taxonomia válida | `42501` (RLS) ✅ |
| idem com patologia inexistente | `P0004` ✅ |
| idem com sistema errado para a patologia | `P0004` ✅ |
| chamada com 11 args (teste de ambiguidade) | resolve limpo ✅ |
| `classify_warranty_claim` | `P0002` ✅ |
| origem inválida | `P0004` ✅ |

**Como o `42501` prova mais do que parece:** usando uma organização da qual o
usuário não é membro, a chamada passa por todas as validações e chega ao
`INSERT`; só então a RLS derruba. O Postgres resolve nomes de coluna no
**plano**, antes de executar — então um `42501` (e não `42703`) prova que o
`INSERT` referencia `taxonomy` e `origin` de verdade.

**Como o teste 4 prova que a assinatura antiga sumiu:** `p_taxonomy` e
`p_origin` têm `DEFAULT NULL`, então a função de 13 aceita 11 args. Se a versão
antiga ainda existisse, dois candidatos casariam e o PostgREST devolveria
`PGRST203` ("could not choose the best candidate"). Resolveu limpo ⇒ sobrou uma
função só.

> Registro de um erro meu: eu havia escrito no teste que o esperado para 11 args
> era `PGRST202`. Errado — a função nova aceita 11 args pelos defaults. A
> expectativa estava mal formulada, o banco estava certo.

### ✅ Teste de escrita ponta a ponta (2026-08-26, autorizado pelo usuário)

Um chamado real criado pela mesma RPC que o app usa, org
`926cf626-ba49-4ee4-9f35-472822fb90e6`:

| Verificação | Resultado |
|---|---|
| `open_warranty_claim` | HTTP 200, chamado criado, `version 1` ✅ |
| `state` / `severity` | `ABERTO` / `alta` ✅ |
| `taxonomy` persistida | `{HID, HID.VAZ, NBR 5626}` ✅ |
| `origin` persistida | `execucao` ✅ |
| `quality_score` pela trigger | **70** = completude 40 + taxonomia 30 + evidência 0 ✅ |
| `minEvidence` por severidade | 2 (severidade `alta`) ✅ |
| `classify_warranty_claim` | trocou para `{IMP, IMP.INF}`, `version 1→2` ✅ |
| Concorrência otimista | versão velha → `P0003` ✅ |
| Log de eventos | `ClaimOpened(v1)` + `ClaimClassified(v2)` ✅ |

O score de 70 bate exatamente com a fórmula: os 4 fatores de completude
preenchidos (descrição ≥30, local, unidade, prazo) = 40, taxonomia válida = 30,
zero evidências = 0.

✅ **Limpeza feita e conferida.** O chamado de teste não pôde ser apagado pela
API (ver bug abaixo); foi removido pelo SQL Editor e a remoção foi **verificada**
— zero linhas do chamado, zero eventos dele, nenhum chamado com "TESTE" no nome,
e o total voltou a 2, os mesmos dois de antes do teste.

A conferência importava: `Success. No rows returned` é exatamente o que o SQL
Editor também responde quando um `DELETE` não apaga nada — é a mesma mensagem do
bug abaixo.

### 🐛 Bug PRÉ-EXISTENTE encontrado: o botão Excluir não exclui

**Não foi introduzido por esta consolidação** — vem de `20260708000000`.

`warranty_claims` tem policies de `SELECT`, `INSERT` e `UPDATE` para
`authenticated`, e **nenhuma de `DELETE`**. A única `FOR ALL` era a de `anon`
para dev, dropada em `20270208000002`. Com RLS ligada e sem policy permissiva,
o `DELETE` apaga **zero linhas sem devolver erro**.

`warrantyService.delete()` só trata `error`, então volta como sucesso.
`WarrantyClaimDetail` mostra o toast "Chamado excluído" e chama `onRefresh()` —
e o chamado continua na lista.

Confirmado na prática: `DELETE` devolveu `HTTP 200` com corpo `[]` e a linha
seguiu existindo.

Mesmo padrão em `warranty_claim_evidence` (só INSERT/SELECT) e no bucket
`warranty-evidence` (só upload/read) — nada anexado pode ser removido.

**Não corrigi**: a decisão de quem pode apagar um chamado de garantia — e se
apagar deve ser permitido, dado que o registro é trilha de auditoria — é de
produto, não minha. As saídas possíveis:

1. Criar policy de `DELETE` (a quem? só admin?) e fazer
   `warrantyService.delete()` conferir linhas afetadas.
2. Trocar exclusão por arquivamento (`state = 'ENCERRADO'`), preservando o log.
3. Remover o botão Excluir, se apagar nunca deveria ter sido oferecido.

Em qualquer um dos três, o service precisa deixar de reportar sucesso quando
apagou zero linhas.

<details>
<summary>Histórico: por que a PARTE 2 ficou de fora na primeira tentativa</summary>

`pg_proc` devolveu uma linha só, `open_warranty_claim | 11`, com
`classify_warranty_claim` ausente — logo não era schema cache velho, como eu
tinha suposto. Como as duas partes estavam na MESMA transação do arquivo
consolidado e a PARTE 1 commitou, o consolidado não rodou por inteiro. Causa
provável: o SQL Editor do Supabase executa **apenas o trecho selecionado**
quando há seleção ativa. Ao colar arquivo longo, clicar fora antes de executar.
</details>

### (histórico) PARTE 2 não estava respondendo

`open_warranty_claim` com 13 parâmetros devolve `PGRST202`, e
`classify_warranty_claim` idem. **"Abrir Chamado" está quebrado agora**, porque
o front deployado manda os 13.

**Confirmado por `pg_proc` (autoritativo, ignora o cache):**

```
proname             | pronargs
open_warranty_claim | 11
```

Uma linha só, com 11. **A PARTE 2 não entrou** — não era cache. Minha hipótese
de "schema cache velho" estava errada; o `pg_proc` desmentiu.

**Como as duas partes estavam na mesma transação do arquivo consolidado, e a
PARTE 1 commitou, o arquivo consolidado não foi o que rodou** — ou rodou
parcialmente. A causa mais provável é o SQL Editor do Supabase executar **apenas
o trecho selecionado** quando há seleção ativa no editor. Vale como aviso para as
próximas: colar, clicar fora, e só então executar.

**Ação pendente:** aplicar `scratch/APLICAR_parte2_open_warranty_claim.sql`
(= a migration 008 + `NOTIFY pgrst, 'reload schema'` + a consulta de
conferência). Roda sozinho sem problema: depende só do que a PARTE 1 criou.

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

## Pendências resolvidas em 2026-08-26 (pedido: "resolva essas pendências")

### 1. Exclusão de chamado — `aplicar_20270914000009_warranty_delete_policies.sql`

Policies de `DELETE` nas três tabelas do agregado + no bucket
`warranty-evidence`, e a RPC `delete_warranty_claim`.

A RPC existe por dois motivos além da conveniência: **ordem**
(`warranty_claim_evidence.claim_id` é `ON DELETE RESTRICT`, então o chamado não
sai antes da evidência; visitas são CASCADE; eventos não têm FK e ficariam
órfãos) e **contagem** (o `.delete()` do PostgREST devolve 200 com corpo vazio
tanto quando apaga quanto quando a RLS barra). A RPC devolve quanto apagou e
estoura `P0002` no zero — é isso que faz o app falhar alto em vez de mentir.

`warrantyService.delete()` passou a usar a RPC e a remover os arquivos do
bucket depois, fora da transação: falha de storage não desfaz a exclusão do
registro.

**Escolhi restaurar a exclusão em vez de arquivar** porque três sinais dizem
que a falta da policy foi esquecimento, não decisão: as outras três policies
existem, a UI tem o botão, e o texto da confirmação diz literalmente "Todo o
histórico e evidências serão removidos". Se a decisão de produto for outra, o
caminho é remover estas policies — não deixá-las meio funcionando.

### 2. SLA — `aplicar_20270914000010_warranty_sla_cron.sql`

`fn_warranty_sla_sweep()` emite `SlaBreached` em `warranty_claim_events` para
chamados com prazo estourado, e o pg_cron a chama **diariamente** (`sla_deadline`
é `DATE`; varrer de 6 em 6 minutos um dado que muda à meia-noite é 240 execuções
para achar o que uma acha).

**SQL puro, sem edge function**: o cron de Qualidade chamava uma function por
`net.http_post`, o que exige function publicada e dois segredos no vault — e
neste repo já houve edge function que nunca foi publicada com cron batendo no
vazio. Aqui não há nada para publicar.

O critério de "estourado" é **o mesmo da tela** (`WarrantyModule.tsx`,
`ClaimRow`): prazo no passado e estado fora de `ENCERRADO`/`FORA_GARANTIA`. Se
um mudar, o outro tem de mudar junto, senão o KPI e o alerta discordam.

Idempotente por (chamado, prazo): reagendar o `sla_deadline` na triagem faz um
novo estouro notificar; enquanto o prazo for o mesmo, não repete.

A mesma migration **desagenda `quality-sla-enforcement`**, que rodava a cada 6
minutos contra tabelas que viraram legado. A edge function fica publicada e
ociosa — reagendar é uma linha, se contestação/escalonamento voltarem.

### 3. Auditoria de exclusões silenciosas — `scripts/check-rls-delete-gap.mjs`

Auditar os **312** `.delete()` do repo seria caro e quase todo inútil: onde a
policy existe, o `.delete()` funciona. O que quebra é a interseção — o app apaga
**e** a tabela tem RLS sem policy de `DELETE`. É essa lista que o script produz.

Achou **3**, todas com o padrão idêntico ao do warranty (SELECT/INSERT/UPDATE,
sem DELETE), confirmadas por grep:

| Tabela | Chamada |
|---|---|
| `companies` | `services/companyService.ts:68` |
| `broker_portal_proposals` | `services/brokerService.ts:523` |
| `nfe_invoices` | `services/nfeService.ts:450` |

**Não corrigi as três**: cada uma carrega a mesma decisão de produto do warranty,
em módulo alheio a este pedido.

> O script errou duas vezes antes de acertar, e as duas viraram tratamento:
> a primeira versão acusou **144** tabelas porque o regex não aceitava nome de
> policy com espaço (`"Manage internal_transactions as member"`) nem `FOR ALL`
> sem cláusula `TO`; corrigido, caiu para **21**. Dessas, 11 eram `area_version_*`,
> cujas policies nascem num `FOREACH ... EXECUTE format('CREATE POLICY ...')` —
> SQL dinâmico que o parser não via. Tratado, caiu para **3**. Um script de
> auditoria que grita 144 falsos positivos é pior que script nenhum.

### Conferência das duas migrations (2026-08-26, banco real)

**`...009` — exclusão.** As 4 policies criadas (`warranty_claims`,
`warranty_claim_evidence`, `warranty_claim_events`, `storage.objects`).
Teste ponta a ponta, **auto-limpante**:

| | |
|---|---|
| Criar chamado | ✅ 1 evento |
| Apagar com org alheia | `P0002`, chamado intacto ✅ — a RPC **não** é bypass de RLS |
| Apagar de verdade | `{claims:1, events:1, visits:0, evidence:0}` ✅ |
| Chamado e eventos sumiram | ✅ / ✅ |
| **Apagar de novo** | `P0002` ✅ — **era exatamente aqui que o bug morava** |
| Total de chamados | 2 → 2 ✅, nada sobrou |

**`...010` — SLA.** Segunda execução devolveu `slaBreached: 0`, provando a
idempotência. Confirmei que o **0 é a resposta certa**, reproduzindo o predicado
da função pela API: dos 2 chamados, 1 tem prazo (04/06/2026, vencido) mas está
`FORA_GARANTIA`, que o critério exclui de propósito — o mesmo critério da tela.

✅ **Caminho positivo exercitado** (`scratch/TESTE_sla_sweep_caminho_positivo.sql`,
rodado em 2026-08-26). Tirando o "Reparo Vazamento" de `FORA_GARANTIA` — o prazo
dele já estava vencido — a varredura **achou a violação e emitiu o
`SlaBreached`**. Como eu havia confirmado minutos antes que existiam **zero**
eventos desse tipo no banco, o evento só pode ter vindo da varredura. Com isso a
função está provada nos dois sentidos: acha quando há, e não inventa quando não há.

Estado conferido depois, por consulta nova: `Reparo Vazamento` de volta em
`FORA_GARANTIA` com `sla_deadline` 2026-06-04, 2 chamados no total, **zero**
eventos `SlaBreached`. Nada persistiu.

> **Errei uma expectativa no roteiro.** Escrevi que a contagem final, depois do
> `ROLLBACK`, devolveria 0; ela devolveu **1**. Por um momento pareceu lixo
> deixado em produção. Não era: o que aquelas últimas consultas enxergam depende
> de como o SQL Editor encadeia os statements do lote, e não serve como prova de
> limpeza. A prova é consultar **numa execução nova**, depois que o lote
> terminou — foi o que fiz, e o banco estava limpo. Não vou inventar o mecanismo
> exato do editor; o registro fica com o fato verificado. O roteiro já está
> corrigido para não assustar da próxima vez.

## Pendências que seguem abertas (não são deste pedido)

- Contestação/escalonamento sobre chamados, se o fluxo fizer falta.
- UI de ponto em planta para `asset_floor_plan_ref`.
- Aposentar as tabelas `condition_*` de vez, depois de um ciclo confirmando que
  o módulo consolidado atende.
- As 3 tabelas achadas pelo script acima.
