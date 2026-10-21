# Agrupar tributos em um DARF

## Pedido original

Sessão `4b376e5e`, 21/10/2026:

> financeiro > tributos a pagar: muitas das vezes o usuário decide agrupar os tributos e pagar em apenas um darf. neste campo implementar opcao de agrupar em um darf podendo selecionar quais o usuário quer agrupar

### Decisões do usuário (perguntadas na mesma sessão)

| Pergunta | Resposta |
|---|---|
| Como o DARF aparece em Contas a Pagar | **Uma linha só**, com o total; "Dar baixa" paga todos de uma vez; expande para mostrar a composição |
| Campos do DARF (além de vencimento e total) | Código de barras, Anexo (PDF do DARF), Número do documento, Observação |
| Multa e juros (DARF pago com atraso) | **Campos no DARF**, que viram lançamento de despesa próprio, pago junto |
| Competências diferentes no mesmo DARF | **Só a mesma competência** |

### Relação com o plano anterior

Muda a trava "Tributos sem seleção" de `2026-10-21-tributos-gestao-pagamento-em-contas-a-pagar.md` (PR #74): a
seleção volta em Tributos a Pagar **só para agrupar em DARF**. Pagar, dar baixa e estornar continuam só em
Contas a Pagar.

## Contexto (o que decide o desenho)

- **Contagem em dobro:** `vw_payables`, DRE (`fn_dre*`, `fn_balancete`), fluxo (`fn_cash_flow`,
  `fn_cashflow_projection`), `fn_calendar_events`, `fn_financial_kpis`, `vw_fpa_cashflow_projection` e
  `vw_fact_financial_tx` somam todo DEBIT não cancelado sem filtrar tributo. O DARF **agrupa** os tributos
  existentes (que seguem como razão contábil); não é título novo com a soma. Multa/juros são despesa nova
  real → linhas DEBIT próprias.
- **Regeração apaga vínculo:** `taxPayableService.generateForDeal` → `removeForDeal` apaga e recria (outro id)
  todo tributo não pago a cada `saveDeal` ativo, no "Gerar" e na troca de regime. Tributo agrupado é
  preservado como o pago.
- **Conciliação N:1:** `fn_reconcile_group` (manual) já existe; o motor automático é só 1:1.

## Desenho

### 1. Banco — migration A (`aplicar_20271021300000_darf_agrupar_tributos.sql`; o prefixo é conferido no dia)

**Tabela `darfs`** (só o cabeçalho; não guarda dinheiro nem status):
- Colunas: `id` (uuid gerado no cliente, para o anexo subir antes em `{org}/darf/{id}/…`), `organization_id`, `competencia` (dia 1), `due_date`, `codigo_barras` (CHECK de 44 ou 48 dígitos), `numero_documento`, `observacao`, `documento_path/nome` (bucket `financeiro-anexos`, o mesmo do pagamento avulso), `created_by/at`, `updated_at`.
- RLS: `is_org_member(organization_id)`, sem `OR`.

**`internal_transactions`** ganha duas colunas:
- `darf_id uuid REFERENCES darfs ON DELETE RESTRICT`, com índice parcial. A coluna garante de graça que um tributo esteja em no máximo um DARF, os gatilhos enxergam o valor direto e as views o leem sem join.
- `due_date_antes_darf date`. Ao agrupar, o `due_date` de cada membro vira o vencimento do DARF (fluxo, calendário, VENCIDO e KPIs mostram a data real de saída do dinheiro). O vencimento original é restaurado ao desagrupar.

**Multa e juros:**
- Uma linha DEBIT para cada valor maior que zero.
- `source_system='DARF'` (sujeita à trava de período, o que está certo para despesa nova).
- `party_type='GOVERNMENT'`, nunca `'TAX'` (senão apareceria em Tributos), `party_name='Receita Federal'`.
- `reference_id='darf-{id}-multa'` ou `'darf-{id}-juros'`, `darf_id=id`.
- Categoria "Multa e Juros de Mora" (global, grupo FINANCEIRO da DRE), via `resolverCategoriaPorNomes` (`services/financialCategoryResolver.ts:65`).

**Travas:**
- **(a) Escrita em `darfs`:** só pelas RPCs (GUC de transação `darf.rpc`; precedente: `docgen.emitindo`).
- **(b) `trg_darf_membro_trava`:** BEFORE UPDATE/DELETE em `internal_transactions`, com `WHEN (darf_id não nulo)`. Recusa, fora das RPCs, mudar `darf_id`, `amount`, org, direção, datas, cancelar ou apagar. A mensagem diz como desagrupar. Isso também segura bundle antigo e o `removeForDeal`.
- **(c) `trg_darf_pago_junto`:** CONSTRAINT TRIGGER deferido. No commit, recusa se os membros não estiverem todos no mesmo estado "pago" (a régua de `tributoJaPago`). Pega a baixa ou conciliação 1:1 de um componente sozinho; `fn_reconcile_group` com o grupo inteiro passa.
- **(d) Validações de criação:** só tributo DEBIT; PENDING e PREVISTO (exclui RETIDO, pago e cancelado); sem DARF; sem conciliação; sem Asaas em curso; mesma org e mesma competência; mínimo de **2 tributos, ou 1 quando há multa/juros** (tributo atrasado sozinho também é DARF).

**Views** (recriadas a partir da definição **viva** do banco, `security_invoker` explícito, colunas novas no fim):
- `vw_payables` + `darf_id`;
- `vw_commercial_tax_payables` + `darf_id, due_date_antes_darf`;
- nova `vw_darfs`: cabeçalho + agregados (`principal`, `multa`, `juros`, `total`, qtde, nomes dos tributos, `n_pagos`, `payment_date`, `conciliado_no_extrato`, `alcada_pendente`, `asaas_em_curso`, `status_efetivo` = PAGO | PARCIAL (inconsistente) | VENCIDO | PREVISTO).

**RPCs** (SECURITY INVOKER, para a RLS e a trava de período continuarem valendo; `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` — Regra #7):
- `fn_darf_criar(p_darf_id, p_tributo_ids[], p_due_date, p_multa, p_juros, p_dados jsonb, p_categoria_encargos jsonb)`.
- `fn_darf_editar(...)`: com o DARF pago, aceita só código, número, observação e anexo.
- `fn_darf_desagrupar(p_darf_id)`: só sem nada pago ou conciliado. Restaura o vencimento, solta os membros, apaga multa/juros e o cabeçalho, e devolve o `documento_path` para o cliente apagar o arquivo.
- `fn_darf_dar_baixa(p_darf_id, p_payment_date, p_payment_type)`: um UPDATE com o mesmo efeito de `payableService.darBaixa` (`services/payableService.ts:236-248`). Recusa alçada pendente usando o texto **idêntico** a `MOTIVO_ALCADA_PENDENTE` (`services/alcadaDaBaixa.ts:17`). Devolve os ids; o service dispara `processService` para cada um, como faz `darBaixa`.
- `fn_darf_estornar(p_darf_id)`: recusa se estiver conciliado com o extrato.

**Migration B** (`…300100_darf_conciliacao.sql`): `fn_darf_desfazer_conciliacao(p_darf_id)` chama `fn_reconcile_unmatch` para cada vínculo dos membros, sem alterar a função existente.

### 2. Regeração dos tributos — `services/taxPayableService.ts`
- Novo predicado `tributoPreservado = tributoJaPago(r) || !!r.darf_id`, ao lado da linha 65.
- `generateForDeal` (614-625, 789): o select lê `darf_id` e `refsPagas` vira `refsPreservadas`, que ficam fora do upsert.
- `removeForDeal` (834-852): não apaga os preservados e **para de engolir o erro do delete** (passa a logar o motivo).
- O texto do confirm do botão "Gerar" (`TributosAPagarManager.tsx:535`) passa a citar "ou agrupados em DARF".
- **Distrato:** o tributo agrupado fica no DARF. A aba DARFs e a composição avisam, em vermelho, "negócio de origem distratado — confira antes de pagar" (`enrichWithEmpreendimento` passa a ler `commercial_deals.status`).
- **`commercialService.deleteDeal`** (913-929): recusa com uma mensagem clara se houver tributo do negócio em algum DARF.

### 3. Tributos a Pagar — `components/TributosAPagarManager.tsx`
- A seleção volta, **só para agrupar**:
  - checkbox + Shift+clique;
  - selecionável = PREVISTO ou VENCIDO, PENDING, sem DARF;
  - as outras linhas ficam com o checkbox desligado e o motivo no `title` (pago, retido, cancelado, "já no DARF de venc. dd/mm").
  - Util puro: `utils/darf.ts → motivoNaoAgrupavel`.
- **Barra de lote:** só "Agrupar em DARF" + "Desmarcar". Pagar e Estornar continuam fora (PR #74). O botão fica desligado, com o motivo, para menos de 2 sem encargo, orgs misturadas ou competências diferentes (`validarSelecaoParaDarf`).
- **Novo `components/financeiro/DarfSheet.tsx`** (Sheet, Regra #4; referências: `PagamentoAvulsoSheet` para o anexo e `MoneyCentsInput`):
  - org e competência vêm da seleção (sem perguntar, Regra #5);
  - tabela densa com os tributos;
  - campos: vencimento (padrão = o menor), multa, juros, total (só leitura, escuro), código de barras (`normalizarLinhaDigitavel`), nº do documento, observação, anexo;
  - ao salvar, atualiza o estado local (§22);
  - modo edição: com o DARF pago, vencimento, multa e juros ficam desligados com o motivo.
- **Coluna "DARF"** na tabela: "DARF · venc. dd/mm", que abre a aba DARFs. O vencimento mostra o original no `title`.
- **No tributo agrupado:** cancelar, editar e excluir ficam desligados com o motivo; "Ver em Contas a Pagar" continua.
- **Nova aba "DARFs"** (`StandardTable`):
  - colunas: competência, vencimento, tributos, qtde, principal, multa, juros, total, nº, status;
  - linha expandida com a composição;
  - ações: Editar, Desagrupar (`useConfirm`; desligado com motivo se pago ou conciliado), Ver em Contas a Pagar, Ver documento, Copiar linha digitável;
  - sem KPI (dizer isso no relatório).
- **Novo `services/darfService.ts`:** `list`, `membros`, `criar` (sobe o anexo e o remove se a RPC falhar), `editar`, `desagrupar`, `darBaixa`, `estornar`, `desfazerConciliacao`.

### 4. Contas a Pagar — `ContasPagarManager.tsx` + `ContasPagarParcelas.tsx`
- O Manager carrega `payableService.list` + `darfService.list`. `payables` continua cru, porque o **Fechamento por CC segue vendo os componentes**. A tabela recebe `colapsarDarfs(payables, darfs)` (util puro): tira os membros e insere **uma** linha sintética:
  - `id = darf.id`, `source_system = 'DARF'`, Credor "Receita Federal (DARF)";
  - descrição "DARF 10/2026 · PIS, COFINS + multa/juros";
  - total, vencimento do DARF, status derivado e `darf.componentes`.
  - Membro cujo DARF não carregou continua aparecendo solto.
- **KPIs e contador:** o DARF conta como 1 título e os valores não mudam.
- **Na linha sintética**, cada funcionalidade por linha é tratada:
  - origem "DARF" no mapa e no filtro;
  - a busca acha pelos componentes ("PIS" encontra o DARF);
  - Centro de Custo e Plano de Contas mostram o valor comum ou "Vários";
  - Imóvel e apropriação: "—", e o lote ignora a linha com motivo;
  - **Recibo desligado**, com o motivo "o comprovante é a guia paga";
  - **PIX/Asaas não aparece** (pagar DARF pela Asaas fica para depois);
  - **Dar baixa** usa `darfService.darBaixa`, inclusive no lote; se a alçada estiver pendente, desligado com o motivo;
  - **Estornar** usa `darfService.estornar`; desligado com o motivo se estiver conciliado;
  - Ver documento usa o anexo do DARF;
  - Editar e excluir não aparecem; entra "Abrir em Tributos › DARFs";
  - **chevron "Ver composição"** (tributos + multa/juros, com o vencimento original).
- **Deep-link** (`ContasPagarParcelas.tsx:698-725` e `rows.some` da linha 700): um id de componente resolve para a linha do DARF e abre a composição. Assim "Ver em Contas a Pagar" de um tributo agrupado cai no DARF certo.
- A baixa e o estorno atualizam o estado local dos membros (`onComponentesChanged`, §22).

### 5. Conciliação
- **O motor 1:1 ignora membros de DARF** (`.is('darf_id', null)`) em três lugares:
  - `supabase/functions/reconciliation-engine/index.ts:277-286` (redeploy + sonda 401);
  - `services/bankReconciliationService.ts:1105-1114`;
  - `services/reconciliationGroupService.ts:110-116`.
- **Sugestão de DARF** em `reconciliationGroupService.findGroups`:
  - débito do extrato com valor ≈ total do DARF (tolerância `groupTol`) e data entre o vencimento −5 e +30 dias;
  - o grupo leva **todos** os membros, sem o limite de 3;
  - é confirmado pelo `fn_reconcile_group` EXACT, que já existe (GroupMatchPanel).
- **Dock de `BankReconciliation.tsx`:** marcar um membro marca os irmãos (`darfService.membros`) e a linha ganha a etiqueta "DARF". "Desfazer" num membro desfaz o DARF inteiro (`fn_darf_desfazer_conciliacao`).
- **Limitação já existente para todo título:** DARF baixado à mão sai do pool de conciliação.

## Fases (cada uma com critério de pronto)

| Fase | Entrega | Pronto quando | Estado |
|---|---|---|---|
| 0 | `bash scripts/nova-frente.sh darf-agrupar-tributos`; `docs/planos/2026-10-21-agrupar-tributos-em-darf.md` com o pedido literal, as 4 decisões e a ressalva ao PR #74 | arquivo commitado | ✅ |
| 1 | Migration A (tabela, colunas, views, travas, RPCs) aplicada por `db query -f` | consultas de verificação no rodapé ok (views com `darf_id`, ACL sem `anon`/PUBLIC, triggers presentes); smoke `BEGIN … ROLLBACK` como authenticated: criar → mudar valor recusado → baixa → estorno → desagrupar → conciliar 1 componente recusado; `segurancaMigrations` + `migrationsPrefixo` verdes | ✅ |
| 2 | `types/financial.ts`, `utils/darf.ts`, `services/darfService.ts`, regeração, `deleteDeal` | testes da seção Verificação verdes; `tsc` limpo | pendente |
| 3 | Tributos: seleção, barra, `DarfSheet`, coluna, travas, aba DARFs | teste de componente verde; `check-ui-standard` exit 0; fluxo descartável no navegador com prints | pendente |
| 4 | Contas a Pagar: linha sintética + todos os itens da seção 4 + deep-link | `ContasPagarDarf.test.tsx` e DeepLink verdes; card "A pagar" com o mesmo valor antes e depois de agrupar (só a contagem muda) | pendente |
| 5 | Migration B, filtros do motor, sugestão de DARF, dock/desfazer | teste do group service verde; function redeployada com 401; conciliação real só se houver extrato descartável (senão, registrado como não verificado) | pendente |
| 6 | Relatório com o checklist do guia item a item; PR; após o merge, `conferir-producao.sh` com textos novos | SHA e textos no bundle servido | pendente |

## Verificação
- **Vitest:**
  - `__tests__/darf.test.ts` (validação de seleção, motivos, status, linha digitável, `colapsarDarfs`);
  - `tributoAgrupadoNaoRegerado.test.ts` (clone do falso query builder de `tributoPagoNaoVoltaAPendente.test.ts`);
  - `darfService.test.ts` (processService por membro, alçada, rollback do anexo);
  - `reconciliationGroupDarf.test.ts`;
  - atualizar `TributosSemPagamento.test.tsx` (continua sem Pagar/Estornar; checkbox só para agrupar);
  - `ContasPagarDarf.test.tsx`;
  - mais `orgContextGuard`, `segurancaMigrations` e `migrationsPrefixo`.
- **Tipos:** `tsc --noEmit` (PowerShell, heap de 12 GB; repetir se o Node cair, e a CI é o portão final).
- **UI:** `check-ui-standard.sh` em cada `.tsx` tocado.
- **Banco:** consultas de verificação + smoke `BEGIN/ROLLBACK` + `scripts/check-rls-postura.sh`.
- **Navegador** (`c:/tmp/pwtest`):
  - leitura com o usuário de leitura;
  - escrita **só com dado descartável**: 2 tributos manuais → agrupar com multa → 1 linha em Contas a Pagar e composição → Dar baixa → Estornar → Desagrupar → excluir os manuais, tudo desfeito no `finally`, com prints.

## Riscos registrados
- **CNPJ:** tributo não guarda empresa; uma organização com vários CNPJs poderia misturá-los num DARF. A regra pedida é "mesma organização"; guardar `company_id` no tributo fica como item futuro.
- **Valor congelado:** tributo agrupado não é recalculado se o negócio mudar, como já acontece com o pago. Só o distrato é sinalizado no v1.
- **Triggers na tabela mais escrita:** os dois novos têm `WHEN darf_id`, então custam zero nas outras linhas. O erro do gatilho deferido aparece no commit, e a mensagem diz "DARF".
- **Recriar as views:** sempre a partir da definição viva (há histórico de drift).
- **Bundle antigo:** o upsert da regeração falha inteiro no negócio com tributo agrupado. Não grava errado; regera quando o app recarregar.
- **Pagar o DARF pela Asaas** (guia de arrecadação) fica fora do escopo.


## Registro de execução

### Fase 1 — banco (21/10/2026)

- Ensaio antes de aplicar: migration + roteiro numa transação com `ROLLBACK`, como `authenticated` (usuário de
  leitura, membro da Alpa), com 3 tributos descartáveis. **28/28 passos certos**: competência mista, 1 tributo sem
  encargo, tributo já em DARF e RETIDO recusados; total 315 = 300 + multa 10 + juros 5; venc. dos tributos vira o
  do DARF e o original fica guardado; 4 linhas em `vw_payables`, multa/juros fora de `vw_commercial_tax_payables`;
  travas (a)/(b)/(c) recusam com a mensagem certa; reclassificar continua livre; editar propaga venc. e apaga a
  linha de juros zerada; baixa → PAGO (trava c satisfeita); baixa dupla, estorno de 1 tributo, mudar multa e
  desagrupar com o DARF pago recusados; estorno → PREVISTO; desagrupar restaura o venc. e apaga encargos e
  cabeçalho. `to_regclass('public.darfs')` = NULL depois do ROLLBACK.
- Aplicada com `db query --linked -f`. Antes/depois: `vw_payables` 2093/2093, `vw_commercial_tax_payables` 787/787.
  Views com as colunas novas e `security_invoker=on`; ACL das 10 funções sem PUBLIC e sem anon; 5 gatilhos.
- Achado na conferência: os privilégios padrão deram ALL (TRUNCATE/TRIGGER/REFERENCES) a `authenticated` em
  `darfs` e escrita em `vw_darfs`. Corrigido (REVOKE de authenticated + GRANT só do necessário), no arquivo e no
  banco: `darfs` = SELECT/INSERT/UPDATE/DELETE, `vw_darfs` = SELECT.
- `scripts/check-rls-postura.sh`: itens 1–4 (policies e SECURITY DEFINER) ✅. A única reprovação é anterior e
  alheia (item 5: segredos de cron da captura de boleto por e-mail com placeholder no Vault).
