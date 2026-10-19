# Contrato › Financeiro › Parcelas: alterar o valor de uma parcela à mão

## Pedido original
> suprimentos > contratos > aba financeiro: permitir alterar o valor de uma fatura manualmente.

Sessão c7448b3f · 19/10/2026

> incluir também uma identificacao que a parcela foi alterada manualmente

(mesma sessão, 19/10/2026, durante o planejamento)

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Qual "fatura" fica editável? | Lançamentos Financeiros (sub-aba Parcelas) — o Histórico de Consumo já tem edição |
| 19/10/2026 | Ao alterar a parcela, o total do contrato muda? | Perguntar se ajusta o total, como na Negociação |

## Andamento
- [x] 1. Migration `valor_manual*` — `aplicar_20271019610000`, aplicada no banco remoto em 19/10/2026; as 4 colunas conferidas em `information_schema`.
- [x] 2. Regra pura + teste — `planejarSyncParcelas` / `marcaDeValorManual` em `utils/contratoParcelaVariavel.ts`; `__tests__/contratoParcelaManual.test.ts` (7 testes). `parcelaBaixada` passou a reconhecer também `status = 'PAID'`.
- [x] 3. Syncs do contrato + `updateFinancialEntry` — `__tests__/contractSyncPreservaParcelas.test.ts` (4 testes) FALHA nos 4 com o `contractService.ts` antigo e passa com o novo.
- [x] 4. UI — coluna Ações (com espaçador §6.1.1), painel `components/contracts/AlterarValorParcelaSheet.tsx` (`size="md"`, não `sm`: o `sm` tem 384px e o UI_PATTERNS exige ≥ 420px), selo "Alterado manualmente" com quem/quando/valor anterior no hover, pergunta do total. Salvar os Dados Gerais e Lançar Financeiro agora recarregam a sub-aba Parcelas sem spinner. `check-ui-standard.sh` exit 0 nos dois arquivos; `__tests__/components/AlterarValorParcelaSheet.test.tsx` (3 testes).
- [ ] 5. Verificação — 5 de 6:
  - [x] Tipos: `tsc` do projeto inteiro achou 3 TS2352 (cast do `select` concatenado), corrigidos. Depois disso o `tsc` inteiro caiu 3× com segfault (exit 139, instabilidade da máquina, sem `error TS`); o subconjunto dos arquivos tocados + tudo que eles importam (inclusive `DealModal`) deu exit 0.
  - [x] Suíte inteira: 10.415 = 10.380 passaram + 34 pulados + 1 pendente (`ContasPagarParcelasAgrupar`, "ainda rodando" ao gerar o JSON; isolado passa 5/5). 0 falhas.
  - [x] Interface, SÓ LEITURA (contrato 010, Alpa Construtora; escritas em `internal_transactions`/`contracts` bloqueadas no navegador): coluna Ações; 21 botões ativos = 21 pendentes; 3 travados com o motivo = 3 baixadas; painel abre com "Salvar valor" desligado e o motivo; digitar habilita; Esc com alteração pede confirmação; 0 erros de JS/console/HTTP.
  - [x] Selo "Alterado manualmente" e histórico no painel conferidos na tela com a marca INJETADA só na resposta do navegador (nenhuma escrita).
  - [x] Gravação real (liberada pelo usuário em 19/10/2026), contrato `TESTE-VALOR-MANUAL` na Garden Cambuhy, Playwright + conferência no banco:
    - Lançar Financeiro → 3 parcelas; parcela 2 → R$ 1.350 → "Manter valor": linha com `valor_manual`, `valor_manual_anterior` 1000, `valor_manual_por` = quem alterou; selo com nome e data na tela; contrato seguiu em R$ 3.000;
    - Salvar Dados Gerais: p1/p3 recriadas pelo sync, p2 manteve a MESMA linha (id e created_at) e o valor;
    - p1 marcada CONCILIATED no banco → Salvar Dados Gerais + ajuste do total: p1 manteve o mesmo id, lápis travado com o motivo;
    - parcela 3 → R$ 1.200 → "Atualizar valor do contrato": original/current = 3.550, cronograma[3] = 1.200;
    - limpeza: parcelas, entradas do cofre "Gestão Comercial" e o contrato removidos (0/0; cofre voltou a 1 transação, a que já existia).
    - Aviso de console nas duas fases: `select` com `value` nulo no formulário dos Dados Gerais (`ContractModal`, não tocado) — o contrato de teste foi criado por SQL com campos nulos; não aparece na leitura sem abrir Dados Gerais.
  - [ ] Typecheck do projeto inteiro: fica com o CI (Linux) no push.

