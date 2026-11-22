# Credit Room · Capacidade de Pagamento — F1 (cálculo + snapshot + coleta) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Congelar, em cada versão do Credit Room, a renda mensal consolidada (vendas a vencer + aluguéis contratados), o recebido de 12 meses, o serviço da dívida mês a mês, a capacidade máxima de empréstimo, a qualidade da renda, a carteira de contratos mascarada e a lista de empreendimentos com fotos — no escopo Empresa ou Grupo.

**Architecture:** Conta pura e testada em `utils/creditCapacity.ts`; `utils/creditRoomSnapshot.ts` ganha o schema 2 e passa a tirar o DSCR da série; `services/creditRoomService.ts` coleta (cliente, RLS do usuário) e entrega aos puros. Migration aditiva em `credit_rooms` (4 colunas + trigger). Telas novas (abas, estresse, book, documentos) ficam para F2/F3.

**Tech Stack:** React 19 + TS, Supabase (Postgres/RLS), Vitest.

**Spec:** `docs/planos/2026-11-21-credit-room-capacidade.md` (ler inteiro antes) · plano original `docs/planos/2026-09-07-portal-credito-credit-room.md`.

## Global Constraints
- Ler e obedecer `CLAUDE.md` (REGRAS OBRIGATÓRIAS) desta frente antes de editar.
- "Dado ausente ≠ zero": bloco sem fonte = `null`; razão sem denominador = `null` (nunca `Infinity`/0).
- Mês = string `'AAAA-MM'` obtida por `slice(0, 7)` da data ISO — nunca `new Date('AAAA-MM-DD')` (fuso UTC-3).
- Dinheiro arredondado com `round2` de `utils/financialMath.ts`.
- Nome de cliente/comprador/locatário **nunca** entra no snapshot (LGPD) — só rótulo mascarado.
- `reference_id` → contrato sempre por `originIdFromRef` (`lib/receivableRef.ts`), nunca `.eq` no uuid.
- Banco: aplicar SQL só com `npx supabase db query --linked -f <arquivo>`; **nunca** `supabase db push`.
- Função/trigger nova: `REVOKE ALL ... FROM PUBLIC, anon` (o `FROM PUBLIC` sozinho não tira o anon).
- Versões já congeladas (schema 1) continuam abrindo e com os mesmos indicadores.

## Review Focus
1. Locação **Ativa com `end_date` vencido ou nulo** (há 4 de 7 em produção) → projeta o horizonte inteiro como prazo indeterminado e gera alerta `LOCACAO_PRAZO_INDETERMINADO`; não some da renda. Teste na Task 1.
2. Venda em etapa vendida (`ETAPAS_VENDIDA`) **sem nenhum título** → alerta `VENDA_SEM_PARCELAS` com qtd e valor, nunca zero silencioso. Teste na Task 1.
3. Título de aluguel **futuro já gerado** + contrato vigente no mesmo mês → conta uma vez só. Teste na Task 1.
4. Sem dívida e sem nova operação, ou renda zero → `dscr = null`, `capacidade_maxima = { parcela_maxima: 0, valor_maximo: 0 }` quando a renda não cobre o DSCR mínimo. Teste na Task 1.
5. Snapshot **schema 1** passado ao `computeIndicators` novo → resultado idêntico ao de hoje. Teste na Task 2.

---

### Task 1: Conta pura da capacidade (`utils/creditCapacity.ts`)

**Files:**
- Create: `utils/creditCapacity.ts`
- Test: `__tests__/creditCapacity.test.ts`

**Interfaces:**
- Consumes: `round2` (`utils/financialMath`), `buildSchedule`, `DebtScheduleParams` (`utils/debtAmortization`), `wale`, `LeaseContract` (`lib/rentalExecutive`), `ratio` (`utils/creditRoomSnapshot`).
- Produces (exportados, usados nas Tasks 2 e 4):

