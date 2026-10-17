# Suprimentos › Contratos — Número do Contrato sem cinza + recibo com objeto e itens do contrato

## Pedido original
> suprimentos > contratos:
> 1. mais uma vez voltamos ao tema do texto cinza. Aqui temos mais um exemplo no campo Número do Contrato. corrigir
> 2. Recibo emitido referente a um contrato deve trazer o campo Título / Objeto (aba resumo) . para identificar do que se trata o recibo.  e também trazer os itens do contrato (aba itens do contrato)
>
> (com dois prints: o card "Identificação do Contrato" com o Número `CTS-010-036-0002` em
> cinza-claro, e o recibo nº 000001 de pagamento a Débora Cristina Duarte — "Fatura
> Contrato CTS-010-036-0001 (1) - agosto de 2021", R$ 600,00)
>
> Sessão: 83f5b348-da9b-4399-8193-c0b488188cfe · 17/10/2026

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | Os 5 recibos já emitidos ligados a contrato (1 de pagamento, 4 de recebimento)? | **Completar e regerar**: gravar objeto e itens nesses registros e regerar o PDF no Storage (número não muda) |
| 17/10/2026 | Colunas da tabela de itens no recibo? | **Completa**: Item · Unid. · Qtd. · Valor unit. · Total |
| 17/10/2026 | Só o campo, ou campo + trava? | **Campo + trava** (teste-guarda em catraca); os outros casos achados ficam no BASELINE e são listados para decisão — não mexer sem aval |

## Diagnóstico
1. `components/ContractModal.tsx` — o input do Número do Contrato recebia
   `useNewNumbering ? 'text-gray-400' : ''`: com numeração automática o campo é `readOnly`
   e o VALOR saía em cinza-claro, lido como placeholder/desabilitado. O Título ao lado
   herda a cor escura.
2. O recibo é snapshot congelado em `financial_receipts`, gravado por
   `emitir_recibo_pagamento`/`emitir_recibo_recebimento`. Só `contracts.number` era
   resolvido do `reference_id`; `contracts.title` e `contract_items` nunca entravam.
   Conferido: CTS-010-036-0002 "Serviço de Faxina" tem 1 item (Faxina · svç · 4 ·
   150,00 · 600,00). O recibo 000001 congelou o nº antigo CTS-010-036-0001 (o contrato
   foi renumerado depois) — o número congelado não muda.

## Plano

1. **`components/ContractModal.tsx`** — valor do Número do Contrato em `text-gray-900`
   quando automático. *Pronto quando:* `check-ui-standard.sh` limpo e a trava (item 2)
   não acusa a linha.
2. **`__tests__/valorDeCampoSemCinzaGuard.test.ts`** (novo, catraca no molde de
   `cabecalhoSemCinzaGuard`) — conta `<input>/<textarea>/<select>` cujo `className`
   pinta o valor de `{gray,slate,zinc,neutral,stone}-{300,400}` (sem variante, ou
   `disabled:`/`read-only:`); `placeholder:`/`hover:`/`focus:` não contam. BASELINE =
   dívida herdada. *Pronto quando:* verde, e o caso real antigo do ContractModal reprova
   no teste do detector.
3. **`docs/ui_ux_guia_unificado.md`** — §32 "Valor de campo nunca em cinza-claro" +
   item no checklist. *Pronto quando:* seção existe e aponta para a trava.
4. **`supabase/migrations/aplicar_<prefixo>_recibo_objeto_e_itens_do_contrato.sql`** —
   colunas `contract_title`/`contract_items`; helper `recibo_contrato_do_titulo(text)
   → jsonb`; as duas RPCs reescritas a partir da definição vigente; backfill dos
   recibos com contrato. *Pronto quando:* aplicada, 5 recibos ativos preenchidos, emissão
   em transação com ROLLBACK grava as colunas.
5. **`types/financial.ts`** — `contract_title`, `contract_items` em `FinancialReceipt`.
6. **`utils/reciboRecebimento.ts`** — "Objeto:" na célula da descrição, objeto na
   declaração, seção "ITENS DO CONTRATO" com corte + resumo quando não cabe; recibo sem
   contrato com o mesmo desenho. *Pronto quando:* testes do item 8 verdes e conferência
   visual do PDF.
7. **`scripts/regerar-recibos.ts`** — aceita as colunas novas do JSON.
8. **`__tests__/reciboRecebimento.test.ts`** — casos novos (objeto, itens, corte,
   sem contrato, determinismo).
9. **Storage** — backup dos 5 PDFs, regerar pelo script, conferir visualmente, `rm` +
   `cp` no mesmo `file_path`.

## Estado
- [x] 1 — `text-gray-900` fixo; `check-ui-standard.sh` limpo.
- [x] 2 — trava verde; com o cinza recolocado na l.844 ela reprova (`ContractModal: 2 (baseline 1)`).
  BASELINE de 12 ocorrências em 11 arquivos, cada uma conferida e classificada
  (2 VAZIO, 7 TRAVADO, 3 VALOR) — aguardam decisão do usuário.
  Achado no caminho: o removedor de comentários tratava `accept="image/*"` como início de
  comentário e o recorte escapava do elemento (4 falsos positivos) — corrigido e com teste.
- [x] 3 — §32 + item nos dois checklists.
- [x] 4 — migration aplicada em 17/10/2026. Antes: as duas RPCs vigentes conferidas idênticas
  aos arquivos; ensaio em transação abortada (backfill + emissão nova como membro da org →
  colunas preenchidas, nada gravado). Depois: 5 recibos com objeto (o de pagamento com 1 item;
  os 4 de recebimento são venda/locação, sem itens); helper só para postgres/service_role.
- [x] 5, 6, 7, 8 — 43 testes do recibo verdes; recibo SEM contrato sai byte a byte igual ao
  gerador do `origin/main` (3 casos conferidos).
- [ ] 9 — regerar os 5 PDFs no Storage.
- [ ] Publicação — `tsc` local cai com segfault (máquina, ver memória); prova por PR de
  rascunho (CI em Linux) antes do push para `main`.

## Verificação
- Tela: Suprimentos › Contratos › contrato existente — Número com valor escuro como o Título.
- `npx vitest run __tests__/valorDeCampoSemCinzaGuard.test.ts __tests__/reciboRecebimento.test.ts`.
- Banco: `contract_title`/`contract_items` nos recibos com contrato.
- PDF do recibo 000001 (pagamento): "Objeto: Serviço de Faxina", declaração com o objeto,
  tabela "Faxina · svç · 4 · R$ 150,00 · R$ 600,00".
- `npm run typecheck`, suíte completa, CI verde, produção conferida.
