# Credit Room — Prévia ao vivo no lado interno; congelar = "Liberar para a instituição" — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Pedido original

Sessão 2961426b, 22/11/2026, depois do relato "Empreendimentos na capacidade — mesmo selecionando alguns empreendimentos a aba empreendimentos e contratos ainda mostra todos" (causa: a aba mostra a versão congelada; a seleção foi salva depois):

> vamos discutir essa funcionalidade de congelar funcao. Da forma que esta, esta atrapalhando o uso.
> Congelar versão é a ultima etapa apenas um marco para liberação para a instituicao e não um pré requisito para inicio de qualquer ajuste ou simulacao. Analise isso

> qual a necessidade de congelamento?

Resposta: o congelamento só é necessário na fronteira com o banco (número fixo durante a análise, prova do que foi apresentado, banco nunca toca dado operacional, portal e book iguais) — no lado interno nenhum desses motivos vale. Proposta: prévia ao vivo no interno, congelar só para liberar.

> sim

**Goal:** No lado interno do Credit Room, as abas Visão, Capacidade de pagamento e Empreendimentos e contratos mostram a **prévia de hoje** (calculada ao vivo, sem gravar); parâmetros da capacidade são simulados na própria aba; "Congelar versão" vira **"Liberar para a instituição"** — o marco final que grava a prévia como V{n}. O lado do banco não muda.

**Architecture:** A prévia é o `VersaoPreparada` que já existe (`creditRoomService.prepararVersao`, lê tudo e não grava) embrulhado como uma "versão" de tela; os três componentes de aba continuam recebendo `version` e ganham só o texto de prévia. Simulação de parâmetros = util puro sobre a série da prévia (sem reler o banco). Liberar = `freezeVersion(room, opts, previa)` — grava exatamente a prévia que está na tela. Sem migration, sem RPC, sem Edge.

**Tech Stack:** React 19 + TS, Vitest.

**Spec:** este arquivo + `docs/planos/2026-11-21-credit-room-capacidade.md` (o que a versão guarda).

## Global Constraints
- Ler e obedecer `CLAUDE.md`; tela editada → `docs/ui_ux_guia_unificado.md` inteiro antes, `bash scripts/check-ui-standard.sh <arquivo>` depois; `<label>` = `text-xs font-semibold text-slate-500` literal; botão desabilitado diz o motivo.
- **O banco (portal do credor) continua vendo SÓ versões liberadas** — nada da prévia chega ao portal, ao log do credor nem ao book do credor.
- **Versões liberadas continuam imutáveis**; nada aqui apaga ou altera versão.
- A prévia **nunca grava** (nem versão, nem log de FREEZE); só "Liberar" grava.
- Covenants continuam apurados sobre a versão **liberada** ativa (é o número oficial do contrato).
- "Dado ausente ≠ zero"; sem `new Date('AAAA-MM-DD')` cru.

## Review Focus
1. **Liberar grava exatamente a prévia que está na tela** — se o cadastro mudou depois da prévia (room salvo), a prévia é recalculada antes; nunca se libera prévia velha. Task 2.
2. **Escopo GRUPO sem acesso a todas as empresas** → a prévia mostra o erro ("você não é membro de …") e as versões liberadas continuam selecionáveis. Task 2.
3. **Room sem nenhuma versão liberada** → as abas funcionam (prévia), e o portal do banco continua dizendo "a empresa ainda não liberou uma versão". Task 2.
4. **Simulação de parâmetros com proposta de dívida vinculada** (cronograma real) → o serviço novo vem da proposta e NÃO é refeito com os parâmetros simulados; sem proposta, é refeito com `buildSchedule`. Task 1.
5. **Book interno gerado da prévia** sai marcado "PRÉVIA — não liberada à instituição" em todas as páginas. Task 4.

---

### Task 1: Contas puras — prévia como versão, simulação, comparação

**Files:** Create `utils/creditRoomPrevia.ts` + `__tests__/creditRoomPrevia.test.ts`. Trazer `utils/creditRoomVersaoDesatualizada.ts` (+ teste) do PR #655 (fechado sem merge) para comparar o cadastro com a última liberada.