```ts
export type Natureza = 'VENDA' | 'LOCACAO';
export interface TituloCarteira {
  id: string; organizationId: string; contractId: string | null;
  natureza: Natureza | null; empreendimentoId: string | null;
  partyKey: string | null;            // party_id ?? party_name — só para agrupar, nunca congelado
  dueDate: string | null; paymentDate: string | null;
  amount: number; recebido: boolean;  // effective_status === 'RECEBIDO'
}
export interface LocacaoVigente {
  contractId: string; organizationId: string; empreendimentoId: string | null;
  partyKey: string | null; aluguelMensal: number;
  inicio: string | null; fim: string | null;
}
export interface ParametrosCapacidade {
  dscr_minimo: number; taxa_mensal_pct: number; prazo_meses: number; carencia_meses: number;
  sistema: 'PRICE' | 'SAC'; horizonte_meses: number; haircut_estoque_pct: number;
  despesa_operacional: boolean;
}
export const PARAMETROS_CAPACIDADE_PADRAO: ParametrosCapacidade; // 1.3, 1.2, 60, 0, 'PRICE', 36, 30, true
export interface SerieMes {
  mes: string; vendas: number; alugueis: number; despesa_operacional: number;
  renda_liquida: number; servico_atual: number; servico_novo: number;
  folga: number; dscr: number | null;
}
export interface CapacidadeEntrada {
  dataBase: string; horizonte: number;
  titulos: TituloCarteira[]; locacoes: LocacaoVigente[];
  despesaMensal: number;                         // média 12m; 0 se desligada
  servicoAtualPorMes: Record<string, number>;    // chave 'AAAA-MM'
  servicoNovoPorMes: Record<string, number>;
  fluxos: { vendas: boolean; alugueis: boolean }; // eligible_flows.receivables / .noi
}
export function mesesDoHorizonte(dataBase: string, n: number): string[];
export function serieDeRenda(e: CapacidadeEntrada): {
  serie: SerieMes[]; vencido_na_data_base: number; a_vencer_mes_corrente: number;
};
export function recebidoPorMes(titulos: TituloCarteira[], dataBase: string): { mes: string; vendas: number; alugueis: number }[];
export function capacidadeMaxima(serie: SerieMes[], p: ParametrosCapacidade, primeiroVencimento: string):
  { parcela_maxima: number; valor_maximo: number };
export interface CenarioEstresse { nome: string; inadimplencia_pct: number; vacancia_pct: number; distrato_pct: number }
export const CENARIOS_ESTRESSE: CenarioEstresse[]; // Base 0/0/0 · Moderado 10/10/5 · Severo 25/20/15
export function aplicarEstresse(serie: SerieMes[], c: CenarioEstresse):
  { serie: SerieMes[]; dscr_minimo_12m: number | null; meses_folga_negativa: number };
export type TipoAlerta = 'VENDA_SEM_PARCELAS' | 'LOCACAO_SEM_VALOR' | 'LOCACAO_PRAZO_INDETERMINADO' | 'TITULO_SEM_EMPREENDIMENTO';
export interface AlertaCarteira { tipo: TipoAlerta; qtd: number; valor: number }
export function alertasDaCarteira(i: {
  dataBase: string; titulos: TituloCarteira[]; locacoes: LocacaoVigente[];
  vendasSemTitulo: { dealId: string; valor: number }[];
}): AlertaCarteira[];
export interface QualidadeRenda {
  concentracao_top5_pct: number | null; wale_anos: number | null;
  locacoes_prazo_indeterminado: number; pontualidade_12m_pct: number | null;
}
export function qualidadeDaRenda(serieEntrada: CapacidadeEntrada): QualidadeRenda;
export function rotuloMascarado(natureza: Natureza, ordem: number): string; // 'Comprador 01' / 'Locatário 03'
```

