# Pós-Obra & Garantia ↔ Suprimentos (SC, cotação, pedido, contrato) + ciclo completo do chamado


## Pedido original

Sessão de 2026-10-11. Mensagem do usuário, transcrita literalmente:

> ao abrir um chamado pode ser que a execucao gere necessidade de compra de algum material ou contracao de algum servico que sera feito via suprimentos (cotacao, pedido, contrato).
> faça um plano para implementacao a conexao entre o módulo pos obra e garantia com suprimentos

### Decisões do usuário (mesma sessão)

| Pergunta | Resposta |
|---|---|
| Contrato de serviço | **Criar contrato a partir do chamado** (aceito: salvar o contrato gera títulos em Contas a Pagar na hora) |
| Chamado sem obra (a SC exige obra) | **Pedir a obra no chamado** — botão desligado dizendo o motivo |
| Ciclo do chamado | **Fluxo completo**: visita (agendar + resultado), responsabilidade, iniciar/concluir reparo, encerrar com custo real |

### Padrões adotados (sem pergunta — dizer no relatório; o usuário pode mudar)
- Compras liberadas nos estados EM_GARANTIA, FORA_GARANTIA, VISITA_AGENDADA, EM_REPARO, REABERTO,
  CONTESTADO (bloqueado em ABERTO/TRIAGEM: "faça a triagem antes"; e em ENCERRADO).
- A SC nasce **sem item pré-montado**: a descrição do chamado é o defeito, não o material.
- KPI "Custo/mês" passa a contar pela **data de encerramento** (`closed_at`, coluna nova) — hoje
  conta pela abertura e sempre dá R$ 0 porque `custo_real` nunca é gravado.

---

## Contexto

Hoje o chamado não tem ligação nenhuma com compras: nenhuma tabela de Suprimentos tem coluna de
origem, e nenhum outro módulo cria SC/pedido/contrato. Além disso, o próprio ciclo do chamado
para em "Em garantia":
- não existe RPC para EM_REPARO/CONCLUIDO (`complete_repair` prometido em `20260708000000:293` nunca
  foi escrito); o cartão de encerrar só aparece nesses estados → inalcançável;
- `scheduleVisit`/`updateVisit` existem em `warrantyService` mas nenhuma tela chama; `parecer` e
  `acao_definida` da visita não têm UI;
- `responsible_party` nunca é gravado; `custo_estimado` nunca é escrito; `handleClose`
  (`WarrantyModule.tsx:~2087`) não manda `custo_real` → sempre NULL.

A cadeia de Suprimentos já existe e é reaproveitada inteira: `purchaseRequestService.create` →
`generateQuotation`/`generateOrder` (`services/purchaseRequestService.ts:182,292,316`) →
`quotationService.selectWinner` (`:401-458`, cria o pedido) → contratos de fornecedor
(`domain='SUPRIMENTOS'`, `direction='INCOMING'`, view `supplies-contracts`, `AppRouter.tsx:951-967`).
**Não** é o `ServiceContractsModule` (esse é contrato com cliente, `OUTGOING`).

Falhas da cadeia que afetam o roll-up: `selectWinner` cria o pedido sem vínculo com a cotação (não há
coluna) — pedido que passou por cotação ficaria invisível para o chamado.

---

## Fase 0 — Ciclo de vida do chamado ✅ (publicada 2026-10-11)

> **Estado (2026-10-11):** 0.1–0.6 feitos e conferidos. Migration
> `aplicar_20271011000500_garantia_ciclo_vida.sql` aplicada; todas as funções `%warranty%` com ACL
> só `authenticated`/`service_role` (achado: triage/schedule/close/classify/delete e 3 auxiliares
> estavam executáveis por PUBLIC e anon — revogado). Recusas de estado provadas uma a uma (frase
> P0004); caminho completo provado num bloco que aborta (nada gravado). Navegador (Playwright,
> agente-leitura): chamado de teste criado → agendar visita → resultado (parecer/ação) → triagem →
> responsabilidade → iniciar reparo (R$ 1.500,00) → concluir → encerrar (R$ 1.234,56); banco
> conferido (`closed_at`, custos, responsável, 1 visita); Histórico com autor e resumo; 0 erro;
> chamado de teste apagado (`delete_warranty_claim`: 1 chamado, 8 eventos, 1 visita), total voltou a 5.
>
> **Ajustes de desenho feitos na execução:**
> - "Triado" = `in_warranty` preenchido (não só o estado): visita de diagnóstico pode vir ANTES da
>   triagem, e a triagem continua possível em VISITA_AGENDADA enquanto não triado.
> - Agendar/registrar visita ficaram em formulário embutido na aba Visitas (molde da Classificação),
>   não em Sheet.
> - NPS no encerramento passou a ser opcional (antes travava o botão).
> - A aba Visitas lia `claim.visits`, que a lista não traz — ficava sempre vazia; agora
>   `warrantyService.listVisits`.
> - O endpoint `db query` não deixa bloco `EXCEPTION` capturar erro — recusas provadas em chamadas
>   separadas.
> - Observação (não alterado): `ESTADOS_TERMINAIS` em `warrantyAnalytics.ts` ainda conta
>   FORA_GARANTIA como terminal no KPI "abertos", embora agora ele possa seguir para reparo.

