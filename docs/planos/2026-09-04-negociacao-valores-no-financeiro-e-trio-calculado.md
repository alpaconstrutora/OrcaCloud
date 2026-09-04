# Gerenciar Negociação — valores na aba Financeiro e trio com campo calculado

## Pedido original

> 1. aba dados da unidade: mover dados com valores para a aba Financeiro.
> 2. na aba financeiro, implemente um seletor para que o usuário defina qual variável ele quer usar dentre as 3 (Valor da Parcela, Número de Parcelas, Valor Total do Contrato). Escolhendo um delas as outras 2 são calculadas automaticamente

(sessão de 2026-09-04, com print da aba "Dados da Unidade" da negociação 406 — Praça Coronel Justiniano)

### Pedido posterior, mesma sessão (2026-09-04, depois dos commits 05a9680…bfbe572)

> esta completamente errado.
> vamos implementar uma melhoria.
> dado o valor total, implemente um botao de adicionar pagamento com um seletor de tipo de pagamento (sinal, parcelas mensais, parcelas semestrais, parcelas anuais, parcelas avulsar, parcela de fechamento).
> A cada pagamento ascrescentado o saldo vai se atualizamdo (valor total - valores dos pagamentos)

O trio entregue neste plano (parcela × nº × total) foi considerado o modelo
errado: uma venda de imóvel não é uma série homogênea, é sinal + série mensal +
reforços + parcela nas chaves. O trio **não foi jogado fora** — passou a ser o
formulário de um bloco de série dentro do construtor. Decisões do usuário na
mesma conversa: a Entrada vira a linha "Sinal"; a geração de cobrança real em
Contas a Receber fica para uma entrega seguinte. O desenho novo está na seção
"Construtor do Plano de Pagamento", ao fim deste arquivo.

## Contexto

Tudo acontece em **`components/DealModal.tsx`** ("Gerenciar Negociação"), aberto por
Vendas de Ativos e por Locações. Hoje o dinheiro da negociação está espalhado em duas
abas: a aba **Dados da Unidade** carrega o valor R$ de cada unidade e o banner "Total do
contrato", enquanto a aba **Financeiro** tem o trio Valor da Parcela × Número de Parcelas
→ Valor Total do Contrato (implantado para venda no commit `05a9680`). Quem monta o
valor de um contrato precisa pular entre as duas.

Além disso o trio tem **um único sentido de cálculo**: o total é sempre derivado
(`entrada + parcela × nº`). Quem negocia pelo valor cheio ("R$ 600 mil em 10 vezes")
precisa fazer a divisão de cabeça antes de digitar.

Resultado pretendido: a aba Financeiro passa a ser o único lugar com valores, e o trio
resolve em qualquer direção — o usuário escolhe qual dos três o sistema calcula.

## Decisões já tomadas pelo usuário

1. **Movem-se só os valores.** A lista de unidades continua na aba Dados da Unidade
   (adicionar, remover, definir principal, escolher qual detalhar). O que muda de aba é
   o campo R$ por unidade e o total.
2. **Nº de Parcelas calculado arredonda e mostra a sobra.** Nenhum campo digitado é
   sobrescrito; a tela diz quanto falta/sobra e o usuário decide.

---

## Mudança 1 — os valores saem de "Dados da Unidade"

**Sai da aba Unidade** (bloco `activeTab === 'unidade'`, hoje em `DealModal.tsx:2022-2199`):

- o `<input type="number">` de valor em cada linha de unidade (`setUnitValue`, ~`:2069`);
- o banner "Total do contrato · N unidade(s)" (`unitsTotal`, ~`:2111`);
- a linha de preço do card de detalhe do imóvel (`expandedProperty.price`, `:2152`);
- o `R$ …` no rótulo das opções de "+ Adicionar unidade" (`referenceValueOf`, `:2105`) —
  vira só o nome da unidade, já que a escolha de valor passa a ser na outra aba.

A linha da unidade fica com: nome/endereço (clicável para detalhar), botão Principal e
excluir. O texto explicativo perde a frase "O valor de cada uma é editável e o total do
contrato é a soma" e passa a apontar a aba Financeiro.

**Entra na aba Financeiro** (bloco `activeTab === 'pagamento'`), como primeiro bloco,
antes do "Valor do Fechamento" — um card **"Composição do valor"**:

- uma linha por unidade: nome à esquerda, input R$ à direita (mesmo `setUnitValue`);
- o total (`unitsTotal`) na última linha, com a contagem de unidades;
- vazio quando não há unidade: "Nenhuma unidade no contrato — adicione na aba Dados da
  Unidade", com botão que faz `setActiveTab('unidade')`.