**Interfaces (Produces):**
```ts
export const ID_DA_PREVIA = 'previa';
/** Embrulha a VersaoPreparada como CreditRoomVersion de tela (versionNo 0, label 'Prévia', frozenAt = calculada em). */
export function versaoDaPrevia(p: VersaoPreparada, calculadaEm: string): CreditRoomVersion;
export const ehPrevia = (v: CreditRoomVersion | null | undefined): boolean;
/** Recalcula a capacidade com parâmetros simulados, sem reler o banco. */
export function simularParametros(
  c: SnapshotCapacidade, p: ParametrosCapacidade,
  ctx: { requestedAmount: number; temProposta: boolean },
): SnapshotCapacidade;   // nova série (servico_novo refeito só sem proposta), capacidade_maxima e parametros
/** Diferença de números entre a prévia e a última liberada (para o aviso e o "Liberar"). */
export function compararComLiberada(previa: CreditRoomVersion, liberada: CreditRoomVersion | null):
  { campo: 'valor_maximo' | 'dscr_minimo_12m' | 'renda_liquida_media_12m' | 'n_empreendimentos' | 'n_contratos'; antes: number | null; depois: number | null }[];
```
- [ ] **Step 1 (testes que falham):** `versaoDaPrevia` mantém snapshot/indicators e `ehPrevia` = true; `simularParametros` com os MESMOS parâmetros devolve a mesma `capacidade_maxima` e série (identidade); taxa maior → valor máximo menor; prazo maior → maior; **com proposta** o `servico_novo` de cada mês não muda; **sem proposta** muda e o 1º vencimento é o 1º mês da série; `compararComLiberada` sem liberada → todos `antes: null`; com liberada igual → lista vazia.
- [ ] **Step 2:** Implementar reutilizando `capacidadeMaxima`, `buildSchedule`, `montarMes`-equivalente via `aplicarEstresse` com cenário Base (ou exportar `montarMes`), `resumoDaCapacidade`. Nada de Supabase.
- [ ] **Step 3:** testes verdes + tsc. Commit `feat(credit-room): contas da prévia (versão de tela, simulação de parâmetros, comparação com a liberada)`.

### Task 2: Detalhe interno — prévia por padrão, seletor, "Liberar para a instituição"

**Files:** Modify `components/credit/CreditRoomDetail.tsx` (+ os 3 componentes de aba só no texto de prévia: `CreditRoomIndicators`, `CreditRoomCapacity`, `CreditRoomEmpreendimentos` aceitam a versão de prévia e dizem "Prévia de hoje — calculada às hh:mm, ainda não liberada à instituição" onde hoje dizem "versão V{n} congelada em…").

- [ ] **Step 1: Prévia.** Ao abrir uma das 3 abas, calcula `prepararVersao(room, hoje)` uma vez (esqueleto §28.5 enquanto calcula; erro com "Tentar de novo"); guarda em estado com a hora; botão "Atualizar prévia". Room salvo pelo formulário (`onChanged` com `updatedAt` novo) → prévia descartada e recalculada ao voltar à aba.
- [ ] **Step 2: Seletor de visão** na barra de status (§5.3): "Prévia (hoje)" (padrão) · "V{n} — liberada em dd/mm" para cada versão. Visão liberada = como hoje (somente leitura). Sem versão liberada, o seletor mostra só a prévia.
- [ ] **Step 3: Comparação.** Na prévia, faixa discreta "Desde a V{n} liberada: valor máximo R$ X → R$ Y; …; cadastro: empreendimentos, parâmetros" (`compararComLiberada` + `mudancasDesdeAVersao`); sem liberada: "Ainda não liberada à instituição".
- [ ] **Step 4: Liberar.** Botão primário "Liberar para a instituição" (era "Congelar versão"). O Sheet deixa de ter o passo "Conferir" separado: mostra o resumo DA PRÉVIA que está na tela (valor máximo, DSCR, alertas, blocos sem dado, comparação com a última liberada), rótulo/data-base/notas, e "Liberar V{n}". Data-base diferente da prévia → recalcula a prévia para aquela data antes de liberar (reusa a guarda de geração atual). Grava com `freezeVersion(room, opts, previa)`; depois, a visão volta para a prévia e a aba Versões mostra a nova.
- [ ] **Step 5:** Textos: aba "Versões" → subtítulo "Versões liberadas à instituição. Cada uma preserva a posição da data em que foi liberada."; Visão sem versão deixa de mostrar "Nenhuma versão congelada" (mostra a prévia). Covenants continuam com a liberada ativa.
- [ ] **Step 6:** Testes de tela (mocks de service): abre na prévia sem gravar nada (`freezeVersion` não chamado); seletor troca para V1; "Atualizar prévia" recalcula; erro de GRUPO na prévia com V1 ainda selecionável; Liberar chama `freezeVersion` com o MESMO objeto da prévia; room salvo descarta a prévia. `check-ui-standard`, travas `*Guard*`, tsc. Commit `feat(credit-room): prévia de hoje no lado interno e "Liberar para a instituição"`.

