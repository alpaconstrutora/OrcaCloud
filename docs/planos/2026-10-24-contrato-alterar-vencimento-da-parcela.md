# Contrato › Financeiro › Parcelas: alterar o vencimento de uma parcela à mão

## Pedido original

Sessão de 24/10/2026. Depois do #131 (parcelas só na sub-aba Parcelas), eu disse que a edição do
vencimento linha a linha tinha saído de Dados Gerais e ofereci: *"Se quiser mudar a data de
vencimento de uma parcela pela sub-aba Parcelas (hoje lá só se altera o valor), é só pedir."*

> Implemente

## Decisão de desenho

Mesmo desenho do valor alterado à mão (`docs/planos/2026-10-19-contrato-alterar-valor-da-parcela.md`):
uma **marca na parcela** que os syncs do contrato respeitam, em vez de mexer no cronograma.

- Por que marca e não `payment_schedule[n-1].date`: o cronograma só existe no Parcelado. No À Vista
  a data sai de `start_date + payment_days`, e no Recorrente da cadência. Os três syncs regravam
  `due_date`/`transaction_date` no upsert. Uma regra única em `planejarSyncParcelas` cobre os
  três (a Medição não é regerada por sync).
- O cronograma dos Dados Gerais **não** muda: o vencimento não altera o valor acordado, e mexer
  numa data do cronograma quebraria `lerParametrosDoCronograma` (Entrada/Nº/Periodicidade).
- Botão próprio (calendário, `ActionIconButton kind="reschedule"`) ao lado do lápis de "Alterar
  valor", com painel próprio: as duas alterações são independentes, cada uma com sua marca.

## Itens

1. [x] **`supabase/migrations/aplicar_20271024850000_internal_tx_vencimento_manual.sql`** —
   `vencimento_manual` (bool, padrão false), `_anterior` (date), `_em`, `_por`. Só colunas (REGRA #7
   não se aplica). Pronto quando: as 4 colunas existem no banco. **Aplicada em 24/10/2026** por
   `db query --linked -f`; `information_schema` mostra as 4, com o padrão `false` e NOT NULL na
   primeira; `NOTIFY pgrst, 'reload schema'` em seguida. `migrationsPrefixo.test` verde.
2. [x] **`utils/contratoParcelaVariavel.ts`** — `planejarSyncParcelas` trata como "manual" a parcela
   aberta com valor **ou** vencimento alterado (`parcelaComAlteracaoManual`). O lote `manuais` leva
   TODAS as colunas extras em toda linha (o upsert grava a união das chaves). A data da linha só
   vale com `vencimento_manual`, e o valor da linha só com `valor_manual`. Também `marcaDeVencimentoManual`.
   Pronto quando: `__tests__/contratoParcelaVencimentoManual.test.ts` (8) passa e os 7 de
   `contratoParcelaManual.test.ts` continuam passando.
3. [x] **`services/contractService.ts`** —
   - `updateFinancialEntry` marca a parcela quando `due_date` difere do atual;
   - `listFinancialEntries` lê as colunas e o nome de quem alterou;
   - `generateRecurringInstallmentsForPeriod` (opção `replaceExisting`) não apaga parcela com vencimento manual.

   Pronto quando: `__tests__/contractVencimentoManualSync.test.ts` (5) passa. Ele cobre o
   `updateFinancialEntry` (marca, e não marca com a mesma data) e os syncs Parcelado, Recorrente e
   À Vista mantendo a data. Também tem de continuar passando o `contractSyncPreservaParcelas.test.ts`.
4. [x] **UI**:
   - `components/contracts/AlterarVencimentoParcelaSheet.tsx` (novo; `Sheet` md, campo de data, botão
     desligado com motivo, histórico em âmbar);
   - `components/ui/ActionIconButton.tsx` (`reschedule` → `CalendarClock`);
   - `components/ContractDetailView.tsx`: o botão na coluna Ações, travado com motivo em parcela
     paga/conciliada ou cancelada; o selo "Alterado manualmente" na célula da Data, com quem, quando
     e o vencimento gerado pelo contrato no hover; largura de Data 130→190 e de Ações 90→110.

   Pronto quando: `__tests__/components/AlterarVencimentoParcelaSheet.test.tsx` (4) passa,
   `check-ui-standard.sh` dá rc=0 nos 3 `.tsx` e o harness abaixo confere.
5. [x] **Verificação**:
   - `tsc --noEmit` rc=0;
   - 17 arquivos de teste de contrato, migration e guarda de organização: 147/147 verdes;
   - testes novos vermelhos antes do código: 11 de 13 (os 2 que passavam são os casos de "não
     marcar" e "pode apagar", que já valiam).
   - Harness `docs/spikes/contrato-parcela-vencimento/`: o `ContractDetailView` real, com os serviços
     substituídos no navegador e as escritas para o Supabase bloqueadas. O Playwright conferiu:
     - 2 botões ativos e 1 travado com o motivo (a parcela conciliada);
     - o painel abre com a data atual e "Salvar" fica desligado sem mudança;
     - ao salvar, grava `{ due_date: '2026-11-20' }`;
     - a célula mostra "20/11/2026 · Alterado manualmente", e o hover mostra quem, quando e o
       vencimento gerado pelo contrato (10/11/2026);
     - nenhum erro de página.
6. [x] PR + CI + publicação — PR #136, `ci` 17min58s verde; squash `1868f28c` em 24/10/2026; `conferir-producao.sh "Alterar vencimento da parcela"` ✅

## Fora do escopo

- O selo também não aparece em Contas a Pagar/Receber, como já acontecia com o do valor (exigiria
  recriar `vw_payables`/`vw_receivables`).
- Gravação real numa parcela de produção não foi feita. O caminho do banco é coberto pelos testes do
  serviço, e a escrita em dado real fica para quando o usuário liberar um contrato de teste.
