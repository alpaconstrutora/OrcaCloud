# Contas a Pagar — Pagamento avulso (gerado manualmente)

## Pedido original

Sessão de 17/10/2026 (Claude Code, VS Code), literal:

> fianceiro > contas a pagar: implementar opcao de pagamento avulso (gerado manualmente)

Decisões do usuário no plan mode (mesma sessão, AskUserQuestion):

1. **Nasce como?** — "Ambos, com chave 'Já pago'": por padrão nasce em aberto (Previsto,
   com vencimento); com "Já pago" ligada pede data do pagamento e conta e entra como Pago.
2. **Anexo agora?** — "Sim, um arquivo por título".
3. **Parcelas?** — "Sim, nº de parcelas + periodicidade".

## Contexto

Contas a Pagar não tinha como criar título pela tela — só exibia parcelas nascidas de
Pedido, Contrato, Boleto, Folha, Tributo etc. `payableService.create` já gravava
`source_system='MANUAL'`, mas ninguém chamava (código morto registrado em
`2026-08-06-kpis-locacao-primitivas.md`). A tela já exibia e excluía linha MANUAL.

## Decisões de desenho

- **Modelo:** um título avulso é uma linha de `internal_transactions` com
  `source_system='MANUAL'`, `direction='DEBIT'`. Sem tabela nova.
- **Parcelas:** N linhas, valor dividido por `gerarCronogramaContrato` (sobra dos
  centavos na última, `somarMeses` sem transbordo). `reference_id = '<grupo>:p<k>'`
  amarra as parcelas; descrição ganha `(k/N)`; `installment_type` = código da
  periodicidade (`UNICA` com 1 parcela).
- **"Já pago" só com 1 parcela** — um pagamento feito é um evento. A conta vai no
  INSERT; data e forma vão pela baixa (`darBaixa`, que grava `payment_date` explícito).