### Task 3: Simulação de parâmetros na aba Capacidade

**Files:** Modify `components/credit/CreditRoomCapacity.tsx` (só no modo prévia + interno).

- [ ] **Step 1:** Painel "Simular parâmetros" (DSCR mínimo, taxa mensal, prazo, carência, sistema, haircut) com os valores do room; mudar recalcula na hora com `simularParametros` (KPIs, gráfico e estresse usam a capacidade simulada); marcador "simulado — não salvo"; "Voltar aos do room"; "Salvar no room" → `creditRoomService.update(room, { parametrosCapacidade })` → prévia recalculada. Prazo/carência que vêm da operação aparecem travados com o motivo (mesma regra do formulário: `prazoVemDaOperacao`/`carenciaVemDaOperacao`).
- [ ] **Step 2:** Versão liberada e portal: painel não aparece. Testes: simular muda o valor máximo sem chamar service; salvar chama `update` com os parâmetros; com proposta vinculada, aviso "o serviço novo vem da proposta vinculada". Commit `feat(credit-room): simulação de parâmetros na prévia`.

### Task 4: Book da prévia, prova e PR
- [ ] **Step 1:** Book interno gera da visão selecionada; da prévia → marca "PRÉVIA — não liberada à instituição" em todas as páginas e nome `book-{code}-previa-AAAA-MM-DD.pdf`; da liberada → como hoje. Portal: inalterado (só liberada). Teste.
- [ ] **Step 2:** Prova na tela (só leitura) no CR-00002: abre na prévia com os 4 empreendimentos marcados; seletor mostra V1 com 11; simular taxa muda o valor máximo sem gravar nada (nenhuma escrita na rede); "Liberar" NÃO é clicado sem OK do usuário.
- [ ] **Step 3:** Fechar o PR #655 (incorporado aqui). PR, CI, merge, `conferir-producao.sh`, CI da main.

## Decisões tomadas por mim (conferir)
- **Abas internas abrem na prévia**; versões liberadas ficam no seletor.
- **Simulação de parâmetros na aba Capacidade**, com "Salvar no room" explícito (simular não grava).
- **Botão vira "Liberar para a instituição"** e o passo "Conferir" some: a prévia na tela JÁ é a conferência.
- **Prévia não é guardada no banco** (some ao sair da tela): guardar rascunhos seria uma tabela nova e o cálculo leva segundos.
- **Covenants seguem a versão liberada** (número oficial).
- **PR #655 fechado sem merge**: a regra de comparação dele entra aqui como parte do aviso "desde a última liberada".

## Estado (22/11/2026)
- **Tasks 1 e 2 prontas e publicadas num PR próprio** (pedido do usuário: "Publicar as Tarefas 1 e 2 agora? sim"). Tasks 3 (simulação de parâmetros) e 4 (book da prévia) ficam para o PR seguinte — **2 de 4**.
- Conferência na tela (só leitura, 0 escritas): C6 bank sem versão abre na prévia ("Ainda não liberada à instituição"); CR-00002 mostra a prévia com os 4 empreendimentos e "Desde a V1 liberada: empreendimentos 11 → 4 · contratos 16 → 9 · cadastro mudou: empreendimentos da capacidade".
- PR #655 (aviso "o cadastro mudou depois da versão congelada") foi publicado antes, a pedido do usuário; este PR o substitui pela faixa da prévia.
- Para o PR seguinte: gráfico com série toda zerada repete rótulos do eixo ("R$ 1", "R$ 0") — trocar por frase (§28.5).
