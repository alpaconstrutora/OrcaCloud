# Comissão do corretor: da negociação ao Portal do Corretor, passando pelo financeiro

## Pedido original

> verifique a conexão entre comercial > Gestão de Locações  > Gerenciar Negociação > aba partes e comissões com portais > Portal do Corretor > aba comissões.
> Vou te dar uma exemplo: O contrato TL-010-014-0001 tem como corretor o Geleia. Porem no portal do corretor do geleia na aba comissões esta zerado

Sessão ec9dc1ab · 17/10/2026

### Respostas do usuário ao diagnóstico (17/10/2026, mesma sessão)

> 1. Posso seguir com a leitura direta da negociação? Sim
> 2. "Liberada / Paga" devem vir de uma conta a pagar da comissão no financeiro? sim

## Diagnóstico (o que estava errado)

- A aba **Partes e Comissões** (`DealModal`) grava a comissão só em
  `commercial_deals.broker_*`. O portal lê `broker_portal_commissions`.
- A ponte `commercialFinanceService.syncBrokerCommissionToPortal` existe desde o
  commit inicial e **nunca foi chamada**. Nenhum gatilho/função grava a tabela:
  **0 linhas no banco inteiro**; 9 negócios com corretor, 7 com comissão > 0.
- O contrato do exemplo é `CTL-010-014-0001` (negócio `b4265d64…`, Loja 204,
  locação R$ 1.500, Geleia 10% = R$ 150). O token do Geleia é da mesma org e do
  mesmo perfil — o filtro da RPC não era o problema, faltava o dado.
- A comissão também não virava título a pagar, então "Liberada/Paga" não tinham fonte.

## Decisões tomadas

| Data | Pergunta | Resposta / decisão |
|---|---|---|
| 17/10 | Portal lê direto da negociação (sem cópia)? | **Sim** (usuário) |
| 17/10 | Liberada/Paga vêm de título a pagar no financeiro? | **Sim** (usuário) |
| 17/10 | Em que estágio o título nasce? | `CONTRATO`, `ASSINATURA`, `COMPLETED` — antes disso o negócio não fechou (mesma razão de o `saveDeal` não gerar cobrança em proposta). Constante única `c_estagios` em `fn_comissao_corretor_sincronizar`. (decisão minha, ajustável) |
| 17/10 | Quem gera o título? | **Gatilho no banco** em `commercial_deals` — a causa do bug foi uma ponte que ninguém chamava; no banco não há caminho de gravação que esqueça. |
| 17/10 | Negócio antigo regravado sem mudança cria título? | **Não.** O gatilho só age quando muda estágio, corretor, valor da comissão, vencimento da comissão ou organização. Há vendas de 2015/2016 em "Contrato" com R$ 20 mil de comissão — criar título hoje seria obrigação falsa. Preencher os negócios existentes é decisão do usuário (ver Estado). |
| 17/10 | Mapeamento dos status no portal | Sem título ou título em RASCUNHO/PENDENTE → **Pendente** (prevista); `approval_status = APROVADO` → **Liberada**; `status = CONCILIATED` → **Paga** (pago < previsto → **Parcial**). |
| 17/10 | Título pago | Nunca é regravado (ver memória "10 origens regravam amount de título PAGO"). |
| 17/10 | Valor muda em título aprovado | Volta para RASCUNHO (alçada precisa reaprovar o valor novo). |
| 17/10 | Categoria / CC / vencimento editados no Contas a Pagar | Categoria e centro de custo só são preenchidos se o título estiver sem; vencimento só muda se o negócio tiver `broker_payment_due_date`. O manual não é sobrescrito. |
| 17/10 | Negócio cancelado / comissão zerada / corretor removido | Título não pago vai para `CANCELLED` (não é apagado — sem CASCADE em conciliação). |
| 17/10 | `broker_portal_commissions` | Sai da leitura (vazia, ninguém grava). Tabela fica — sem DROP nesta frente. |

## Plano

