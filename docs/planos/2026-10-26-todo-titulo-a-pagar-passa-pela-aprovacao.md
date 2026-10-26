# Todo título a pagar passa pela aprovação (Aguardando aprovação → Liberado para pagamento)

## Pedido original

> 1. Financeiro > contas a pagar:
> 1.1 Coluna status, criar mais um item chamado aguardando aprovação. O boleto fica bloqueado para pagamento até ser aprovado em financeiro > aprovações.
> 1.2 Coluna status, criar mais um item chamado Liberado para Pagamento. Então fica desbloqueado para pagamento.
> 2. financeiro > tributos a pagar > aba Darf:
> 2.1. em acoes, Criar botão enviar para aprovação (financeiro > aprovações).
> 3. Boletos a Pagar: o botão Aprovar e lancar faz exatamente o que? Lança em financeiro > aprovações?

Sessão `28d65126-a526-45e0-8d6a-3e30e5f1eef2` · 26/10/2026.

### Resposta dada ao item 3 (não gera código)

"Aprovar e lançar" (`boletoService.aprovarECriarInvoice`): confere fornecedor e
vencimento → cria a nota (`invoices`, `approved`) → **lança o título em Contas a
Pagar** (`internal_transactions`, `source_system='BOLETO'`, `PENDING`) → submete à
alçada com `semFaixa: 'liberar'`: **só vai para Financeiro › Aprovações se o valor
cair numa faixa** (Alpa: R$ 5.000–50.000 = 1 nível; ≥ R$ 50.000 = 2 níveis);
abaixo do piso nasce liberado → marca o boleto `aprovado`, auditoria, processo.
Com este plano, o título passa a cair SEMPRE em Aprovações (item M1).

## Estado medido antes (26/10/2026, banco remoto)

| Títulos a pagar em aberto (`DEBIT`, `PENDING`) | qtd | R$ |
|---|---|---|
| `approval_status = PENDENTE` (já na fila, "Aguardando aprovação") | 6 | 175.653 |
| `APROVADO` (todos vencidos → a tela mostra "Vencido") | 82 | 80.274 |
| `RASCUNHO` **dentro** da faixa — nunca enviados, pagáveis sem aprovação | 104 | 1.714.722 |
| `RASCUNHO` fora da faixa (976 tributos/demais) | 1.020 | 150.157 |

- "Aguardando aprovação" **já existe** (`STATUS_PT.AGUARDANDO_APROVACAO`) e já trava a
  baixa manual (`services/alcadaDaBaixa.ts`, item H.1 do plano 2026-10-16). Não trava
  Asaas nem conciliação.
- "Liberado para pagamento" **não existe**: aprovado aparece "Aprovado"/"Vencido"
  (`vw_payables.effective_status` troca APROVADO vencido por VENCIDO).
- `fn_approval_action_queue` só lista título que **cai numa faixa** — um título
  pendente abaixo do piso ficaria travado e invisível na fila.
- Volume: ~460 títulos a pagar nascem por mês (30 dias até 26/10: COMMERCIAL 207,
  CONTRACT_* 114, LABOR 72, BOLETO 59, outros 5).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 26/10 | Quais títulos ficam bloqueados até aprovar? | **Todo título a pagar**, qualquer valor |
| 26/10 | O que fazer com os já em aberto na virada? | **Liberar só os vencidos**; os a vencer vão para a fila |
| 26/10 | O que trava enquanto aguarda? | **Baixa manual/lote + PIX/Asaas**; conciliação com extrato segue liberada (aviso "Pago sem aprovação") |
| 26/10 | Parte 1 (regra e banco) | Aprovada |
| 26/10 | Parte 2 (telas) | Aprovada |
| 26/10 | Plano | Aprovado ("ok") |
| 26/10 | Títulos de organização de CONDOMÍNIO entram na regra? (o síndico dá baixa pelo portal, que não tem tela de aprovação) | **Não — condomínio fica fora** (`empreendimentos.condominio_org_id`) |

Decorrências registradas no desenho aprovado:
- Níveis continuam pelas faixas; **abaixo do piso = 1 nível** (rótulo do nível 1 da menor faixa da org, ou "Gestor").
- Fora da regra: título que já nasce pago/cancelado, tributo **RETIDO**, `ASAAS_FEE`,
  multa/juros de DARF (`source_system='DARF'`, seguem o DARF), `entry_type='CONTRA'`.
