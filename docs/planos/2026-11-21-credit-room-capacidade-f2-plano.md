# Credit Room · Capacidade de Pagamento — F2 (abas Capacidade e Empreendimentos + estresse + conferência antes de congelar) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Pedido original

Sessão 2961426b (21/11/2026):

> Portal de Crédito: A ideia é criar uma nova funcionalidade que seria a de demonstrar a capacidade de pagamento para preitear um emprestimo. neste sentido e ideia e conectar com os módulos comercial (vendas de unidades e locacao), listar os empreendimentos, os contratos de venda ou locacao, consolidar a renda mensal e um dashboard completo. mostrar as fotos dos imoveis. sugira mais funcionalidades

22/11/2026, após a F1 no ar (PR #644), perguntado "Se quiser, começo a Parte 2": **"Sim"**.

**Goal:** Mostrar ao time interno e ao banco o que a F1 já congela em cada versão — renda mês a mês, valor máximo do empréstimo, estresse ao vivo, qualidade da renda, alertas, empreendimentos com fotos e a carteira de contratos mascarada — e conferir os alertas ANTES de congelar.

**Architecture:** Tudo lê a versão congelada (`version.snapshot.capacidade/qualidade/empreendimentos/contratos`), nunca dado vivo. Contas novas ficam puras em `utils/creditCapacity.ts` e `utils/creditRoomProvenance.ts`; duas telas novas compartilhadas por app e portal com prop `accent` (§24); `freezeVersion` se divide em `prepararVersao` (lê e monta) + gravação, para a conferência mostrar exatamente o que será gravado.

**Tech Stack:** React 19 + TS, Recharts, Vitest.

**Spec:** `docs/planos/2026-11-21-credit-room-capacidade.md` (§4 estresse, §5 conferência, §6 UI) · plano F1 `docs/planos/2026-11-21-credit-room-capacidade-f1-plano.md`.

## Global Constraints
- Ler e obedecer `CLAUDE.md` desta frente; tela editada → ler `docs/ui_ux_guia_unificado.md` INTEIRO antes e rodar `bash scripts/check-ui-standard.sh <arquivo>` em cada `.tsx` tocado depois (REGRA #1). Painel novo = `Sheet` (REGRA #4, `UI_PATTERNS.md`).
- "Dado ausente ≠ zero": bloco `null`/ausente → "—" ou frase explicando; nunca 0 nem gráfico zerado (§28.5).
- Versão schema 1 (sem `capacidade`) abre sem erro nas abas novas, com estado vazio que diz "versão congelada antes da capacidade de pagamento — congele uma nova".
- Nome de cliente nunca aparece: só `rotulo` do snapshot ("Comprador 01").
- Componente compartilhado app/portal: UM componente, prop `accent: 'indigo' | 'portal'` (padrão `indigo`), mapa `ACCENTS` escrito por extenso; portal usa primitivas de `components/portal/PortalKit.tsx` (`PortalCard`, `KpiStrip`, `CardHeader`, `Th`, `Td`, `PortalEmpty`) — sem hex coral à mão fora do mapa.
- Gráficos (§28): uma escala Y só (R$, compacta `R$ 12 mil`); barras ≤ 24px, raio 4 na ponta; grade `#f1f5f9` sólida; legenda HTML acima; `role="img"` + `aria-label` com os números; `accessibilityLayer={false}`; sem animação ao trocar cenário.
- Paleta (validada 22/11 com `validate_palette.js`, ALL PASS): **interno** vendas `#3b82f6` · aluguéis `#d97706`; **portal** vendas `#E1553C` · aluguéis `#2563eb`; serviço da dívida = linha 2px `#1e293b` nas duas (forma diferente + legenda). Registrar na tabela do §28.4 do guia.
- Mês exibido de `'AAAA-MM'` sem `new Date('AAAA-MM-DD')` cru (fuso UTC-3) — formatar por split da string.
- Sem migration, sem RPC, sem Edge Function nesta fase.

## Review Focus
1. **Cenário Base do estresse ≠ número congelado.** `estresseDaVersao(c, Base)` precisa devolver exatamente `c.capacidade_maxima` e o DSCR mínimo dos 12 primeiros meses — senão o banco vê dois valores máximos diferentes. Teste na Task 1.
2. **Fluxo não elegível no estresse.** Operação com só `noi` marcado: estressar vendas não pode mudar nada. Teste na Task 1.
3. **Versão schema 1 / `capacidade: null`** nas duas abas → estado vazio explicado, sem exceção. Teste na Task 1 (`resumoDaCapacidade(null)`) e conferência visual na Task 6.
4. **Conferência com data-base trocada depois de conferir** → a versão preparada é descartada; "Congelar" exige conferir de novo. Task 5.
5. **Série com DSCR `null` em todo mês** (sem dívida e sem proposta) → KPIs "—", não `Infinity`/0. Teste na Task 1.

---

### Task 1: Contas puras da tela (resumo, estresse, alertas, proveniência)

**Files:**
- Modify: `utils/creditCapacity.ts`, `utils/creditRoomProvenance.ts`
- Test: `__tests__/creditCapacity.test.ts`, `__tests__/creditRoomProvenance.test.ts`

**Interfaces:**
- Consumes: `aplicarEstresse`, `capacidadeMaxima`, `CENARIOS_ESTRESSE`, `CenarioEstresse`, `FluxosElegiveis`, `TipoAlerta` (já em `utils/creditCapacity.ts`); `SnapshotCapacidade`, `CreditRoomSnapshot`, `CreditRoomIndicators` (`utils/creditRoomSnapshot.ts`).
- Produces:

```ts
// utils/creditCapacity.ts
export function fluxosDaOperacao(s: CreditRoomSnapshot): FluxosElegiveis; // { vendas: eligible_flows.receivables, alugueis: eligible_flows.noi }
export interface ResumoCapacidade {
  renda_liquida_media_12m: number | null;  // média de renda_liquida dos 12 primeiros meses
  dscr_minimo_12m: number | null;          // menor dscr não-nulo dos 12 primeiros
  folga_minima_12m: number | null;         // menor folga dos 12 primeiros
  mes_folga_minima: string | null;         // 'AAAA-MM' dela
  meses_folga_negativa: number;            // no horizonte inteiro
}
export function resumoDaCapacidade(c: SnapshotCapacidade | null | undefined): ResumoCapacidade | null;
export function estresseDaVersao(
  c: SnapshotCapacidade, cenario: CenarioEstresse, fluxos: FluxosElegiveis,
): ReturnType<typeof aplicarEstresse> & { capacidade_maxima: { parcela_maxima: number; valor_maximo: number } };
export const ALERTA_PT: Record<TipoAlerta, { titulo: string; comoResolver: string }>;
export function rotuloDoMes(mes: string): string; // '2026-12' → 'dez/26'

// utils/creditRoomProvenance.ts — IndicadorKey ganha:
//   'renda_liquida_media' | 'dscr_minimo_12m' | 'capacidade_maxima' | 'folga_minima'
```

- [ ] **Step 1: Testes que falham** (`creditCapacity.test.ts`, bloco `describe('tela da capacidade')`), sobre uma `SnapshotCapacidade` montada com `montarCapacidade` de fixture já existente no arquivo:
  - `estresseDaVersao(c, CENARIOS_ESTRESSE[0], fluxos).capacidade_maxima` `toEqual(c.capacidade_maxima)` e `.dscr_minimo_12m` igual a `resumoDaCapacidade(c).dscr_minimo_12m`.
  - Severo reduz `valor_maximo` (`<` o Base) e não muda `servico_atual` de nenhum mês.
  - Com `fluxos = { vendas: false, alugueis: true }`, mudar só `distrato_pct` de 0 para 50 dá o mesmo `valor_maximo`.
  - `resumoDaCapacidade(null)` → `null`; série sem serviço (todo `dscr` `null`) → `dscr_minimo_12m: null`, `renda_liquida_media_12m` numérica.
  - `rotuloDoMes('2026-12') === 'dez/26'`, `rotuloDoMes('2027-01') === 'jan/27'`.
  - `Object.keys(ALERTA_PT)` cobre os 4 `TipoAlerta`; `VENDA_SEM_PARCELAS.comoResolver` contém `'Gerar parcelas'`.
- [ ] **Step 2:** `npx vitest run __tests__/creditCapacity.test.ts` → FAIL (não definidos).
- [ ] **Step 3: Implementar.** `estresseDaVersao` chama `aplicarEstresse(c.serie, cenario, fluxos)` e `capacidadeMaxima(estressada.serie, c.parametros, \`${c.serie[0].mes}-01\`)` — é o mesmo 1º vencimento que `primeiroVencimentoSimulado` usou no congelamento (dia 1 do mês seguinte à data-base = 1º mês da série); série vazia → `{ parcela_maxima: 0, valor_maximo: 0 }`. Percentuais do cenário presos em 0–100. `ALERTA_PT.VENDA_SEM_PARCELAS.comoResolver`: "Abra o contrato da venda em Comercial › Contratos › Financeiro › Parcelas e use Gerar parcelas."; os outros três dizem o que corrigir no cadastro (data de término / valor do aluguel / empreendimento do título).
- [ ] **Step 4: Proveniência.** Testes em `creditRoomProvenance.test.ts`: para snapshot schema 2 de fixture, `explicarIndicador('capacidade_maxima', s, i)` tem `resultado.valor === s.capacidade.capacidade_maxima.valor_maximo`, fórmula mencionando "mês a mês" e termos com DSCR mínimo, taxa, prazo, carência e sistema dos `parametros`; `'dscr_minimo_12m'` e `'renda_liquida_media'` batem com `resumoDaCapacidade`; com `capacidade` ausente (schema 1) as quatro chaves devolvem `resultado.valor: null` e uma ressalva "versão congelada antes da capacidade de pagamento". Implementar os 4 `case`.
- [ ] **Step 5:** `npx vitest run __tests__/creditCapacity.test.ts __tests__/creditRoomProvenance.test.ts __tests__/creditRoomSnapshot.test.ts` → PASS.
- [ ] **Step 6: Commit** `feat(credit-room): contas da tela de capacidade (resumo, estresse da versão, alertas, proveniência)`.

### Task 2: `prepararVersao` — congelar em dois passos

**Files:**
- Modify: `services/creditRoomService.ts` (`freezeVersion`, ~linhas 925–1146)

**Interfaces:**
- Produces:

```ts
export interface VersaoPreparada {
  roomId: string; dataBase: string;
  snapshot: CreditRoomSnapshot; indicators: CreditRoomIndicators;
}
// em creditRoomService:
prepararVersao(room: CreditRoom, dataBase?: string): Promise<VersaoPreparada>;
freezeVersion(room: CreditRoom, opts?: { label?: string; notes?: string; dataBase?: string }, preparada?: VersaoPreparada): Promise<CreditRoomVersion>;
```

- [ ] **Step 1:** Mover para `prepararVersao` tudo de `freezeVersion` até `computeIndicators(snapshot)` inclusive (escopo, `exigirMembroDeTodas`, coleta, montagem), sem mudar a ordem nem as regras. `freezeVersion` passa a: usar `preparada` se `preparada.roomId === room.id && preparada.dataBase === (opts.dataBase ?? hoje)`; senão chamar `prepararVersao`; depois numerar, inserir, ativar e logar como hoje.
- [ ] **Step 2:** `npx tsc --noEmit -p .` → ler o exit por `grep` (memória `feedback_tsc_exit_le_por_grep_nao_pelo_tail`), 0 erros novos; `npx vitest run __tests__/creditRoomSnapshot.test.ts __tests__/orgContextGuard.test.ts` → PASS.
- [ ] **Step 3: Commit** `refactor(credit-room): freezeVersion em prepararVersao + gravação`.

### Task 3: Aba "Capacidade de pagamento" (`components/credit/CreditRoomCapacity.tsx`)

**Files:**
- Create: `components/credit/CreditRoomCapacity.tsx`
- Modify: `docs/ui_ux_guia_unificado.md` (§28.4: linha nova da paleta)

**Interfaces:**
- Consumes: Task 1 (`resumoDaCapacidade`, `estresseDaVersao`, `fluxosDaOperacao`, `ALERTA_PT`, `rotuloDoMes`, `CENARIOS_ESTRESSE`), `explicarIndicador` + painel de proveniência (extrair `PainelProveniencia` de `CreditRoomIndicators.tsx` para export nomeado e reusar — não duplicar).
- Produces: `export default function CreditRoomCapacity(props: { version: CreditRoomVersion; accent?: 'indigo' | 'portal' })`.

Conteúdo, de cima para baixo (tudo da `version`):
1. **KPIs** (interno `KpiCardCompact` como em `CreditRoomIndicators`; portal `KpiStrip`), cada um clicável abrindo a proveniência: Valor máximo do empréstimo (`sub`: parcela máxima + "DSCR ≥ x,xx×"), Renda líquida média 12m, DSCR mínimo 12m, Folga mínima 12m (`sub`: mês). Rodapé curto: "Contratado, sem reajuste · data-base dd/mm/aaaa · escopo Empresa|Grupo (n empresas)".
2. **Mês a mês** (card §28.2, altura 260): `ComposedChart` com `Bar` vendas + `Bar` aluguéis empilhadas (`stackId`), `Line` "Serviço da dívida" = `servico_atual + servico_novo`, todos os meses do horizonte; tooltip com vendas, aluguéis, despesa, renda líquida, serviço, folga, DSCR. Legenda HTML. Barras do fluxo NÃO elegível ficam fora (a série guarda o bruto; mostrar só o que entra no DSCR, e dizer no subtítulo qual fluxo ficou de fora). Abaixo, botão-texto "Ver tabela" que abre/fecha tabela mês a mês (mesmas colunas do tooltip) — é a vista acessível.
3. **Teste de estresse**: 3 botões de cenário (Base/Moderado/Severo, §5.3) + 3 campos numéricos h-9 (inadimplência, vacância, distrato, 0–100, %) que partem do cenário escolhido; resultado em 3 números (valor máximo, DSCR mínimo 12m, meses com folga negativa) com a diferença para o Base; a linha "renda estressada" sobreposta no gráfico só quando cenário ≠ Base. Estado local, nada grava. Portal: também funciona (o banco mexe).
4. **Recebido nos últimos 12 meses** (colunas empilhadas vendas/aluguéis, mesmas cores) + total; ≤ 2 meses com valor → lista (§28.5).
5. **Estoque a vender** (card): VGV disponível, haircut, valor elegível, com a frase "não entra no DSCR — potencial de venda/garantia". `estoque: null` → frase.
6. **Qualidade da renda** (card dl): concentração top-5, WALE (anos), locações com prazo indeterminado, pontualidade 12m, vencido na data-base.
7. **Alertas da carteira**: lista com ícone + `ALERTA_PT[tipo].titulo`, qtd, valor e `comoResolver` (no portal, só título/qtd/valor — o "como resolver" é interno). Sem alertas → "Carteira sem pendências de cadastro".
8. **GRUPO**: tabela "Por empresa" de `por_organizacao` (nome vindo de `snapshot.escopo.organizacoes`), só quando `escopo.tipo === 'GRUPO'`.

- [ ] **Step 1:** Implementar; `capacidade` ausente → estado vazio §12/`PortalEmpty` com o texto do Global Constraints.
- [ ] **Step 2:** Atualizar §28.4 do guia com a paleta do Global Constraints.
- [ ] **Step 3:** `bash scripts/check-ui-standard.sh components/credit/CreditRoomCapacity.tsx components/credit/CreditRoomIndicators.tsx` → exit 0 (achados do vocabulário de portal: citar §24, não "corrigir"); tsc sem erro novo.
- [ ] **Step 4: Commit** `feat(credit-room): aba Capacidade de pagamento (mês a mês, estresse, qualidade, alertas)`.

### Task 4: Aba "Empreendimentos e contratos" (`components/credit/CreditRoomEmpreendimentos.tsx`)

**Files:**
- Create: `components/credit/CreditRoomEmpreendimentos.tsx`

**Interfaces:**
- Produces: `export default function CreditRoomEmpreendimentos(props: { version: CreditRoomVersion; accent?: 'indigo' | 'portal' })`.

- [ ] **Step 1: Cards** (grade 1/2/3 colunas) por `snapshot.empreendimentos`: capa (`aspect-[16/9] object-cover`, sem capa → bloco cinza com ícone e "sem foto cadastrada"), nome, cidade/UF, objetivo, unidades (total · vendidas · alugadas · disponíveis), VGV vendido/disponível, renda do mês. Clicar no card abre `Sheet` com a galeria (`components/investor/PhotoGallery.tsx`, só leitura — sem `onDelete`) e os contratos daquele empreendimento.
- [ ] **Step 2: Tabela de contratos** de `snapshot.contratos`: interno `StandardTable` (`storageKey="creditRoom:contratos"`, busca por rótulo/unidade/empreendimento, filtro Venda/Locação em `filters`, colunas Contrato (rótulo) · Tipo · Empreendimento · Unidade · Valor do contrato · Parcela/aluguel mensal · Saldo a receber · Vencido · 1º venc. · Último venc. · Situação; `totaisPorColuna` nos valores); portal: tabela com `Th`/`Td` do kit e o mesmo filtro em `PortalTabs`. Contrato `tem_parcelas: false` mostra "sem parcelas geradas" na coluna Situação (texto âmbar §8, sem pílula no interno). **Sem coluna "Documentos"** (vai para a F3, ver Decisões).
- [ ] **Step 3:** `empreendimentos`/`contratos` ausentes → estado vazio explicado.
- [ ] **Step 4:** `bash scripts/check-ui-standard.sh components/credit/CreditRoomEmpreendimentos.tsx` → exit 0; tsc sem erro novo.
- [ ] **Step 5: Commit** `feat(credit-room): aba Empreendimentos e contratos (fotos, carteira mascarada)`.

### Task 5: Ligar as abas + conferência antes de congelar

**Files:**
- Modify: `components/credit/CreditRoomDetail.tsx`, `components/credit/portal/LenderPortal.tsx`

- [ ] **Step 1: Interno.** Abas novas `capacidade` ("Capacidade de pagamento") e `empreendimentos` ("Empreendimentos e contratos") logo depois de "Visão", com subtítulo em `ABA_SUBTITULO`; mostram a mesma versão da Visão (`ativa`); sem versão → o mesmo estado vazio da Visão.
- [ ] **Step 2: Portal.** As mesmas duas abas depois de "Visão geral" (ícones `TrendingUp`, `Building2`), versão ativa; o `log('VIEW','tab', aba)` já cobre. Barra inferior do celular com 10 abas: vira rolagem horizontal (`overflow-x-auto`, itens `min-w-[72px] flex-none`) em vez de espremer.
- [ ] **Step 3: Conferência no `CongelarSheet`.** Passo 1 "Conferir" chama `prepararVersao(room, dataBase)` e mostra: valor máximo, DSCR mínimo 12m, renda líquida média, os alertas com `comoResolver`, e quais blocos vieram `null` ("sem dado nesta versão: …"). Passo 2 "Congelar" chama `freezeVersion(room, opts, preparada)`. Mudar a data-base descarta a preparada (botão volta a "Conferir"). Botão desabilitado sempre diz o motivo (`title`). Erro do `prepararVersao` (ex.: não-membro do grupo) aparece no Sheet.
- [ ] **Step 4:** `bash scripts/check-ui-standard.sh components/credit/CreditRoomDetail.tsx components/credit/portal/LenderPortal.tsx`; `npx vitest run __tests__/orgContextGuard.test.ts`; tsc.
- [ ] **Step 5: Commit** `feat(credit-room): abas de capacidade no room e no portal + conferência antes de congelar`.

### Task 6: Prova na tela e PR

- [ ] **Step 1:** Vite da frente (porta livre, ex. 3118) + Playwright com o perfil `c:/tmp/pwtest/perfil-planej-local` (Desenvolvedor). Abrir CR-00001 (Garden): a V3 schema 1 mostra o estado vazio nas abas novas sem erro de console. **Não congelar no CR-00001 sem OK do usuário**; para ver uma versão schema 2 de verdade, criar room de teste "TESTE — capacidade F2 (não usar)", Conferir → ver alertas → Congelar, e abrir as duas abas; screenshot de cada uma, estresse Severo mudando o valor máximo, galeria do Garden abrindo.
- [ ] **Step 2:** Conferir que o valor máximo da aba = o do Conferir = `indicators`/`snapshot.capacidade.capacidade_maxima` da linha gravada (`db query --linked`).
- [ ] **Step 3:** Portal: não há credor de teste com MFA nesta máquina sem o usuário — renderizar `CreditRoomCapacity`/`CreditRoomEmpreendimentos` com `accent="portal"` numa página de prova do vite (ou declarar explicitamente que o portal não foi visto logado).
- [ ] **Step 4:** Excluir o room de teste só com OK explícito do usuário (trava de imutabilidade — script da F1). PR com skill `pr`, CI verde (conferir pesados-quais), merge, `scripts/conferir-producao.sh`, CI da main.

## Decisões tomadas por mim (conferir)
- **Coluna "Documentos" da carteira → F3.** `CreditRoomDocument` não liga documento a contrato hoje; essa ligação nasce com "Sugerir documentos" (F3). Custo se errado: a coluna chega uma fase depois.
- **"Atalho para Gerar parcelas" = o caminho em texto**, não um link: o app não tem link direto para uma venda específica. Custo se errado: o usuário procura as 2 vendas à mão.
- **Estresse:** 3 cenários prontos + 3 campos livres (0–100%). Nada grava; o banco também pode mexer.
- **Conferência reusa a versão preparada** (não lê duas vezes): o que o usuário confere é o que grava. Se demorar para congelar, a leitura é a do momento do "Conferir".
- **Gráfico mostra só o fluxo elegível** (o que entra no DSCR); o subtítulo diz o que ficou de fora.
