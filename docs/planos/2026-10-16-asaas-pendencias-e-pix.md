# Integração Asaas — fechar pendências e pagar via PIX

## Pedido original

> aonde módulo financeiro existe integracao com o banco asaas?

> faça um plano do que falta implementar e solucao de pendencias.
> incluir pagamentos via PIX

> Sessão: ab640f61-38a9-4dd6-9cd5-0757d6703cfc · 16/10/2026
>
> Decisões do usuário na mesma sessão (respostas às perguntas do plano):
> - Quem recebe PIX: "Fornecedor (Recomendado), Colaborador (folha), Sócio (pró-labore), Qualquer título a pagar"
> - Conta Asaas: "Sim, conta própria (Recomendado)"
> - Governança: "Alçada + papel (Recomendado)"
> - Homologação: "Sandbox → piloto 1 org (Recomendado)"
>
> Substitui como fonte o `PLANO_MODULO_PAGAMENTO_TITULOS.md` (raiz), cuja Fase 1
> (pagamento de boleto) já estava no ar desde 03/07/2026.

## Estado

| Fase | Situação |
|---|---|
| 0 — painel Asaas (usuário) | **SANDBOX concluído e provado de ponta a ponta em 17/10/2026** — ver "Fase 0 no sandbox"; produção pendente |
| 1 — correções da integração existente | **12 de 14 publicados em 17/10/2026** (`bb5c6d2a`); 1.8 já estava resolvido; 1.14 fora do plano |
| 2 — conta Asaas como Conta de Pagamento | **5 de 5 publicados em 17/10/2026** (`c55b4558` + `071b77b8`); falta só o USO: cadastrar a conta Asaas com chave válida (depende do item 0.0) |
| 3 — PIX | **publicada em 17/10/2026** (`7b965915`); uso real depende da Fase 0 (chave válida + saída de PIX habilitada na conta Asaas) |
| 4 — governança | portão de DISPARO antecipado para a Fase 3 (papel, alçada, tetos, piloto, competência); faltam `supplier_payments_auditoria` e RLS de escrita por papel |

## Fase 0 no sandbox (17/10/2026, feito junto com o usuário)

| Passo | Resultado |
|---|---|
| 1 conta sandbox + chave | conta "Asaas Sandbox" (Alpa), chave aceita pela Asaas e no Vault; regra "Repasse Gateway (Asaas)" desligada sozinha |
| 2 webhook | token NOVO do webhook (ASAAS_WEBHOOK_TOKEN regravado — o de 06/2026 era ilegível); ⚠️ a Asaas trata cada GRUPO de eventos como uma configuração ("Webhook para cobranças"): Transferências/Pagamento de contas tiveram de ser incluídos à parte |
| 3 saldo de teste | sandbox › cobrança › "Ações de Sandbox › Confirmar pagamento" (NÃO "receber em dinheiro", que não credita saldo); webhook 200 "ignorado"; extrato importado pelo cron |
| 4 PIX | 1ª tentativa: "A chave de API fornecida não possui permissão para realizar operações de saque via API" → pagamento FAILED com o motivo, título intacto |
| 5 liberar saque | (a) na chave: "Permitir que esta chave execute operações de saque via API (Pix, Ted, Pague Contas e Recarga de celular)"; (b) Integrações › Segurança › "Validação de saque via Webhook" → Edge NOVA `asaas-saque-validacao` (token ASAAS_SAQUE_TOKEN), caixas "via interface", "Splits" e "estornos Pix" DESMARCADAS |

Provas de ponta a ponta:
- PIX 1 (R$ 1,00): disparado 14:32, saque **aprovado** pela validação (Logs das autorizações), DONE na Asaas 14:34; o webhook de transferência ainda não existia → **baixado pela consulta automática das 15:00** (rede de segurança da Fase 1).
- PIX 2 (R$ 2,00): disparado 14:45:19, aprovado, **TRANSFER_DONE pelo webhook às 14:45:36** → título PAGO/CONCILIATED, data 17/10, forma PIX, conta Asaas Sandbox, comprovante.
- Extrato das 15:07: as duas transferências importadas e **conciliadas sozinhas** com os títulos (MATCHED, `bank_reconciled_at`); saldo 48,02 = Asaas.
- Histórico: criado → enviado (altair.rosa@) → concluído (Asaas), nos dois.

Mudanças de acesso feitas para o teste: `desenvolvedor@alpaconstrutora.com.br` promovido de `member` a `admin` na Alpa (pedido do usuário).
Dados de teste a limpar: 2 títulos MANUAL "TESTE PIX SANDBOX…", 3 `supplier_payments` (1 FAILED + 2 DONE), 4 linhas de extrato da conta Asaas Sandbox, 2 vínculos de conciliação. O histórico (`supplier_payments_auditoria`) fica.

Testes adicionais no sandbox (17/10/2026, tarde):
- **Cobrança emitida pelo OrçaCloud** (Boleto+PIX R$ 10): QR guardado (`pix_qr_image`), cliente criado na Asaas e cacheado POR CONTA (`asaas_customer_ids`), "Confirmar pagamento" no sandbox → webhook → recebível RECEBIDO na conta Asaas Sandbox + taxa R$ 1,99 com `reference_id`; extrato das 16:07 conciliou recebimento e taxa sozinho. ✅
- **PIX agendado e cancelado** (R$ 3): SCHEDULED → cancelado no painel → `TRANSFER_CANCELLED` → CANCELLED (autor "Asaas"), título intacto. ✅
- **Boleto de terceiro**: `bill/simulate` respondeu `unregistered_bank_slip` por 45 min — o sandbox NÃO registra boletos. ⏸ Fica para o piloto em produção (boleto real de valor baixo). A decisão de validação BILL está coberta em `__tests__/asaasSaque.test.ts`.
- A aprovação do boleto de teste abriu 2 `process_instances` sozinha — limpeza tem de procurar processos também.

Limpeza (17/10/2026, ~16:50 BRT, autorizada): cópia em JSON local; transação com contagem conferida por passo — 6 lançamentos, 4 vínculos, 4 `supplier_payments`, 1 cobrança, 2 processos, 1 boleto + 1 nota, 1 cliente e 1 fornecedor de teste APAGADOS; 6 linhas do extrato da conta Asaas Sandbox marcadas IGNORED (apagar faria o cron reimportar). Mantidos: histórico (`supplier_payments_auditoria`, 15 linhas, com as 4 exclusões), conta Asaas Sandbox ativa, desenvolvedor@ admin.