- Pagamento avulso **"Já pago"** nasce pago (o pagamento já aconteceu) — não entra na fila.
- Rejeitado = **Bloqueado** (também trava pagamento); volta à fila por "Reenviar para aprovação".
- DARF na fila = **um item só**; aprovar/rejeitar vale para todos os membros; DARF
  aprovado cujo total muda na edição volta para "Aguardando aprovação".
- Fora do escopo: status de aprovação na aba de tributos soltos; título comum
  aprovado voltar à fila quando o valor muda.

## Plano

### Banco — uma migration (`supabase/migrations/aplicar_<prefixo>_todo_titulo_a_pagar_passa_pela_aprovacao.sql`)

Prefixo conferido pelos DÍGITOS de todos os nomes + `migrationsPrefixo.test` (memória
de colisões de 17/10). Aplicada com `db query --linked -f`, nunca `db push`.
REGRA #7: toda função nova com `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated`.

- [ ] **M1. Gatilho "título nasce na alçada"** — `fn_titulo_nasce_na_alcada()` BEFORE
  INSERT em `internal_transactions`, `WHEN (NEW.direction='DEBIT')`: se `status='PENDING'`,
  `business_status` ≠ RETIDO/CANCELADO, `source_system` ∉ (ASAAS_FEE, DARF),
  `entry_type` ≠ CONTRA e `approval_status` nulo/RASCUNHO → grava `PENDENTE`,
  `approval_chain='[]'`, `approval_required_levels` = faixa (`fn_resolve_approval_levels`) ou 1.
  **Pronto quando:** INSERT de teste (em transação com ROLLBACK) de um MANUAL de R$ 10
  volta `PENDENTE`/1 nível; um de R$ 60.000 na Alpa volta 2 níveis; um RETIDO e um
  CONCILIATED voltam sem alteração.
- [ ] **M2. Memória da aprovação para sync que apaga e recria** — tabela
  `titulo_aprovacao_memoria` (org, source_system, reference_id, entry_type, amount,
  approval_status, approval_chain, approval_required_levels, apagado_em) gravada por
  gatilho AFTER DELETE de título aberto APROVADO; M1 restaura `APROVADO` + cadeia
  quando nasce título com a MESMA org/origem/reference_id/entry_type **e o mesmo valor**
  (valor diferente = aprovação nova). Memória com mais de 30 dias é ignorada.
  Motivo: 27 caminhos `.delete()` em `services/` (contrato, comercial, folha, tributos,
  dívida…) — preservar serviço a serviço seria repetir a REGRA #2 ("toda tela nova nasce errada").
  **Pronto quando:** apagar e reinserir (ROLLBACK) um título aprovado com o mesmo
  reference_id/valor volta APROVADO; com valor diferente volta PENDENTE.
- [ ] **M3. Fila** — `fn_approval_action_queue` (DROP + CREATE, o retorno ganha
  `origem text`): transação `PENDENTE` entra **sem exigir faixa**; `RASCUNHO` continua
  pela faixa; membros de DARF ficam fora e o DARF entra como `entity='darf'` (id do
  DARF, total, vencimento, pendente se algum membro está PENDENTE). Os outros ramos
  (contrato, pedido, planta, SC, ofício) copiados do texto do banco lido como UTF-8.
  **Pronto quando:** a fila devolve um título PENDENTE de R$ 10; um DARF pendente
  aparece uma vez com o total; contagem dos demais ramos igual à de antes.
- [ ] **M4. `vw_payables` ganha `approval_status`, `approval_required_levels`,
  `approval_chain`** (acrescentadas no FIM — `CREATE OR REPLACE VIEW` com a
  definição atual). `effective_status` NÃO muda (KPIs de atrasado continuam).
  **Pronto quando:** `select approval_status from vw_payables limit 1` funciona e
  `count(*)` por `effective_status` é igual ao de antes.
- [ ] **M5. RPCs do DARF** — `fn_darf_enviar_aprovacao(p_darf_id)` (recusa pago ou já
  pendente; níveis pelo total do DARF), `fn_darf_aprovar(p_darf_id, p_nivel, p_por,
  p_rotulo, p_obs)`, `fn_darf_rejeitar(p_darf_id, p_por, p_motivo)` — SECURITY INVOKER,
  GUC `darf.rpc`, aplicam a mesma cadeia em TODOS os membros (incl. multa/juros).
  `fn_darf_editar`: se o total mudar e o DARF estiver aprovado → membros voltam PENDENTE.
  **Pronto quando:** em transação com ROLLBACK, enviar → todos PENDENTE; aprovar →
  todos APROVADO; editar multa → todos PENDENTE de novo.
