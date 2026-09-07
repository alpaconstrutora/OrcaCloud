# Portal de Crédito — Credit Room (MVP cortado)

> Origem: PRD "Portal de Crédito e Financiamento ÒPURA" v1.0 (126 seções),
> anexado pelo usuário na sessão abaixo. Este plano é a avaliação do PRD contra
> o código real **e** o escopo executável que sobrou dela. O PRD continua
> valendo como visão; o que muda aqui é a ordem e o tamanho da primeira fatia.

## Pedido original

> Sessão: dd89c166-0472-424c-b9fe-76615382d1b6 · 2026-09-07

```
avalie este prd
```

(anexo: `PRD — Portal de Crédito e Financiamento ÒPURA.md`)

Depois da avaliação, à pergunta *"Quer que eu transforme isso num plano em
`docs/planos/` (REGRA #6) com o escopo cortado e critérios de pronto por item,
ou numa página compartilhável para revisar com quem escreveu o PRD?"*:

```
sim
```

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-07 | Transformar a avaliação em plano com escopo cortado? | Sim. |
| 2026-09-07 | A quem pertence um Credit Room quando o grupo atravessa organizações (holding + SPEs são orgs distintas)? | **Org da SPE tomadora** (`credit_rooms.organization_id`); a holding aparece no snapshot como dado, não como dona. É a ancoragem da RLS. |
| 2026-09-07 | O banco entra com **login** (Supabase Auth + role `LENDER`, MFA) ou com **token** como os 4 portais atuais? | **Login.** O PRD exige MFA, expiração por usuário, permissão por documento e auditoria por pessoa — token por instituição não entrega "quem baixou". Primeiro portal do sistema com esse modelo; ver risco R2. |
| 2026-09-07 | O que é congelado no snapshot: agregados, linhas, ou os dois? | **Agregados (JSON) + `document_version_id` dos documentos.** Nunca cópia de tabela operacional. Linha a linha (rent roll, espelho de vendas) fica para a Fase 2, também como JSON dentro da versão. |

## O que a avaliação achou (2026-09-07)

### A tese do PRD está certa e o motor já existe em ~70%

Conferido contra o código atual, não contra memória:

| Seção do PRD | Já existe | Estado |
|---|---|---|
| §15 Endividamento · §44 Simulador · §65 Comparação · §74–76 Covenants | Módulo Dívida: `services/debtService.ts`, `components/debt/DebtSimulator.tsx`, `DebtProposals.tsx` (CET + concentração), `services/debtCovenantService.ts` com `DSCR` AUTOMÁTICA e `warningMarginPct` (= alerta preventivo §76), `fn_debt_position`, `fn_debt_schedule_curve` | Produção (30/08) |
| §35 NOI · §31–32 Vacância | `services/rentalNoiService.ts` + `lib/rentalNoi.ts`, `rentalVacancyService.ts`, `property_expense_allocations`, `commercial_property_status_events` | Produção |
| §39 · §51 Garantias | `contract_guarantees` com `scope` OBRA/LOCACAO/DIVIDA, LTV, `asset_id`, `released_at`; `DebtGuarantees.tsx` | Estrutura pronta; tela de dívida ainda é aviso |
| §54–57 Data Room · versões · status | GED: `opura_document_versions`, aprovação, cron de vencimento, auditoria, signed URL 15 min, **`opura_document_portal_shares` (`audience`)** + Edge `portal-ged-download` | Maduro |
| §11–12 Grupo · Organograma | `organizations` → `companies` → `spe_entities`/`spe_partners` | Falta só a visualização |
| §16 · §24 · §26 Empreendimento · Espelho · Estoque | Empreendimentos F1–F3, `EspelhoVendasTab` (VGV total/comercializado/disponível) | Produção |
| §19–20 Cronograma · Curva S | `CentralObra` (Curva Física × Financeira), `fn_portal_get_planning` | Existe |
| §21 Orçamento base/revisado/contratado/realizado/pago | `fn_opura_obra_kpis` + `BudgetVersion` | Existe, **sem EAC** |
| §25 Recebíveis | `deal_installments`, `fn_opura_cliente_kpis` (vencido) | Sem aging por faixa |
| §8 Personas externas | 4 portais com `components/portal/PortalKit.tsx` | Padrão pronto para o 5º |

Consequência: a §92 do PRD (`debts`, `guarantees`, `documents`, `covenants`,
`financial_statements`, `economic_groups`, `tenants`, `sales`…) **contradiz a
§94** (single source of truth). Cinco daquelas seriam a segunda tabela para a
mesma coisa. Nenhuma delas é criada por este plano.

### O que realmente não existe

1. **Credit Room + snapshot versionado** (§5–7) — o núcleo novo de verdade.
2. **Usuário externo com login** (§8.8–8.11, §83, §86–87) — todos os portais
   atuais são token anônimo + RPC `SECURITY DEFINER`. Modelo de segurança novo
   no projeto, com histórico recente de 22 falhas de RLS (auditoria 01/09) e
   `client_portal_tokens` legível pela chave pública (03/09).
3. **EAC** (§22) — há contratado e pago; não há "comprometido restante + a
   contratar estimado".
4. **Balanço / DFC / PL** (§14) — o razão é partida simples. DRE existe;
   balanço não fecha. O PRD lista como dado disponível.
5. **DSCR por fluxo elegível da operação** (R8) — o DSCR atual é global.
6. **Caixa** — `payment_accounts` sem `opening_balance`; 1 em 2.300 lançamentos
   com conta. "Dívida líquida" e "caixa mínimo" já caíram para SEMIAUTOMÁTICO
   no módulo Dívida por isso. Dashboard não pode prometer caixa.
7. Fontes e Usos (§47), override com justificativa (§95), proveniência
   clicável (§96), watermark (§84), request list / Q&A (§59–60), WALE (§36),
   concentração de locatários (§37), aging por faixa (§25).

### Problemas do PRD como documento

- "MVP P0" tem 9 domínios e 20 critérios de aceite. Não é MVP.
- Snapshot sem definição de granularidade (decide o schema inteiro).
- R7 e §33 (MRR) colidem com a aproximação do `rentalNoiService` (receita =
  contratada × meses). O PRD está certo; o serviço precisa de um modo
  "recebido".
- Personas §8.2–8.7 presumem papéis funcionais que o sistema não tem
  (perfis: ADMIN/USER/BROKER/INVESTOR/CLIENT/SUPPLIER).
- §98 API REST e §99 eventos não cabem em PostgREST + RPC; são Fase 4.
- Nada sobre "Todas as organizações" (REGRA #5) nem sobre org dona quando o
  grupo atravessa várias.

## Escopo do MVP (o corte)

> **Credit Room é camada de compartilhamento + snapshot, não de cálculo.**

Entra: Credit Room · versões com snapshot · convite do banco · Data Room via
GED · dashboard com o que o sistema já calcula · request list · auditoria de
acesso e download.

Fica de fora (Fases 2–4, no fim): portfólio de renda completo (§27–40),
capacidade máxima de dívida (§43), stress (§45), Fontes e Usos (§47), EAC (§22),
desembolsos/medições (§68–71), covenants **por operação** (§74), watermark
(§84), override (§95), proveniência (§96), IA/scoring/marketplace.

## Plano

### Fase 1 — Credit Room mínimo

**1. `supabase/migrations/aplicar_2027092X000001_credit_rooms.sql`** (prefixo
livre a conferir na hora; ≥ `20270918000000` para o teste de segurança pegar)
- `credit_rooms` (organization_id **sem FK** — deadlock 40P01 já mordeu 4×;
  `empreendimento_id`, `company_id`, `debt_contract_id` nullable, `status` do
  §63, `code` `CR-000NN`), `credit_room_versions` (`version_no`, `label`,
  `snapshot JSONB`, `frozen_at`, `frozen_by`; **imutável**: sem policy UPDATE),
  `credit_room_members` (`user_id`, `side` 'TOMADOR'|'CREDOR', `permissions`,
  `expires_at`, `revoked_at`), `credit_room_requests` (§59: `title`,
  `assignee`, `due_at`, `priority`, `status` dos 6 do PRD),
  `credit_room_comments` (`visibility` 'INTERNO'|'COMPARTILHADO'),
  `credit_room_access_log` (§89, somente INSERT pela aplicação; SELECT só
  interno).
- RLS: lado interno via `is_org_member(organization_id)`; lado credor via
  `EXISTS (credit_room_members WHERE user_id = auth.uid() AND revoked_at IS
  NULL AND (expires_at IS NULL OR expires_at > now()))`. Nenhuma perna de OR
  que baste sozinha (REGRA #7, Pergunta 1).
- `REVOKE ALL ... FROM anon` em todas; funções com `REVOKE EXECUTE FROM
  PUBLIC, anon`.
- `SET lock_timeout='5s'`, idempotente, uma tabela por bloco.
**Como sei que terminou:** `npx vitest run __tests__/segurancaMigrations.test.ts`
passa; ensaio com ROLLBACK no banco real; `bash scripts/check-rls-postura.sh`
limpo; sonda com a chave publicável em `credit_rooms` devolve 401 ou `[]`.

**2. `supabase/migrations/aplicar_2027092X000002_ged_shares_credor.sql`**
- `opura_document_portal_shares.audience` ganha `'credor'` e coluna
  `credit_room_id` (sem FK); CHECK de alvo estendido.
- `fn_credit_room_documents(p_room uuid)` (`SECURITY INVOKER`, lê pelas
  policies) devolvendo documento + versão ativa + status de vencimento.
**Como sei que terminou:** compartilhar um documento pelo botão do GED com
audiência "Credit Room" grava a linha; a função devolve só documentos do room
do chamador; anon não executa.

**3. `utils/creditRoomSnapshot.ts`** — puro, sem banco.
- `buildSnapshot(inputs)` monta o JSON a partir de: `DebtPosition`
  (`debtAnalyticsService`), `OpuraObraKpis`, `RentalNoiMetrics`, roll-up do
  Espelho de Vendas, dados cadastrais do empreendimento, lista de
  `document_version_id`. Cada bloco leva `data_base` (R3) e `fonte`.
- `computeIndicators(snapshot, operacao)` → LTV, LTC, equity/custo, DSCR
  (fluxo elegível = **só o que a operação marcar**, R8), cobertura de garantias
  com haircut (R9). Devolve `null` quando falta insumo — nunca zero.
**Como sei que terminou:** `__tests__/creditRoomSnapshot.test.ts` cobre: LTC
com custo zero = null; DSCR ignora fluxo não elegível; haircut reduz a
cobertura; snapshot não muda quando o input muda depois (imutabilidade por
valor).

**4. `services/creditRoomService.ts`**
- CRUD do room; `freezeVersion(roomId, label)` chama os serviços existentes
  (`debtAnalyticsService.position`, `opuraAnalyticsService.obraKpis`,
  `rentalNoiService.getNoiMetrics`, `empreendimentoService`), monta via
  `buildSnapshot` e grava a versão; `invite(roomId, email, side, permissions,
  expiresAt)`, `revoke(memberId)`; `requests.*`; `comments.*`;
  `logAccess(roomId, action, resource)`.
- `organizationId?: string | null` em toda leitura (REGRA #5) — `null` lista
  todas as orgs do usuário.
**Como sei que terminado:** `tsc --noEmit` limpo; congelar duas versões e
alterar a dívida entre elas produz snapshots diferentes e a V1 não muda (R2).

**5. Acesso do credor — `hooks/useAuthSync.ts`, `types` (role `LENDER`),
`supabase/functions/credit-room-download/index.ts`**
- Role `LENDER` no perfil; `AppRouter` roteia `LENDER` só para
  `components/credit/portal/`. MFA: exigir `aal2` (Supabase MFA TOTP) para
  `LENDER` antes de renderizar qualquer room (§87).
- Edge Function copia `portal-ged-download`, mas autentica pelo **JWT do
  usuário** (não token), confere `credit_room_members` + share `audience =
  'credor'` **antes** de assinar com service_role, e grava
  `credit_room_access_log` (`DOWNLOAD`). Gate no código, não só no gateway
  (REGRA #7, Pergunta 3).
**Como sei que terminou:** `curl -X POST .../credit-room-download -d '{}'` sem
header → 401; com JWT de membro revogado → 403; com membro válido → URL de 15
min e uma linha no log. Provado no **deploy**, não no arquivo local.

**6. `components/credit/CreditRoomModule.tsx` (+ `CreditRoomDetail.tsx`)** —
lado interno, sob Financeiro (ao lado de Dívida).
- Lista (tabela padrão do guia) e detalhe com abas: Visão (indicadores da
  versão ativa + "Posição de DD/MM/AAAA", §97), Versões (congelar/rotular/
  comparar duas), Data Room (documentos compartilhados + botão que abre o
  compartilhamento do GED), Participantes (convidar/revogar/expirar),
  Solicitações, Comentários (interno × compartilhado), Auditoria.
- Painel lateral (`Sheet`) para criar/editar; nunca tela cheia.
**Como sei que terminou:** `bash scripts/check-ui-standard.sh` exit 0 nos
arquivos tocados; `check-org-selector-guard` sem violação nova; em "Todas as
organizações" a lista carrega.

**7. `components/credit/portal/LenderHome.tsx` (+ `LenderRoom.tsx`)** — o que
o banco vê, com `PortalKit` (acento coral, mesmo vocabulário dos outros
portais).
- Linha 1 do §104 (Solicitado · LTV · LTC · DSCR · Equity), linha 2 (Obra ·
  Vendas · Orçamento · Portfólio) **lendo só o snapshot** — nunca o dado vivo.
  "Caixa" fica de fora até existir saldo (achado do módulo Dívida).
- Data Room (lista + download pela Edge Function), Solicitações (criar/
  acompanhar), Comentários compartilhados, Versões (só leitura).
- Toda visualização de documento e de aba grava `credit_room_access_log`.
**Como sei que terminou:** usuário `LENDER` de um room não vê outro room (RLS
provada com dois usuários); dado alterado no ÒPURA depois do congelamento não
aparece no portal; `check-ui-standard.sh` exit 0.

**8. `components/OpuraDocsModule.tsx` — botão Compartilhar** ganha a audiência
"Credit Room" (seleciona o room).
**Como sei que terminou:** compartilhar e descompartilhar refletem na aba Data
Room do item 6 sem recarregar a página.

**9. Wiring** — `AppRouter.tsx` (lazy + case `credit-rooms`, guard `LENDER`),
`Layout.tsx` (NavItem sob Financeiro).
**Como sei que terminou:** `npm run ci` verde; `/rodar-app` varre as abas do
módulo sem erro de JS nem 4xx/5xx.

### Fase 2 — Operação (metade já mora no módulo Dívida)
Propostas do banco vinculadas ao room (`debt_contracts.status='EM_NEGOCIACAO'`
+ `credit_room_id`), garantias com haircut e cobertura (tela de
`DebtGuarantees`), condições precedentes, desembolsos e medição financeira
(§68–70), aging de recebíveis por faixa, rent roll no snapshot.

### Fase 3 — Monitoramento
Covenants **por operação** (extensão de `debt_covenants` com `credit_room_id`
e fluxo elegível), congelamento automático mensal, EAC, override com
justificativa (§95), proveniência (§96), stress simples.

### Fase 4 — Fora do horizonte
IA, scoring, marketplace, API pública, watermark, Open Finance.

## Riscos conhecidos deste repositório que este plano precisa respeitar

- **R1 · Migration**: nunca `supabase db push`; aplicar por `db query -f`;
  FK para `organizations`/tabela quente deadlocka — proveniência sem FK.
- **R2 · Primeiro portal com login**: qualquer policy nova de `credit_room_*`
  passa pelas Perguntas 1–3 da REGRA #7 **e** pela sonda externa com a chave
  publicável — a `client_portal_tokens` "parecia" restritiva lendo o SQL.
- **R3 · Dado ausente ≠ zero**: LTV/LTC/DSCR devolvem `null` sem insumo;
  a tela mostra "—", nunca 0.
- **R4 · Snapshot em JSONB** é o modelo certo aqui (ao contrário de
  `projects.settings`, que é estado vivo): a versão é imutável por policy.
- **R5 · `rentalNoiService` usa receita contratada** — o dashboard do credor
  rotula como "NOI (receita contratada)" até a Fase 2 trazer o recebido (R7 do
  PRD).

## Estado

- [x] 0 — 3 decisões respondidas pelo usuário (2026-09-07: SPE tomadora · login · agregados+ids)
- [x] 1 — `aplicar_20270920000001_credit_rooms.sql` — **APLICADA e conferida em 2026-09-07**
- [x] 2 — `aplicar_20270920000002_ged_shares_credor.sql` — **APLICADA e conferida em 2026-09-07**
- [x] 3 — `aplicar_20270920000003_credit_rooms_revoke_anon_triggers.sql` — corretiva, **APLICADA** (ver achado abaixo)
- [x] 3 — `utils/creditRoomSnapshot.ts` + `__tests__/creditRoomSnapshot.test.ts` — 15 testes
- [x] 4 — `services/creditRoomService.ts` + `types/creditRoom.ts` — `tsc` limpo
- [x] 5 — `ProfileGroup.LENDER`/`UserProfile.LENDER`, `profileService.validateAccess` via `fn_my_credit_rooms`, card no `LoginGateway`, tema no `Auth`, `LenderMfaGate` (TOTP, aal2), Edge `supabase/functions/credit-room-download/index.ts` — **função NÃO publicada**; **TOTP precisa ser ligado no painel do Supabase**
- [x] 6 — `components/credit/CreditRoomModule.tsx`, `CreditRoomDetail.tsx`, `CreditRoomForm.tsx`, `CreditRoomRequests.tsx`, `CreditRoomIndicators.tsx` — `check-ui-standard.sh` exit 0 nos 5
- [x] 7 — `components/credit/portal/LenderPortal.tsx` (casca standalone + `LenderMfaGate`) — `check-ui-standard.sh` exit 0
- [x] 8 — audiência `'credor'` em `types/documents.ts`, `documentService.sharePortalDocumentsBatch/unshare/listPortalSharingsForDocuments`, aba "Credit Room" no modal Compartilhar do `OpuraDocsModule`
- [x] 9 — `AppRouter` (`credit-rooms`), `Layout` (item no dropdown Financeiro › Dívida + paleta de comandos), `App.tsx` (gate `LENDER` antes do Layout), `scripts/check-rls-postura.sh` (4 tabelas novas na sonda 9); `check-system-projects`/`check-project-classification` limpos; `orgContextGuard` passa
- [ ] 9b — varredura `/rodar-app` — **pendente**: só faz sentido depois de aplicar as migrations (o módulo abre em erro sem as tabelas)

### Registro — 2026-09-07 · itens 1–9 escritos na frente `portal-credito`

Frente criada por `git worktree add` a partir de `origin/main` (5b00c75) porque
o checkout de integração estava **171 commits atrás** e nem tinha
`scripts/nova-frente.sh`. Prefixo de migration `20270920` — o último em
`origin/main` era `aplicar_20270919000027`.

### ✅ PUBLICADO em 2026-09-07 — `03b3047..97433a7`

`git push origin HEAD:main` (a publicação; não existe outro comando de deploy).
Provado com `scripts/conferir-producao.sh`: o domínio entrega o bundle
`/assets/index-DoS1VaYA.js` com **`__BUILD_COMMIT__ = 97433a7`**, igual a
`origin/main` — o painel do Vercel dizer "Ready" não seria prova.

Estado do banco conferido depois: 6 tabelas `credit_room_*`, 8 funções, 17
policies, 3 índices de compartilhamento sem `WHERE`, e **0 dados de teste**
(rooms, shares, log de auditoria e fatores MFA todos limpos).

⚠️ **O TOTP já estava `Enabled`** no painel — o item 3 abaixo nunca foi
necessário. Descoberto sondando a API de enroll, não olhando a tela.

**O que ainda depende do usuário (produção):**
1. ~~Aplicar as migrations~~ — ✅ feito em 2026-09-07 (as três).
2. ~~Publicar a Edge Function~~ — ✅ feito e provado nos quatro cenários.
3. ~~Ligar TOTP no painel~~ — ✅ já estava `Enabled`; nada a fazer.
4. ~~`git push origin HEAD:main`~~ — ✅ feito e provado no domínio.
5. ~~Varredura `/rodar-app`~~ — ✅ feita; achou 4 defeitos, todos corrigidos.

**Sobra, e é decisão do usuário (nada bloqueia o uso):**

- **Convidar um banco de verdade.** O portal foi exercitado com o próprio
  `agente-leitura` convidado como CREDOR — não com um analista externo real.
  O fluxo de convite → login → MFA → Data Room → download está provado, mas
  com um usuário que também é membro da organização.
- **Duas divergências registradas e NÃO corrigidas**, por serem escolha dele:
  o `CLAUDE.md` manda conferir deploy com `publicar-producao.sh` (que recusa
  fora de `main`; a partir de uma frente o certo é `conferir-producao.sh`), e a
  violação §8 preexistente no rodapé do `LoginGateway`.
- **Fechar a frente**: `bash scripts/fechar-frente.sh portal-credito` — a
  branch já está contida em `origin/main`, então o passo 0 do script passa.

### Migrations aplicadas em produção — 2026-09-07 (autorizado pelo usuário: *"aplique as duas migration"*)

Aplicadas na ordem 1 → 2 com `npx supabase db query --linked -f …`, nunca
`db push`. Conferido contra o banco depois de cada uma:

- **RLS ligada** nas 6 tabelas; **`anon` sem privilégio nenhum** (não aparece em
  `role_table_grants`); 17 policies no total.
- `credit_room_versions` com apenas `INSERT, SELECT` para `authenticated`.
- `audience` aceita `'credor'`; o CHECK de alvo exige `credit_room_id` e proíbe
  `client_id`/`employee_id` junto; índice único e FK no lugar.
- `bash scripts/check-rls-postura.sh` → **postura limpa nas 9 verificações**, e
  a sonda 9 (chave publicável, de fora) devolve **`recusado`** para as quatro
  tabelas novas — melhor que "vazio", que é o piso aceitável.

#### 🔴 Achado ao conferir: duas funções de trigger ficaram executáveis por `anon`

`fn_credit_room_numerar` e `fn_credit_room_version_imutavel` saíram com
`anon=X/postgres`. As cinco funções de acesso, não. Causa: na ...000001 escrevi
`REVOKE ALL ... FROM PUBLIC` para as de trigger e `FROM PUBLIC, anon` para as de
acesso — e o `ALTER DEFAULT PRIVILEGES` do Supabase concede a `anon` como grant
**explícito**, que `FROM PUBLIC` não remove. É a Pergunta 2 da REGRA #7 no
segundo andar.

O que induziu ao erro: copiei o padrão de `aplicar_20270915000001_debt_core.sql`,
cujas funções de trigger hoje aparecem **sem** `anon` — mas não por serem
melhores, e sim porque a varredura `aplicar_20270916000001_revoke_anon_rpcs_internas.sql`
passou depois e limpou. Herdei o defeito sem herdar a limpeza.

Risco real baixo (função que devolve `trigger` não é chamável pelo PostgREST, e
as duas são `SECURITY INVOKER`), corrigido mesmo assim pela ...000003 — "o risco
é baixo" foi o raciocínio que deixou passar os quatro achados críticos de 01/09.
Depois da corretiva: **as 8 funções `credit_room` negam `anon` e `PUBLIC`.**

#### R2 (snapshot imutável) exercitado no banco, com ROLLBACK

São **três** camadas, não duas — o commit inicial descrevia mal. Provadas uma a uma:

| # | Camada | Ensaio | Resultado |
|---|---|---|---|
| 1 | Privilégio | `SET ROLE authenticated` + UPDATE/DELETE | `42501` nos dois |
| 2 | RLS | privilégio devolvido por `GRANT` | **0 linhas**; `label` segue `ORIGINAL` (não há policy de UPDATE/DELETE) |
| 3 | Trigger | privilégio + RLS desligados, só ela no caminho | recusa UPDATE e DELETE com `check_violation` |

E a numeração (10.f): dois INSERTs na mesma organização → `CR-00001`, `CR-00002`.

⚠️ A camada 3 **só é alcançável com RLS desligada** neste ensaio, porque a policy
de SELECT (`fn_credit_room_access`) filtra a linha antes — não tenho um JWT de
membro real para forjar. Quem for testar de novo: sem desabilitar a RLS, o
UPDATE volta "sem erro e sem efeito", que é seguro mas parece falha de trigger.

### 🔴 Varredura no navegador — 2026-09-07 (dois defeitos que só a tela mostrou)

Rodada ANTES de publicar o frontend, com `/rodar-app` (frente na porta 3104 —
3100–3103 eram de outras sessões). Escutando `pageerror`, `console.error` e todo
4xx/5xx do PostgREST.

**Regressão do GED: passou.** O caminho não era o suposto — a reescrita de
`f3ce645`/`b19f216` tirou o Compartilhar da linha da tabela; hoje ele abre pelo
modo grade, pela pasta ativa ou pelo filtro de disciplina. Por lá: as 4 abas
presentes, a nova renderiza, as 3 antigas reabrem com conteúdo, zero erro.

**Módulo novo: passou.** Criar → detalhe (7 abas) → congelar V1 → indicadores,
com dados reais (NOI mensal R$ 16.194, dívida R$ 100.000, DSCR atual 1,84×) e
"—" com explicação onde falta insumo.

#### Defeito 1 · "Margem NOI 1%" para uma carteira de 99,6%

`rentalNoiService` devolve `margin` e `capRate` como **fração** (0,9962);
o snapshot os congelava crus e o formatador só grudava o "%". A assinatura do
*erro engolido virando número plausível*: 1% de margem não parece defeito,
parece carteira ruim — num documento apresentado a banco.

Corrigido convertendo uma vez no `buildSnapshot`, com os campos renomeados para
`margem_pct`/`cap_rate_pct`. Dois testes travam a unidade. Reconferido na tela:
**99,6%**.

#### Defeito 2 · Compartilhar documento com portal estava quebrado EM PRODUÇÃO

Ao compartilhar com o Credit Room:

```
HTTP 400 · 42P10
"there is no unique or exclusion constraint matching the ON CONFLICT specification"
```

Testado então o caminho **antigo** (Portal do Cliente), que esta frente não
tocou: **mesmo erro**. Ou seja, compartilhar documento com o Portal do Cliente e
com o do Colaborador estava quebrado desde `20270821000008` (21/08) — ~2,5
semanas. Não é regressão desta frente; foi descoberto por ela, ao copiar o
padrão das duas audiências existentes e levar o mesmo 400.

Causa: os três índices únicos são **parciais** (`WHERE audience = '…'`), e o
Postgres só casa índice parcial com `ON CONFLICT` se a instrução repetir o
predicado — que o PostgREST não tem como enviar (`on_conflict` aceita só a lista
de colunas). O índice existe, está correto como restrição, e o upsert não o
enxerga.

Corrigido pela `…000004`, que tira o `WHERE` dos **três**. A garantia não se
perde: o CHECK de alvo já limita cada coluna à sua audiência, e NULL não
conflita com NULL. Corrigi além do meu escopo de propósito — é a mesma linha, o
mesmo defeito, e deixar duas audiências quebradas sabendo disso seria pior.

Provado depois, na interface: Portal do Cliente grava; Credit Room grava; o
room aparece no select do GED.

⚠️ A tabela tinha **0 linhas** — ninguém nunca conseguiu compartilhar. É por
isso que o defeito passou 2,5 semanas sem reclamação.

### Portal do credor, ponta a ponta — 2026-09-07

O TOTP já estava `Enabled` no painel (o usuário não precisou mexer). Entrada
pelo card "Portal de Crédito" do login, com o `agente-leitura` convidado como
CREDOR do próprio room de teste; os códigos de 6 dígitos foram gerados por
HMAC-SHA1 no script, a partir da chave que o gate exibe em texto.

Funcionou: **cadastro do TOTP → portal → Data Room (3 documentos, "links
válidos por 15 minutos") → Baixar → Edge Function `HTTP 200` com `signedUrl`**.
E a trilha registrou o que importa:

| Ação | Lado | IP |
|---|---|---|
| DOWNLOAD | CREDOR | **tem IP** (gravado pela Edge Function; o cliente não teria como) |
| VIEW / LOGIN | CREDOR | — |
| INVITE / FREEZE | (interno) | — |

#### Defeito 3 · o credor podia ficar trancado fora do portal para sempre

`listFactors()` do supabase-js devolve três listas, e **`data.totp` já vem
filtrada por `status === 'verified'`**. A limpeza de cadastros abandonados lia
essa lista — ou seja, não limpava nada. Quem fechasse a aba antes de digitar o
código deixava um fator órfão e, do segundo acesso em diante, batia em
`422 mfa_factor_name_conflict` **para sempre**, sem nenhuma saída pela própria
interface.

Três correções, porque a causa tinha três camadas:

1. ler `data.all` (única lista que traz os não-verificados);
2. `friendlyName` **único por tentativa** — com nome fixo, qualquer órfão que a
   limpeza não alcance volta a trancar o acesso;
3. guarda de reentrância (`useRef`) no efeito. Ele ESCREVE (unenroll + enroll) e
   o StrictMode o monta duas vezes em desenvolvimento: a 1ª passada limpava e
   cadastrava, a 2ª tentava remover o que a 1ª removeu (404) e cadastrar por
   cima (500) — e o usuário via o erro da segunda, não o sucesso da primeira.

#### Defeito 4 · LOGIN sem lado na auditoria

O evento mais consultado da trilha ("fulano acessou") nascia com `actor_side`
nulo, deixando a coluna "Lado" vazia justamente nele. `touch()` passou a receber
o lado.

### Edge Function publicada e provada — 2026-09-07

`npx supabase functions deploy credit-room-download` (projeto
`oxedkknreghxrgenyjiu`). A prova que vale é contra o **deploy**, não contra o
arquivo local (REGRA #7, Pergunta 3 — a `task-alert-notifier` tinha o gate no
repositório e não no bundle publicado):

| Cenário | Resposta |
|---|---|
| sem header nenhum | **401** |
| com a chave publicável do bundle (`anon`) | **401** |
| token lixo | **401** |
| `anon` + corpo com `creditRoomId` forjado | **401** |

O segundo é o que mais importa: `verify_jwt` aceita qualquer chave do projeto, e
a `anon` vai no bundle do frontend. Quem recusa é o `exigirUsuario` do código.

**A sonda virou permanente**: `credit-room-download` entrou na verificação 8 do
`scripts/check-rls-postura.sh`, que passou a se chamar "Edge Functions sem
sessão" (era "Functions de cron" — esta é a primeira cujo chamador legítimo é um
usuário externo com sessão). Rodado depois: **postura limpa nas 9 verificações**.

### Rebase sobre `origin/main` — 2026-09-07, depois de 14 commits de outras frentes

Enquanto esta frente era escrita, `origin/main` recebeu **14 commits** de pelo
menos três frentes (GED, Portal do Fornecedor, Blueprint). Rebase feito ANTES de
qualquer publicação, porque publicar árvore atrasada é o incidente de 04/09
(uma publicação de pasta atrasada apagou do ar o trabalho de outra frente).

**Duas colisões, ambas resolvidas:**

- **`components/Auth.tsx`** — conflito de verdade: `069b941` acrescentou
  `case SUPPLIER` e `case BROKER` no mesmo `switch`, no ponto exato onde entrou
  o `case LENDER`. Os três coexistem. Aproveitei o argumento que eles
  escreveram no comentário ("o caminho escolher portal → entrar não pode trocar
  de identidade") e **troquei o ícone do LENDER de `Building2` para `Landmark`**
  — `Building2` é o ícone do Portal do Cliente, e o cartão do Portal de Crédito
  em `LoginGateway.tsx` usa `Landmark`.
- **`components/OpuraDocsModule.tsx`** — `f3ce645` + `b19f216` reescreveram o
  GED (141+/311−: saiu o painel lateral, Disciplina virou coluna). **Auto-merge
  limpo**, porque as duas mudanças são em regiões disjuntas: eles mexeram na
  tabela e na navegação, eu no modal de compartilhamento. Conferido depois:
  `git diff origin/main..HEAD -- components/OpuraDocsModule.tsx` = **+58/−6**, e
  as 6 remoções são linhas que o próprio patch substitui por versões estendidas
  — nenhuma reverte o trabalho deles.

**Prefixo de migration:** `origin/main` chegou a `aplicar_20270919000033` (uma
das frentes precisou renumerar `028/029/030 → 031/032/033` no commit `bf2bcbc`
— a corrida de prefixo é real). `20270920000001/2` continua acima; sem colisão.

**Uma violação de UI que NÃO é minha, e não silenciei:**
`check-ui-standard.sh components/LoginGateway.tsx` acusa §8 (pílula
`rounded-full` + `uppercase`) na linha do rodapé "Acesso Seguro e Protegido".
É **dívida preexistente** — provado rodando o checker na versão de
`origin/main`, sem o meu cartão: falha igual. Meu diff no arquivo é só o objeto
do cartão "Portal de Crédito" + o import de `Landmark`. Não corrigi porque
mudaria o rodapé da tela de login de **todos** os portais, o que é escopo de
outra tarefa — fica registrado para quem for mexer nela.

### ⚠️ Divergência encontrada na própria documentação de deploy

`CLAUDE.md` REGRA #8 diz "para conferir o que foi publicado:
`bash scripts/publicar-producao.sh`". Mas esse script **recusa quando a branch
não é `main`** ("Você está em '<branch>', não em 'main'"), e trabalho de frente
nunca está em `main`. Quem confere a partir de uma frente é
`scripts/conferir-producao.sh` — que é, aliás, o que o próprio `.githooks/pre-push`
imprime depois do push. Registrado aqui, não corrigido: mexer no CLAUDE.md é
decisão do usuário.

**Decisões de implementação que não estavam no plano:**
- `credit_rooms.seq/code` nascem numa trigger BEFORE INSERT por organização (`CR-00001`), UNIQUE por org.
- `credit_room_versions`: `authenticated` só tem SELECT+INSERT (sem privilégio de UPDATE/DELETE) **e** trigger que recusa — duas travas para o R2. Consequência: room com versão não pode ser excluído (erro traduzido no service: "cancele a operação").
- Credor entra por `credit_room_members.email = lower(auth.jwt()->>'email')` antes do primeiro acesso; `fn_credit_room_touch_member` grava o `user_id` no primeiro login.
- `fn_credit_room_documents` é DEFINER e confere `fn_credit_room_access` dentro — o credor nunca lê `opura_documents` direto.
- Snapshot do portfólio de renda é rotulado `base: 'CONTRATADA'` e a tela diz "receita contratada, não recebida" (R7 do PRD; o `rentalNoiService` só sabe contratada).
- DSCR pós-operação só existe se o room aponta para uma proposta em `debt_contracts` com cronograma (12 primeiras parcelas); sem isso fica `null`, não `valor ÷ prazo`.

## Verificação (critérios de aceite do MVP — 10, não 20)

1. Criar um Credit Room vinculado a um empreendimento e a um contrato de dívida.
2. Congelar V1; alterar orçamento/dívida no ÒPURA; congelar V2 — V1 intacta.
3. Convidar um usuário `LENDER`; ele só entra com MFA.
4. O `LENDER` vê o dashboard com LTV/LTC/DSCR/equity **da versão**, com data-base.
5. Compartilhar 2 documentos do GED; o `LENDER` baixa 1 e o log registra.
6. Revogar o acesso; o mesmo JWT recebe 403 no download e a lista some.
7. O `LENDER` abre uma solicitação; o interno responde; status muda nos dois lados.
8. Comentário interno não aparece para o `LENDER`.
9. Sonda com chave publicável em todas as `credit_room_*` → 401 ou `[]`.
10. `npm run ci` verde e varredura do módulo sem erro.
