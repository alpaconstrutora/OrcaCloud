# Central de Controle — um bloco lento não derruba a tela inteira

> **Para quem executa:** siga tarefa por tarefa (superpowers:executing-plans); os passos usam `- [ ]`.

**Objetivo:** quando a chamada única da Central (`fn_central_controle_bootstrap`) cair, a tela pede
os blocos um a um e cada cartão aparece (ou mostra "Não carregou.") sozinho.

**Arquitetura:** o caminho normal não muda — uma chamada só (a rajada de setembro continua
resolvida). Só quando ela é rejeitada (estouro dos 8 s, rede), `load()` chama
`centralControleService.fontesSeparadas()`, que dispara as 6 consultas que a tela usa em
paralelo, cada uma com o próprio limite de 8 s; cada resultado é aplicado ao estado quando chega.

**Base:** React 18 + supabase-js; PostgreSQL 15 (Supabase); Vitest + Testing Library.

## Pedido original

> Contexto: na mesma sessão, depois de corrigir "central de controle nao esta carregando. verifique"
> (#511 — o bootstrap estourava os 8 s e NENHUM cartão abria), ofereci: *"hoje, se qualquer bloco
> da Central passar do tempo, a tela inteira deixa de abrir. Dá para fazer só o cartão daquele
> bloco falhar. Se quiser, abro como próxima frente."*
>
> **"quero"**
>
> (e, à proposta "plano B só quando a chamada única falha"): **"sim"**
>
> Sessão: 4df5f147-5935-4f89-aca8-224927a45bb4 · 16/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 16/11 | Caminho: (1) plano B só quando a chamada única falha · (2) blocos sempre separados · (3) duas chamadas, pesados × leves | **(1)**. O (2) recria a rajada do login medida em 24/09 (`project_rpcs_do_login_nao_sao_lentas_a_rajada_e`); o (3) faz 2 pedidos sempre e os pesados seguem caindo juntos. |
| 16/11 | Isolar dentro da função SQL? | Impossível: o `statement_timeout` vale para a chamada inteira e o cancelamento (57014) não é pego por `EXCEPTION WHEN OTHERS`. |
| 16/11 | Custo aceito | No dia ruim, cartões em ~9 s (8 s da chamada única + ~1 s dos blocos); o bloco lento diz "Não carregou." em ~16 s. Hoje: nenhum cartão, nunca. |

## Restrições globais

- Caminho normal idêntico: com o bootstrap respondendo, `fontesSeparadas` **não é chamada** (zero requisição a mais).
- Mesmos parâmetros de hoje: divergências com `limit: 0`, `asOf` = hoje, `agingDays 5`, `valueTolerance 50`; "Todas" = `null` (REGRA #5).
- `approval_summary` fica fora do plano B: a tela não lê esse bloco.
- Função nova nasce `SECURITY INVOKER` com `REVOKE EXECUTE … FROM PUBLIC, anon` + `GRANT … TO authenticated` (REGRA #7).
- Migration aplicada à mão com `db query --linked -f`, **nunca** `db push`; aplicada ANTES do merge do app.
- Sem mudança visual: cada cartão usa o "Não carregou." / "Tentar de novo" que já existe.

## Pontos de atenção na revisão

1. **Troca de organização com o plano B em voo** — a resposta atrasada da org anterior não pode pintar a tela da org nova (o plano B estica a janela para ~16 s). → teste na Tarefa 3.
2. **Bloco de alertas lento segura a Minha fila** — `tudoCarregado` exige alertas fora de "carregando"; com alertas parciais (o 1º que chega já vale) a fila abre sem esperar `financial_alerts`. → teste na Tarefa 3.
3. **Rede fora do ar** — bootstrap e os 6 caem; cada cartão mostra "Não carregou.", e o `carregando` termina (o caixa não fica preso esperando). → coberto pelo teste "todas caem" na Tarefa 3.
4. **"Atualizar" com plano B** — os cartões que estavam OK continuam visíveis até o bloco novo chegar (não voltam ao esqueleto). → comportamento herdado (`load` não zera estados); sem teste novo.
5. **Paridade do `meu_dia`** — a extração para função própria não pode mudar um número. → md5 antes/depois na Tarefa 1.

---

### Tarefa 1: `fn_central_meu_dia` própria; o bootstrap passa a chamá-la

**Arquivos:**
- Criar: `supabase/migrations/aplicar_20271116907000_central_meu_dia_funcao_propria.sql`

**Interfaces:**
- Produz: `public.fn_central_meu_dia(p_organization_id uuid) RETURNS jsonb` — STABLE, plpgsql,
  `SET search_path = public, pg_temp`, SECURITY INVOKER; devolve exatamente o objeto que hoje é
  `meu_dia.data` do bootstrap.

- [ ] **Passo 1: gerar a migration a partir do arquivo, não do banco.** Base:
  `aplicar_20271111400000_central_meu_dia.sql` (md5 do corpo = md5 de `prosrc` em produção, conferido
  16/11: `6702ffb6…`). O corpo do bloco 7 (do `WITH` até `INTO bloco;`) vira o corpo da função nova,
  com as 4 variáveis `v_hoje`, `v_inicio`, `v_fim`, `v_email` no `DECLARE` dela, terminando em
  `RETURN bloco;`. No bootstrap, o bloco 7 fica `bloco := public.fn_central_meu_dia(p_organization_id);`
  dentro do mesmo `BEGIN … EXCEPTION`, e as 4 variáveis saem do `DECLARE` dele. Os blocos 1–6
  ficam byte a byte iguais. Cabeçalho: sintoma, por que, P1/P2 da REGRA #7, como reverter
  (reaplicar a `aplicar_20271111400000`).
- [ ] **Passo 2: ensaio sem risco.** Num `begin`, como o usuário dev (`SET LOCAL ROLE authenticated` +
  `request.jwt.claims`): md5 de `fn_central_controle_bootstrap(null,…)->'meu_dia'` com a função
  velha → aplica a migration → md5 de novo, e md5 de
  `jsonb_build_object('ok',true,'data',fn_central_meu_dia(null))`; repetir com a org Alpa;
  `DO … RAISE EXCEPTION` com os números (força o rollback).
  Esperado: os três md5 iguais nas duas orgs; tempo do bootstrap na mesma ordem (~0,6 s).
- [ ] **Passo 3: aplicar** com `npx supabase db query --linked -f <arquivo>`; conferir
  `has_function_privilege('anon', 'public.fn_central_meu_dia(uuid)', 'EXECUTE') = false` e
  `authenticated = true`; repetir o md5 do Passo 2 fora da transação.
- [ ] **Passo 4: `npx vitest run __tests__/segurancaMigrations.test.ts`** → PASS; commit.

### Tarefa 2: `centralControleService.fontesSeparadas`

**Arquivos:**
- Modificar: `services/centralControleService.ts`
- Teste: `__tests__/centralControleService.test.ts`

**Interfaces:**
- Consome: `fn_central_meu_dia` (Tarefa 1); `financialIntelligenceService.getAlerts` /
  `getProjectScorecards`, `divergenceService.getDivergences`, `processService.getBottlenecks`,
  `approvalService.listActionQueue` (já existem; trazem as próprias normalizações).
- Produz:
  ```ts
  export interface FontesSeparadas {
      financial_alerts: Promise<FinancialAlert[]>;
      divergences: Promise<ReconciliationDivergences>;
      bottlenecks: Promise<ProcessStepBottleneck[]>;
      action_queue: Promise<ActionQueueItem[]>;
      scorecards: Promise<ProjectScorecard[]>;
      meu_dia: Promise<MeuDia>;
  }
  centralControleService.fontesSeparadas(organizationId: string | null): FontesSeparadas
  ```

- [ ] **Passo 1: testes que falham** (`describe('centralControleService.fontesSeparadas')`, com o
  `rpc` mockado que o arquivo já usa):
  - `'pede as 6 consultas da tela, com os mesmos parâmetros do bootstrap'` — nomes chamados =
    `fn_financial_alerts`, `fn_reconciliation_divergences` (com `p_limit: 0`, `p_aging_days: 5`,
    `p_value_tolerance: 50`), `fn_process_bottlenecks`, `fn_approval_action_queue`,
    `fn_project_scorecard`, `fn_central_meu_dia`; nenhuma chamada a `fn_approval_pending_summary`.
  - `'"Todas" vai como null em todas'` — todo `p_organization_id` recebido é `null`.
  - `'uma consulta que cai não derruba as outras'` — `rpc` devolve `{error}` só para
    `fn_project_scorecard`: `scorecards` rejeita; `meu_dia` resolve com o objeto devolvido.
- [ ] **Passo 2:** `npx vitest run __tests__/centralControleService.test.ts` → FAIL (`fontesSeparadas is not a function`).
- [ ] **Passo 3: implementar.** Cada campo é a promessa crua do serviço (sem `await` entre elas — saem
  juntas). `meu_dia` chama `supabase.rpc('fn_central_meu_dia', { p_organization_id: organizationId || null })`.
  Comentário no topo: por que existe (plano B, só quando o bootstrap cai) e por que não substitui o bootstrap.
- [ ] **Passo 4:** mesmo comando → PASS; commit.

### Tarefa 3: `load()` cai para o plano B, cartão a cartão

**Arquivos:**
- Modificar: `utils/meuDia.ts` (helper puro), `components/CentralControle.tsx` (`load`)
- Teste: `__tests__/meuDia.test.ts`, `__tests__/components/CentralControle.test.tsx`

**Interfaces:**
- Consome: `centralControleService.fontesSeparadas` (Tarefa 2).
- Produz (em `utils/meuDia.ts`):
  ```ts
  export interface FontesDeAlerta {
      financial?: PromiseSettledResult<FinancialAlert[]>;
      divergences?: PromiseSettledResult<ReconciliationDivergences>;
      bottlenecks?: PromiseSettledResult<ProcessStepBottleneck[]>;
      // o tipo é o retorno de contractIndexService.listDueForReajuste (inline lá)
      reajustes?: PromiseSettledResult<Awaited<ReturnType<typeof contractIndexService.listDueForReajuste>>>;
  }
  /** `undefined` = ainda não chegou. */
  export function alertasDasFontes(f: FontesDeAlerta):
      { estado: 'carregando' } | { estado: 'erro' } | { estado: 'ok'; data: AlertaDoDia[] };
  ```
  Regra: alguma `fulfilled` → `ok` com a lista das que chegaram (a montagem de cada tipo de alerta é a
  que hoje está inline no `load`, movida sem mudança); nenhuma `fulfilled` e alguma `undefined` →
  `carregando`; todas `rejected` → `erro`.

- [ ] **Passo 1: testes do helper** em `__tests__/meuDia.test.ts`, `describe('alertasDasFontes')`:
  - `'só reajustes chegou: ok com os reajustes, sem esperar os outros'`
  - `'nada chegou ainda: carregando'` (todas `undefined`)
  - `'todas caíram: erro'`
  - `'divergência zerada não vira alerta; valor divergente vira HIGH'` (mesmos títulos de hoje)
- [ ] **Passo 2: testes da tela** em `CentralControle.test.tsx` (mock de `centralControleService`
  ganha `fontesSeparadas: (...a) => fontesSeparadas(...a)`; helper `fontes(p)` monta o objeto de
  promessas a partir de `painel()`):
  - `'bootstrap respondendo: o plano B não é chamado'` — `fontesSeparadas` 0 vezes.
  - `'chamada única cai: os cartões vêm pelas consultas separadas e só o bloco que caiu diz "Não carregou."'`
    — bootstrap rejeita (`{ code: '57014' }`); `scorecards` rejeita; Obras = "Não carregou." com
    "Tentar de novo"; Contas a pagar e Minha fila sem "Não carregou.".
  - `'alerta lento não segura a Minha fila'` — `financial_alerts` nunca responde; `action_queue` traz
    `aprovacao('a1')`; "Boleto a1" aparece e a Minha fila sai de `aria-busy`.
  - `'tudo cai: cada cartão diz "Não carregou." e o caixa é buscado'` — `cashflow` chamado.
  - `'resposta atrasada da org anterior não pinta a tela da org nova'` — plano B da `o1` com
    `action_queue` pendente; `rerender` com `organizationId="o2"` (bootstrap da o2 OK, fila vazia);
    resolver a da `o1` com `aprovacao('velha')` → "Boleto velha" **não** aparece.
- [ ] **Passo 3:** `npx vitest run __tests__/meuDia.test.ts __tests__/components/CentralControle.test.tsx`
  → os novos FAIL, os antigos PASS.
- [ ] **Passo 4: implementar.** `load()`:
  - um `useRef` de rodada incrementado a cada `load`; todo `set*` vindo de resposta confere se a rodada
    ainda é a corrente (resolve o item 1 da revisão);
  - bootstrap OK → aplica tudo de uma vez, como hoje (via `alertasDasFontes` com as 4 presentes);
  - bootstrap rejeitado → `console.error('[CentralControle] chamada única caiu; pedindo por bloco:', motivo)`,
    `fontesSeparadas(organizationId)`, e a cada promessa que assenta: guarda o resultado num objeto de
    parciais e reaplica — `fila`/`meuDia`/`scorecards` pelo `paraFonte` existente, alertas por
    `alertasDasFontes(parciais)`; `setCarregando(false)` depois que as 6 assentarem;
  - atualizar o comentário "Uma falha da chamada consolidada… derruba todas as fontes juntas" para o
    comportamento novo.
- [ ] **Passo 5:** mesmo comando → PASS; `bash scripts/check-ui-standard.sh components/CentralControle.tsx`
  e `npx vitest run __tests__/orgContextGuard.test.ts` → sem achado novo; commit.

### Tarefa 4: publicar e provar na tela

- [ ] `npx tsc --noEmit` (exit lido por grep — memória `feedback_tsc_exit_le_por_grep_nao_pelo_tail`) e a
  suíte completa → verdes.
- [ ] PR (skill `pr`), CI verde lida em chamada separada; migration já aplicada (Tarefa 1); merge
  `--squash --match-head-commit`; CI do `main` verde.
- [ ] **Prova em produção** (aba do Chrome do usuário, já logada): via `javascript_tool`, embrulhar
  `window.fetch` para rejeitar só `/rpc/fn_central_controle_bootstrap` e `/rpc/fn_project_scorecard`,
  clicar "Atualizar": esperado — Minha fila, Contas a pagar, Caixa e Extrato carregam; Obras =
  "Não carregou."; na rede, as 6 RPCs separadas. Recarregar a aba (desfaz o embrulho) e conferir que
  volta a sair UMA chamada só.
- [ ] Fechar a frente (`fechar-frente.sh --sem-publicar` após provar conteúdo idêntico ao squash);
  atualizar memórias `project_central_bom_dia` e `project_central_timeout_cte_obras_inlined`.

## Estado

- [ ] Tarefa 1 — função própria do meu_dia
- [ ] Tarefa 2 — `fontesSeparadas`
- [ ] Tarefa 3 — plano B no `load()`
- [ ] Tarefa 4 — publicação e prova na tela

## Verificação

De ponta a ponta: a prova em produção da Tarefa 4 (bootstrap bloqueado → cartões pelo plano B, só
Obras falha; aba recarregada → uma chamada só). Nos testes: `CentralControle.test.tsx` cobre o caminho
normal sem plano B, o plano B parcial, o bloco lento, tudo caindo e a troca de org.
