# Central de Controle — os 5 menores do plano B (#521)

> **Para quem executa:** siga tarefa por tarefa (superpowers:executing-plans); os passos usam `- [ ]`.

**Objetivo:** fechar os 5 pontos menores que a revisão final do #521 deixou para depois: plano B
pegajoso, caixa sem esperar os 6 blocos, Atualizar no plano B sem a lista de alertas encolher nem a
fila piscar o esqueleto, cartão que falha ao montar sem travar a tela, e a variável sombreada.

**Arquitetura:** só app — nenhuma mudança no banco. `components/CentralControle.tsx` continua dono
da carga (`load`). Entram: um módulo pequeno com a memória do plano B por organização
(`utils/planoBPegajoso.ts`), um estado próprio para o caixa esperar só a chamada única, um `ref` com
as fontes de alerta que estão na tela e uma `alertasDasFontes` que nunca lança.

**Base:** React 18 + supabase-js; Vitest + Testing Library.

**Plano anterior (contexto):** `docs/planos/2026-11-16-central-blocos-isolados.md`.

## Pedido original

> Contexto: no relatório final do #521 listei "Deixado para depois, menores":
> plano B pegajoso · Caixa espera todos os blocos (~16 s) · Atualizar no plano B troca a lista de
> alertas pela 1ª fonte e, numa combinação rara, a fila pisca o esqueleto · se a montagem de um
> cartão der erro no plano B a tela pode ficar presa em "carregando" · variável que repete o nome
> de outra.
>
> **"implemente os itens Deixado para depois, menores"**
>
> (à proposta em 4 itens, 5 minutos por organização): **"sim"**
>
> Sessão: 4df5f147-5935-4f89-aca8-224927a45bb4 · 17/11/2026

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 17/11 | Plano B pegajoso: quanto tempo, por quem | **5 minutos, por organização**, memória da aba (recarregar a página zera). "Todas" (`null`) é uma chave própria. |
| 17/11 | Que falha liga o pegajoso | **Qualquer** rejeição da chamada única — não só 57014. Se a função quebrou, insistir nela a cada Atualizar também não ajuda. |
| 17/11 | Caixa | Espera só a **resposta da chamada única** (ok ou falha), não os blocos. Custo aceito: no dia ruim, 7 consultas juntas em vez de 6 + 1. Dia normal: igual. |
| 17/11 | Atualizar no plano B | Cada fonte de alerta troca **só a própria parte**; o resto fica como estava até a resposta nova chegar. Trocar de org continua do esqueleto. |
| 17/11 | Cartão que falha ao montar | Só ele diz "Não carregou." (para alertas: a fonte entra no aviso "Parte da fila não carregou (…)"), e a tela termina de carregar. Vale no caminho normal e no plano B. |

## Restrições globais