- **Alçada:** todo título nasce em aberto e passa por
  `financialApprovalService.submitForApproval` (como o boleto); abaixo do piso vira
  APROVADO sem mexer no `business_status`. **"Já pago" é a baixa logo em seguida, pelo
  `payableService.darBaixa`** — que recusa título pendente na alçada (decisão de
  17/10/2026, plano 2026-10-16 item H.1). Se cair na alçada, o título fica criado e
  aguardando aprovação, e a tela avisa; gravar PAGO direto no INSERT passaria por cima
  da alçada. (Desenho revisto na execução — o rascunho dizia "pago não passa pela
  alçada", escrito antes de ver o H.1.)
- **Editar valor** de título em aberto devolve o título à alçada (aprovação de R$ 1.000
  não vale para R$ 10.000). Título pago não se edita pela linha: estorna antes.
- **Anexo:** colunas `documento_path`/`documento_nome` na própria linha; bucket privado
  `financeiro-anexos`, path `<org>/avulso/<grupo>/<arquivo>`; as parcelas compartilham o
  arquivo; excluir um título só apaga o arquivo se nenhum outro aponta para ele.
- **Credor:** `supplier_id` do cadastro (antes de `party_name`); sem cadastro, texto livre.
  Nunca `party_id` (FK só para `clients`).
- **Organização:** `resolveWriteOrg('single')` — topo em org/empresa não pergunta nada.
- **Rótulo da origem MANUAL em Contas a Pagar:** "Avulso".

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | Migration `aplicar_20271018300000_contas_pagar_avulso_anexo.sql`: colunas `documento_path/nome`, bucket `financeiro-anexos` + 4 policies por `is_org_member`, `vw_payables` com as colunas novas no fim | `segurancaMigrations` + `migrationsPrefixo` verdes; aplicada e conferida por `db query` | ✅ aplicada 17/10 com autorização; bucket `public=false`, 4 policies, view `security_invoker=on`, 2.088 linhas lidas |
| 2 | `utils/pagamentoAvulso.ts` (puro) + `__tests__/pagamentoAvulso.test.ts` | teste verde: 1×, 3× com sobra, 31/jan bimestral, já pago, obra de sistema → null, validações | ✅ 15/15 |
| 3 | `services/payableService.ts`: `createAvulso`, `getAvulso`, `updateAvulso`, `urlDoAnexo`, `remove` limpa arquivo órfão | typecheck verde; inserção real grava as colunas | ✅ tsc 0 erros; gravação real feita no item 7 |
| 4 | Ramo `MANUAL` no resolvedor de documento de origem (`_shared/origemDoLancamento.ts`) | teste do resolvedor cobre MANUAL | ✅ `origemDoLancamentoAvulso.test.ts` 2/2 + os 2 testes antigos do resolvedor |
| 5 | `components/financeiro/PagamentoAvulsoSheet.tsx` (criar/editar) | `check-ui-standard.sh` exit 0 | ✅ |
| 6 | `ContasPagarManager`/`ContasPagarParcelas`: botão "Novo pagamento avulso", Editar/Ver documento na linha MANUAL, rótulo "Avulso", estado vazio | `check-ui-standard`, `check-system-projects`, `check-project-classification`, `orgContextGuard` verdes | ✅ todos exit 0 |
| 7 | Verificação no app de verdade (Playwright) + linhas conferidas no banco | roteiro abaixo executado | ✅ ver resultado abaixo |
| 8 | Republicar a Edge Function `client-portal-rateio-comprovantes` (usa o resolvedor compartilhado) — autorizado pelo usuário | sonda sem credencial continua recusada | ✅ v3 → v4, `verify_jwt` segue ligado; sem header = 401, anon + token falso = 403 |
| 9 | Publicação (push em main) | `conferir-producao.sh "Novo pagamento avulso"` acha o texto no bundle servido | ✅ domínio serve `fa95739` (carimbado) e o texto está no bundle |

## Roteiro de verificação (item 7)

- avulso 1× em aberto com anexo → "Avulso", Previsto, Credor/CC/Plano/Obra certos, "Ver documento" abre;
- 3× mensal R$ 100,00 → 33,33/33,33/33,34, (1/3)…(3/3), vencimentos certos;
- "Já pago" → linha Pago com data de pagamento;
- editar e excluir um avulso;
- topo em "Todas" → pergunta a organização; topo numa org → não pergunta;
- `internal_transactions` conferida por `db query`.

### Resultado (17/10/2026, conta agente-leitura, org Alpa, localhost)

Escopo autorizado: UM título de teste (R$ 1,00), excluído no fim. Os 3× e o "Já pago"
foram conferidos na tela **sem gravar** (prévia e estado da chave) e pela parte pura.
`process_templates` respondido vazio no Playwright: a Alpa tem modelos ATIVOS em
`payable.approved`/`payable.settled` sem valor mínimo — um título de teste abriria
processo de verdade.

- OK botão na visão Parcelas; topo na org → não perguntou organização;
- OK prévia 3× de R$ 1,00 = 0,33 / 0,33 / 0,34 (17/10, 17/11, 17/12); "Já pago" desligado com 3 parcelas;
- OK lançado → linha "Avulso", credor certo, destacada pelo deep-link;
- OK "Ver documento" abre URL assinada de `financeiro-anexos`;
- OK edição reabre descrição e anexo; salvar atualiza a linha;
- OK exclusão pela tela. Duas rodadas anteriores do roteiro falharam no MEIO (seletor do
  roteiro, não do app) e deixaram 2 títulos de teste; a rodada final excluiu os 3 pela tela.
- Banco depois: 0 títulos `TESTE Claude avulso%`, 0 objetos no bucket (anexo órfão
  removido nas 3 exclusões), 0 `process_instances` criados no período.
- Suíte completa: 10.215 passaram, 1 falha em `PainelVersoes.test.tsx` (Planta, fora
  desta frente) que passa sozinho (26/26) — instabilidade conhecida da suíte cheia.
