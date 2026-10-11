# Conciliação: conta que atende outras organizações vale para o motor e para o vínculo

## Pedido original

> financeiro < conciliacao bancaria < central.
> Verifique por que existe lancamento com mesmo cliente , valor e data que nao foi nao foi dectado pela central. veja print

(print: aba Pendentes, conta Banco Itaú 12263-9, extrato "Igreja Universal do Reino de Deus"
R$ 4.167,03 em 05/12/2016, 05/01/2017… ao lado de lançamentos da mesma igreja, R$ 4.167,03
— bruto R$ 4.556,00 — em 10/12/2016, 10/01/2017…)

Depois do diagnóstico:

> precisamos resolver isso de uma vez por todas.
> Se esta marcado todas organizacões. ë por que todas as organizacoes deve ser aceita pelo sistema. Caso contrato todas as organizacoes perde o sentido de ser. Concorda ou tem alguma ojecao técnica que nao estou percebendo?

> 1. organizacoes? quais sao essas 11, pois so sei conheço 4
> 2. se o titulo ja foi conciliado ele deve ser bloqueado
> 3. Isso e um erro. Tudo deve ser como realmente foi a transacao. se um titulo da alpa foi pago no garden por exemplo, o app deve registrar no garden. O app nao pode inventar

> esta certa

Sessão: a9d65fb7-e896-475d-a49c-45a7fb6ded2a · 11/10/2026

## Diagnóstico (11/10/2026, produção)

- Conta **Banco Itaú** é da org **Altair Pereira da Rosa** e está marcada
  `serves_all_organizations = true`.
- Os 14 títulos da Igreja (10/11/2016–10/12/2017, `CONTRACT_RECURRING`, criados em 11/10/2026)
  são da org **Alpa Construtora**. O extrato da Igreja (2016–2017) está na org Altair.
- A Edge `reconciliation-engine` busca títulos com `.eq('organization_id', <dona da conta>)`.
  A Altair tem **0** títulos pendentes → toda execução na conta Itaú registrou
  `title_rows_scanned = 0`, `suggestions = 0`. 105 linhas do extrato Itaú têm título da Alpa
  de mesmo valor/direção em ±10 dias, e nenhuma chega à Central.