Regras (as que a assinatura não decide):
- Série começa no **mês seguinte** à data-base e tem `horizonte` meses. Título aberto com `dueDate <= dataBase` → `vencido_na_data_base`; aberto com vencimento depois da data-base mas no mesmo mês → `a_vencer_mes_corrente`. Nenhum dos dois entra na série.
- `vendas` = Σ títulos abertos `natureza='VENDA'` do mês. Títulos `LOCACAO` **futuros** não somam (o aluguel vem do contrato).
- `alugueis` = Σ `aluguelMensal` das locações com `inicio <= último dia do mês` e (`fim` nulo **ou** `fim < dataBase` [prazo indeterminado] **ou** `fim >= primeiro dia do mês`).
- `despesa_operacional` = `aluguelBase > 0 ? round2(despesaMensal * alugueis / aluguelBase) : 0`, com `aluguelBase` = aluguéis do 1º mês.
- `renda_liquida` = `(fluxos.vendas ? vendas : 0) + (fluxos.alugueis ? alugueis - despesa_operacional : 0)`.
- `folga` = `renda_liquida - servico_atual - servico_novo`; `dscr` = `ratio(renda_liquida, servico_atual + servico_novo)`.
- `capacidadeMaxima`: `parcela_maxima = max(0, min dos 12 primeiros meses de (renda_liquida / dscr_minimo - servico_atual))`; `valor_maximo` = maior principal (busca binária, precisão R$ 100, teto `parcela_maxima * prazo_meses`) tal que a maior `total` das 12 primeiras linhas de `buildSchedule({ principal, nominalRate: taxa_mensal_pct, ratePeriod: 'MENSAL', system: sistema, installmentCount: prazo_meses, installmentPeriod: 'MENSAL', firstDueDate: primeiroVencimento, gracePrincipalPeriods: carencia_meses })` ≤ `parcela_maxima`.
- `aplicarEstresse`: `vendas × (1−distrato)(1−inad)`, `alugueis × (1−vacância)(1−inad)`, despesa e serviço inalterados; recalcula `renda_liquida`, `folga`, `dscr`.
- `qualidadeDaRenda`: concentração = Σ renda futura (títulos de venda abertos + aluguel × meses da série) dos 5 maiores `partyKey` ÷ total; WALE pelo `wale()` (`value` = aluguelMensal, `active: true`); pontualidade = títulos recebidos com `dueDate` nos 12 meses até a data-base e `paymentDate <= dueDate` ÷ todos os recebidos desse período.

- [ ] **Step 1: Escrever os testes que falham** — `describe('creditCapacity')` com, no mínimo:

```ts
it('mesesDoHorizonte começa no mês seguinte e vira o ano', () =>
  expect(mesesDoHorizonte('2026-11-21', 3)).toEqual(['2026-12', '2027-01', '2027-02']));
it('venda aberta entra no mês do vencimento; vencida vai para vencido_na_data_base', ...);
  // títulos: VENDA 1000 due 2026-12-10 aberto; VENDA 500 due 2026-11-01 aberto; VENDA 700 due 2026-11-28 aberto
  // expect serie[0].vendas 1000, vencido_na_data_base 500, a_vencer_mes_corrente 700
it('aluguel vem do contrato e título futuro de aluguel não conta 2×', ...);
  // locação 1500/mês fim 2029-01-10 + título LOCACAO 1500 due 2026-12-10 aberto → serie[0].alugueis 1500
it('locação ativa com fim vencido projeta o horizonte inteiro', ...);
  // fim '2025-05-25', dataBase '2026-11-21', horizonte 36 → todos os 36 meses com o aluguel
it('locação com fim no meio do horizonte some depois do fim', ...);
  // fim '2027-07-31' → '2027-07' tem, '2027-08' não
it('renda zero sem dívida dá dscr null, não Infinity', ...);
it('despesa só desconta aluguel e acompanha a queda da receita', ...);
it('fluxos desmarcados zeram a parcela correspondente da renda líquida', ...);
it('capacidadeMaxima: renda que não cobre o DSCR mínimo devolve 0/0', ...);
it('capacidadeMaxima PRICE: parcela de buildSchedule do valor_maximo ≤ parcela_maxima < a de valor_maximo + 100', ...);
it('capacidadeMaxima SAC usa a 1ª parcela (a maior)', ...);
it('aplicarEstresse Severo reduz vendas por 0.85*0.75 e aluguéis por 0.8*0.75', ...);
it('alertas: venda sem título, locação sem valor, prazo indeterminado, título sem empreendimento', ...);
it('qualidade: top5 com 6 pagadores, pontualidade com 1 de 2 pago em atraso = 50', ...);
it('rotuloMascarado', () => expect(rotuloMascarado('LOCACAO', 3)).toBe('Locatário 03'));
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run __tests__/creditCapacity.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `utils/creditCapacity.ts`** com as assinaturas e regras acima (cabeçalho de comentário no estilo de `creditRoomSnapshot.ts` citando a spec).
- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.
- [ ] **Step 5: Commit** — `git add utils/creditCapacity.ts __tests__/creditCapacity.test.ts && git commit -m "feat(credit-room): conta pura da capacidade de pagamento"`

---

### Task 2: Snapshot schema 2 e DSCR pela série (`utils/creditRoomSnapshot.ts`)

**Files:**
- Modify: `utils/creditRoomSnapshot.ts` (tipos, `buildSnapshot`, `computeIndicators`)
- Test: `__tests__/creditRoomSnapshot.test.ts` (acrescentar), `__tests__/creditRoomProvenance.test.ts` (só se quebrar)

**Interfaces:**
- Consumes: Task 1 (`SerieMes`, `AlertaCarteira`, `QualidadeRenda`, `ParametrosCapacidade`).
- Produces:

```ts
export const CREDIT_ROOM_SNAPSHOT_SCHEMA = 2 as const;
export type CreditRoomSnapshotSchema = 1 | 2;          // `schema` do snapshot passa a ser este tipo
export interface SnapshotEscopo extends BlocoBase { tipo: 'EMPRESA' | 'GRUPO'; organizacoes: { id: string; nome: string; cnpj: string | null }[] }
export interface SnapshotEmpreendimentoItem {
  id: string; nome: string; organization_id: string; cidade: string | null; uf: string | null;
  objetivo: string | null; unidades_total: number; vendidas: number; alugadas: number; disponiveis: number;
  vgv_total: number; vgv_vendido: number; vgv_disponivel: number; renda_mensal: number;
  capa: string | null; fotos: { url: string; legenda: string | null }[];   // máx. 8
}
export interface SnapshotContrato {
  rotulo: string; tipo: 'VENDA' | 'LOCACAO'; contract_id: string | null; organization_id: string;
  empreendimento_id: string | null; unidade: string | null; valor_contrato: number;
  parcela_mensal: number; saldo_a_receber: number; vencido: number;
  primeiro_vencimento: string | null; ultimo_vencimento: string | null; status: string; tem_parcelas: boolean;
}
export interface SnapshotCapacidade extends BlocoBase {
  parametros: ParametrosCapacidade; base: 'CONTRATADA';
  serie: SerieMes[]; recebido_12m: { mes: string; vendas: number; alugueis: number }[];
  vencido_na_data_base: number; a_vencer_mes_corrente: number;
  estoque: { vgv_disponivel: number; haircut_pct: number; valor_elegivel: number } | null;
  capacidade_maxima: { parcela_maxima: number; valor_maximo: number };
  alertas: AlertaCarteira[];
  por_organizacao: { organization_id: string; renda_12m: number; servico_12m: number; divida_total: number }[];
}
// CreditRoomSnapshot ganha (opcionais — ausentes em schema 1):
//   escopo?: SnapshotEscopo | null; empreendimentos?: SnapshotEmpreendimentoItem[] | null;
//   contratos?: SnapshotContrato[] | null; capacidade?: SnapshotCapacidade | null;
//   qualidade?: (QualidadeRenda & BlocoBase) | null;
// SnapshotInputs ganha os mesmos 5 campos opcionais, já na forma acima (o service monta).
```

Regras de `computeIndicators`:
- Se `s.capacidade` existe: `fluxo_elegivel_anual` = Σ `renda_liquida` dos 12 primeiros meses; `servico_atual_anual` = Σ `servico_atual` dos 12; `servico_pos_anual` = Σ (`servico_atual + servico_novo`) dos 12, ou `null` se todos os `servico_novo` forem 0 **e** `op.novo_servico_12m` for `null`; `receivables` e `noi` **não** vão para `fontes_ausentes`; `noi_mensal × 12` **não** é somado.
- Sem `s.capacidade` (schema 1): comportamento atual byte a byte.
- `buildSnapshot` grava `schema: 2` e copia os blocos novos com `structuredClone`.

- [ ] **Step 1: Testes que falham** — no `creditRoomSnapshot.test.ts`:

```ts
it('schema 1 congelado continua com os mesmos indicadores', () => {
  const v1 = { ...buildSnapshot(base), schema: 1 as const };
  delete (v1 as any).capacidade;
  expect(computeIndicators(v1)).toEqual(INDICADORES_SCHEMA1_ESPERADOS); // fixture copiada do resultado atual antes de mexer
});
it('com capacidade, DSCR sai da série e não soma NOI de novo', ...);
  // serie com 12 meses renda_liquida 10_000, servico_atual 5_000 → dscr_atual 2; portfolio.noi_mensal 99_999 ignorado