O campo **"Valor do Fechamento"** que já existe lá é o mesmo `formData.value` (soma das
unidades, read-only) — com a composição logo acima ele vira redundante e **deve ser
removido**, junto com o botão "Soma de N unidades — editar na aba Unidade". Não há perda:
o número passa a ser o total do card novo.

Nenhuma função muda: `dealUnits`, `unitsTotal`, `setUnitValue`, `referenceValueOf`,
`expandedProperty` (`DealModal.tsx:970-1031`) já vivem no componente e são visíveis pelos
dois blocos de aba. É movimentação de JSX.

## Mudança 2 — seletor do campo calculado no trio

**Estado novo**, ao lado dos helpers do trio (`DealModal.tsx:437-490`):

```ts
type CampoDerivado = 'TOTAL' | 'PARCELA' | 'NUMERO';
const [campoDerivado, setCampoDerivado] = useState<CampoDerivado>('TOTAL');
```

Estado local, não persistido: `'TOTAL'` reproduz exatamente o comportamento de hoje, então
toda negociação abre como está hoje e o usuário muda se quiser.

**Seletor** acima do trio, reusando o segmented control que já existe neste arquivo para o
Tipo (`DealModal.tsx:2221`, `flex items-center bg-white p-1 rounded-[10px] border
border-gray-200 shadow-sm gap-1 w-fit`, botões `h-7 px-3 rounded-[6px] text-sm
font-medium`). Rótulo: "Calcular automaticamente". Três botões: Valor da parcela ·
Número de parcelas · Valor total.

**Fórmulas** (`E` = entrada, que só conta em venda — `entradaDoTotal`, já existe):

| Derivado | Conta |
|---|---|
| `TOTAL` | `E + parcela × n` (é o `computedContractTotal` atual) |
| `PARCELA` | `(total − E) / n`, com `n ≥ 1`; arredondado a 2 casas |
| `NUMERO` | `round((total − E) / parcela)`, mínimo 1; `0` quando parcela é 0 |

Generalizar `computedContractTotal` numa função única `recalcularTrio(next, campoDerivado)`
que devolve o `formData` com o campo derivado atualizado. Os três handlers
(`handleInstallmentValueChange`, `handleInstallmentCountChange`, `handleDownPaymentChange`)
e um novo `handleContractTotalChange` passam a chamá-la, em vez de escreverem
`contract_total_value` direto.

**O campo derivado é read-only na tela** (`bg-gray-50`, como o total é hoje) e os outros
dois viram editáveis — hoje o total é o único read-only. Trocar de modo não altera valor
nenhum na hora: recalcula o novo derivado a partir dos outros dois.

**Persistência:** os três continuam gravados em `commercial_deals`
(`installment_value`, `installments`, `contract_total_value` — colunas confirmadas no
banco). Isso importa porque `geracaoContrato` (`DealModal.tsx:1288`) lê
`installment_value` e `installments` para gerar as parcelas: qualquer que seja o modo, os
dois precisam estar gravados com o valor que está na tela.

**Sobra do arredondamento** (modo `NUMERO`): quando
`|total − (E + parcela × n)| ≥ 0,01`, mostrar abaixo do campo, em `text-xs text-gray-400`
(mesma legenda que já existe ali):
`13 × R$ 30.000,00 = R$ 390.000,00 · faltam R$ 10.000,00 para o total`
(ou "sobram", quando o arredondamento passa do total).

**`divergeDoProduto`** (`:459`) hoje avisa "Ajustado por desconto nas parcelas" quando o
total salvo não bate com a conta. Precisa deixar de disparar quando a diferença é a sobra
do arredondamento do modo `NUMERO` — senão a tela dá duas explicações diferentes para o
mesmo número. Regra: `divergeDoProduto` só vale no modo `TOTAL`.

**`perguntarCorrigirTotalContrato`** (`:587`) fica como está: continua gravando
`contract_total_value` e **não** recalcula os outros dois. Se ela rodar no modo `PARCELA`
ou `NUMERO`, o derivado se ajusta no próximo render pela fórmula — que é o
comportamento certo, porque o total acabou de ser decidido pelo usuário.

## Arquivos

- `components/DealModal.tsx` — único arquivo. Blocos: helpers do trio (`:437-490`),
  aba Unidade (`:2022-2199`), aba Financeiro (`:2204+`).
- Nenhuma migration: as quatro colunas (`installment_value`, `installments`,
  `contract_total_value`, `down_payment`) já existem em `commercial_deals`.
- Nenhum serviço muda: `commercialService.saveDeal` faz `{ ...deal }` sem whitelist.

## Verificação

