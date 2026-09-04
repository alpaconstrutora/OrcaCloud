# Notificações — tabela no padrão, KPIs abaixo das abas e 5 avisos novos

## Pedido original

Sessão de 2026-09-03. Mensagem do usuário, transcrita literalmente:

> Notificações:
> 1.	Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas
> 2.	mover kpis cards para abaixo do toolbar de abas
> 3.	Novas notificações:
> •	Novo recibo de pagamento disponível
> •	Aviso de data de pagamento próxima
> •	Aviso de atraso de pagamento
> •	Aviso de data de Vencimento do contrato próxima
> •	Aviso de data de reajuste próxima

## Decisões do usuário (mesma sessão, respondidas antes de começar)

| Pergunta | Decisão |
|---|---|
| Escopo dos avisos de pagamento (itens 2 e 3 da lista) | **Recebíveis + pagáveis** (`CREDIT` e `DEBIT`) |
| "Novo recibo de pagamento disponível" — não existe recibo persistido | **Disparar na baixa da parcela**, não construir persistência de recibo |
| Vencimento de contrato — já existe cron só para LOCAÇÃO | **Estender a todos os domínios** |
| RLS aberta de `notifications` (`FOR ALL TO public USING (true)`) | **Corrigir junto** |

---

## Contexto

A tela **Notificações** (`components/NotificationsCenter.tsx`, rota `notifications-center`
em `components/AppRouter.tsx:1031`) nunca passou pelo padrão do
`docs/ui_ux_guia_unificado.md`. Hoje ela:

- renderiza os alertas como **lista de divs empilhadas** (`divide-y`, linhas 585-648) —
  não há `<table>`, nem ordenação, nem colunas configuráveis;
- monta **KPIs antes das abas** (355-361 vs 363-380), a ordem que o guia inverteu em
  02/08/2026 justamente porque os KPIs refletem a aba ativa;
- usa `KPICard` local (linha 440) em vez do `KpiCard` canônico, busca com `useState`
  (§3), e badge `rounded-full`+`uppercase`+`font-black` (linha 57 — reprova o §8 do
  `check-ui-standard.sh`).

Dois defeitos funcionais descobertos na auditoria entram junto, porque a tabela nova
depende deles:

1. **A taxonomia de tipos da UI não existe no banco.** A tela filtra por
   `sistema|financeiro|suprimentos|operacional|qualidade|fiscal` (linha 18), mas os
   `type` gravados são outros — medido no banco remoto: `manutencao_vencimento` (28),
   `task_alert` (3), `warning` (2). São 14 slugs espalhados por 7 services, 2 edge
   functions e 6 crons. **O filtro por tipo não casa nada e o badge cai sempre no
   fallback cinza.** Uma coluna "Tipo" ordenável herdaria o defeito.
2. **`notifications` é legível por qualquer conta autenticada.** Policy original
   `FOR ALL TO public USING (true) WITH CHECK (true)`
   (`20260215000011_notifications_and_chat.sql:31-33`), sem `organization_id`, e nenhuma
   migration posterior a tocou. O risco já era conhecido e contornado por autocensura:
   `20270850000009_academy_alerts_cron.sql:8` documenta *"a mensagem NUNCA contém nota,
   percentual, CPF ou NR sensível"*. Os avisos novos carregam nome de locatário, número
   de contrato e valor — não dá para publicá-los sob essa policy.

Dos 5 avisos pedidos, 4 não existem e 1 já roda em produção
(`daily-rental-renewal-alerts`, `type = 'rental_renewal'`).

---

## Fase 1 — Taxonomia de tipos (pré-requisito da coluna "Tipo")

**Arquivo novo:** `components/notifications/notificationTypes.ts`

Mapa único slug → `{ category, label, icon, color }`, fallback para `sistema` com o slug
cru como label. Cobre os 14 tipos existentes mais os 5 novos:

| Categoria | Tipos |
|---|---|
| `financeiro` | `pagamento_recibo`, `pagamento_proximo`, `pagamento_atraso` |
| `contratos` | `rental_renewal`, `contrato_vencimento`, `contrato_reajuste` |
| `suprimentos` | `status_change`, `chat_message` |
| `documentos` | `documento_compartilhado`, `solicitacao_aprovacao`, `documento_aprovado`, `documento_rejeitado`, `vencimento_documento` |
| `operacional` | `operacional`, `task_alert` |
| `qualidade` | `manutencao_vencimento`, `garantia_fornecedor` |
| `comercial` | `broker_proposal` |
| `sistema` | `error`, `warning`, desconhecidos |

O filtro da tela passa a comparar **categoria**, não igualdade crua com `n.type`.