Ajustes pequenos revelados pelos testes — FEITOS (17/10/2026):
1. Botão "Cancelar" no OrçaCloud para pagamento agendado/enviado (antes só pelo painel da Asaas) — push `78d17e99`. Testado pelo usuário no sandbox ("TESTE PIX SANDBOX 4", R$ 4: agendado → cancelado pelo botão, autor = o usuário).
2. Motivo legível no cancelamento vindo da Asaas ("Cancelado na Asaas" em vez de `TRANSFER_CANCELLED`; idem bloqueado/falhou/estornado) — `motivoDaFalha` em `utils/asaasEventos.ts`, push `78d17e99`.
3. "Sincronizar extrato" passa a dizer quantos movimentos já estavam no período (`no_periodo`) — push `78d17e99`.
4. Pedido do usuário ao testar o item 1 ("aonde vejo o histórico?" — não havia tela): Contas a Pagar › Parcelas ganha o ícone de histórico em toda linha com pagamento pela Asaas; `components/financeiro/HistoricoPagamentoAsaasSheet.tsx` mostra as tentativas do título (PIX/boleto, valor, favorecido, status, comprovante) e, em cada uma, a linha do tempo — quando, o quê, quem e motivo — lida de `supplier_payments_auditoria` (policy `spa_select` para autenticado; filtro `detalhe->>transaction_id`) — push `ce237685`.

### Produção (18/10/2026)

- Conta "Asaas" `env=production` cadastrada na Alpa (piloto, tetos 500/2.000/200), chave testada (saldo R$ 0,00); "Asaas Sandbox" desativada.
- Webhook de produção conferido pela própria Asaas (`GET /v3/webhooks`, chamado de dentro do banco com a chave do cofre): URL certa, ativo, não interrompido, API v3, todos os `PAYMENT_*`/`BILL_*`/`TRANSFER_*` numa configuração só. Token e validação de saque só se provam no 1º pagamento real.
- Antes do 1º PIX real, verificado o "Novo pagamento avulso" (fa957390, outra sessão) — pedido do usuário: "verifique a funcionalidade e vamos fazer um teste real de pagamento via integracao com assas". Achado: linha "Avulso" tinha Excluir sempre ligado e `supplier_payments.transaction_id` é `ON DELETE SET NULL` → excluir com PIX em andamento deixava o pagamento órfão; Editar trocava valor/credor no meio do pagamento. Usuário escolheu corrigir antes: gatilho `trg_titulo_com_pagamento_asaas_nao_exclui` (`aplicar_20271018420000`, aplicada; provado em bloco desfeito — PENDING e DONE recusam, CANCELLED exclui) + `updateAvulso` recusa + Editar/Excluir desligados com motivo — push `36651ec0`.
- **1º PIX real (18/10/2026) — OK.** "teste 1" (avulso, R$ 100,00, Garden SPE). Tentativas 1 e 2 com a chave e-mail do cadastro: Asaas recusou "Não é permitido transferir para a própria conta" (a chave e-mail cadastrada no fornecedor é da PRÓPRIA conta Asaas — cadastro a corrigir); nada saiu. Tentativa 3 com chave CNPJ: Asaas resolveu o titular (Garden SPE, 60.897.254/0001-86, Sicredi), `authorized=true`, tarifa R$ 0,00; enviado 09:22:24, **DONE 09:23:53 pelo webhook** (autor "Asaas"; a consulta automática só pega > 30 min) → token de produção e validação de saque provados. Título PAGO/CONCILIATED, `payment_date` 18/10, PIX, conta Asaas, comprovante gravado.
- Achados no teste real, corrigidos (Edge `asaas-payment`, `asaas-webhook`, `asaas-status-sync` republicadas; front no push seguinte):
  1. "PIX enviado para ." — `beneficiary_name` do cadastro era `''` e passava pelo `??`. `_shared/pixFavorecido.ts` trata texto vazio como ausente; `pix_pay` grava o titular resolvido pela Asaas (`bankAccount.ownerName/cpfCnpj`).
  2. Baixa pela Asaas não disparava processos (`payable.settled`/`receivable.settled`, `internal_transaction.paid`) — a baixa manual dispara no navegador. `_shared/asaasProcessar.ts` chama o Motor de Processos (`criarMotor(admin)`, o mesmo da reconciliation-engine) depois da baixa, em saída e em cobrança. O "teste 1" (baixado antes da correção) ficou sem o processo de liquidação — não disparado retroativamente.

- **Teste de boleto real (18/10/2026) — pendente.** O usuário subiu o boleto #1486 (Energisa, R$ 61,65): é um REAVISO, o PDF não imprime a linha digitável (leitor: "Linha digitável não encontrada") e está na org Garden SPE — o piloto só paga a Alpa, e o usuário escolheu MANTER o piloto. A linha foi decodificada rasterizando o código de barras (I2of5) do PDF — `83650000000616500010005096430202609703008019`, DV geral conferido —, conferida por `POST /v3/bill/simulate` (R$ 61,65, CAIUA DISTRIB ENERGIA S A, tarifa 0, não vencido, data mínima 19/10) e gravada no boleto com autorização. Falta: um boleto real da própria Alpa, dentro do prazo e ≤ R$ 500 (nenhum dos 164 aprovados com linha está no prazo — o último vence 21/08/2026).
- Boleto #1486 com piloto DESLIGADO pelo usuário (o Salvar não gravava — corrigido em `516261ed`): 1ª e 2ª tentativas `invalid_dueDate` (linha de arrecadação não traz vencimento → `dueDate` = vencimento impresso, `911f5197`); 3ª, domingo 10:55: "contas de serviço vencidas só até às 22 horas" + "contas vencidas não podem ser agendadas" — conta de serviço VENCIDA só se paga em DIA ÚTIL (em fim de semana a Asaas tentaria agendar). Mensagem traduzida (`6f57307f`). Nada pago; retomar na segunda 19/10, antes das 22h.
- Lacunas vistas no caminho (não corrigidas): a linha digitável é só leitura no cadastro do boleto (leitura falhou = boleto impagável pela Asaas); o leitor não tenta decodificar o código de barras desenhado quando o texto não traz a linha.

## Andamento da Fase 3 (17/10/2026)

Contrato da Asaas conferido na documentação oficial (17/10): `POST /v3/transfers` { value, operationType: PIX, pixAddressKey, pixAddressKeyType CPF|CNPJ|EMAIL|PHONE|EVP, description, scheduleDate, externalReference } → { id, status PENDING|BANK_PROCESSING|DONE|CANCELLED|FAILED, transferFee, effectiveDate, authorized, failReason, transactionReceiptUrl }; cancelar = `DELETE /v3/transfers/{id}/cancel` (só antes de concluir). `authorized=false` = a conta exige token (validação de eventos críticos) — item novo da Fase 0.