1. `npx tsc --noEmit` e `npx vitest run` (baseline atual: 2291 passed).
2. `bash scripts/check-ui-standard.sh components/DealModal.tsx`.
3. Na tela real, com o servidor da porta 3100 e o script Playwright já existente
   (`c:/tmp/pwtest/verificar-deal-financeiro.cjs`, adaptado), abrindo
   Vendas de Ativos › 007 - Bella Vista › Negociações › Gerenciar Negociação:
   - aba Dados da Unidade **sem nenhum R$**; a lista ainda adiciona/remove/torna
     principal e o clique na unidade ainda abre os specs;
   - aba Financeiro com a composição por unidade, e o total igual ao que estava antes
     no banner (R$ 650.000,00 na negociação 406 / R$ 400.000,00 na do Bella Vista);
   - modo `TOTAL`: parcela 50.000 × 6 + entrada 100.000 → total 400.000,00
     (é o cenário já provado no commit `05a9680` — não pode regredir);
   - modo `PARCELA`: total 600.000, entrada 100.000, nº 10 → parcela 50.000,00;
   - modo `NUMERO`: total 400.000, entrada 0, parcela 30.000 → nº 13 e a legenda
     "13 × R$ 30.000,00 = R$ 390.000,00 · faltam R$ 10.000,00";
   - sem erro de console/JS nem 4xx/5xx do PostgREST (ignorando o ruído conhecido das
     RPCs da Central de Controle, que dão 57014).
4. Conferir que o modal "Gerar parcelas" segue lendo os valores certos nos três modos
   (painel de conferência mostra Valor da parcela / Nº / Total sem "—").

## Antes de começar (REGRA #6 do CLAUDE.md)

Copiar este plano para `docs/planos/2026-09-04-negociacao-valores-no-financeiro-e-trio-calculado.md`,
versionado no repositório, mantendo a seção "Pedido original" acima. Este arquivo em
`~/.claude/plans/` fica fora do repo e não serve como registro.

---

# Construtor do Plano de Pagamento (2026-09-04, segunda rodada)

## Modelo de dados (sem migration)

O plano é a soma de duas fontes que **já existem** e que a proposta já lê:

| Parte | Onde vive |
|---|---|
| Sinal | `down_payment` + `down_payment_installment_type='SINAL'` (+ `down_payment_payment_type`, `down_payment_notes`) |
| Todo o resto | `custom_installments: PaymentInstallment[]` |

⚠️ **O Sinal fica FORA de `custom_installments`.** `propertyExportService` soma
`down_payment` e depois todas as linhas — pôr o sinal nos dois lugares dobraria
o valor na proposta. O construtor mostra o sinal como linha, mas a fonte é o
campo. Consequência: **um sinal só por negociação** (o tipo some do seletor
depois de adicionado; para mudar, edita-se a linha).

Cada bloco periódico é **expandido em linhas** na hora de salvar: N linhas com
`installmentType` = código do tipo, `value` = valor da parcela, `dueDate`
avançando `interval_months` a cada uma. É o que `custom_installments` já
comporta e o que a proposta já sabe imprimir — sem inventar um formato de
"bloco" que o resto do sistema não conhece.

⚠️ **Datas:** montar com aritmética de ano/mês (`new Date(ano, mes + i*intervalo, dia)`),
nunca `new Date('YYYY-MM-DD')` — o parse é UTC e em UTC-3 volta um dia. É o
mesmo defeito corrigido hoje na curva do dashboard (commit `71c28f6`).

## Mudanças em `components/DealModal.tsx`

### 1. Sai o trio solto e o campo Entrada

Remover da aba Financeiro o bloco dos três campos + seletor "Calcular
automaticamente" (hoje ~`:2350-2490`) e o campo "Entrada (BRL)" (~`:2523`). Os
helpers `recalcularTrio`, `campoDerivado`, `entradaDoTotal`, `arredonda2`,
`sobraDoArredondamento`, `divergeDoProduto`, `entradaExcedeTotal` e os handlers
(`handleInstallmentValueChange`, `handleInstallmentCountChange`,
`handleContractTotalChange`, `handleDownPaymentChange`, `trocarCampoDerivado`)
**não são apagados** — passam a servir o formulário do bloco (item 3).

Fica: **Composição do valor** (por unidade, entregue hoje) → **Valor Total do
Contrato** → **Plano de pagamento** → **Saldo**.

### 2. Lista do plano + saldo

Abaixo do total, um card "Plano de pagamento":

- **Linhas agrupadas por bloco**, não uma linha por parcela: "Parcelas mensais ·
  12× R$ 25.000,00 · a partir de 10/10/2026 — R$ 300.000,00", com ações editar e
  excluir. O agrupamento é derivado de `custom_installments` por
  (`installmentType` + valor + intervalo entre vencimentos consecutivos); uma
  linha só, quando o bloco tem uma parcela.
- **Botão `+ Adicionar pagamento`** (primário compacto, §17: `h-9 px-3.5
  rounded-[6px] bg-blue-600 … font-medium text-[13px]`).
