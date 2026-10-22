# Folha de adiantamento não gera financeiro + recálculo das de 05/2026

## Pedido original

Sessão de 22/10/2026 (Claude Code, VS Code), tarde. Depois de eu relatar, ao fechar a frente
`encargos-inss-relacao`: *"Continua aberto só o risco do adiantamento: as 2 folhas de adiantamento
em aberto têm desconto de INSS. Se uma for fechada, o INSS sairia em dobro em Tributos a Pagar.
Quer que eu trate isso?"* — o usuário respondeu:

> sim

## Causa (investigada no banco e no git)

1. **Dado:** as folhas de adiantamento 05/2026 (Alpa `820e821c`, Garden `f4b1785d`) foram
   calculadas em 02/06/2026 00:37 UTC, 7 minutos antes do commit `3bc0d9af` (processAdvance, 00:44
   UTC). Rogério (Alpa) e Clovis (Garden) receberam o cálculo da MENSAL: SALARIO, INSS, FGTS e o
   ADIANTAMENTO como desconto. O Claudinei foi recalculado às 13:41 e está certo (só o provento
   ADIANTAMENTO). As duas folhas estão em PROCESSANDO; nenhuma gerou financeiro.
2. **Código:** `syncPayrollToFinance` roda para qualquer tipo de folha fechada. O adiantamento já é
   pago pela folha MENSAL (rubrica ADIANTAMENTO com lançamento individualizado) — fechar a folha de
   adiantamento gravaria o adiantamento uma segunda vez, e, nas de 05/2026, ainda INSS, CPP, RAT,
   terceiros e FGTS em dobro.

## Itens

### 1. Sync ignora folha de adiantamento — `services/payrollService.ts`
**Muda:** `syncPayrollToFinance` devolve `count: 0` e um aviso quando `run.type === 'adiantamento'`.
`LaborPayroll` ajusta as mensagens de fechar e re-sincronizar.
**Pronto quando:** `__tests__/folhaSyncPreserva.test.ts` tem o caso (nenhum upsert/delete) e passa.
**Estado:** feito (commit `4f9b6a15`).

### 2. Recalcular Rogério e Clovis nas folhas de adiantamento 05/2026
**Muda:** itens e resultado deles ficam no formato do Claudinei (só ADIANTAMENTO provento,
bruto = líquido = custo, bases zeradas), com backup das linhas antigas.
**Pronto quando:** consulta mostra as 3 linhas das duas folhas só com `ADIANTAMENTO:provento`.
**Estado:** feito em 22/10/2026 — o auto mode barrou a gravação; o usuário rodou o script
(`npx supabase db query --linked -f adiantamento_05_2026_recalculo.sql`). Conferido: Claudinei
1.618,40, Clovis 990,81, Rogério 648,40, só `ADIANTAMENTO:provento`; 0 item estranho em folha de
adiantamento. Backup `bkp_folha_adiantamento_res_20271022` (2) e `bkp_folha_adiantamento_itens_20271022`
(8) — **NÃO APAGAR**.

### 3. Publicar
**Pronto quando:** CI verde no PR, mesclado, `conferir-producao.sh` prova o commit no domínio.