- [ ] **M6. Virada** — tabela de reversão `_reversao_virada_alcada_20271026`
  (id, approval_status, approval_chain, approval_required_levels, business_status —
  **NÃO apagar**). Títulos abertos `RASCUNHO`/nulo (exceto RETIDO e as exclusões de M1):
  vencidos (`due_date < data da virada`) → `APROVADO` com passo na cadeia
  `{"role":"Liberação automática na virada (26/10/2026)","action":"APROVADO"}`;
  a vencer → `PENDENTE` com níveis por faixa/1. PENDENTE e APROVADO existentes intocados.
  **Pronto quando:** contagem pós-virada = nenhum título aberto RASCUNHO fora de
  RETIDO; vencidos liberados + a vencer pendentes = total da reversão.

### Serviços

- [ ] **S1. `services/alcadaDaBaixa.ts`** — trava também `REJEITADO` (motivo próprio:
  "Rejeitado na aprovação — reenvie para aprovação antes de pagar."); função pura
  `motivoParaNaoPagar(approval_status)` usada pelo botão e pelo serviço.
  **Pronto quando:** teste cobre PENDENTE/REJEITADO travam, APROVADO e RASCUNHO não.
- [ ] **S2. `services/financialApprovalService.ts`** — `reenviar(id)`: REJEITADO →
  PENDENTE (`semFaixa: 'exigir1'`), cadeia preservada com o passo de rejeição.
  **Pronto quando:** teste do serviço com supabase simulado grava PENDENTE.
- [ ] **S3. `services/approvalService.ts`** — `ApprovalEntity` + `'darf'`;
  `ActionQueueItem.origem`. **Pronto quando:** `tsc` limpo.
- [ ] **S4. `services/darfService.ts`** — `enviarParaAprovacao`, `aprovar`, `rejeitar`
  chamando M5. **Pronto quando:** `tsc` limpo e chamada real (ROLLBACK não se aplica —
  conferir no navegador com DARF de teste e desfazer).
- [ ] **S5. `services/payableService.ts`** — avulso "Já pago" grava o título já pago
  na criação (status/payment_date/payment_type no INSERT, mesma costura de processo do
  `darBaixa`) em vez de criar e depois baixar (a baixa seria recusada por M1).
  **Pronto quando:** teste de `montarTitulosAvulsos`/criação cobre jaPago → CONCILIATED no insert.
- [ ] **S6. `services/boletoService.ts`** — `alcadaPendente` considera REJEITADO.
  **Pronto quando:** `marcarPago` de boleto com título rejeitado é recusado (teste).

### Utilitário puro

- [ ] **U1. `utils/situacaoAprovacaoTitulo.ts`** — de (`effective_status`,
  `approval_status`, `approval_chain`, `approval_required_levels`) → `{ rotulo, cor,
  segundaLinha, podePagar, motivo }`: Aguardando aprovação (laranja; "Nível 1 de 2
  aprovado" quando couber), Liberado para pagamento (azul), Bloqueado (vermelho, motivo
  da rejeição no title); "Vencido" vermelho na 2ª linha; PAGO/PARCIAL/RENEGOCIADO/
  RETIDO/CANCELADO passam como hoje. Teste `__tests__/situacaoAprovacaoTitulo.test.ts`.
  **Pronto quando:** teste verde com todas as combinações.

### Telas (REGRA #1: ler `docs/ui_ux_guia_unificado.md` inteiro antes; `check-ui-standard.sh` em cada arquivo tocado)

- [ ] **T1. `components/ContasPagarParcelas.tsx`** — coluna Status por U1; filtros
  Todos · Aguardando aprovação · Liberado para pagamento · Vencido · Pago; PIX/Asaas
  desligado com motivo quando `!podePagar`; ação "Reenviar para aprovação" no
  Bloqueado; `idsComAlcadaPendente` substituído pela coluna da view (M4).
  **Pronto quando:** no navegador, um título de cada situação mostra o rótulo certo,
  Dar baixa/PIX desligados com o motivo, reenviar leva para Aguardando.
- [ ] **T2. `components/ContasPagarManager.tsx`** — exportação/agrupamento usam o
  rótulo de U1; KPIs inalterados. **Pronto quando:** export mostra "Liberado para pagamento".