it('receivables marcado com capacidade não aparece em fontes_ausentes', ...);
it('buildSnapshot congela capacidade por valor (mutar a entrada não muda o snapshot)', ...);
it('buildSnapshot grava schema 2', () => expect(buildSnapshot(base).schema).toBe(2));
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run __tests__/creditRoomSnapshot.test.ts` → FAIL nos novos.
- [ ] **Step 3: Implementar** tipos e regras acima. Gerar a fixture `INDICADORES_SCHEMA1_ESPERADOS` rodando o `computeIndicators` **atual** antes da mudança.
- [ ] **Step 4: Rodar** `npx vitest run __tests__/creditRoomSnapshot.test.ts __tests__/creditRoomProvenance.test.ts __tests__/creditCapacity.test.ts` → PASS; `npx tsc --noEmit` → sem erro novo (telas que leem `schema === 1` compilam).
- [ ] **Step 5: Commit** — `feat(credit-room): snapshot schema 2 com capacidade, carteira e empreendimentos`

---

### Task 3: Migration — escopo, empreendimentos e parâmetros no room

**Files:**
- Create: `supabase/migrations/aplicar_<prefixo>_credit_room_capacidade.sql` e `supabase/migrations/aplicar_<prefixo>_credit_room_capacidade_rollback.sql` (prefixo: listar **todos** os nomes com `ls supabase/migrations | sed -E 's/^(aplicar_)?([0-9]+).*/\2/' | sort -n | tail` — hoje o maior é `20271121999000`; usar o próximo livre, ex. `20271122000000`, e reconferir no `origin/main` antes do commit)

Conteúdo:
- `ALTER TABLE public.credit_rooms ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'EMPRESA' CHECK (escopo IN ('EMPRESA','GRUPO'))`, `grupo_organization_ids uuid[] NOT NULL DEFAULT '{}'`, `empreendimento_ids uuid[] NOT NULL DEFAULT '{}'`, `parametros_capacidade jsonb NOT NULL DEFAULT '{}'`.
- `fn_credit_room_grupo_valido()` (plpgsql, `SECURITY INVOKER`, trigger BEFORE INSERT OR UPDATE OF `escopo, grupo_organization_ids, organization_id`): se `escopo='EMPRESA'` força `grupo_organization_ids := '{}'`; se `GRUPO`, inclui `organization_id` no array (sem duplicar) e recusa com `RAISE EXCEPTION ... USING ERRCODE = 'check_violation'` qualquer id que não esteja em `minhas_orgs_membro()`. `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon`.
- Idempotente (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`).
- Rollback: `DROP TRIGGER`, `DROP FUNCTION`, `ALTER TABLE ... DROP COLUMN IF EXISTS` das 4.

