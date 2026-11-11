# KpiCard com tendência, sparkline e sólido no alerta + histórico do Dashboard financeiro

## Pedido original

> analise este design: https://www.instagram.com/reel/DfeTS2Jzcgx/?utm_source=ig_web_copy_link&mdxt=NTc4MTIwNjQ2YQ==
>
> Sessão: cf4ba22a-408a-4bc8-a2d2-244b6cd77dae · 10/11/2026

Pedidos seguintes, na mesma sessão:

- 10/11/2026 — à oferta *"posso montar um protótipo descartável desse card de KPI no padrão
  do OrçaCloud para comparar lado a lado"*: **"sim"**. Protótipo publicado em
  https://claude.ai/artifact/FNLn4VxSznXa8myb56AKca (variantes A, B e C).
- 11/11/2026 — **"A"** (card com tendência e sparkline, sólido só no alerta).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 11/11/2026 | A faixa "Hoje" só tem o valor de hoje, sem histórico. Até onde vai a frente? (componente + dados reais / tudo, inclusive histórico / só componente e guia) | **Tudo, inclusive histórico** |
| 11/11/2026 | Com limiar zero os dois cards de vencido estão sempre em alerta. Quando o card fica sólido? (alerta E piorando / sempre que em alerta / subir o limiar) | **Alerta E piorando** |

## Decisões técnicas (minhas, registradas para conferência)

1. **Aguardando aprovação fica SEM série.** A fila mudou de definição em 26/10/2026 (todo
   título a pagar passou a nascer PENDENTE) e em 09/11/2026 (tributo solto saiu da fila):
   uma série de 12 meses desenharia uma fila que nunca existiu. O card ganha só o que não
   depende de histórico.
2. **Vencido no fim de um mês** = título do livro único (`fn_fi_ledger`) com `data_ref`
   antes do corte (1º dia do mês seguinte) e que ainda não estava baixado no corte. Baixado
   em = `payment_date`; sem ela, `data_ref` (a mesma régua do `data_pgto` do período). Medido
   em 11/11: 276 dos 523 débitos pagos não têm `payment_date`, mas só 14 deles vencem nos
   últimos 12 meses — o erro fica pequeno e é para MENOS (título pago sem data conta como
   pago no vencimento, nunca como vencido).
3. **Sem corte por `created_at`.** O histórico é "o que estava devido naquela data segundo os
   registros de hoje": título lançado em abril com vencimento em janeiro conta como vencido
   em janeiro. Cortar por `created_at` desenharia a implantação do sistema (dados desde
   mar/26), não a dívida.
4. **Saldo: série pelo extrato.** O card mostra o saldo que o banco informa (digitado, OFX ou
   Asaas), que não existe no passado. A série e a tendência usam o saldo calculado pelo
   extrato (saldo inicial + lançamentos até o fim de cada mês), conta só a partir da data do
   saldo inicial. A legenda da tendência diz isso.
5. **O ponto de hoje vem da faixa "Hoje", não da função nova.** A função devolve só meses
   FECHADOS; o front acrescenta o valor do card como último ponto. Assim o fim da linha é
   sempre o número escrito no card.
6. **Sólido = `tom === 'alerta'` E piorou pelo menos 2%** desde o fim do mês anterior
   (`LIMIAR.pioraRelevante`, hipótese editável). Medido em 11/11: o vencido a receber da
   Alpa subiu 0,4% entre 31/10 e hoje — sem esse piso os dois cards ficariam sólidos por
   ruído. Quem decide é a tela (`cardSolido`), e o componente recebe só `solido`: as outras
   telas que usam `destaque` (Locações, Central do Cliente, Conciliação) não mudam sem pedido.
7. **Saldo: série pelo saldo INFORMADO no mês, não pelo extrato** (revisão do item 4 acima,
   11/11): o calculado pelo extrato da Sicredi fica ~R$ 28 mil abaixo do OFX em todo mês
   (falta saldo inicial na conta). A forma da linha batia, o percentual não. Mês sem saldo
   informado = sem ponto. Na Alpa hoje: jul, ago e set/26 têm; out/26 não — então o card de
   saldo ganha linha mas não ganha selo de tendência até um saldo de outubro/novembro existir.