### 0.1 `utils/warrantyLifecycle.ts` (novo) + teste
Mapa único de transições (estado → ações permitidas), `acoesDisponiveis(state)`, uma frase de
motivo por ação bloqueada, `EVENT_LABELS` (sai do componente), `sugerirResponsavel(origin)`
(execucao/projeto → construtora, material → fornecedor, uso → uso_inadequado, manutencao →
proprietario, indeterminada → indeterminado).
- **Pronto quando:** vitest cobre os 10 estados e todo bloqueio tem frase.

### 0.2 Migration A `aplicar_<prefixo livre>_garantia_ciclo_vida.sql`
- `warranty_claims.closed_at timestamptz` + backfill pelo último `ClaimClosed` + índice.
- Novas (SECURITY INVOKER, `search_path`, `FOR UPDATE` + conferência de versão, evento):

| RPC | Origem permitida | Destino | Evento |
|---|---|---|---|
| `start_warranty_repair(…, p_custo_estimado, p_notes, p_actor)` | EM_GARANTIA, FORA_GARANTIA, VISITA_AGENDADA, REABERTO, CONTESTADO | EM_REPARO | `RepairStarted` |
| `complete_warranty_repair(…)` | EM_REPARO | CONCLUIDO | `RepairCompleted` |
| `record_warranty_visit_result(visit, claim, …, realized_at, diagnostico, parecer, acao_definida)` | visita AGENDADA/REAGENDADA do mesmo chamado/org | visita REALIZADA (chamado não muda) | `VisitCompleted` |
| `set_warranty_responsibility(…, p_party, p_notes)` | ≠ ENCERRADO | — | `ResponsibilityAssigned` |

- Reescritas **a partir da definição viva** (`pg_get_functiondef`), com guarda de estado:
  `triage_warranty_claim` (ABERTO/TRIAGEM/REABERTO), `schedule_warranty_visit` (estado só vira
  VISITA_AGENDADA se vier de EM_GARANTIA/FORA_GARANTIA/REABERTO/CONTESTADO), `close_warranty_claim`
  (CONCLUIDO/EM_REPARO/FORA_GARANTIA; grava `closed_at`).
- REGRA #7: `REVOKE ALL … FROM PUBLIC, anon` + `GRANT … TO authenticated` em todas.
- **Pronto quando:** aplicada por `db query --linked -f`; `pg_proc` mostra as funções com ACL sem
  PUBLIC/anon; chamada de estado inválido devolve a frase (bloco que aborta — nada gravado);
  `segurancaMigrations.test.ts` e `migrationsPrefixo.test.ts` verdes.

### 0.3 `__tests__/warrantyLifecycleSql.test.ts` (novo)
Lê o texto da migration e confere que as listas de origem de cada RPC batem com o mapa TS.
- **Pronto quando:** mudar só um dos lados quebra o teste.

### 0.4 `types/warranty.ts`, `services/warrantyService.ts`
`startRepair`, `completeRepair`, `recordVisitResult`, `setResponsibility`; `close` com `custo_real`.

### 0.5 `components/WarrantyModule.tsx` (detalhe)
- Aba **Informações**: cartões por estado via `acoesDisponiveis` — Triagem (já existe), Iniciar
  reparo (custo estimado pré-preenchido com previsto+comprometido da Fase 1, editável), Concluir
  reparo, **Encerrar** (também em FORA_GARANTIA) com **Custo real** sugerido pelo realizado em
  Suprimentos ("sugerido pelos pedidos e medições"; aviso se ainda houver comprometido não
  realizado; sugestão nunca sobrescreve o digitado). Cartão **Responsabilidade** (5 opções,
  sugerida pela origem provável; Salvar desligado sem alteração, com motivo; §25).
- Aba **Visitas**: "Agendar visita" (Sheet; padrão amanhã 09:00, técnico = usuário logado) e
  "Registrar resultado" em cada visita agendada (realizada em, diagnóstico, parecer, ação definida);
  lista mostra parecer e ação.