**Pronto quando:** o mapa cobre os 19 slugs e filtrar por "Qualidade" na tela retorna as
28 linhas `manutencao_vencimento` que hoje o filtro não acha.

---

## Fase 2 — Reescrever a tela no padrão do guia

**Arquivo:** `components/NotificationsCenter.tsx` (829 linhas).
Referência a copiar: `components/TributosAPagarManager.tsx` (definições 36-67, estado
373-381, abas 676-734, toolbar acoplada 736-843, tabela 891-982).

### 2.1 Anatomia (§20.1) — itens 1 e 2 do pedido

Trocar o casco `flex flex-col h-full` com header branco fixo pela ordem canônica, `mb-3`
no filho, sem `px-*`/`pt-*` na raiz (§20.2 — o gutter é do `Layout.tsx`):

```
<div className="space-y-6">
  1. <h1> + subtítulo         ← muda com a aba ativa
  2. Toolbar de abas (§19.1)  ← mb-3
  3. KPI cards (§4)           ← mb-3   ← ITEM 2 DO PEDIDO
  4. Toolbar acoplada + tabela (§5.2)
```

Abas no vocabulário §19.1 (trilho `bg-gray-50 p-1 rounded-[10px] border border-gray-100`,
botão `px-3 h-7 rounded-[6px] text-sm font-medium`, ativo `bg-white text-blue-600
shadow-sm`, inativo `text-gray-700`, `flex-wrap`). `KPICard` local apagado em favor do
`KpiCard` de `./ui/KpiCard`. Aba persistida com `usePersistedState`.

**Pronto quando:** a ordem visual no app real é abas → KPIs → toolbar → tabela.

### 2.2 Alertas e Logs viram `<table>` — item 1 do pedido

Duas tabelas independentes (duas instâncias dos hooks, como `condominio/ManutencaoTab.tsx`).
**Preferências fica como está** — é grade de configuração, não lista de registros.

- Alertas (`'notificacoesAlertasColumns'`): `status` · `title` · `message` · `category` ·
  `recipientEmail` (`defaultHidden` para não-admin) · `createdAt` · `actions`.
- Logs (`'notificacoesLogsColumns'`): `channel` · `recipient` · `subject` · `status` ·
  `error` · `createdAt` · `actions`.

Obrigatório por tabela: `useResizableColumns` + `tableTotalWidth` (soma exata, nunca
`w-full` com `table-layout: fixed`); `<colgroup>` com `data-col-key` e espaçador `<col />`
antes de "Ações", replicado nas três listas (`<td aria-hidden="true"></td>` fechado —
self-closing quebra o parser do script); `<tr sticky top-0 z-10>`; `SortableHeader` com
`uppercase={false}` e `onMoveColumn`; `<th> px-6 py-2 border-r`, `<td> px-6 py-2.5
border-r last:border-r-0`; `divide-y divide-gray-200`; `hover:bg-blue-50/50`; status como
texto colorido simples (mata o `NotifTypeBadge` `rounded-full`+`uppercase` da linha 57);
nada de `font-bold`/`font-black`/`font-mono` em `<td>`.

**Pronto quando:** as duas tabelas ordenam, escondem coluna e redimensionam; o reload
preserva aba, busca, colunas e larguras.

### 2.3 Toolbar acoplada (§5.2) — "botão de ajuste de colunas"

Fileira: busca `flex-1` com `usePersistedState` → filtros (categoria, lida/não lida) →
Atualizar `h-9 w-9` → separador → bloco `h-9 bg-white px-1 rounded-[10px] border gap-1`
com **`ColumnConfigButton`** (engrenagem: quais colunas) **e o botão de ajuste**
(`MoveHorizontal` → `cols.autoFit()`).

⚠️ São dois botões distintos e é exatamente aqui que o pedido já foi mal interpretado
antes (`ContasReceberManager`, 31/07): "ajuste de colunas" é o `MoveHorizontal`
(largura), não a engrenagem (visibilidade). O guia trata a dupla como bloco único, então
entram os dois — mais a busca, que o `CHECKLIST DE APLICAÇÃO` cobra junto (entrega sem
ela já foi rejeitada em `OrganizationUsers.tsx`).

`DEFAULT_COL_WIDTHS` deve somar perto da largura útil real (~1290px com sidebar).

**Pronto quando:** `bash scripts/check-ui-standard.sh components/NotificationsCenter.tsx`
sai com exit 0 e o relatório percorre o `CHECKLIST DE APLICAÇÃO` item a item, incluindo
os que não se aplicam.

---

## Fase 3 — Fechar a RLS de `notifications`

