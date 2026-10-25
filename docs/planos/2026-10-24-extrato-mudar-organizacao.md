# Conciliação Bancária › Extrato — mudar a organização do lançamento (célula e lote)

## Pedido original
> permitir alterar organizacao individualmente e em lote
>
> Sessão: a8e2ea08-5228-4f48-a778-da2044c30bf2 · 24/10/2026 (logo após a coluna Organização, PR #146)

## O que o banco diz (lido antes de desenhar)
- RLS de `bank_transactions`: `is_org_member(organization_id)` sem `WITH CHECK` próprio → o UPDATE só passa se o usuário for membro da org de DESTINO.
- `trg_block_period_bank_tx`: recusa se o período estiver fechado na org de origem OU de destino.
- Saldo bancário / fluxo de caixa (`fn_fi_saldo_bancario`, `fn_cashflow_position`) somam pela org da CONTA — mudar a org do lançamento não mexe no saldo.
- `fn_generate_internal_from_bank` cria o título na org do LANÇAMENTO; `fn_reconcile_match` aceita título da mesma org ou de org que a conta atende (`fn_conta_atende_org`).
- Motor: pontuação por `bank_account_id`; só a detecção de transferência entre contas usa `organization_id`.

## Decisões tomadas (precedente: "mover boleto de organização", plano 2026-09-24)
| Data | Pergunta | Resposta |
|---|---|---|
| 24/10/2026 | Para onde pode ir? | Organizações que a **conta atende** (dona + "Atende também") ∩ as que o usuário grava (`useWritableOrganizations`). Conta que só atende a dona → campo travado com o motivo e o caminho para liberar. |
| 24/10/2026 | Conciliado muda? | Não: MATCHED / CONFIRMED / TRANSFER / LOCKED ficam travados ("desfaça a conciliação"). O valor continua legível e o motivo vai no `title`. |
| 24/10/2026 | E as dimensões? | Obra, Centro de Custo e Plano de Contas de OUTRA org (ou de org desconhecida) são limpos — com confirmação antes. Os da org de destino ficam. Categoria e contraparte (texto) ficam. |
| 24/10/2026 | Lote com linha conciliada? | Recusa o lote inteiro antes de gravar, dizendo quantas — nada de aplicar parcialmente em silêncio. Dimensão escolhida no próprio lote precisa ser da org de destino. |
| 24/10/2026 | Pendentes? | Não: o pedido segue a coluna Organização, que só existe na aba Extrato. O modal de lote da Pendentes não recebe o campo. |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/extratoMudarOrganizacao.ts` (novo) | `motivoParaNaoMudarOrganizacao`, `planoDaMudanca` | `__tests__/extratoMudarOrganizacao.test.ts` (10 casos) |
| `components/reconciliation/tabelasDaConciliacao.tsx` | célula Organização vira seletor (ou texto com motivo) | tela |
| `components/BankTxEdicaoEmLoteModal.tsx` | campo Organização opcional | tela |
| `components/BankReconciliation.tsx` | destinos da conta, handler individual, lote com validação/confirmação/gravação por grupo | tela + gravação |

## Estado
- [x] util + testes 10/10; `tsc --noEmit` rc=0 (0 erros); `check-ui-standard.sh` 0 violações nos 3 `.tsx`
- [x] tela real SEM gravar (escritas abortadas no navegador; 0 tentativas de PATCH/POST): seletor com as 4 orgs graváveis atendidas pela conta; mudar org de linha com CC de outra org abre a confirmação ("Centro de Custo é de outra organização e será limpo") e Cancelar não grava; linha conciliada sem seletor e com o motivo; lote com o campo e o aviso. Script `c:/tmp/pwtest/extrato-mudar-org.js`
- [x] gravação real, autorizada pelo usuário em 25/10/2026 ("autorizado"): conta Sicredi, 26/06/2026, destino Garden. Célula: MUNICIPIO DE CAMBUI R$ 201,71 → Garden (banco confirmou; tela atualizou sem recarregar) → Alpa (banco confirmou). Lote: CAMBUI CARTORIO R$ 6.445,63 + R$ 7.189,02 → Garden (banco confirmou os 2; o 3º lançamento não foi tocado) → Alpa. Foto antes × depois dos 3 lançamentos idêntica campo a campo; a restauração por SQL do `finally` não precisou agir. Script `c:/tmp/pwtest/extrato-mudar-org-grava.js`
- [ ] PR + CI