| # | Situação | Prova |
|---|---|---|
| 3.1 favorecido do título | código | Medido: `party_id` NUNCA é preenchido. `utils/pixDestino.ts`: fornecedor por `supplier_id`; colaborador pelo `reference_id` da folha (`labor-<folha>-indiv-<RUBRICA>-<colab>` e `labor-<folha>-<obra>-<colab>-salario`); folha AGRUPADA (`unallocated-salario`, `<obra>-salario`) não vira PIX para uma pessoa; sócio pelo item do pró-labore (`reference_id` = `prolabore_payroll_items.id` → `partner_id`). 9 testes com referências reais. `_shared/pixFavorecido.ts` lê as chaves do cadastro. |
| 3.2 `utils/pixKey.ts` | código | valida por tipo (DV de CPF/CNPJ reusando `lib/validators.ts`, DDD real, EVP), normaliza no formato da Asaas, deduz tipo de chave antiga sem tipo, mascara. Chave fictícia do Bacen para sandbox (999.911.111-40) passa. Aplicada nos cadastros: fornecedor, colaborador, sócio (campos NOVOS — não havia tela) e conta bancária da empresa. 10 testes. |
| 3.3 `pix_quote` / `pix_pay` / cancelar | código + migration `aplicar_20271017400100` (nasceu `…400000`, colidiu com outra frente e foi renomeada; já estava aplicada) | servidor relê a chave pela `ref` (a chave do cadastro nunca vai ao navegador); avulso exige nome + CPF/CNPJ válido e tem teto próprio; `externalReference` = id do `supplier_payments`; DONE na resposta → mesmo processador do webhook. Colunas novas: `pix_key_type`, `beneficiary_document`, `favorecido_origem`, `asaas_authorized`; `company_partners.pix_tipo`. |
| 3.4 TRANSFER_* | já na Fase 1 | `decidirSaida('transfer', …)` + processador; baixa grava `payment_type='PIX'` e a conta Asaas. |
| 3.5 tela | código | Contas a Pagar › Parcelas: ação "PIX" (ou "Asaas" para boleto) só nas linhas cuja org tem conta Asaas; selo "Pagamento enviado / Agendado / Aguardando token"; ícone de alerta quando a última tentativa falhou. `components/financeiro/PagarPixSheet.tsx`: chaves mascaradas do cadastro ou digitada, agendamento, lista de bloqueios, confirmação obrigatória, botão desabilitado sempre com o motivo. Ação da visão Notas removida (nunca baixava o título). |
| Portão (Fase 4, disparo) | código | `utils/asaasGovernanca.ts` (10 testes) + `_shared/asaasDisparo.ts`: só owner/admin; alçada APROVADO, ou RASCUNHO sem faixa (`fn_resolve_approval_levels`); tetos por pagamento/dia (dia de Brasília)/avulso; piloto; competência fechada; pagamento em curso; e conta Asaas CADASTRADA (a chave global não paga). Vale para boleto e PIX; o modal de boleto mostra os bloqueios. |