## Contexto
- A tabela fica em `components/ContractDetailView.tsx`, `activeTab === 'financeiro'`, sub-aba `parcelas` (~2913–3047 em origin/main). Hoje é **só leitura**: não tem coluna de ações.
- As linhas são `internal_transactions` com `source_system` `CONTRACT_AVISTA`, `CONTRACT_PARCELADO`, `CONTRACT_RECURRING` ou `CONTRACT_MEASUREMENT`. Contas a Pagar lê a mesma tabela, então a alteração aparece lá sem trabalho extra.
- **O serviço de edição já existe:** `contractService.updateFinancialEntry(entryId, { amount })`. Ele recusa parcela paga ou conciliada, grava `original_amount`/`amount` e respeita o desconto. Hoje só o `DealModal` o usa.
- **Problema que impede a edição de sobreviver** (confirmado em origin/main):
  - `syncParceladoScheduleToFinance` apaga **todas** as `CONTRACT_PARCELADO` e `CONTRACT_MEASUREMENT` do contrato, **inclusive as pagas**, e recria tudo como PENDING.
  - `syncAVistaToFinance` faz o mesmo com a linha À Vista.
  - Os dois rodam a cada "Salvar" dos Dados Gerais, porque `updateContract` re-sincroniza quando `'original_value' in updates`, e o formulário sempre manda o objeto inteiro.
  - Também rodam em "Lançar Financeiro" e no reajuste.
  - Resultado: hoje um valor editado à mão some no próximo save. Pior, uma parcela paga volta a ser PENDING, e o vínculo de conciliação some por CASCADE.
  - `syncRecurringToFinance` já poupa as baixadas (`semParcelasBaixadas`), mas sobrescreveria um valor manual.
  - O reajuste do recorrente regrava `amount` de todas as pendentes futuras.

## Trabalho
Fazer numa frente: `bash scripts/nova-frente.sh contrato-valor-parcela-manual`. O checkout de integração está 936 commits atrás.