- Caminho normal idêntico: bootstrap respondendo → 1 chamada, `fontesSeparadas` não é chamada.
- "Todas" = `organizationId === null` (REGRA #5); a org vem da prop, como hoje (BASELINE).
- Nenhuma migration, nenhuma RPC nova.
- Comentários e mensagens em português.

## Pontos de atenção na revisão

1. Pegajoso marcado numa org não pode afetar outra (inclusive "Todas" × org específica).
2. Pegajoso vencido (≥ 5 min) volta a tentar a chamada única — e, se ela cair de novo, remarca.
3. Carga velha (org trocada) não pode remarcar/limpar a memória de forma errada nem pintar a tela.
4. O `ref` das fontes de alerta é zerado na troca de org: alerta da org anterior nunca entra na nova.
5. Caixa: com o bootstrap respondendo, a ordem continua bootstrap → caixa (teste existente).

---

### Tarefa 1: `alertasDasFontes` nunca lança — fonte que não monta vira "faltou"

Hoje `f.financial.value.forEach(…)` com `value` nulo (bloco `{ ok: true, data: null }`) lança dentro
de `load`: no caminho normal nenhum cartão sai do esqueleto; no plano B o `await Promise.all`
rejeita e `carregando` nunca volta a `false` (Atualizar fica desabilitado).

**Arquivos:**
- Modificar: `utils/meuDia.ts` (`alertasDasFontes`)
- Testes: `__tests__/meuDia.test.ts`, `__tests__/components/CentralControle.test.tsx`

**Interfaces:** produz `alertasDasFontes(f: FontesDeAlerta): AlertasDoDia` com a mesma assinatura;
garantia nova: não lança.

- [ ] **Passo 1: testes que falham**

`__tests__/meuDia.test.ts`, no `describe('alertasDasFontes')`:
```ts
it('fonte que chega mas não monta (valor nulo) entra em `faltou` em vez de lançar', () => {
    const r = alertasDasFontes({ financial: ok(null as never), divergences: ok(semDivergencia), reajustes: ok([reajuste]) });
    expect(r).toEqual({ estado: 'ok', faltou: ['alertas financeiros'], data: [expect.objectContaining({ id: 'reajuste-c1' })] });
});
```
`__tests__/components/CentralControle.test.tsx`:
```ts
it('alerta que não monta não trava a tela: os cartões carregam e o aviso cita a fonte', async () => {
    bootstrap.mockResolvedValue(painel({ financial_alerts: { ok: true, data: null } }));
    montar();
    expect(await screen.findByText(/Parte da fila não carregou \(alertas financeiros\)\./)).toBeInTheDocument();
    expect(cartao('Contas a pagar')).toHaveAttribute('aria-busy', 'false');
});
it('plano B: alerta que não monta não deixa o Atualizar preso em "carregando"', async () => {
    bootstrap.mockRejectedValue(TIMEOUT);
    fontesSeparadas.mockImplementation(() => fontes({ financial_alerts: () => Promise.resolve(null) }));
    montar();
    expect(await screen.findByText(/Parte da fila não carregou \(alertas financeiros\)\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run __tests__/meuDia.test.ts __tests__/components/CentralControle.test.tsx`
Expected: os 3 novos FALHAM (TypeError no unitário; aviso nunca aparece nos de tela).

- [ ] **Passo 3: implementar**

Em `alertasDasFontes`, cada fonte `fulfilled` monta seus alertas num array próprio dentro de
`try/catch`; se lançar: `console.error('[meuDia] alertas: fonte não montou', nome, err)`, a fonte
conta como `rejected` (não entra em `data`, não conta para "algum chegou", entra em `faltou`).

- [ ] **Passo 4: rodar e ver passar** (mesmo comando) — Expected: tudo verde.

- [ ] **Passo 5: commit** — `fix(central): alerta que não monta vira "faltou" em vez de travar a tela`

---

### Tarefa 2: Atualizar no plano B — cada fonte de alerta troca só a própria parte

Hoje o plano B começa `{ reajustes }` do zero: a 1ª fonte que chega substitui a lista inteira
(alertas das outras somem até chegarem) e, se reajustes caiu e a 1ª fonte também caiu,
`alertasDasFontes` devolve `carregando` e a Minha fila volta ao esqueleto.

**Arquivos:**
- Modificar: `components/CentralControle.tsx` (`load`)
- Teste: `__tests__/components/CentralControle.test.tsx`

**Interfaces:** novo `const fontesDeAlertaNaTela = React.useRef<FontesDeAlerta>({})` — as fontes que
geraram o cartão de alertas atual. Zerado (`{}`) no bloco de troca de org (`orgNaTela`). Gravado no
caminho normal (`{ financial, divergences, bottlenecks, reajustes: reajusteR }`) e a cada fonte que
chega no plano B. A variável local `alertas: FontesDeAlerta` do plano B passa a se chamar
`fontesAlerta` e nasce `{ ...fontesDeAlertaNaTela.current, reajustes: reajusteR }`.

- [ ] **Passo 1: testes que falham**

Trocar o mock fixo de reajustes por um `vi.fn`: `const reajustes = vi.fn();` no mock de
`contractIndexService` (`listDueForReajuste: (...a) => reajustes(...a)`), e no `beforeEach`
`reajustes.mockReset().mockResolvedValue([])`.
```ts
it('Atualizar no plano B: alerta de fonte que ainda não respondeu continua na fila', async () => {
    const fin = [{ severity: 'HIGH', title: 'Saldo negativo previsto', description: 'Conta X' }];
    bootstrap.mockRejectedValue(TIMEOUT);
    fontesSeparadas
        .mockImplementationOnce(() => fontes({ financial_alerts: () => Promise.resolve(fin) }))
        .mockImplementationOnce(() => fontes({ financial_alerts: nunca }));
    montar();
    expect(await screen.findByText('Saldo negativo previsto')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 50));
    expect(screen.getByText('Saldo negativo previsto')).toBeInTheDocument();
});
it('Atualizar no plano B: reajuste e 1º alerta caídos não voltam a fila ao esqueleto', async () => {
    bootstrap.mockRejectedValue(TIMEOUT);
    fontesSeparadas
        .mockImplementationOnce(() => fontes())
        .mockImplementationOnce(() => fontes({ financial_alerts: caiu, divergences: nunca, bottlenecks: nunca }));
    montar();
    await waitFor(() => expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'false'));
    reajustes.mockRejectedValue(TIMEOUT);
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 50));
    expect(cartao('Minha fila')).toHaveAttribute('aria-busy', 'false');
});
```
(Se o `ok` de `fontes()` com `Promise.resolve(fin)` precisar de mais campos de `FinancialAlert`
para a fila renderizar, completar o objeto — o título é o que se afirma.)

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run __tests__/components/CentralControle.test.tsx`
Expected: os 2 novos FALHAM (o alerta some; a fila fica `aria-busy="true"`). Os existentes seguem verdes.

- [ ] **Passo 3: implementar** conforme **Interfaces**; o teste existente "trocar de org volta os
cartões ao esqueleto" e "resposta atrasada da org anterior…" continuam valendo.

- [ ] **Passo 4: rodar e ver passar** (mesmo comando) — Expected: tudo verde.

- [ ] **Passo 5: commit** — `fix(central): Atualizar no plano B troca cada fonte de alerta só quando ela chega`

---

### Tarefa 3: o caixa espera só a chamada única

Hoje o efeito do caixa espera `carregando === false`, que no plano B só chega depois dos 6 blocos
(até ~16 s com um bloco lento).

**Arquivos:**
- Modificar: `components/CentralControle.tsx`
- Teste: `__tests__/components/CentralControle.test.tsx`

**Interfaces:** novo estado `const [esperandoChamadaUnica, setEsperandoChamadaUnica] = React.useState(true)`.
`load` põe `true` no início e `false` logo após o `Promise.allSettled([bootstrap, reajustes, config])`
(depois do `if (!vale()) return`). O efeito do caixa troca `carregando` por `esperandoChamadaUnica`
(na condição e nas dependências). `carregando` continua comandando o Atualizar e a animação.

- [ ] **Passo 1: teste que falha**
```ts
it('plano B: o caixa sai junto com os blocos, sem esperar o mais lento', async () => {
    bootstrap.mockRejectedValue(TIMEOUT);
    fontesSeparadas.mockImplementation(() => fontes({ scorecards: nunca }));
    montar();
    await waitFor(() => expect(fontesSeparadas).toHaveBeenCalled());
    await waitFor(() => expect(cashflow).toHaveBeenCalledTimes(1));
});
```

- [ ] **Passo 2: rodar e ver falhar** — `npx vitest run __tests__/components/CentralControle.test.tsx`
Expected: o novo FALHA (`cashflow` 0 vezes); "o caixa só é buscado depois que o bootstrap responde" segue verde.

- [ ] **Passo 3: implementar** conforme **Interfaces**; atualizar o comentário do efeito do caixa.

- [ ] **Passo 4: rodar e ver passar** — Expected: tudo verde.

- [ ] **Passo 5: commit** — `fix(central): caixa não espera os blocos do plano B`

---

### Tarefa 4: plano B pegajoso — 5 minutos por organização

**Arquivos:**
- Criar: `utils/planoBPegajoso.ts`
- Modificar: `components/CentralControle.tsx` (`load`)
- Testes: criar `__tests__/planoBPegajoso.test.ts`; `__tests__/components/CentralControle.test.tsx`

**Interfaces:**
```ts
export const PLANO_B_PEGAJOSO_MS = 5 * 60 * 1000;
export interface MemoriaDoPlanoB {
    marcarQueCaiu(organizationId: string | null): void;
    pularChamadaUnica(organizationId: string | null): boolean; // true = ir direto aos blocos
    esquecer(): void;                                          // zera tudo (testes)
}
export function criarMemoriaDoPlanoB(agora?: () => number): MemoriaDoPlanoB; // padrão Date.now
export const memoriaDoPlanoB: MemoriaDoPlanoB; // a da aba
```
Chave `null` ("Todas") distinta de qualquer id. Vence em `agora() >= marcado + PLANO_B_PEGAJOSO_MS`.

Em `load`: `const pular = memoriaDoPlanoB.pularChamadaUnica(organizationId)`; no lugar do
`bootstrap(...)` no `allSettled`, `pular ? Promise.reject(new Error('plano B pegajoso')) : bootstrap(...)`.
Se o bootstrap foi chamado e rejeitou: `memoriaDoPlanoB.marcarQueCaiu(organizationId)` **antes** do
`if (!vale()) return` (a falha é real mesmo com a carga descartada). O `console.error` "chamada única
caiu" só quando ela foi de fato chamada.

- [ ] **Passo 1: testes que falham**

`__tests__/planoBPegajoso.test.ts` (relógio injetado `let t = 0; const m = criarMemoriaDoPlanoB(() => t)`):
- `'sem queda, não pula'` → `pularChamadaUnica('o1') === false`
- `'caiu: pula por 5 minutos, depois volta a tentar'` → marca em t=0; t=PLANO_B_PEGAJOSO_MS-1 → `true`; t=PLANO_B_PEGAJOSO_MS → `false`
- `'é por organização: "Todas" e o1 não se misturam'` → marca `null`; `pularChamadaUnica('o1') === false`, `pularChamadaUnica(null) === true`
- `'esquecer zera'` → marca `'o1'`, `esquecer()`, `pularChamadaUnica('o1') === false`

`__tests__/components/CentralControle.test.tsx` — `beforeEach` ganha `memoriaDoPlanoB.esquecer()`:
```ts
it('plano B pegajoso: depois de cair, o Atualizar vai direto aos blocos', async () => {
    bootstrap.mockRejectedValue(TIMEOUT);
    fontesSeparadas.mockImplementation(() => fontes());
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledTimes(2));
    expect(bootstrap).toHaveBeenCalledTimes(1);
});
it('plano B pegajoso: passados 5 minutos, volta a tentar a chamada única', async () => {
    const agora = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    bootstrap.mockRejectedValueOnce(TIMEOUT).mockResolvedValue(painel());
    fontesSeparadas.mockImplementation(() => fontes());
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' })).toBeEnabled());
    agora.mockReturnValue(1_000_000 + PLANO_B_PEGAJOSO_MS);
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(bootstrap).toHaveBeenCalledTimes(2));
    expect(fontesSeparadas).toHaveBeenCalledTimes(1);
    agora.mockRestore();
});
it('plano B pegajoso é por organização: a outra org tenta a chamada única', async () => {
    bootstrap.mockRejectedValueOnce(TIMEOUT).mockResolvedValue(painel());
    fontesSeparadas.mockImplementation(() => fontes());
    const { rerender } = montar();
    await waitFor(() => expect(fontesSeparadas).toHaveBeenCalledWith('o1'));
    rerender(<CentralControle organizationId="o2" userEmail="ana@alpa.com.br" onNavigate={vi.fn()} />);
    await waitFor(() => expect(bootstrap).toHaveBeenCalledWith('o2'));
    expect(fontesSeparadas).toHaveBeenCalledTimes(1);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npx vitest run __tests__/planoBPegajoso.test.ts __tests__/components/CentralControle.test.tsx`
Expected: unitários FALHAM (módulo não existe); "depois de cair, o Atualizar vai direto aos blocos"
FALHA (`bootstrap` 2 vezes). Os outros dois podem já passar (comportamento de hoje) — são as travas
do pegajoso não vazar.

- [ ] **Passo 3: implementar** conforme **Interfaces**.

- [ ] **Passo 4: rodar e ver passar** — Expected: tudo verde.

- [ ] **Passo 5: commit** — `feat(central): plano B pegajoso — 5 min por organização sem a chamada única`

---

### Tarefa 5: verificar, publicar e provar na tela

- [ ] `npm run typecheck` → ler `exit=` por grep (memória `feedback_tsc_exit_le_por_grep_nao_pelo_tail`).
- [ ] Suíte inteira (`npx vitest run`), conferindo falhas contra `project_suite_local_windows_falhas_que_nao_sao_da_frente`.
- [ ] Revisão final da branch (revisor novo, modelo mais capaz).
- [ ] PR → CI verde → merge → `conferir-producao.sh` → CI da `main`.
- [ ] Prova em produção com o desvio de `fetch` (`reference_prova_falha_de_rpc_em_producao_desvio_fetch`):
  chamada única + Obras caindo → Atualizar não pede a chamada única de novo, o caixa aparece antes
  de Obras dizer "Não carregou.", e a lista de alertas não encolhe.

## Estado

- [ ] Tarefa 1 · [ ] Tarefa 2 · [ ] Tarefa 3 · [ ] Tarefa 4 · [ ] Tarefa 5