Publicação (17/10/2026):
1. `aplicar_20271017400100_asaas_pix` aplicada (com o nome antigo `…400000`). Prova: 4 colunas em `supplier_payments`, `company_partners.pix_tipo`, 3 CHECKs.
2. Prova de suíte: nesta máquina o Node/V8 derruba o worker no `blueprintCasaAutomatica.test.ts` (Planta, sem relação) — 54/74 testes ficavam sem resultado. Prova feita na CI em Linux por PR de RASCUNHO (#30). 1ª rodada: **1 falha real minha** — prefixo `aplicar_20271017400000` repetido com `processos_extras_financeiro` (outra frente chegou antes) → renomeada para `…400100`, cabeçalho avisa que já foi aplicada. 2ª rodada: verde (10.066+ testes, tipos e build). PR fechado.
3. `asaas-payment` v7 publicada (leva `lib/validators.ts`, `utils/pixKey.ts`, `utils/pixDestino.ts`, `utils/asaasGovernanca.ts`). `pix_quote`, `pix_pay`, `cancel` com a chave anon → 401.
4. Push `7b965915` em main.

⚠️ Não provado de ponta a ponta: um PIX real/sandbox. Depende da Fase 0 (chave válida — a global dá 401 — e transferência PIX habilitada). Roteiro em "Verificação" deste plano.

Fora do escopo, registrado: violações de padrão de UI pré-existentes em `CompanyPartnersTab`, `SupplierBankAccountsTab`, `CompanyBankAccountsTab` (pílula uppercase, `confirm()` nativo) — mesma contagem antes e depois desta mudança.

## Andamento da Fase 2 (17/10/2026)

| # | Situação | Prova |
|---|---|---|
| 2.1 modelo | migration `aplicar_20271017300000` | `payment_accounts.kind`; `payment_account_gateway` (SELECT só membro da dona, sem policy de escrita); `client_charges`/`supplier_payments.payment_account_id`; `clients.asaas_customer_ids`; RPCs `asaas_conta_salvar` (gestor), `asaas_conta_guardar_chave`/`ler_chave` (só service_role, Vault `asaas_api_key:<id>`), `fn_conta_asaas_da_org`. Ensaio no banco real com ROLLBACK: passou. |
| 2.2 Edge resolvem a conta | código | `_shared/asaasConta.ts`: `resolverContaAsaas` (dona → "atende também" → chave global de RESERVA) e `contaDoRegistro` (reenvio, cancelamento e polling usam a conta que CRIOU o registro). charge, payment e status-sync migrados. |
| 2.3 baixa grava a conta | código | processador grava `payment_account_id` no título e na taxa; estorno não desfaz título já conciliado com extrato (vira "Baixa pendente"). |
| 2.4 extrato | código + migration `aplicar_20271017300100` (cron de hora em hora) | Edge `asaas-conta` importa `/v3/financialTransactions` (campos conferidos na doc oficial em 17/10) em `bank_transactions` NORMALIZED; vínculo determinístico por `paymentId/billId/transferId` via `fn_reconcile_match` (só valor igual e só o que o evento já baixou). Regras puras em `utils/asaasExtrato.ts` + 10 testes. |
| 2.5 tela | código | Minha Organização › Contas › editar conta › seção "Conta Asaas" (`components/financeiro/ContaAsaasSecao.tsx`): chave testada antes de guardar, ambiente, ativo, piloto, 3 tetos, testar conexão, sincronizar extrato; selo "Asaas" na lista. |

Publicação (17/10/2026) — cada passo provado:
1. `aplicar_20271017300000` aplicada. Prova: tabela, `kind`, `payment_account_id` nas 2 tabelas, `asaas_customer_ids`; ACL de `asaas_conta_ler_chave`/`guardar_chave` = só `postgres`+`service_role`; `pag_select` única policy; `anon` sem grant. ⚠️ A prova achou `TRUNCATE/REFERENCES/TRIGGER` para `authenticated` (grants padrão; TRUNCATE ignora RLS) → REVOKE acrescentado ao arquivo e aplicado; agora só `SELECT`.
2. Functions: `asaas-conta` v1→v2, `asaas-webhook` v13, `asaas-status-sync` v2 (`verify_jwt=false`), `asaas-charge` v15, `asaas-payment` v6. ⚠️ A prova achou que `asaas-conta` respondia 400 para id inexistente e 401 para existente (enumerava contas) → `exigirUsuario` antes de qualquer consulta; republicada; agora 401 nos dois casos, com e sem chave anon. RPC do cofre chamada com a anon → `permission denied` (42501).
3. Caminho do cron (pg_net + `fn_cron_secret`): HTTP 200 `{"ok":true,"contas":{}}`. `aplicar_20271017300100` aplicada: job `asaas-conta-extrato` `7 * * * *` ativo.
4. Push `071b77b8`; `conferir-producao.sh "Testar e guardar chave"` → domínio serve 071b77b com o texto.

Decisões tomadas no caminho (não estavam no plano):
- **Chave só é guardada depois de aceita pela Asaas** (`GET /finance/balance`). A chave global de 06/2026 é recusada (401) e ninguém sabia.
- **Id do cliente na Asaas é por conta**: `clients.asaas_customer_ids` (jsonb por conta). O `asaas_customer_id` antigo só vale para a chave global — numa conta nova ele não existe e a emissão falharia.
- **Ativar a conta Asaas desliga a regra "Repasse Gateway (Asaas)" da org dona** (não apaga): ela confirmava sozinha o crédito do repasse no banco, e linha confirmada não entra no pareamento de transferências — o débito do mesmo repasse no extrato Asaas ficaria solto.
- `kind` é só leitura no formulário de contas: `updatePaymentAccount` regrava todos os campos carregados e devolveria 'banco' por cima de 'gateway'.
- No lugar do "campo Tipo" do plano: botão "Usar como conta Asaas" na seção — a conta vira gateway ao salvar a configuração ou a chave.

## Andamento da Fase 1 (17/10/2026)

| # | Situação | Prova |
|---|---|---|
| 1.1 TRANSFER_*/desconhecido → 200 | código | `ramoDoEvento` + webhook delega a `processarEventoAsaas`; `__tests__/asaasEventos.test.ts` |
| 1.2 estorno de cobrança reverte recebível + taxa | código | `decidirCobranca` → `estornar`; `_shared/asaasProcessar.ts` |
| 1.3 data do movimento da Asaas | código | `dataDoMovimento` (teste) |
| 1.4 BILL_REFUNDED após DONE | código | `decidirSaida` → `estornar` (teste) |
| 1.5 `supplier_payments.transaction_id` | código | `asaas-payment` resolve o título antes do INSERT |
| 1.6 emissão/pagamento duplicados | código + migration | 409 nas duas Edge; índices `uq_client_charges_tx_ativa`, `uq_supplier_payments_{boleto,tx}_ativo` |
| 1.7 `byTransaction` sem canceladas | código | `cobrancaAtiva`; + as 2 contagens do condomínio |
| 1.8 regra Repasse Gateway sem direção | **já resolvido em produção** | a regra no banco tem `filters.direction = CREDIT` e o motor respeita (`bankReconciliationService.ts:638`). A memória/agente leu só a migration original. Nada a fazer. |
| 1.9 polling de fallback | código + migration | Edge `asaas-status-sync` + `aplicar_20271017200100` (cron) |
| 1.10 QR PIX com imagem | código + migration | `components/financeiro/QrPixCobranca.tsx` no modal de emissão e em Boletos ao Cliente |
| 1.11 cliente por `party_id` sem org | código | `asaas-charge` `.eq('organization_id')` |
| 1.12 org do fornecedor no modal | código | `invoiceService.listAll` devolve `organizationId` da nota |
| 1.13 RLS | migration | `acc_update` com WITH CHECK; DELETE de `client_charges` removido. Ensaio no banco real em transação com ROLLBACK passou. |
| 1.14 `invoiceService.marcarPago` | fora deste plano | registrado; a ação Asaas migra para a visão `parcelas` na Fase 3 |

Achados novos durante a Fase 1:
- `trg_sync_boleto_baixa` já leva boleto→pago / invoice→paid quando o TÍTULO é baixado, e desfaz no estorno. O webhook não precisa (nem deve) duplicar isso — só grava o boleto direto quando ele não tem título.
- Gravação por evento agora é "reivindicação" (UPDATE condicionado + `.select('id')`): CONFIRMED + RECEIVED quase juntos não lançam a taxa duas vezes. Erro de gravação lança → webhook 500 → a Asaas reenvia (antes: 200 com metade gravada).
- Cobrança criada na Asaas que falha ao gravar aqui agora é cancelada lá (não sobra boleto órfão pagável).
- ⚠️ `fn_payable_bloqueia_competencia_fechada` (gatilho de `internal_transactions`, DEBIT) **não isenta o service_role**: baixa de título a pagar — e lançamento da taxa — num mês com competência FECHADA é recusada até pelo webhook. Duas medidas: (a) `asaas-payment` recusa o disparo (422) se a competência do título estiver fechada, ANTES de o dinheiro sair; (b) falha de efeito depois da reivindicação vira **pendência anotada** ("Baixa pendente: …" em `supplier_payments.failure_reason` / `client_charges.error_message`) com resposta 200 — 500 em loop faria a Asaas pausar a fila de webhooks da conta inteira.
- `PAYMENT_RESTORED` não reabre cobrança encerrada (o índice de cobrança viva recusaria e o 500 repetiria para sempre).
- Contagens do lote do condomínio ("N de M emitidas") contavam cobrança cancelada como emitida — mesmo defeito do `byTransaction`, corrigido junto.
- Prova de tipos: `tsc` cai sempre nesta máquina (V8, -1073741819); checador por arquivo (`tsc_por_arquivo.cjs`) fechou `FIM erros=0` na 2ª rodada. `deno check` das 4 functions: ok.

Publicação (17/10/2026, ~01h30 UTC) — feita nesta ordem, cada passo provado:

1. `aplicar_20271017200000` aplicada — prova: 3 colunas em `client_charges`, `asaas_checked_at` em `supplier_payments`, 4 índices, 0 policy de DELETE em `client_charges`, `acc_update` com WITH CHECK.
2. Functions publicadas: `asaas-webhook` v12 e `asaas-status-sync` v1 (`verify_jwt=false`), `asaas-charge` v14 e `asaas-payment` v5 (`verify_jwt=true`). Provas de fora: webhook sem token → 401, token errado → 401; status-sync sem header → 401, com chave anon → 401; charge/payment com chave anon → 401 "Token inválido".
3. `aplicar_20271017200100` aplicada — job `asaas-status-sync` `*/15 * * * *` ativo. Disparo manual pelo mesmo caminho do cron (pg_net + `fn_cron_secret`): HTTP 200, `cobrancas: 1` consultada e carimbada em `asaas_checked_at`.
4. Push `bb5c6d2a` em main; `conferir-producao.sh "QR Code indisponível para esta cobrança"` → domínio serve bb5c6d2 com o texto no bundle.

⚠️ **Achado da publicação:** a consulta à Asaas voltou **HTTP 401** — a `ASAAS_API_KEY` configurada (19/06/2026) é recusada pela própria Asaas (revogada, expirada, ou de ambiente diferente do `ASAAS_ENV`). Hoje NENHUMA chamada à Asaas funciona: emitir, pagar, consultar. Não é efeito desta fase (o código trata 401 como erro de consulta e não mexe na cobrança). Virou o item 0.0 da Fase 0.

Roteiro original de publicação (mantido para referência): aplicar `aplicar_20271017200000` → publicar `asaas-webhook` (`--no-verify-jwt`), `asaas-charge`, `asaas-payment`, `asaas-status-sync` → aplicar `aplicar_20271017200100` (cron) → push em `main` (front) → provas: curl de `TRANSFER_CREATED` com token = 200; status-sync sem header = 401.

## Contexto

**Pedido original:** "faça um plano do que falta implementar e solucao de pendencias. incluir pagamentos via PIX" (após a pergunta "aonde módulo financeiro existe integracao com o banco asaas?").

**Estado real em 16/10/2026** (código de `origin/main` + banco remoto):
- A integração existe nas duas pontas — cobrar cliente (`asaas-charge` → `client_charges`) e pagar boleto de fornecedor (`asaas-payment` → `supplier_payments`), com webhook único — mas **nunca foi usada em produção**: `client_charges` = 2 (teste de 19/06), `supplier_payments` = 0, `asaas_charge_config` = 1 org (Alpa).
- Segredos `ASAAS_API_KEY/ASAAS_ENV/ASAAS_WEBHOOK_TOKEN` são **globais** (um para todas as orgs); `ASAAS_ENV` só é legível como hash — pode estar em `sandbox`.
- **PIX de saída não existe**: nenhuma chamada a `/v3/transfers`; webhook não trata `TRANSFER_*` (cai no `400 Payload inválido`, `asaas-webhook/index.ts:196-198`). A demanda é real: **1.065 títulos a pagar abertos sem boleto** vs 93 com boleto.
- Pendências de código da integração atual (detalhadas na Fase 1): baixa sem `payment_account_id`, `payment_date=hoje`, refund não reverte recebível, `supplier_payments.transaction_id` nunca preenchido, sem polling de fallback, sem checagem de alçada, qualquer membro dispara dinheiro.
- PRD existente: `PLANO_MODULO_PAGAMENTO_TITULOS.md` (raiz) — Fase 1 (boleto) feita, Fase 0 (painel Asaas) e Fases 2–4 abertas. Este plano o substitui como fonte e passa a viver em `docs/planos/` (REGRA #6).
- ⚠️ O checkout `C:\D\ORÇACLOUD\orçacloud-saas` está **817 commits atrás** de `origin/main`. Os arquivos Asaas são idênticos, mas `ContasPagarParcelas.tsx`, `payableService.ts`, `types/financial.ts`, `Layout.tsx`, conciliação e `employee_bank_accounts` (migration `aplicar_20271007000020`) só existem atualizados em `origin/main`.

**Decisões do usuário (16/10):**
1. PIX para **fornecedor, colaborador, sócio e qualquer título** (chave digitada quando não há cadastro).
2. Conta Asaas vira **Conta de Pagamento própria** (`payment_accounts`) com saldo e extrato.
3. Governança: **alçada aprovada + só owner/admin dispara** + teto editável por org.
4. **Sandbox → piloto só na Alpa** com teto baixo por 2 semanas.

---

## Onde o trabalho nasce

```bash
cd /c/D/ORÇACLOUD/orçacloud-saas && bash scripts/nova-frente.sh asaas-pix   # REGRA #8
```
Plano versionado: `docs/planos/2026-10-16-asaas-pendencias-e-pix.md` (com o pedido original). Migrations `aplicar_20271017…_*.sql` (último prefixo em main: `aplicar_20271017100000`), aplicadas com `npx supabase db query --linked -f`, **nunca** `db push`. Edge Functions: `npx supabase functions deploy <nome>`; o webhook com `--no-verify-jwt` (regra de `docs/planos/2026-09-02-correcao-auditoria-seguranca.md`).

---

## Fase 0 — Do usuário, no painel Asaas (sem código, paralela à Fase 1)

- [ ] **0.0 — Chave de API válida.** A atual é recusada (HTTP 401 em 17/10/2026). Gerar nova chave no painel Asaas (Integrações → Chave de API) do MESMO ambiente que `ASAAS_ENV` e regravar com `npx supabase secrets set ASAAS_API_KEY=… ASAAS_ENV=sandbox|production`. Prova: o próximo ciclo do `asaas-status-sync` não registra mais `HTTP 401` (`SELECT content FROM net._http_response ORDER BY id DESC LIMIT 5`).
- [ ] Conta Asaas tem **`BILL:WRITE`** (pagar boleto) e **transferências PIX** habilitadas? (KYC de saída é mais rigoroso que o de recebimento.)
- [ ] Gerar **chave de API de sandbox** e **de produção** separadas (a de produção só entra na Fase 2, no Vault).
- [ ] Webhook cadastrado com URL `https://<ref>.supabase.co/functions/v1/asaas-webhook`, token = `ASAAS_WEBHOOK_TOKEN`, eventos: `PAYMENT_*`, `BILL_*`, `TRANSFER_*` (sandbox e produção).
- [ ] Política de **aporte de saldo**: pagamentos de saída debitam o saldo da conta Asaas (pré-pago). Quanto manter, quem autoriza a transferência Itaú → Asaas.
- [ ] Confirmar **tarifa** por boleto pago e por PIX enviado (vai para `fee` e para a despesa `ASAAS_FEE`).

---

## Fase 1 — Correções da integração existente (~3 dias)

Antes de qualquer coisa nova, deixar o que existe correto e idempotente. Extrair os tratadores de evento do webhook para `supabase/functions/_shared/asaasEventos.ts` (funções puras `aplicarEventoBill/Payment/Transfer(admin, payload)`), para o webhook (F1) e o poller (F1.9) usarem o mesmo código.

| # | Problema (hoje) | Mudança | Arquivo |
|---|---|---|---|
| 1.1 | Payload sem `payment.id` → **400** (TRANSFER_*, eventos de conta) | Devolver `200 {ignored:'evento_sem_tratamento'}`; ramos por `payload.bill` / `payload.transfer` / `payload.payment` | `asaas-webhook/index.ts:196-198` |
| 1.2 | `PAYMENT_REFUNDED/DELETED/CHARGEBACK_REQUESTED` só mudam `client_charges.status` | Reverter recebível: `business_status='PREVISTO'`, `status='PENDING'`, `payment_date=null`, `payment_account_id=null`; linha `ASAAS_FEE` ligada → `status='CANCELLED'`. Guardar `reference_id`=charge.id na taxa para achá-la | `asaas-webhook:272-278` |
| 1.3 | `payment_date=hoje` | Usar `bill.paymentDate`, `payment.paymentDate ?? clientPaymentDate`, `transfer.effectiveDate`; cair em hoje só se vazio | `asaas-webhook:123,234` |
| 1.4 | `BILL_REFUNDED` após DONE é ignorado | Tratar refund mesmo após DONE: `supplier_payments` → `FAILED` (motivo refund), título volta a `APROVADO/PENDING`, boleto volta a `aprovado`, taxa cancelada | `asaas-webhook:118-120` |
| 1.5 | `supplier_payments.transaction_id` nunca preenchido → trava de exclusão de `boletoService.desfazerLancamento:1307` está morta | Em `pay`, resolver título por `source_system='BOLETO' AND reference_id=boleto.id` e gravar `transaction_id` | `asaas-payment:189-206` |
| 1.6 | Emissão/pagamento duplicados | `emit`: recusar 422 se há `client_charges` ativa (status ∉ CANCELLED/REFUNDED/DELETED) para o `transaction_id`. `pay`: recusar se há `supplier_payments` em PENDING/SCHEDULED/DONE para o boleto. Índices únicos parciais no banco (⚠️ upsert × índice parcial = 42P10, não usar upsert) | `asaas-charge:193+`, `asaas-payment:184+`, migration |
| 1.7 | `clientChargeService.byTransaction` devolve a mais recente **inclusive CANCELLED** | Filtrar canceladas | `services/clientChargeService.ts:134` |
| 1.8 | Regra "Repasse Gateway (Asaas)" sem direção: um **débito** de aporte com "ASAAS" vira "repasse" confirmado | Adicionar condição `direction = CREDIT` à regra (UPDATE na seed + na migration `20261119000004`) | migration nova |
| 1.9 | Sem fallback se o webhook se perder | Edge `asaas-status-sync` (cron 15 min, `chamadaDeCron`): `supplier_payments` PENDING/SCHEDULED há > 30 min → `GET /v3/bill/{id}` ou `/v3/transfers/{id}`; `client_charges` PENDING vencidas → `GET /v3/payments/{id}`; aplica via `_shared/asaasEventos.ts` | nova function + `cron.schedule` (modelo `aplicar_20270919000024`) |
| 1.10 | QR PIX só tem copia-e-cola | Guardar `encodedImage` em `client_charges.pix_qr_image` (+ `pix_expiration`); exibir `<img>` no `EmitirCobrancaModal` e em `ClientChargesModule` | `asaas-charge:306-313`, migration, 2 telas |
| 1.11 | `emit` resolve cliente por `party_id` **sem filtro de org** | `.eq('organization_id', organization_id)` | `asaas-charge:208-211` |
| 1.12 | Modal passa **org do fornecedor** (`supplierOrganizationId`) como `organization_id` | Passar a org do boleto/título (`boleto.organization_id`) | `ContasPagarManager.tsx:1177` |
| 1.13 | `asaas_charge_config` UPDATE sem `WITH CHECK`; `client_charges` DELETE para qualquer membro | `WITH CHECK (is_org_member)`; remover policy de DELETE (só service_role) | migration (REGRA #7) |
| 1.14 | `invoiceService.marcarPago` só muda `invoices.status` | Fora deste plano, mas registrar: a visão `notas` não baixa título. A ação Asaas migra para a visão `parcelas` (Fase 3) | — |

**Testes:** `__tests__/asaasEventos.test.ts` (mapeamento de eventos → mudanças, puro, com payloads de exemplo); `deno check` das 4 functions; curl ao webhook com payload `TRANSFER_*` deve dar 200.

---

## Fase 2 — Conta Asaas como Conta de Pagamento (~4 dias)

### 2.1 Modelo
Migration `aplicar_20271017…_payment_accounts_gateway.sql`:
- `payment_accounts.kind text NOT NULL DEFAULT 'banco' CHECK (kind IN ('banco','caixa','gateway'))`.
- Tabela 1:1 `payment_account_gateway (payment_account_id PK → payment_accounts, provider CHECK ('asaas'), env CHECK ('sandbox','production'), vault_secret_id uuid, webhook_token_vault_id uuid NULL, teto_por_pagamento numeric, teto_por_dia numeric, piloto boolean DEFAULT true, ativo boolean, updated_at)`. Tetos/piloto são **hipóteses editáveis** (feedback: nunca constante escondida).
- RPCs no padrão do Vault da captura por e-mail (`aplicar_20271015110100_email_capture_rpcs.sql`): `asaas_conta_guardar_chave(payment_account_id, chave)` — SECURITY DEFINER, só **gestor da org dona**; `asaas_conta_ler_chave(payment_account_id)` — só `service_role`. REVOKE de PUBLIC/anon/authenticated + GRANT explícito (REGRA #7, duas perguntas no cabeçalho).
- `fn_conta_asaas_da_org(org)`: a conta `kind='gateway' AND provider='asaas' AND ativo` cuja dona é a org **ou que a atende** (`fn_conta_atende_org`, `aplicar_20271011007000`). Zero ou uma; duas → erro explícito.

### 2.2 Edge Functions resolvem a conta pela org
Helper `_shared/asaasConta.ts`: `resolverContaAsaas(admin, organization_id)` → `{payment_account_id, base_url, api_key, env, tetos, piloto}`. Fallback **só enquanto nenhuma conta estiver cadastrada**: `ASAAS_API_KEY/ASAAS_ENV` do ambiente, com `console.warn`. Usado por `asaas-charge`, `asaas-payment`, `asaas-status-sync`.

### 2.3 Webhook grava a conta
- `client_charges.payment_account_id`, `supplier_payments.payment_account_id` (gravados na emissão/pagamento).
- Baixa por evento grava `internal_transactions.payment_account_id` = conta Asaas (título e linha `ASAAS_FEE`). Isso tira os pagamentos Asaas do "só baixado" errado do `ReconciliationDashboard` quando o extrato chegar (2.4). **Não** grava `bank_reconciled_at` — só `fn_reconcile_match` grava.
- Roteamento: token global permanece (uma conta hoje). O registro é localizado por `asaas_payment_id/asaas_bill_id/asaas_transfer_id`, que já carregam a conta. Multi-conta futura: `?conta=<id>` na URL + token por conta no Vault (`webhook_token_vault_id` já previsto).

### 2.4 Extrato da conta Asaas → `bank_transactions`
Edge `asaas-extrato-sync` (cron 1 h): `GET /v3/financialTransactions?startDate&finishDate` ⚠️ **campos a confirmar na OpenAPI** (esperado: `id, value, balance, type, date, description, paymentId, transferId, billId`). Grava em `bank_transactions` com `bank_account_id` = conta Asaas, `external_id` = id do movimento (idempotente), direção pelo sinal. Depois:
- **Vínculo determinístico**: movimento com `billId/transferId/paymentId` → `supplier_payments`/`client_charges` → título → `fn_reconcile_match` (grava `bank_reconciled_at` e `payment_account_id` real). Não passa pela heurística do motor.
- **Aporte Itaú → Asaas** e **repasse Asaas → Itaú**: débito numa conta + crédito na outra, mesma org → `pairInternalTransfers` já pareia (tolerância 1 dia). A regra "Repasse Gateway" fica como fallback para org sem conta Asaas cadastrada.
- `reconciliation_historic_until` da conta Asaas = data do cadastro (não conciliar passado).

### 2.5 UI
- `FinancialRegistryManager` (Organização › Contas): no drawer da conta, campo **Tipo** (banco/caixa/gateway). Com `gateway`: seção "Asaas" — ambiente, chave de API (campo write-only: mostra "cadastrada em dd/mm", botão "Trocar"; ⚠️ lição da captura: campo errado = cofre vazio, dar rótulo inequívoco), tetos, modo piloto, "Testar conexão" (`GET /v3/finance/balance` via Edge, devolve saldo). Multa/juros de `asaas_charge_config` passam a ser editados aqui também (hoje só no modal de emissão).
- Saldo Asaas aparece no card da conta (último `balance` do extrato).

**Testes:** `__tests__/asaasConta.test.ts` (seleção de conta: dona, atendida, duas → erro, nenhuma → fallback); SQL: conta cadastrada, chave no Vault só legível por service_role (tentar como `authenticated` deve falhar).

---

## Fase 3 — PIX a fornecedor / colaborador / sócio / avulso (~4 dias)

### 3.1 Fonte da chave por tipo de título (`Payable.party_type/party_id/supplier_id/source_system`)
| Favorecido | Fonte (origin/main) | Ajuste |
|---|---|---|
| Fornecedor | `supplier_bank_accounts` `is_pix_primary AND status='ativo'` (`pix_key`, `pix_key_type`) | nenhum |
| Colaborador | `employee_bank_accounts` `is_primary` (`pix_key`, `pix_key_type`; `aplicar_20271007000020`) | nenhum. Títulos LABOR **agrupados** por obra não têm colaborador → PIX só em título com `party_type='employee'` (rubricas individualizadas / `syncEmployeeToFinance`). Folha completa por colaborador = Fase 5 |
| Sócio | `company_partners.bank_account_id → company_bank_accounts (pix_chave, pix_tipo)`; fallback `company_partners.pix_chave` | nova coluna `company_partners.pix_tipo` + campo no formulário de sócio (localizar com `grep company_partners components/` em origin/main) |
| Avulso | chave digitada no drawer | validada por formato; favorecido nome/documento obrigatórios; teto próprio menor (`teto_avulso`, editável) |

O servidor **re-resolve a chave do cadastro** pelo id da conta bancária recebido — nunca aceita chave vinda do cliente, exceto no modo avulso (marcado `origem='manual'` em `supplier_payments`).

### 3.2 `utils/pixKey.ts` (puro, com `__tests__/pixKey.test.ts`)
`validarChavePix(tipo, chave)` → `{ok, chaveNormalizada, motivo}`: cpf/cnpj = dígitos + DV (reusar `validateCNPJ`/`validateCPF` existentes — `grep -rn "validateCNPJ" utils/`); email RFC simples; telefone → E.164 `+55DDDNNNNNNNN`; aleatória = UUID v4. `paraAsaas(tipo)` → `CPF|CNPJ|EMAIL|PHONE|EVP`. Usar também no `SupplierBankAccountsTab.tsx:156-158` e `LaborEmployeeBankAccounts.tsx`, que hoje não validam formato.

### 3.3 Edge `asaas-payment`: actions novas
- `pix_quote {organization_id, transaction_id, destino: {origem:'supplier'|'employee'|'partner'|'manual', bank_account_id? | pix_key?, pix_key_type?, favorecido_nome?, favorecido_documento?}}` → resolve chave, valida, aplica tetos/alçada (Fase 4) e devolve `{favorecido, chave_mascarada, tipo, valor, fee_estimada, bloqueios[]}` sem chamar a Asaas (⚠️ confirmar na OpenAPI se existe consulta de titular de chave; **não assumir** — se não existir, o favorecido exibido é o do cadastro).
- `pix_pay {…, schedule_date?}` → INSERT `supplier_payments` (`payment_type='PIX_TRANSFER'`, `transaction_id`, `supplier_id|party_id`, `pix_key`, `pix_key_type`, `beneficiary_name`, `payment_account_id`, status APPROVED) → `POST /v3/transfers {value, pixAddressKey, pixAddressKeyType, description, scheduleDate?, externalReference: transaction_id}` → grava `asaas_transfer_id`, `fee`, status `PENDING|SCHEDULED|DONE` (PIX pode voltar DONE na resposta) → título `business_status='APROVADO'` permanece até DONE; auditoria.
- `pix_cancel` → `DELETE /v3/transfers/{id}` ⚠️ confirmar endpoint na OpenAPI; só para SCHEDULED/PENDING.
- Idempotência: índice único parcial `supplier_payments(transaction_id) WHERE status IN ('PENDING','SCHEDULED','DONE')`.

### 3.4 Webhook / poller: `TRANSFER_*` (em `_shared/asaasEventos.ts`)
- `TRANSFER_DONE` → `supplier_payments` DONE (`authentication_code`, `receipt_url`, `fee`, `effectiveDate`) → título `PAGO/CONCILIATED`, `payment_date=effectiveDate`, `payment_type='PIX'`, `payment_account_id`=conta Asaas → taxa `ASAAS_FEE` → **mesma costura** de `payableService.darBaixa`: `processService.triggerForTransaction(id,'internal_transaction.paid')` (fazer via RPC/insert equivalente no Edge, ou deixar o front disparar — decidir ao implementar; registrar no plano versionado).
- `TRANSFER_FAILED/BLOCKED/CANCELLED` → FAILED/CANCELLED com `failure_reason` (`failReason`), título fica como estava.
- `TRANSFER_CREATED/PENDING/IN_BANK_PROCESSING` → só status.

### 3.5 UI — visão `parcelas` de Contas a Pagar (`ContasPagarParcelas.tsx`, origin/main)
- Nova ação por linha **"Pagar via Asaas"** (ícone `Landmark`), ao lado de "Pago" (`:1097-1109`), visível quando a org tem conta Asaas ativa. Abre `components/financeiro/PagarAsaasSheet.tsx` (Sheet padrão §, substitui `PagarBoletoAsaasModal`): o Sheet decide o meio — **boleto** se `source_system='BOLETO'` com `linha_digitavel` (fluxo `quote/pay` atual), senão **PIX**.
- Sheet PIX: favorecido, chave mascarada e tipo (ou campos para digitar no avulso), valor, taxa, data (hoje / agendar), status da alçada, teto restante do dia, checkbox "Confirmo o favorecido". Botão "Pagar" **desabilitado sempre com o motivo** (sem conta Asaas, não é gestor, alçada pendente, sem chave PIX cadastrada → link para o cadastro, acima do teto, piloto desligado para esta org).
- Coluna/badge "Asaas" na linha: `programado / enviado / pago / falhou` (via `supplierPaymentService.byTransaction`, novo) com link para o comprovante.
- Lote: "Pagar via Asaas" em lote **fica para a Fase 5**; o lote atual continua só baixa manual.
- Remover o botão da visão `notas` (`ContasPagarManager.tsx:1089-1099`) quando o da visão `parcelas` estiver no ar.

**Testes:** `pixKey.test.ts`; `asaasEventos.test.ts` (TRANSFER_*); teste de componente do Sheet (motivos do botão desabilitado); roteiro sandbox (abaixo).

---

## Fase 4 — Governança (~2 dias, pode andar junto com a 3)

- `asaas-payment` (`pay`, `pix_pay`, `cancel`): `exigirGestor` em vez de `exigirMembro` (`_shared/auth.ts:122-134`). `quote/pix_quote` seguem `exigirMembro`.
- **Alçada**: antes de `/bill` e `/transfers`, ler `internal_transactions.approval_status`: `APROVADO` → segue; `PENDENTE/REJEITADO` → 422 "aguardando alçada / rejeitado"; `RASCUNHO` → chamar `fn_resolve_approval_levels` — sem faixa para o valor → liberar (mesma semântica de `approvalService.submit` `semFaixa:'liberar'`), com faixa → 422 "título não foi submetido à alçada". Título de boleto já passa por `aprovarECriarInvoice` → `financialApprovalService`.
- **Tetos** (`payment_account_gateway`): por pagamento, por dia (soma de `supplier_payments` DONE/PENDING/SCHEDULED do dia na conta), avulso. Excedeu → 422 com os números.
- **Piloto**: `piloto=true` → só a org dona paga; `env='production'` exige `piloto=false` ou teto ≤ valor-piloto. Fica editável.
- **Auditoria**: tabela `supplier_payments_auditoria` (espelho de `boletos_auditoria`) por trigger em INSERT/UPDATE de `supplier_payments` (status antes/depois, ator = `approved_by_email`/`created_by_email`, `raw_response`). ⚠️ FK **sem** CASCADE (lição `boletos_auditoria`).
- **RLS** `supplier_payments`: INSERT/UPDATE pela aplicação só para owner/admin (helper existente — `grep -n "is_org_admin\|is_org_owner" supabase/migrations/ | tail`); service_role segue livre. SELECT continua por membro.

---

## Fase 5 — Deferido (só registrar)
Agendamento com calendário (backend já aceita `scheduleDate`); pagamento em lote respeitando alçada por título; folha completa por colaborador (opção de `syncPayrollToFinance` individualizado por `employee_id`); comissão de corretor (hoje não gera título); multi-conta Asaas com token de webhook por conta.

---

## Verificação

**Mecânica (toda fase):** `npx -y deno@2.1.4 check supabase/functions/asaas-*/index.ts supabase/functions/_shared/*.ts`; `npx vitest run __tests__/pixKey.test.ts __tests__/asaasEventos.test.ts __tests__/asaasConta.test.ts`; `npm run typecheck` (⚠️ Node 24: ler `exit=` por grep, repetir se cair); `bash scripts/check-ui-standard.sh components/financeiro/PagarAsaasSheet.tsx`; REGRA #7 nas migrations.

**Roteiro sandbox (conta `env='sandbox'` cadastrada na Alpa):**
1. Receber: emitir cobrança PIX de um recebível → QR aparece → `POST /v3/payments/{id}/receiveInCash` no sandbox → webhook `PAYMENT_RECEIVED` → título RECEBIDO com `payment_account_id` da conta Asaas e `payment_date` do payload; taxa `ASAAS_FEE` com conta. Depois `PAYMENT_REFUNDED` simulado → recebível volta a PREVISTO, taxa cancelada.
2. Saldo: o item 1 popula saldo sandbox.
3. Boleto: gerar boleto na própria conta sandbox (`POST /v3/payments` BOLETO), cadastrar a linha num `boletos` aprovado → "Pagar via Asaas" na visão parcelas → `BILL_PAID` → boleto `pago`, título PAGO, `supplier_payments.transaction_id` preenchido.
4. PIX: fornecedor com chave fictícia Bacen (CPF `99991111140`) → "Pagar via Asaas" → `TRANSFER_DONE` → título PAGO/CONCILIATED, comprovante. Repetir com colaborador, sócio e avulso. Tentar com usuário `USER` (403), com título sem alçada (422 com motivo), acima do teto (422).
5. Extrato: rodar `asaas-extrato-sync` → `bank_transactions` da conta Asaas → vínculo determinístico → `bank_reconciled_at` preenchido → Dashboard não mostra "só baixado".
6. Webhook perdido: pagar PIX com webhook desligado no painel → `asaas-status-sync` fecha o ciclo em ≤ 15 min.

**Produção (piloto, após Fase 0 e sandbox verdes):** cadastrar conta `env='production'`, `piloto=true`, teto por pagamento baixo (ex. R$ 500) por 2 semanas; 1º PIX real para fornecedor conhecido; conferir no painel Asaas + extrato Itaú o aporte pareado. `bash scripts/conferir-producao.sh "Pagar via Asaas"` após o push; SQL de prova: `supplier_payments` DONE com `transaction_id` e `payment_account_id`, título com `bank_reconciled_at`.

---

## Riscos e armadilhas específicas deste código
- `ContasPagarParcelas.tsx` mudou 403 linhas em `origin/main` — **nunca** editar a partir do checkout atrasado.
- Org do modal atual é a **do fornecedor** (1.12) — em "Todas" ou org atendida isso dispara pagamento na org errada.
- `payment_date=hoje` e ausência de `payment_account_id` fazem o DRE/caixa cair no mês/conta errados (1.3, 2.3).
- `pairInternalTransfers` exige extrato das **duas** contas e mesma org — se a conta Asaas "atende" outra org, o aporte entre orgs não pareia (registrar; é o mesmo pendente da conta Itaú/Altair).
- PIX pode voltar `DONE` **na resposta** do `POST /transfers`: tratar no `pix_pay` sem esperar webhook, com a mesma função de `asaasEventos`.
- `supplier_payments.status` tem CHECK fechado — `REFUNDED`/`BLOCKED` mapeiam para FAILED com `failure_reason`, não ampliar o enum sem migrar a projeção FP&A (`aplicar_20270915000005` lê esses status).
- Índice único parcial + `upsert` = 42P10 — usar INSERT com verificação prévia.
- Campos da OpenAPI marcados ⚠️ devem ser confirmados antes de codar (`financialTransactions`, cancelamento de transfer, consulta de titular de chave). Sem OpenAPI no repo — pedir ao usuário o arquivo usado em 03/07/2026.
- Sandbox não aceita boleto externo nem PIX real — o cenário "boleto real de fornecedor" só se prova no piloto com teto.

## Ordem e esforço
F0 (usuário, em paralelo) → F1 (3 d) → F2 (4 d) → F3 (4 d) → F4 (2 d) → sandbox → piloto 2 semanas. Cada fase é um push em `main` próprio (deploy), com a parte visível desligada pela ausência de conta `gateway` até a F2.