7a. **Saldo só com o mês COMPLETO** (11/11, visto na tela com dados reais): em "Todas" o
   card de hoje somava 4 contas e jul/26 somava 2 — a linha mostrava uma queda que não
   houve. Agora o mês só tem ponto quando toda conta que já existia no corte informou
   saldo nele, e o ponto de hoje segue a mesma régua (`saldoDoMesCorrente`). Medido: em
   "Todas" só set/26 fecha (um ponto, sem linha); na Alpa, jul–set/26. A migration foi
   reaplicada com essa regra.
8. **Sem hover.** O protótipo tinha elevação no hover para card clicável; nenhum card de
   destaque é clicável (a ação é o link `acao`), então não entrou — o §4 segue valendo.

## Plano

1. **`supabase/migrations/aplicar_20271111300000_dashboard_financeiro_historico.sql`** —
   `fn_financial_dashboard_history(p_organization_id uuid, p_meses int)`: um item por mês
   fechado (`mes`, `vencido_receber`, `vencido_pagar`, `saldo_extrato` ou null). SECURITY
   INVOKER, STABLE, REVOKE de PUBLIC/anon (REGRA #7).
   *Pronto quando:* aplicada no banco (pelo usuário — o auto mode barra escrita) e uma
   consulta de conferência mostra o mês de outubro com o vencido batendo, na ordem de
   grandeza, com o medido em 28/10 (R$ 3,13 mi a receber; R$ 1,83 mi a pagar na Alpa).
2. **`services/financialOverviewService.ts`** — `getHistory(orgId)` + tipo
   `DashboardHistoricoMes`. *Pronto quando:* tsc limpo.
3. **`lib/dashboardFinanceiro.ts`** — funções puras `serieComHoje` e `tendenciaDaSerie`.
   *Pronto quando:* testes em `__tests__/dashboardFinanceiro.test.ts` cobrem: série vazia,
   mês anterior zero (sem %), null no meio, último ponto = hoje, "bom quando desce".
4. **`components/ui/KpiCard.tsx`** — no `destaque`: props opcionais `serie`, `tendencia`,
   `solidoQuandoPiora`, contagem do número na 1ª carga (respeita `prefers-reduced-motion`),
   elevação no hover só com `onClick`. Sem as props novas o card fica IGUAL ao de hoje.
   *Pronto quando:* teste de componente cobre: sem props novas = mesma aparência de antes; chip
   com seta + texto `sr-only`; sólido só com alerta + piora; sparkline com `aria-hidden`.
5. **`components/FinancialDashboard.tsx`** — faixa "Hoje" com série/tendência nos três cards
   com histórico; sólido nos dois de vencido quando piora; histórico carrega e falha
   SOZINHO (sem ele, os cards ficam como hoje — nunca some o número). *Pronto quando:*
   `check-ui-standard.sh` limpo e a tela vista no navegador (claro e Escuro Total).
6. **`docs/ui_ux_guia_unificado.md`** — §4.4 deixa de ser "proposta não implementada" e
   aponta para a §4.5; §4.5 ganha `serie`/`tendencia`/`solidoQuandoPiora` e a exceção de
   hover. *Pronto quando:* o texto descreve o que o componente faz, com o exemplo do
   Dashboard financeiro.

## Estado

- [ ] 1. migration — escrita e conferida em modo leitura (consulta da função rodada com a org
      Alpa: out/26 = R$ 3,13 mi a receber / R$ 1,83 mi a pagar, bate com 28/10). **Falta
      aplicar** (usuário).
- [x] 2. service — `getHistory` (tsc limpo)
- [x] 3. lib + testes — 7 casos em `__tests__/dashboardFinanceiro.test.ts`
- [x] 4. KpiCard + teste — `__tests__/components/KpiCardDestaque.test.tsx` (6 casos)
- [ ] 5. FinancialDashboard — código pronto, check-ui-standard limpo; **falta ver a tela**
      (depende da migration aplicada e de login na porta do dev server)
- [x] 6. guia — §4.4 (nota) e §4.5.2 nova

## Verificação

- `npx vitest run __tests__/dashboardFinanceiro.test.ts __tests__/components/KpiCard*.test.tsx`
- `npx tsc --noEmit -p .`
- `bash scripts/check-ui-standard.sh components/ui/KpiCard.tsx components/FinancialDashboard.tsx`
- `npx vitest run __tests__/migrationsPrefixo.test.ts __tests__/segurancaMigrations.test.ts`
- Tela: Financeiro › Dashboard financeiro, org Alpa e "Todas", tema claro e Escuro Total.