**Migration:** `supabase/migrations/20270919000001_notifications_org_e_rls.sql`
(maior prefixo atual: `20270918000027`).

Adiciona `organization_id` + índice; backfill só do inequívoco (destinatário membro de
UMA organização); troca a policy aberta por:

```sql
USING (
  LOWER(recipient_email) = LOWER(auth.jwt() ->> 'email')
  OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
)
WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id))
```

Decisões embutidas: `is_org_member` é o helper canônico (prefere `user_id`, fallback por
e-mail); linha com org NULL fica visível só ao próprio destinatário (fallback seguro —
nada some para quem é dono, nada vaza); a 2ª perna do `OR` preserva a visão "admin vê a
organização inteira" que a tela já tem e **não** é a perna frouxa da REGRA #7, porque
`is_org_member` sozinha já recorta o tenant; crons são `SECURITY DEFINER` e não são
afetados.

**Escrita passa a gravar a org:** `sendNotification` ganha `organizationId?`; preencher
onde a org já está em escopo (`documentService.ts:1380/1442/1506`, `orderService.ts:308`,
`partnerService.ts:618`, insert direto em `servicesCommercialService.ts:469`); as 6
funções SQL de cron e as 2 edge functions (`task-alert-notifier:143`,
`notify-broker-proposal:105`) já têm a org no loop.

**Pronto quando:** com a chave anon, `select` em `notifications` retorna 0 linhas;
logado, a tela mostra as mesmas notificações de antes.

---

## Fase 4 — Os 5 avisos

**Migration:** `20270919000002_notificacoes_avisos_financeiros.sql`