Copiar este plano para `docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md` (REGRA #6) e mantê-lo vivo.

### 1. Migration: marca de valor manual
- **Arquivo:** `supabase/migrations/aplicar_<prefixo>_internal_tx_valor_manual.sql`.
- **O que muda:** em `internal_transactions`, `ADD COLUMN IF NOT EXISTS` de quatro colunas, cada uma com `COMMENT` explicando a regra:
  - `valor_manual boolean NOT NULL DEFAULT false`;
  - `valor_manual_anterior numeric`, o valor antes da primeira alteração manual;
  - `valor_manual_em timestamptz`;
  - `valor_manual_por uuid`, que aponta para o `auth.uid()` de quem alterou.
- Não cria função nem policy, então a REGRA #7 não se aplica.
- **Prefixo:** escolher depois de `git grep` nos dígitos de todos os nomes, deixando folga. O último em origin/main é `20271019300000`. Rodar `migrationsPrefixo.test` depois.
- **Aplicação:** `npx supabase db query --linked -f …`, nunca `db push`.
- **Pronto quando:** `SELECT column_name FROM information_schema.columns WHERE table_name='internal_transactions' AND column_name='valor_manual'` devolve 1 linha.

### 2. Regra pura: o sync poupa parcela baixada e valor manual
- **Arquivo:** `utils/contratoParcelaVariavel.ts`, ao lado de `parcelaBaixada` e `semParcelasBaixadas`, que são reaproveitados.
- **O que muda:** nova função `aplicarParcelasPreservadas(lote, existentes)`:
  - tira do lote as parcelas cuja `reference_id` existe **baixada**, como já faz `semParcelasBaixadas`;
  - nas que existem com `valor_manual = true` e ainda pendentes, mantém `amount`, `original_amount`, `discount_type` e `discount_amount` e preserva `valor_manual: true`.
- Junto vai `idsApagaveisNoSync(existentes)`, que devolve só as linhas não baixadas.
- **Pronto quando:** existe `__tests__/contratoParcelaManual.test.ts` e ele passa, cobrindo:
  - baixada fica fora do lote;
  - manual pendente mantém o valor;
  - manual cuja parcela saiu do cronograma não é preservada;
  - linha sem a flag segue o contrato.

### 3. Syncs do contrato respeitam a regra
- **Arquivo:** `services/contractService.ts`.
- **O que muda:**
  - `syncParceladoScheduleToFinance`: lê as existentes com `id, reference_id, status, business_status, valor_manual, amount, original_amount, discount_*`. Apaga **só as não baixadas**, tanto PARCELADO quanto MEASUREMENT. Faz o upsert do lote passado por `aplicarParcelasPreservadas`.
  - `syncAVistaToFinance`: se a linha À Vista existente está baixada, não apaga nem insere. Se é manual pendente, regrava preservando o valor.
  - `syncRecurringToFinance`: troca `semParcelasBaixadas` por `aplicarParcelasPreservadas`.
  - `generateRecurringInstallmentsForPeriod`, com `replaceExisting`: não apaga a parcela manual e trata a data dela como existente, para não recriar.
  - `applyReajuste` no recorrente: o `update({ amount })` ganha `.eq('valor_manual', false)`. O parcelado já é coberto pelo sync.
  - `updateFinancialEntry`: quando `amount` ou desconto mudam, grava:
    - `valor_manual: true`;
    - `valor_manual_em: now`;
    - `valor_manual_por: usuário da sessão`;
    - `valor_manual_anterior`, só na primeira alteração, para guardar o valor gerado pelo contrato.
  - A regra vale também para o DealModal, o que é inofensivo e desejável. A preservação do item 2 mantém essas quatro colunas.
  - `listFinancialEntries`: passa a selecionar `valor_manual`, `valor_manual_anterior`, `valor_manual_em`, `valor_manual_por` e `business_status`.
- **Pronto quando:** existe um teste em `__tests__/` com o supabase mockado, no padrão dos testes de contractService que já existem, e ele prova duas coisas: o sync parcelado não apaga linha CONCILIATED e mantém o valor manual. Também é preciso fazer o roteiro manual do item 5.

### 4. UI: botão Alterar valor e painel lateral
- **Arquivos:** `components/ContractDetailView.tsx` e um novo `components/contracts/AlterarValorParcelaSheet.tsx`. Fazer `ls` antes do Write para não sobrescrever nada.
- **Tabela:** nova coluna **Ações** fixa, no fim da tabela de Lançamentos Financeiros, com `ActionIconButton kind="edit"` e título "Alterar valor".
  - Em parcela baixada (`parcelaBaixada`), o botão fica desligado, envolvido em `<span className="inline-flex" title="Parcela já paga ou conciliada — estorne no financeiro antes de alterar.">`, porque o ActionIconButton desligado esconde o `title`.
  - **Identificação de parcela alterada manualmente** (pedido do usuário durante o planejamento):
    - na célula de Valor, um selo de texto visível "Alterado manualmente", em âmbar, seguindo §8 do guia: texto colorido simples, sem pílula `rounded-full uppercase`;
    - no hover, o título diz quem alterou, quando e o valor anterior: *"Alterado por Fulano em 19/10/2026 14:32 · valor gerado pelo contrato: R$ X · o contrato não sobrescreve este valor"*;
    - o nome vem de `valor_manual_por`, resolvido pelo mesmo resolvedor de perfil já usado na tela; se não houver, aparece "usuário";
    - o painel de edição mostra o mesmo histórico quando a parcela já foi alterada;
    - o valor nunca aparece em cinza-claro.
- **Painel:** `Sheet` no tamanho `sm`, usando `ContractRetentionReleaseModal.tsx` como modelo. Mostra descrição, vencimento e valor atual. Tem um campo "Novo valor" em moeda, com o desconto existente refletido no líquido. O painel tem `dirty`, e os botões são Cancelar e Salvar.
- **Ao salvar:**
  1. chamar `updateFinancialEntry(id, { amount })`;
  2. recarregar com `listFinancialEntries` (hoje a lista só carrega na entrada da tela; criar um `recarregarParcelas` e usar também depois de "Lançar Financeiro");
  3. mostrar um toast.
- **Pergunta do total** (`useConfirm`, mesmo texto e padrão do `perguntarCorrigirTotalContrato` do DealModal; só para PARCELADO e AVISTA, porque recorrente e medição não têm "total" a casar):
  - **Parcelado:** soma das parcelas lançadas após a edição × `contract.original_value`. Se diferente e confirmado, chamar `updateContract(id, { original_value: soma, payment_schedule })`, com `payment_schedule[n-1].value` = novo valor; `n` vem do `:p<n>` da `reference_id`. Assim os Dados Gerais ficam coerentes. O sync que dispara preserva o manual e as pagas.
  - **À Vista:** novo valor × `original_value`; confirmado, `updateContract(id, { original_value: novo })`.
  - "Manter valor" não muda nada no contrato.
  - Depois, `setContract(updated)`. Verificar que o formulário embutido dos Dados Gerais reflete o novo total.
- **Regras de UI:** ler `docs/ui_ux_guia_unificado.md` inteiro e `UI_PATTERNS.md` antes de editar. Depois, `bash scripts/check-ui-standard.sh` nos dois arquivos.
- **Pronto quando:** `check-ui-standard.sh` dá exit 0 nos dois arquivos, `npm run typecheck` passa e o roteiro do item 5 passa.

## Verificação (item 5)
1. Rodar `npx vitest run __tests__/contratoParcelaManual.test.ts` mais o teste do item 3, depois a suíte inteira. Ler o resultado antes de qualquer push. Rodar também `npx vitest run __tests__/orgContextGuard.test.ts`.
2. Rodar `npm run typecheck`.
3. Na interface (skill `rodar-app` / Playwright), com um contrato de suprimentos **de teste** parcelado:
   - alterar o valor da parcela 2 e conferir, na tabela, o valor novo e o selo "Alterado manualmente", cujo hover deve mostrar quem alterou, quando e o valor anterior; conferir o mesmo valor em Contas a Pagar;
   - responder "Manter valor", salvar os Dados Gerais e conferir que a parcela 2 mantém o valor;
   - repetir respondendo "Atualizar total" e conferir que o Valor do contrato e o cronograma nos Dados Gerais mudaram;
   - conferir que uma parcela paga tem o botão desligado e mostra o motivo no hover.
4. No banco, confirmar que `valor_manual = true` só na linha editada. Limpar o contrato de teste no fim.

## Fora do escopo (registrar no plano)
- O selo "Alterado manualmente" fica só na aba do contrato. Levá-lo a Contas a Pagar exige recriar `vw_payables` com as colunas novas. Fica como próximo passo, se o usuário quiser.
- `updateContract` re-sincroniza a cada save mesmo sem mudança de valor. Com a preservação, deixa de destruir dados, mas continua apagando e reinserindo as pendentes. Fica anotado.
- O recorrente com obra grava no JSON do projeto, com origem `PROJECT`, e não aparece nesta aba. Isso não muda.
