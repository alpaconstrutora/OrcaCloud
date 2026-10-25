# Folha: Contribuições de Terceiros lançadas por entidade em Tributos a Pagar

## Pedido original

Sessão `df31dfea`, 25/10/2026:

> os encargos social > Contribuições de Terceiros / Outras Entidades esta sendo lançando agrupados em financeiro > tributos a pagar. Lançar individualizados

## Estado antes (lido em origin/main `1eceed0c` e no banco em 25/10/2026)

- `utils/folhaFinanceiro.ts › componentes()` somava as alíquotas das entidades e gerava UM tipo
  `terceiros` = base INSS × Σ (5,8% no FPAS 507). `formaDoTitulo('terceiros')` → credor
  "Terceiros (outras entidades)". Um título por obra × chave contábil, com as 5 entidades juntas.
- No banco: 10 títulos "Terceiros (outras entidades)" (Alpa 7 = R$ 845,01; Garden 3 = R$ 561,72),
  **todos PENDING/PREVISTO**, nenhum em DARF, nenhum conciliado.
- Nada no código lê o credor "Terceiros (outras entidades)" (só o plano do DARF pela Receita o cita
  num levantamento).

## Itens

### 1. Um tipo por entidade — `utils/folhaFinanceiro.ts`
**Muda:** `componentes()` gera `ter-{código}` para cada entidade de `cfg.terceiros` (base × alíquota
dela). `formaDoTitulo('ter-…')` → TAX, credor = nome da entidade (Salário-Educação, INCRA, SENAI,
SESI, SEBRAE), categoria "Contribuições de Terceiros", vencimento dia 20. Sai o tipo agregado.
**Pronto quando:** `__tests__/folhaFinanceiro.test.ts` prova as 5 linhas do FPAS 507 na folha de 06/2026
(5.667,00 → 141,68 · 11,33 · 56,67 · 85,01 · 34,00) e o formato do título.

### 2. Sync — `services/payrollService.ts › syncPayrollToFinance`
**Muda:** `reference_id` `labor-{folha}-{destino}-ter-{código}[-cls-…]`; o nome da entidade vai para o
título. O agregado antigo em aberto é apagado como obsoleto (regra que já existe). Se o agregado de uma
fatia estiver **preservado** (pago, conciliado, em DARF), as entidades daquela fatia NÃO são geradas —
somariam em dobro — e o sync avisa.
**Pronto quando:** `__tests__/folhaSyncPreserva.test.ts` cobre os dois casos.

### 3. Regerar os títulos das folhas fechadas
**Muda:** "Re-sincronizar financeiro" nas folhas mensais fechadas que têm o agregado. Como todos estão
em aberto, o sync troca cada agregado pelas 5 entidades, sem tocar em pago/conciliado.
**Pronto quando:** 0 título "Terceiros (outras entidades)" no banco e, por folha, a soma das entidades
= o agregado antigo (± centavos de arredondamento por entidade).

### 4. Publicar
**Pronto quando:** CI verde no SHA do PR, merge por mim, `conferir-producao.sh` prova o commit.

## Andamento

- 25/10/2026 — plano escrito.
- 25/10/2026 — itens 1 e 2 feitos: `folhaFinanceiro.test.ts` + `folhaSyncPreserva.test.ts` (7 testes novos/ajustados,
  falharam antes da mudança); 48/48 com `relacoesDaFolha` e `prolaboreTributos`; `tsc` exit 0.