- [ ] **Step 1: Escrever os dois arquivos.**
- [ ] **Step 2: Aplicar** — `npx supabase db query --linked -f supabase/migrations/aplicar_<prefixo>_credit_room_capacidade.sql` → sem erro.
- [ ] **Step 3: Provar** (`db query --linked`, como postgres simulando usuário com `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid de um membro>"}'` dentro de `begin … rollback`):
  - UPDATE de room com `escopo='GRUPO', grupo_organization_ids = '{<org de que o uid não é membro>}'` → `check_violation`.
  - Com org de que é membro → passa e o array contém a org dona.
  - `escopo='EMPRESA'` → array vira `{}`.
  - `bash scripts/verificar-views-anon.sh` e sonda com a chave publicável em `credit_rooms` → 0 linhas / sem acesso (REGRA #7).
- [ ] **Step 4: Commit** — `feat(credit-room): escopo empresa/grupo, empreendimentos e parâmetros no room (migration)`

---

### Task 4: Coleta no `freezeVersion` + mídia do empreendimento extraída

**Files:**
- Create: `services/empreendimentoMidiaService.ts` — move `fotosDosEmpreendimentos` e o tipo `FotoDaVitrine` de `services/investorPortalService.ts:115-240`; o investidor passa a importar daqui (re-exportar `FotoDaVitrine` de lá para não quebrar importadores).
- Modify: `types/creditRoom.ts` (`CreditRoom` + `escopo`, `grupoOrganizationIds`, `empreendimentoIds`, `parametrosCapacidade`), `services/creditRoomService.ts` (`ROOM_COLS`, `mapRoom`, `toRoomRow`, `freezeVersion`, coletores novos).

**Interfaces:**
- Consumes: Task 1 (`TituloCarteira`, `LocacaoVigente`, `serieDeRenda`, `recebidoPorMes`, `capacidadeMaxima`, `alertasDaCarteira`, `qualidadeDaRenda`, `rotuloMascarado`, `PARAMETROS_CAPACIDADE_PADRAO`), Task 2 (blocos do snapshot), Task 3 (colunas).
- Produces (métodos do `creditRoomService`, todos `try/catch → null` + `console.warn`, exceto posição da dívida):

```ts
orgsDoEscopo(room: CreditRoom): string[];                       // EMPRESA → [org]; GRUPO → únicos [org, ...grupo]
coletarEscopo(room: CreditRoom): Promise<SnapshotEscopo | null>; // organizations(id,name) + companies matriz (cnpj)
coletarTitulos(orgs: string[], empreendimentoIds: string[]): Promise<TituloCarteira[] | null>;
coletarLocacoes(orgs: string[], empreendimentoIds: string[]): Promise<LocacaoVigente[] | null>;
coletarVendasSemTitulo(orgs: string[], titulos: TituloCarteira[]): Promise<{ dealId: string; valor: number }[]>;
coletarServicoAtual(orgs: string[], dataBase: string, meses: number): Promise<Record<string, number> | null>;
servicoNovoPorMes(room: CreditRoom, dataBase: string, p: ParametrosCapacidade): Promise<Record<string, number>>;
coletarEmpreendimentosDoEscopo(orgs: string[], empreendimentoIds: string[], titulos: TituloCarteira[], locacoes: LocacaoVigente[], mesBase: string): Promise<SnapshotEmpreendimentoItem[] | null>;
montarCarteira(titulos: TituloCarteira[], locacoes: LocacaoVigente[], dataBase: string): SnapshotContrato[];
```

Fonte de cada coletor (o que o builder não acharia sozinho):
- **Títulos:** `vw_receivables` (`id, organization_id, reference_id, due_date, amount, effective_status, party_id, party_name, project_id`) por org; `payment_date` de `internal_transactions` por `id` (em lotes de 200). Contrato por `originIdFromRef(reference_id)` → `contracts (id, domain, deal_id, empreendimento_id, project_id)`; `natureza` = `VENDAS→'VENDA'`, `LOCACAO→'LOCACAO'`, senão `null`. Empreendimento por `receivableService.resolveEmpreendimentos(rows, org)` (já cobre contrato → negócio → imóvel → empreendimento). `recebido = effective_status === 'RECEBIDO'`. Filtro: se `empreendimentoIds` não vazio, descarta título com empreendimento fora da lista (sem empreendimento fica e vira alerta).
- **Locações vigentes:** `contracts` `domain='LOCACAO'`, `status in ('Ativo','Assinado')`, sem filho (`id` não aparece em `parent_contract_id` de outro contrato da org); `aluguelMensal = current_value ?? getDealInstallmentValue(deal)`; empreendimento por `empreendimento_id` ou negócio → imóvel (`empreendimentoService.mapPropertiesToEmpreendimentos(org)`).
- **Vendas sem título:** `commercial_deals` `type='SALE'` com etapa em `ETAPAS_VENDIDA` (`lib/salesAnalysis.ts`) cujo id não é `deal_id` de nenhum contrato com título, nem aparece como `tx-<deal_id>-` em `reference_id`; `valor = value`.
- **Despesa mensal:** Σ por org de `rentalNoiService.getNoiMetrics(org, dataBase−12m, dataBase).expense / monthsInWindow`; 0 se `parametros.despesa_operacional === false`.
- **Serviço atual:** `debtAnalyticsService.curve(org, { from: dataBase, months: horizonte + 1 })` por org, somado por `mes.slice(0,7)`.
- **Serviço novo:** com `room.debtContractId`, as parcelas do cronograma vigente (`coletarNovoServico` já lê) agrupadas por mês de `dueDate`; sem proposta, `buildSchedule` com `room.requestedAmount` e os parâmetros (prazo/carência do room quando preenchidos, senão os de `parametros`), `firstDueDate` = dia 1 do 2º mês após a data-base.
- **Dívida no GRUPO:** `debtAnalyticsService.position` por org, campos somados (prazo e custo médio ponderados por `dividaTotal`); EMPRESA segue como hoje.
- **Empreendimentos:** `empreendimentoService.list(org)` por org, filtrados por `empreendimentoIds`; unidades pela lógica atual de `coletarUnidades` (status `ALUGADO` conta em `alugadas` — conferir o enum real em `types/` e mapear); fotos de `empreendimentoMidiaService.fotosDosEmpreendimentos(ids)` cortadas em 8, `capa = fotos[0]?.url ?? null`; `renda_mensal` = títulos de venda abertos do `mesBase` + aluguéis vigentes do empreendimento.
- **Carteira:** uma linha por contrato (títulos agrupados por `contractId`) + uma por locação vigente sem título; rótulo por `rotuloMascarado`, ordem por `valor_contrato` desc dentro de cada natureza; **sem** `partyKey`.
- **Por organização** (`capacidade.por_organizacao`): rodar `serieDeRenda` com os títulos/locações/serviço de cada org isolada e somar os 12 primeiros meses (`renda_12m`, `servico_12m`), mais `divida_total` da posição daquela org. No EMPRESA, uma linha só.
- `freezeVersion` monta `CapacidadeEntrada` com `fluxos = { vendas: room.eligibleFlows.receivables, alugueis: room.eligibleFlows.noi }`, chama os puros e passa os 5 blocos novos ao `buildSnapshot`. Estoque = Σ `vgv_disponivel` × (1 − haircut).

- [ ] **Step 1: Extrair a mídia** e rodar `npx vitest run` dos testes do portal do investidor (`ls __tests__ | grep -i investor`) → PASS sem mudança.
- [ ] **Step 2: Mapear as colunas novas** (`ROOM_COLS`, `mapRoom` com `parametrosCapacidade: { ...PARAMETROS_CAPACIDADE_PADRAO, ...r.parametros_capacidade }`, `toRoomRow`).
- [ ] **Step 3: Implementar os coletores e o `freezeVersion`.**
- [ ] **Step 4: `npx tsc --noEmit`** → sem erro novo; `bash scripts/check-org-selector-guard.sh` e `npx vitest run __tests__/orgContextGuard.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(credit-room): coleta da capacidade, carteira e empreendimentos no congelamento`

---

### Task 5: Formulário — Escopo, Empreendimentos e Parâmetros

**Files:**
- Modify: `components/credit/CreditRoomForm.tsx`

**Interfaces:**
- Consumes: Task 4 (`CreditRoom` com os 4 campos), `PARAMETROS_CAPACIDADE_PADRAO`.
- Seções novas no Sheet existente:
  - **Escopo da renda** — rádio "Empresa tomadora" (padrão) / "Grupo inteiro"; no grupo, lista de checagem das organizações de que o usuário é membro (fonte: a mesma que o seletor do topo usa em `useOrgContext`; a org dona vem marcada e travada, com o motivo no `title`).
  - **Empreendimentos** — lista de checagem dos empreendimentos das orgs do escopo (`empreendimentoService.list`), todos marcados por padrão (gravar `[]` quando todos marcados).
  - **Parâmetros da capacidade** — DSCR mínimo, taxa mensal %, prazo, carência, sistema (Price/SAC), horizonte (24/36), haircut do estoque %, "Descontar despesa operacional dos aluguéis".
  - Checkbox existente "Recebíveis de vendas" deixa de dizer "sem fonte".
- Campos `h-9`, rótulos sem caixa alta, botão desabilitado diz o motivo.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: `bash scripts/check-ui-standard.sh components/credit/CreditRoomForm.tsx`** → exit 0.
- [ ] **Step 3: Commit** — `feat(credit-room): escopo, empreendimentos e parâmetros da capacidade no formulário`

---

### Task 6: Prova no caso real e PR

- [ ] **Step 1:** Subir o app da frente e, no room **CR-00001**, salvar com escopo EMPRESA e congelar uma versão; depois GRUPO com uma 2ª org e congelar outra.
- [ ] **Step 2: Conferir contra o banco** (`db query --linked`): Σ dos títulos de venda abertos por mês nos 3 primeiros meses = `snapshot.capacidade.serie[0..2].vendas`; Σ `current_value` das locações vigentes = `serie[0].alugueis`; `alertas` traz as vendas sem parcelas e as locações com prazo indeterminado (CTL-010-0002, CTL-006-012-0001, CTL-010-0005, CTL-010-0004); nenhum nome de cliente no JSON (`snapshot::text ilike '%<nome real de um locatário>%'` → false).
- [ ] **Step 3:** Abrir uma versão antiga (schema 1) no interno e no portal do credor → indicadores iguais aos de antes.
- [ ] **Step 4:** `npx vitest run __tests__/creditCapacity.test.ts __tests__/creditRoomSnapshot.test.ts __tests__/creditRoomProvenance.test.ts` + `npx tsc --noEmit` → verdes; abrir PR com o skill `pr`, CI verde, merge por mim (`gh pr merge`).