- **Histórico**: labels novos + linha com o payload (nº da SC/contrato, custo, parecer).
- **Pronto quando:** teste de componente — cada estado mostra só as ações válidas; botão
  desligado tem `title` com o motivo; check-ui-standard 0.

### 0.6 `utils/warrantyAnalytics.ts`
KPI "Custo/mês" e `fluxoMensal` por `closed_at`. **Pronto quando:** `warrantyAnalytics.test.ts` verde.

---

## Fase 1 — Solicitação de Compra ligada ao chamado + roll-up

### 1.1 Migration B `…_garantia_vinculo_suprimentos.sql` (parte SC/pedido)
- `purchase_requests.warranty_claim_id` (FK `ON DELETE SET NULL`, índice parcial).
- `purchase_orders.quotation_request_id` (FK, índice) — fecha o buraco cotação → pedido.
- Trigger `fn_guard_warranty_claim_link` (BEFORE INSERT/UPDATE): o chamado tem de ser da mesma
  organização do registro (a SC herda a org da obra — cobre o chamado com obra de outra org).
- Trigger `fn_log_warranty_procurement_link` (AFTER): evento `ProcurementLinked` no chamado,
  atômico para qualquer porta de entrada.
- Trigger de org entre cotação e pedido. `fn_purchase_requests_guard` **não** é tocado.
- REVOKE nas funções de trigger.
- **Pronto quando:** SC com chamado de outra org falha (bloco que aborta); evento aparece.

### 1.2 `types/purchaseRequest.ts`, `services/purchaseRequestService.ts`
`warrantyClaimId` no tipo/`mapRequest`; gravado **só no `create`** (`headerFromDraft:121` também
serve o `update` — editar a SC não pode apagar o vínculo); `listByWarrantyClaim(claimId)`.
- **Pronto quando:** vitest com mock — `update()` não envia `warranty_claim_id`.

### 1.3 `services/quotationService.ts`, `services/orderService.ts`, `types/supplyChain.ts`
`selectWinner` grava `quotation_request_id` no pedido criado.
- **Pronto quando:** pedido vindo de cotação tem a coluna preenchida.

### 1.4 `components/suprimentos/SolicitacaoCompraForm.tsx`
Prop `origemGarantia={{claimId, rotulo}}` (rótulo no cabeçalho; vínculo no create). O formulário é
**embutido no detalhe do chamado** (já é tela in-flow com `initialDraft`/`onBack`/`onSaved`,
`:62-80`) — sem rascunho órfão e sem sair do módulo. Pré-preenchido pelo que o app sabe: obra;
CC e plano (só se a org da obra = a do chamado); título "Garantia — {sistema} — {unidade}";
justificativa = descrição + local; prioridade `urgente` se severidade alta/crítica; necessidade =
`sla_deadline` se futura.
- **Pronto quando:** SC criada pelo chamado tem `warranty_claim_id`; editar a SC mantém.

### 1.5 `utils/warrantySuprimentos.ts` (novo, puro) + teste
`consolidarSuprimentos()`:
- **Previsto** = itens de SC ativa sem pedido (preço estimado) + pedidos Rascunho + contratos não assinados;
- **Comprometido** = pedidos ≠ Rascunho/Cancelado (`totalEfetivoDoPedido`, `utils/pedidoItemValor.ts:52`
  — trava `pedidoValorCotacaoTrava.test.ts`) + `current_value` de contratos Assinado/Ativo/Suspenso/Concluído/Encerrado;
- **Realizado** (⊂ comprometido) = pedidos Entregue/Recebido/Divergência + Σ medições Processada/Paga.

`sugestaoCustoReal()`; `motivoNaoGerarSolicitacao()` / `motivoNaoCriarContrato()` com caminho na
frase (sem permissão "Suprimentos › Compras"; sem obra "Editar › Obra"; obra de outra org; estado).
- **Pronto quando:** vitest — pedido não repete (via item e via cotação), cancelado não conta,
  realizado ≤ comprometido, cada motivo.

### 1.6 `services/warrantySuprimentosService.ts` (novo)
`carregar(claimId)`: SCs por `warranty_claim_id`; pedidos por `items.purchase_order_id` ∪
`quotation_request_id`; contratos por `warranty_claim_id` com `contract_measurements`. Sem view/RPC
nova — a RLS já recorta.