- [ ] **T3. `components/financeiro/DarfsTab.tsx`** — botão "Enviar para aprovação"
  (ligado: aberto e sem membro pendente; desligado diz "Já está em Financeiro ›
  Aprovações" / "DARF pago"); 2ª linha do Status com a aprovação.
  **Pronto quando:** no navegador, enviar um DARF faz ele aparecer em Aprovações como 1 item.
- [ ] **T4. `components/FinancialApprovalModule.tsx`** — seleção + "Aprovar
  selecionados" (cada item aprova o nível que aguarda; resumo de ok/falhas); coluna e
  filtro Origem; despacho de `entity='darf'` para S4.
  **Pronto quando:** aprovar 3 em lote no navegador → os 3 viram Liberado em Contas a Pagar.
- [ ] **T5. `components/BoletoFormModal.tsx`** — motivo do REJEITADO no "Marcar como
  pago". **Pronto quando:** `check-ui-standard.sh` limpo e motivo aparece.

### Edge Function

- [ ] **E1. `supabase/functions/asaas-payment/index.ts`** — recusa pagamento de título
  com `approval_status` PENDENTE/REJEITADO (mesmo texto de S1). Deploy da function +
  prova REGRA #7 (sem credencial → 401). **Pronto quando:** chamada com título pendente
  devolve erro com o motivo; sonda sem header = 401.

## Achados da revisão final (26/10/2026) e o que foi feito

| Achado | Grau | Feito |
|---|---|---|
| `CREATE OR REPLACE VIEW` sem `security_invoker = on` tiraria a RLS de `vw_payables`/`vw_darfs` (vazamento entre organizações) | Crítico | ✅ opção repetida + conferência no fim da migration; `viewSecurityGuard.test` vermelho → verde |
| Editar valor de avulso pendente o liberava (submit `semFaixa: 'liberar'` abaixo do piso) | Importante | ✅ gatilho `trg_titulo_volta_a_alcada` (BEFORE UPDATE): aberto em RASCUNHO volta PENDENTE |
| Recálculo de comissão (`fn_comissao_titulo_gravar`) devolve RASCUNHO pagável | Importante | ✅ mesmo gatilho |
| Estorno/desfazer conciliação reabre título nunca aprovado | Importante | ✅ mesmo gatilho (prova: estorno → PENDENTE) |
| Condomínio: portal do síndico recusaria a baixa sem ter onde aprovar | Importante | ✅ decisão do usuário: condomínio fora (gatilhos e virada) |
| "Aprovar selecionados" levava itens escondidos pelo filtro | Menor → Importante (reclassificado: aprovação de dinheiro que o usuário não vê) | ✅ `utils/filaAprovacao.itensDoLote` + teste |
| Enviar DARF já liberado o volta à fila sem confirmar; memória só guarda APROVADO; texto da virada com data fixa; `fn_darf_aprovar` aceita nível 2 sem o 1 por chamada direta; REJEITADO conciliado sem carimbo; conciliação de divergência cria título que fica "Pago sem aprovação" | Menor | adiados (relatados ao usuário) |

## Estado

- [x] Plano aprovado pelo usuário (26/10)
- [x] M1–M6 — migration `aplicar_20271026400000` (provada em transação desfeita; ainda NÃO aplicada)
- [x] S1–S6, U1, T1–T5 — commits `c55bddd1`, `5bafa0f6` e o da revisão
- [x] E1 — sem código: `bloqueiosDoDisparo` já recusava PENDENTE/REJEITADO; função publicada = origin/main
- [ ] Aplicar a migration no banco e conferir as contagens
- [ ] Conferência no navegador (Contas a Pagar, DARFs, Aprovações, Boleto)
- [ ] Publicar (PR + CI verde + merge)

## Verificação

1. `npx vitest run __tests__/situacaoAprovacaoTitulo.test.ts` + testes de S1/S2/S5/S6.
2. `npm run typecheck` (grep `error TS`, não `tail`) e suíte completa.
3. Banco após M6: `select approval_status, count(*) from internal_transactions where direction='DEBIT' and status='PENDING' group by 1` — sem RASCUNHO fora de RETIDO; total = reversão.
4. Navegador: Contas a Pagar (3 situações + vencido), Tributos › DARFs (enviar), Aprovações (lote, origem, DARF 1 item), Boleto (marcar pago recusado).
5. `bash scripts/check-ui-standard.sh` nos 5 componentes; `npx vitest run __tests__/orgContextGuard.test.ts`.