- **Rodapé com o saldo**: `Saldo a distribuir = total − down_payment − Σ custom_installments`.
  Zero → verde "Plano fechado"; positivo → cinza "faltam R$ X";
  negativo → âmbar "excede o total em R$ X". Nunca bloqueia salvar: plano
  incompleto é estado normal durante a negociação.
- Vazio: "Nenhum pagamento no plano — comece pelo sinal ou por uma série."

### 3. Formulário do bloco (é onde o trio passa a viver)

Painel `Sheet` (`components/ui/sheet`, REGRA #4 — já usado neste arquivo), aberto
pelo botão e pelo editar de cada linha:

- **Tipo de pagamento** — `<select>` alimentado por `paymentTypes` (estado já
  existente), ordenado por `sortPaymentTypes`. Sinal oculto se já houver um.
- **Se `generates_series`** (mensais/trimestrais/semestrais/anuais): os três
  campos do trio — Valor da parcela · Nº de parcelas · Subtotal do bloco — com o
  seletor "Calcular automaticamente" decidindo qual dos três é derivado. Reusar
  `recalcularTrio` adaptado para operar sobre o bloco (sem a entrada no termo:
  o subtotal do bloco é `parcela × nº`), e manter a regra do arredondamento do
  nº (arredonda e mostra a sobra, decisão anterior do usuário).
  Mais **Data do 1º vencimento**; o intervalo vem de `intervalMonthsForType`.
- **Se não gera série** (Sinal, Avulsa, Chaves): Valor + Data.
- **Sugestão de valor**: o campo de valor/subtotal nasce com o **saldo atual**,
  para o caso comum de "o resto vai nas chaves".
- Opcionais em todos: Forma de pagamento (`paymentType`: PIX/TED/…) e Observação
  (`notes`) — campos que `PaymentInstallment` já tem e a proposta já imprime.

### 4. Ponte com o gerador de parcelas (não quebrar o que existe)

`geracaoContrato` (`:1288`) lê `installment_value` e `installments` para gerar a
série real. Com o trio fora da tela, esses dois campos passam a ser **espelhados
a partir do plano**: se houver exatamente um bloco periódico, gravar seu valor e
sua quantidade; se houver mais de um, espelhar o maior e exibir no modal "Gerar
parcelas" um aviso de que o plano tem N blocos e a geração cobre um.

Sem isso, a geração que foi consertada hoje (`05a9680`) volta a mostrar "—".

## Arquivos

- `components/DealModal.tsx` — praticamente tudo.
- Reuso, sem alteração: `constants/paymentTypes.ts`, `services/paymentTypeService.ts`,
  `types/financial.ts` (`PaymentInstallment`), `services/propertyExportService.ts`,
  `components/ui/sheet`.
- **Nenhuma migration**: `custom_installments`, `down_payment` e os três campos
  `down_payment_*` já existem em `commercial_deals`.

## Verificação

1. `npx tsc --noEmit`, `npx vitest run` (baseline 2291 passed) e
   `bash scripts/check-ui-standard.sh components/DealModal.tsx`.
2. Um teste puro novo em `__tests__/` para a expansão de bloco → linhas: 12
   mensais de 25.000 a partir de 10/10/2026 devem render 12 linhas, a última em
   10/09/2027, somando 300.000 — e a virada de ano não pode escorregar de dia
   (guarda contra o bug de fuso).
3. Na tela real (servidor da 3100 + Playwright, script
   `c:/tmp/pwtest/verificar-trio-modos.cjs` adaptado), em Vendas de Ativos ›
   007 - Bella Vista › Negociações › Gerenciar Negociação › Financeiro:
   - total R$ 400.000; adicionar Sinal 50.000 → saldo 350.000;
   - adicionar 12 mensais calculando a parcela pelo subtotal 200.000 →
     16.666,67 cada, saldo 150.000;
   - adicionar Parcela nas chaves com o valor sugerido → saldo **0,00** e
     "Plano fechado";
   - excluir a série mensal → saldo volta a 200.000;
   - sem erro de console/JS nem 4xx/5xx do PostgREST (ignorar o ruído conhecido
     das RPCs da Central de Controle, 57014).
4. Salvar, reabrir a negociação e conferir que o plano volta igual (grava em
   `custom_installments`; o efeito de reidratação do cofre, `:837`, só preenche
   quando o array está vazio).

## Antes de começar (REGRA #6 do CLAUDE.md)

Este plano substitui o conteúdo de
`docs/planos/2026-09-04-negociacao-valores-no-financeiro-e-trio-calculado.md`
(mesma tela, modelo novo): acrescentar lá o pedido original acima com a data,
sem apagar o registro do que foi decidido antes — o histórico explica por que o
trio existiu e por que mudou de lugar.