### 1.7 `components/warranty/WarrantySuprimentosTab.tsx` (novo) + `WarrantyModule.tsx` + `AppRouter.tsx:1303`
Aba **Suprimentos** (`info | visitas | suprimentos | historico`): 3 `KpiCard` (Previsto,
Comprometido, Realizado) + `StandardTable` (Tipo, Número, Fornecedor, Status §8, Valor, Data) +
botões §17 "Gerar solicitação de compra" / "Novo contrato" com motivo quando desligados.
`AppRouter` passa `podeUsarSuprimentos={isModuleAllowed('canViewOrders','compras')}` (molde
`podeVerMapaRegulatorio`, `:557`).
- **Pronto quando:** sem `compras` → botão desligado com motivo; chamado sem obra → motivo da obra.

### 1.8 `AppRouter.tsx`, `SolicitacoesCompraList.tsx`
Clicar numa linha usa `navigateToFocus(view, id, fonte)` (`store/useStore.ts:200-214`); o
`AppRouter` passa a consumir `viewFocus` para `SOLICITACAO_COMPRA` e `PEDIDO_COMPRA`.
- **Pronto quando:** a linha abre o painel da SC / o detalhe do pedido.

---

## Fase 2 — Contrato a partir do chamado

### 2.1 Migration B (parte contratos) — `contracts.warranty_claim_id` + as mesmas triggers
Antes: conferir em `pg_policies` que `contracts` só tem policies por organização (REGRA #7).

### 2.2 `types/contracts.ts`, `contractService.listContracts` (select)

### 2.3 "Novo contrato" na aba Suprimentos
`<ContractModal domain="SUPRIMENTOS" direction="INCOMING" initialData={…}>` **local** (molde
`ServiceContractsModule.tsx:30-43`; não reaproveitar o modal global do `App.tsx` — sem `id` ele cai
no `updateContract(undefined)`, `hooks/useProjectOperations.ts:369`). `initialData`: obra,
empreendimento, CC, plano, tipo Manutenção / natureza Serviço, título e descrição do chamado,
`original_value` = custo estimado; fornecedor fica para o usuário. Antes de abrir, `useConfirm`
avisa que salvar gera títulos em Contas a Pagar. Submit: `contractService.createContract({...,
warranty_claim_id})` (o insert espalha o objeto, `:1742-1748`).
- **Pronto quando:** contrato criado aparece na aba com valor; medição Processada entra em Realizado.

### 2.4 `AppRouter.tsx` — `viewFocus` `CONTRATO` → abre o `ContractDetailView`.

---

## Fase 3 — Acabamento

- Volta para o chamado: "Chamado de garantia: {sistema}" no `SolicitacaoCompraSheet`, no cabeçalho
  do formulário de SC e no `ContractDetailView` (`navigateToFocus('pos-obra', id, 'CHAMADO_GARANTIA')`;
  o `WarrantyModule` consome e abre o detalhe).
- Ator real (usuário logado) nos comandos, em vez de `{actorId:'system'}`.
- Aviso ao excluir chamado com vínculos (FK `SET NULL` mantém SC/pedido/contrato).
- **Fica para decidir depois** (não entra sem o usuário pedir): cancelar/reagendar visita; reabrir
  chamado; vincular SC/contrato já existente; pedido via cotação herdar CC/plano da SC.

---

## Verificação

1. Vitest: `warrantyLifecycle`, `warrantyLifecycleSql`, `warrantySuprimentos`, `warrantyAnalytics`,
   `WarrantyModule.test.tsx` ampliado, mais as travas `segurancaMigrations`, `migrationsPrefixo`,
   `orgContextGuard`, `pedidoValorCotacaoTrava`, `solicitacaoCompra`. Suíte inteira com a conta fechando.
2. `tsc` (exit lido por grep); `check-ui-standard.sh` em cada `.tsx` tocado + CHECKLIST DE APLICAÇÃO
   no relatório; `check-xss-sinks.sh`.
3. Banco: `pg_proc`/`proacl` das RPCs e triggers; `bash scripts/check-rls-postura.sh`; guardas
   provadas em bloco que aborta (nada gravado).
4. Navegador (Playwright, agente-leitura, Alpa), num chamado de teste: agendar visita → registrar
   resultado → definir responsabilidade → iniciar reparo → gerar SC (rascunho) → ver no roll-up →
   (Fase 2) novo contrato → encerrar com custo sugerido; 0 erro de console/HTTP.
5. Limpeza obrigatória: excluir SC (rascunho), contrato via `deleteContract` (apaga os títulos —
   conferir Contas a Pagar) e o chamado via `delete_warranty_claim`; contagens voltam ao início.
6. Publicação por fase: push em `main` só após ler a suíte; `conferir-producao.sh` + check-run `ci`.