1. **`supabase/migrations/20271017500000_comissao_corretor_titulo_e_portal.sql`**
   - `fn_comissao_corretor_sincronizar(deal)` — cria/atualiza/cancela o título
     `reference_id = 'brk-{deal}'`, `source_system = 'COMMERCIAL'`, DEBIT, fornecedor
     pelo e-mail do corretor na org do negócio, categoria "Comissão de Corretagem" →
     "Comissões de Venda". REVOKE de PUBLIC/anon/authenticated (só o gatilho chama).
   - gatilho `trg_comissao_corretor` AFTER INSERT/UPDATE/DELETE em `commercial_deals`.
   - `fn_broker_comissoes_lista(orgs[], email)` — leitura derivada (negócio + títulos),
     interna, REVOKE de todos.
   - `fn_broker_portal_get_commissions(token)` reescrita sobre a leitura derivada.
   - `fn_broker_comissoes_gestor(org, email)` — visão interna, autoriza por `is_org_member`.
   - **Pronto quando:** prova `DO … RAISE EXCEPTION 'PROVA'` mostra, para o negócio do
     exemplo, título criado e o portal do Geleia devolvendo R$ 150; regravar sem mudança
     não cria título; cancelar cancela; título pago fica intocado; `segurancaMigrations` verde.
2. **`services/brokerService.ts`** — `listCommissions` chama `fn_broker_comissoes_gestor`.
   **Pronto quando:** não lê mais `broker_portal_commissions`.
3. **`components/broker/BrokerCommissions.tsx`** — visão interna usa `useOrgContext`
   (REGRA #5); linha mostra Locação/Venda, unidade, empreendimento e nº do contrato.
   **Pronto quando:** `check-ui-standard.sh` sem violação nova; tela mostra a comissão do exemplo.
4. **`services/commercialFinanceService.ts`** — remove `syncBrokerCommissionToPortal` e
   `deleteBrokerCommissionFromPortal` (código morto que fazia parecer que a ponte existia).
   **Pronto quando:** grep não acha mais as duas.
5. **`types/`** — `BrokerCommission` ganha `deal_type`, `contract_number`.
   **Pronto quando:** `tsc` verde.

## Estado

- [x] 1 migration — **aplicada no banco em 17/10/2026** (`db query -f`). Prova com
  rollback (`comissao_prova.sql`, cenários S0–S11): portal antes do título R$ 150
  Pendente; regravar sem mudança = 0 títulos; vencimento informado → título criado
  ("CTL-010-014-0001 - Comissão de corretagem - Geleia", fornecedor e categoria
  "Comissão de Corretagem" da Alpa, CC e contrato herdados); aprovado → Liberada;
  valor muda → volta a RASCUNHO; conciliado → Paga; valor muda depois de pago →
  título intocado e portal Parcial; negócio cancelado → título CANCELLED; gestor vê
  6 comissões; token inválido → `valid:false`. Como `anon`: lê pelo token, gestor e
  lista negados. Depois de aplicar: 0 títulos `brk-%` (nada gravado).
- [x] 2 brokerService — `listCommissions` → `fn_broker_comissoes_gestor`.
- [x] 3 BrokerCommissions — `useOrgContext`; Locação/Venda, unidade • empreendimento,
  nº do contrato; data do marco sem `new Date` (fuso). `check-ui-standard` sem violação.
  Navegador (`C:/tmp/pwtest/corretor-comissoes.js`, link do Geleia, 1366 e 390 px): 14/14 OK.
- [x] 4 código morto — `syncBrokerCommissionToPortal`/`deleteBrokerCommissionFromPortal` removidos.
- [x] 5 tipos — `deal_type`, `contract_number`. `tsc` 0 erros; `segurancaMigrations` +
  `orgContextGuard` verdes.
- [ ] Preencher títulos dos negócios já existentes — **aguarda decisão do usuário**
  (5 negócios em estágio de contrato com comissão > 0, incluindo vendas de 2015/2016).
  Sem isso eles aparecem no portal como Prevista/Pendente (correto: não há título).
- [ ] Fora do escopo, anotado: o cartão "Comissão Acumulada" do painel do portal ainda
  calcula 5% fixo sobre propostas aprovadas (`useBrokerPortal.ts`, `BrokerPortal.tsx`),
  não lê estas comissões.

## Verificação

- Prova SQL (scratchpad `comissao_prova.sql`) com rollback.
- Navegador: portal do Geleia pelo link → aba Comissões mostra R$ 150 (CTL-010-014-0001).
- Contas a Pagar mostra o título "CTL-010-014-0001 - Comissão de corretagem - Geleia"
  quando o negócio muda / é preenchido.