Template validado em produção: `generate_rental_renewal_alerts`
(`20270827000003_rental_renewal_cron.sql:16-98`) — `SECURITY DEFINER SET search_path =
public, pg_temp`, loop por `organization_members`, `INSERT INTO notifications` com dedup
manual por `link` em janela de 7 dias (a tabela não tem chave única), `REVOKE EXECUTE
FROM PUBLIC, anon` na mesma migration (REGRA #7).

### 4.1 `pagamento_recibo` — "Novo recibo de pagamento disponível"

Não há recibo persistido: `exportService.generateReceiptPDF` (`services/exportService.ts:566`)
monta o PDF com jsPDF e faz `doc.save()` no navegador. O gatilho é a **baixa**:
`internal_transactions.payment_date`, preenchido pelo trigger `trg_payment_date_na_baixa`
(`20270909000002_payment_date_na_baixa.sql:37`). Varredura de `payment_date >= CURRENT_DATE - 1`.

### 4.2 `pagamento_proximo` — "Aviso de data de pagamento próxima"

`due_date = CURRENT_DATE + N` (N=3), `status='PENDING'`,
`COALESCE(business_status,'PREVISTO') NOT IN ('PAGO','RECEBIDO','CANCELADO','RENEGOCIADO')`.
`CREDIT` e `DEBIT`, com o texto dizendo "a receber"/"a pagar".

⚠️ `daily-payment-tasks` já cria **tarefa** (não notificação) para DEBIT vencendo em 3
dias — passa a haver tarefa **e** notificação para o mesmo fato. É o comportamento
pedido; registrado no comentário da migration para não parecer duplicação acidental.

### 4.3 `pagamento_atraso` — "Aviso de atraso de pagamento"

Não existe status `overdue` gravado; atraso é derivado. Regra canônica: o `CASE` de
`vw_receivables` (`20270909000000:140-176`). ⚠️ Essa view é `security_invoker = on` —
dentro de função `SECURITY DEFINER` aplicaria a RLS do owner, então **replicar o `CASE`
sobre `internal_transactions`**, não consultar a view. Disparo em marcos (3, 7, 15, 30
dias), não diariamente. `COALESCE(business_status,'PREVISTO')` obrigatório: o campo é
NULL em ~1.000 linhas vindas de sync (lição de `20270819000002`).

### 4.4 `contrato_vencimento` — estender o alerta existente

Alterar `generate_rental_renewal_alerts` (mantendo o job `daily-rental-renewal-alerts`,
ativo): remover `domain = 'LOCACAO'` e `is_recurring IS TRUE`. Entram SUPRIMENTOS (20
contratos com `end_date`), SERVIÇOS e VENDAS. Manter `end_date >= v_today - 30` (contrato
que passou do fim sem renovar é o caso mais urgente) e `NOT EXISTS (... parent_contract_id)`.
`type` continua `rental_renewal` para LOCAÇÃO e vira `contrato_vencimento` nos demais,
para não reclassificar o que já foi emitido.

### 4.5 `contrato_reajuste` — "Aviso de data de reajuste próxima"

`contracts.reajuste_proximo` (`20261102000003:13`), cujo `COMMENT` já previa o scheduler
que nunca foi escrito. Os 8 contratos de LOCAÇÃO têm a coluna preenchida.

⚠️ A maioria está **no passado** (2017-09, 2021-05, 2023-03, 2025-05, 2025-08, 2026-01,
2026-08) — reajustes devidos e nunca aplicados. `BETWEEN hoje AND hoje+30` não dispararia
em nenhum. Usar `reajuste_proximo >= CURRENT_DATE - 90 AND <= CURRENT_DATE + 30`, com o
texto distinguindo "vence em N dias" de "venceu há N dias". Espelhar a condição de
`contractIndexService.listDueForReajuste` (`services/contractIndexService.ts:115-131`)
para as duas não divergirem. Índice é `'IGP-M'` **com hífen** (`'IGPM'` já quebrou o join).

### 4.6 Agendamento

Um job diário chamando as quatro funções. Horários ocupados: `0 6`, `0 7`, `30 7`, `0 8`,
`15 8`, `0 9` → usar **`45 8 * * *`** (`daily-financial-notifications`), precedido do
`DO $$ ... cron.unschedule ... $$` idempotente.

**Pronto quando:** cada função roda à mão e devolve contagem > 0 com dado real; a segunda
execução devolve 0 (dedup); o job aparece em `cron.job`.

---

## Verificação

```bash
bash scripts/check-ui-standard.sh components/NotificationsCenter.tsx   # exit 0
npx vitest run __tests__/migrationsPrefixo.test.ts
npx vitest run __tests__/segurancaMigrations.test.ts
npx vitest run __tests__/orgContextGuard.test.ts
npm run ci
```

Migrations aplicadas com `npx supabase db query --linked -f <arquivo>` — **nunca
`supabase db push`**.

Prova de fora do app:

```bash
npx supabase db query --linked -o table \
  "SELECT type, count(*) FROM notifications WHERE created_at > now() - interval '1 day' GROUP BY 1"
```

UI de verdade (skill `rodar-app`, Playwright com `serviceWorkers:'block'`, sidebar
montada ~1290px úteis): (1) ordem abas → KPIs → toolbar → tabela; (2) as duas tabelas
ordenam/escondem coluna/ajustam largura; (3) filtrar por "Qualidade" retorna as 28 linhas
que hoje o filtro não acha; (4) reload preserva aba/busca/colunas/larguras; (5) trocar a
organização no topo não deixa a tela em branco (REGRA #5).

---

## Fora de escopo (dívida registrada, não silenciada)

- `TaskForm.tsx:225` e `chatService.ts:66` gravam notificação sem `organization_id` — a
  org não está em escopo nessas duas cadeias; a notificação fica visível só ao
  destinatário até serem refatoradas.
- Aba **Preferências** grava apenas em `localStorage['notif_prefs']` (linhas 104/117);
  não há persistência no banco nem efeito real sobre o envio.
- `client_portal_messages` (mural do Portal do Cliente, job `vencimento-portal-alerts`)
  segue como canal separado — nada dela aparece nesta tela.

---

## Progresso — CONCLUÍDO em 04/09/2026

- [x] **Fase 0** — plano registrado
- [x] **Fase 1** — `components/notifications/notificationTypes.ts`, 20 slugs em 8 categorias.
      Eram 19 no plano: a varredura achou `engineering_request`
      (`servicesCommercialService.ts:469`), que nenhuma das explorações tinha listado.
- [x] **Fase 2** — `NotificationsCenter.tsx` reescrita. Alertas e Logs viraram `<table>`
      com `useTableColumns` + `useResizableColumns` + `SortableHeader`; KPIs abaixo das abas;
      toolbar acoplada com busca persistida, engrenagem e autofit. `check-ui-standard.sh`: exit 0.
- [x] **Fase 3** — `20270919000001` (coluna + backfill + policy) e `20270919000003`
      (os 4 crons legados passam a gravar a organização).
- [x] **Fase 4** — `20270919000002`: as 4 funções novas + a extensão do alerta de contrato,
      job `daily-financial-notifications` às 08:45 UTC.

## Verificação executada (04/09/2026)

| O quê | Resultado |
|---|---|
| `check-ui-standard.sh components/NotificationsCenter.tsx` | exit 0 |
| `vitest run` (suíte inteira) | 2.291 passaram, 24 skipped |
| `migrationsPrefixo` · `segurancaMigrations` · `orgContextGuard` | 19 passaram |
| `tsc --noEmit` | limpo nos arquivos desta frente (ver "Fora de escopo") |
| Playwright no app real (1600×950, sidebar montada) | ordem abas→KPIs→toolbar→tabela; tabela 1290px sem scroll horizontal no body; alturas de linha uniformes; ordenação, autofit e engrenagem funcionando; **0 erros fora do ruído conhecido da Central de Controle** |
| Filtro por categoria | Qualidade 24 · Financeiro 28 · Contratos 14 · Todos 66 — **antes retornava 0 para qualquer categoria** |
| As 5 funções SQL | rodadas contra o banco real; 2ª execução devolve 0 (dedup); `fn_notif_recibo_disponivel` e os 4 crons legados provados em transação revertida |
| ACL das funções | `anon` = false, `authenticated` = true nas 6 |
| RLS | `anon` sem grant nenhum em `notifications`; 1 policy, só `authenticated` |

## Achados que não estavam previstos no plano

1. **`create_task` com erro de tipo latente desde `20270827000003`.** O `p_priority`
   é `SMALLINT` e o CASE devolve `INTEGER`; a conversão é de atribuição, não implícita,
   então a resolução por nome falha com 42883. Os 37 jobs "succeeded" do
   `daily-rental-renewal-alerts` **nunca chegaram nessa linha** — o filtro antigo
   (LOCACAO + `is_recurring` + janela) não casava contrato nenhum. Ampliar o filtro é o
   que fez o erro aparecer. Corrigido com `::SMALLINT`.
2. **Membro órfão aborta o cron inteiro.** Há 1 linha em `organization_members` com
   `user_id` de conta que não existe mais em `auth.users`; `tasks_user_id_fkey` levanta
   23503 e, por ser erro, derruba a função — deixando sem alerta todo contrato ainda não
   percorrido. Resolvido com `EXISTS` em `auth.users` antes do `create_task`.
3. **Moeda saía em formato americano.** `lc_numeric` do cluster é `en_US.UTF-8`, então
   `to_char(...,'FM999G999G990D00')` produz `R$ 561.25`. Criada `public.fn_brl()`.
   O mesmo defeito continua em `generate_rental_renewal_alerts` e `fn_vencimento_alerts`,
   que não foram tocados nesse ponto.
4. **Drift de policy.** `notifications` tinha `users_read_own_notifications` e
   `users_update_own_notifications` no banco e em nenhuma migration. Não vazavam
   (para `anon`, `auth.email()` é NULL), mas eram redundantes com a nova policy —
   removidas para o estado voltar a ser reproduzível pelos arquivos.
5. **`fn_supplier_warranty_alerts` é inalcançável com o dado atual.** Exige
   `opura_assets.empreendimento_id`, e as 84 linhas da tabela têm todas NULL. O alerta
   de garantia de fornecedor nunca disparou e não vai disparar até esse vínculo existir.
   Fora do escopo deste pedido, registrado aqui.
6. **Reescrever função a partir de `pg_get_functiondef` corrompeu acentuação.** A saída
   do `supabase db query` chega decodificada errado no Windows; regravá-la em UTF-8
   transformou "prazo —" em "prazo â€"", de forma irreversível a partir do banco.
   Detectado, revertido reconstruindo a partir dos **arquivos** de migration, e conferido
   depois (`prosrc` sem mojibake, com acentos). **Ao reescrever função existente, use o
   arquivo, nunca a re-serialização do banco** — nada quebra, só sai texto errado.

## Fora de escopo (dívida registrada, não silenciada)

- `TaskForm.tsx:225`, `chatService.ts:66`, `orderService.ts:308` e `partnerService.ts:618`
  gravam notificação sem `organization_id` — a org não está em escopo nessas cadeias
  (nos dois últimos o destinatário é externo, fornecedor/parceiro, para quem a
  notificação pessoal é o alcance correto). Ficam visíveis só ao destinatário.
- Aba **Preferências** grava apenas em `localStorage['notif_prefs']`; não há persistência
  no banco nem efeito real sobre o envio.
- `client_portal_messages` (job `vencimento-portal-alerts`) segue como canal separado.
- **Árvore suja de outra frente:** `components/ClientList.tsx` (mais `ClientForm.tsx`,
  `ClientImportModal.tsx`, `utils/clientExcel.ts`, `clientEmpreendimentoService.ts` e
  `docs/planos/2026-09-04-clientes-empreendimento-excel-tela-abas.md`) está em edição por
  outra sessão e **não compila** — 7 erros de TS, todos nesse arquivo, nenhum nos arquivos
  desta frente. Por isso `npm run ci` falha no passo de typecheck enquanto aquele trabalho
  não fecha. Não corrigido de propósito.