- `fn_reconcile_match` recusa par de orgs diferentes ("Movimento e lançamento pertencem a
  organizações diferentes"), então nem o VINCULAR manual passa. `fn_reconcile_group` idem.
- `fn_reconcile_match` não recusa título já vinculado a OUTRO movimento, e não grava no
  título a conta onde o pagamento aconteceu (75 de 76 títulos vinculados têm
  `payment_account_id` nulo).
- O par 05/12 × 10/12 tem 5 dias: pela regra atual (exato e único ≤ 3 dias) vira **sugestão**
  (≈78 pontos), não conciliação automática. Isso não muda neste plano.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 11/10 | Conta marcada "todas as organizações" deve ser aceita pelo motor e pelo vínculo? | Sim — "caso contrário todas as organizações perde o sentido". |
| 11/10 | "Todas" no servidor (cron sem usuário) | As 4 orgs. Implementado como: orgs que têm membro em comum com a dona da conta (hoje = as 4; nunca alcança outro cliente do SaaS). |
| 11/10 | Título já conciliado | Bloqueado. Pagamento em mais de um movimento continua só pelo "Vincular em grupo". |
| 11/10 | Título da Alpa pago em conta de outra org | O título continua da Alpa; o pagamento é registrado na conta REAL do extrato. Nada é inventado: sem mover título, sem lançamento de compensação entre empresas. |

## Plano

### 1. Migration `aplicar_20271011007000_conciliacao_conta_atende_orgs.sql`

- **`fn_orgs_atendidas_pela_conta(p_conta uuid) RETURNS SETOF uuid`** — dona +
  `payment_account_organizations` + (se `serves_all_organizations`) orgs com membro em comum
  com a dona. `SECURITY DEFINER` (lê `organization_members` de outras orgs), com autorização
  dentro: só responde a `service_role` ou a membro da org dona. REVOKE PUBLIC/anon.
- **`fn_conta_atende_org(p_conta uuid, p_org uuid) RETURNS boolean`** — atalho do anterior.
- **`reconciliation_matches.conta_do_titulo_antes uuid`** — `payment_account_id` do título
  antes do PRIMEIRO vínculo, para o desfazer devolver o valor exato.
- **`fn_reconcile_match`** (corpo do arquivo `aplicar_20270919000022`):
  - aceita org diferente quando `fn_conta_atende_org(b.bank_account_id, i.organization_id)`;
  - recusa título já vinculado a outro movimento em transação anterior
    ("Este lançamento já está conciliado com outro movimento do extrato…"); vínculos criados
    na MESMA transação (o laço do `fn_reconcile_group`) passam;
  - grava `internal_transactions.payment_account_id = b.bank_account_id`.
- **`fn_reconcile_unmatch`**: ao remover o último vínculo, devolve `payment_account_id` ao valor
  de antes; sobrando vínculo, aponta para a conta de um deles.
- **`fn_reconcile_group`** (corpo do arquivo `aplicar_20271010005001`): a trava "organizações
  diferentes" passa a ser: todos os títulos da mesma org, e cada movimento é da mesma org ou
  de conta que atende a org dos títulos. Ajuste/excedente nascem na org dos títulos (mesma
  convenção do resíduo de `fn_reconcile_match`) e com a conta real.
- **`fn_reconciliation_divergences`** (corpo de `aplicar_20271001000070`): o par de valor
  divergente casa título de org atendida pela conta do extrato, não só da mesma org.

**Pronto quando:** aplicada; `pg_proc` mostra as funções novas com ACL sem PUBLIC/anon; teste
em transação com ROLLBACK (`DO … RAISE EXCEPTION`) prova: (a) par Itaú×Alpa aceito e
`payment_account_id` = Itaú; (b) segundo vínculo do mesmo título com outro movimento recusado;
(c) unmatch devolve `payment_account_id` nulo; sem mojibake (`prosrc LIKE '%Ã§%'` falso).

### 2. `utils/reconciliationRules.ts` — nada muda nas regras de pontuação.

### 3. `supabase/functions/reconciliation-engine/index.ts`

Títulos (`internal_transactions`) e contrapartes (fornecedores/clientes) carregados com
`.in('organization_id', orgsAtendidas)` via `fn_orgs_atendidas_pela_conta`. Ajustes e aliases
seguem os da dona.
**Pronto quando:** `npx deno check` passa; deploy com `--no-verify-jwt`; sonda sem header → 401;
rodada na conta Itaú registra `title_rows_scanned > 0`.

### 4. `services/bankReconciliationService.ts` — motor reserva do navegador

Mesma troca da Edge (`orgsAtendidasPelaConta`). **Pronto quando:** teste unitário cobre o
helper; typecheck passa.

### 5. `services/reconciliationGroupService.ts` — `findGroups`

Títulos das orgs atendidas pela conta. **Pronto quando:** typecheck passa.

### 6. Prova em produção

Reprocessar a conta Itaú; títulos da Igreja aparecem como sugestão na Central para os
extratos de 05/12/2016 etc.

## Fora deste plano (registrado, não decidido)

- 3.793 das 7.757 linhas do extrato Itaú estão marcadas com a org Alpa, embora a conta seja
  da Altair. Não alterado — decisão do usuário.
- Aba Pendentes, lado Lançamentos, segue o seletor do topo (REGRA #5).

## Estado

- [ ] 1 migration — escrita e **testada em transação desfeita** contra o banco de produção
      (11/10): orgs da conta Itaú = as 4; vínculo Itaú 05/12/2016 × título Alpa 10/12/2016
      aceito, título CONCILIATED com `payment_account_id` = Itaú; segundo movimento no mesmo
      título recusado ("já está conciliado com outro movimento… 05/12/2016 · R$ 4167,03");
      desfazer volta PENDING e conta NULL; grupo EXACT Itaú × Alpa aceito; backfill 75/75;
      mojibake 0; rollback confirmado (função nova inexistente depois). Divergências como
      usuário autenticado: 858 ms em "Todas" (value_mismatch 935 → 1.044), 192 ms na Altair.
      **Falta aplicar** — a aplicação em produção foi bloqueada pelo controle de permissões
      da sessão; aguarda autorização do usuário.
- [ ] 3 Edge — código pronto; `deno check` passa. Falta deploy (depois da migration).
- [x] 4 motor navegador — `orgsAtendidasPelaConta` + `loadPartyIndex(org, orgs)`; tsc 0 erros.
- [x] 5 agrupamentos — `findGroups` usa as orgs atendidas; tsc 0 erros.
- [x] testes — `__tests__/conciliacaoTitulosDasOrgsAtendidas.test.ts` (helpers, caso da
      Igreja = sugestão 78, trava de texto nas 3 cargas de título).
- [ ] 6 prova em produção
