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
- [x] 9 — 5 PDFs regerados: backup baixado, gerados pelo script, conferidos em imagem
  (000001 pagamento e 000005 recebimento), `rm`+`cp` no mesmo `file_path`, baixados de novo
  do bucket com sha256 igual ao gerado.
- [x] 10 — pedido de 17/10/2026, resposta "sim" a "Quer que eu corrija os grupos 2 e 3?":
  os 10 campos de valor real em cinza corrigidos (BudgetRow qtd./preço/BDI, BlueprintEditor,
  PainelTopografia, ContractModal vencimento da entrada, MarketFeedPanel, ObraTypesManager,
  DatabaseExplorer código, LaborFiscalSettings dedução — input e leitura —, ScheduleGridView).
  A trava passou a ler `<MoneyCentsInput>` (o preço travado do BudgetRow escapava) e achou o
  CARREGANDO do DatabaseExplorer. BASELINE final: 3 legítimos. ScheduleGridView era na verdade
  VAZIO (`value={pct || ''}`, sem placeholder): trocado sem efeito visual.
  `check-ui-standard` acusa em BudgetRow (§7, l.179/185/262) e DatabaseExplorer (§3, busca)
  violações ANTERIORES, em linhas não tocadas — não corrigidas aqui.
- [ ] Publicação — `tsc` local cai com segfault (máquina, ver memória); prova por PR de
  rascunho (CI em Linux) antes do push para `main`.

## Verificação
- Tela: Suprimentos › Contratos › contrato existente — Número com valor escuro como o Título.
- `npx vitest run __tests__/valorDeCampoSemCinzaGuard.test.ts __tests__/reciboRecebimento.test.ts`.
- Banco: `contract_title`/`contract_items` nos recibos com contrato.
- PDF do recibo 000001 (pagamento): "Objeto: Serviço de Faxina", declaração com o objeto,
  tabela "Faxina · svç · 4 · R$ 150,00 · R$ 600,00".
- `npm run typecheck`, suíte completa, CI verde, produção conferida.

## Pedido posterior (17/10/2026)
> Duas falhas antigas que o verificador de padrão de UI acusou, em linhas que não mexi. Não corrigi nenhuma:
> 1. BudgetRow: negrito e fonte mono dentro de células da tabela: Corrigir
> 2. DatabaseExplorer: a busca não fica guardada ao sair e voltar da tela: Corrigir

### Decisões
| Data | Pergunta | Resposta |
|---|---|---|
| 17/10/2026 | BudgetRow: mono/negrito/pílulas eram exceção DOCUMENTADA (§7.3), mas a tela já é `<table>` e falha o critério 1. Manter, aplicar o §7 inteiro, ou só código e total? | **Aplicar o §7 inteiro** |

### Itens
- [x] 11 — `components/BudgetRow.tsx`: código sem `font-mono` (`text-sm font-normal text-gray-600`),
  total em `font-medium text-gray-800`, origem Própria/SINAPI e tipo Serviço/Insumo como texto
  colorido (sem pílula, sem caixa alta); nas linhas de composição, código sem mono e
  Composição/Insumo em texto. O botão-ícone de composição (abre a CPU) continua — é ação, não badge.
  *Pronto:* `check-ui-standard.sh` limpo; 48 testes de orçamento/banco verdes.
- [x] 12 — `docs/ui_ux_guia_unificado.md` §7.3: parte tipográfica revogada; sobra a exceção de
  largura (`px-3`, `divide-x`).
- [x] 13 — `components/DatabaseExplorer.tsx`: a busca acusada era a do modal **Gerenciar Grupos**
  (não a da tela, que já persistia). Não é seletor que fecha ao escolher → §3.1 não se aplica →
  `usePersistedState('databaseExplorerGroupManager:search')`. *Pronto:* checador limpo.
- Pedido seguinte ("sim" a corrigir o BudgetEditor também):
- [x] 14 — `components/BudgetEditor.tsx` §7: botão "Abrir" da coluna de ações no formato do §9
  (texto azul `font-medium`); linhas de grupo e fase no formato do §6.12 (rótulo
  `font-semibold text-sm` sem caixa alta, total `text-sm font-medium`). *Pronto:* §7 limpo no
  checador; 42 testes do orçamento verdes.
- [x] 15 — §3 do BudgetEditor NÃO trocado: Estado/Encargos/Referência/Base já são gravados no
  próprio orçamento (`onUpdateSettings`); `usePersistedState` vazaria o valor de um orçamento
  para outro (o comentário no código já dizia isso). Registrado como guia §3.2; o checador
  segue acusando por ser textual (também acusa `searchResults`/`isSearching`, que nem são filtro).
- Pedido seguinte ("sim" a corrigir as ações no hover e os rótulos):
- [x] 16 — ações das linhas de grupo, fase e subfase sempre visíveis (§9): saíram do
  `absolute` + `opacity-0 group-hover`, ficam abaixo do total como no BudgetRow; setas de
  mover lado a lado.
- [x] 17 — os 23 `<label>` do BudgetEditor em `text-xs font-bold text-gray-400 uppercase`
  (Base/Referência/Estado/Encargos, BDI e os dos modais de item) → §21 `text-xs
  font-semibold text-slate-500`. *Pronto:* checador só com o §3 da exceção §3.2; 52 testes verdes.
- Visto e NÃO mexido: hover-only em renomear versão (l.2362) e em 2 botões da lista de
  resultados (l.3432/3439); `<p>` de cartões em `text-gray-400 uppercase` (l.2431/2527/2629);
  cabeçalho em grade `bg-gray-50 text-gray-400` das composições (l.3716).
- Conferência visual no navegador: NÃO feita (mudança de classe; testes de componente verdes).

## Pedido posterior (17/10/2026) — Suprimentos › Contratos › aba Resumo
> Aba resumo:
> 1. botao salvar na linha do título e alinhado a esquerda
> 2. separar os cards como foi feito na aba itens do contrato (veja print). Cards Identificação do Contrato, Identificação da Obra, Cronograma.
>
> (print da aba Itens do Contrato: barra no topo com "Importar do orçamento" à esquerda; abaixo, cada bloco no seu card)

Leitura: "linha do título" = a barra de ações do topo da aba (§5.3), onde fica "Importar do
orçamento" no print de referência.

- [x] 18 — `components/ContractModal.tsx`: props `cardPorSecao` (cada bloco num card branco
  próprio, `space-y-6` entre eles — exceção ao §30 pedida pelo usuário, como no
  BoletoFormModal) e `barraDeAcoes` (o "Salvar alterações" + a linha de exposição vão por
  portal para a barra da tela-mãe; o submit usa `form={formId}`).
- [x] 19 — `components/ContractDetailView.tsx`: a barra §5.3 passa a existir na aba Resumo, com
  o encaixe do Salvar como primeiro item (à esquerda); o Resumo liga as duas props. Abas
  Financeiro e Emissão sem mudança (não pedidas).
- [ ] 20 — conferência visual (Playwright logado).
