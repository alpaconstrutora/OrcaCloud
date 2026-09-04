# Gerenciar Negociação — valores na aba Financeiro e trio com campo calculado

## Pedido original

> 1. aba dados da unidade: mover dados com valores para a aba Financeiro.
> 2. na aba financeiro, implemente um seletor para que o usuário defina qual variável ele quer usar dentre as 3 (Valor da Parcela, Número de Parcelas, Valor Total do Contrato). Escolhendo um delas as outras 2 são calculadas automaticamente

(sessão de 2026-09-04, com print da aba "Dados da Unidade" da negociação 406 — Praça Coronel Justiniano)

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
