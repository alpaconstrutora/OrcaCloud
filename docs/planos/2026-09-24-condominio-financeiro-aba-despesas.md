# Condomínio › Financeiro: filtro de competência e aba Despesas

## Pedido original

Sessão de 24/09/2026, transcrito literalmente:

> aba financeiro:
> 1. Filtro por competencia mensal
> 2. Ao clicar em uma compoentres na tabela, abrir uma tela listando todos os lançamentos

### Definições do usuário (perguntado antes de editar)

| Ponto | Resposta |
|---|---|
| Qual aba Financeiro | **Condomínio › Financeiro** (Comercial › Condomínios › Ficha › Financeiro) |
| "uma compoentres" | **uma competência (mês)** — era typo |
| Tela cheia? | *"tela cheia nao e padrao no nosso app. crie uma nova aba dentro de financeiro chamado despesas"* |

⚠️ Eu havia oferecido "tela cheia" como opção recomendada. **Era contra o
padrão do app** — e contra a minha própria memória do projeto
(`feedback_nunca_tela_cheia_para_paineis`). O usuário corrigiu; a resposta é
uma sub-aba.

## O que a investigação achou

A aba Financeiro mostrava **rateios**, e o único lugar que listava lançamento
era o painel de um rateio JÁ criado. Consequência: **despesa que ainda não
entrou em rateio nenhum não aparecia em lugar algum** — e é justamente a que o
síndico precisa achar, porque é a que vai faltar na cobrança.

O aviso "14 despesa(s) ficaram de fora porque já entraram em outro rateio",
que essa mesma aba dá desde 23/09, não tinha para onde mandar o usuário olhar.

## Plano

### 1. `services/condominioRateioService.ts` (editado)

`listarLancamentos({ costCenterIds, competencia })` novo — os lançamentos vivos
de `internal_transactions`, com o centro de custo de origem e a marca `rateada`.

**Mesmo recorte da prévia do rateio, de propósito:** `DEBIT`, nos centros de
custo do condomínio, por `transaction_date`. Um recorte diferente faria o
síndico ver aqui uma despesa que não aparece no rateio do mesmo mês, sem ter
como explicar a diferença.

A marca `rateada` vem de `listarJaRateadas` — a mesma consulta que a prévia usa
para EXCLUIR. Aqui ela não exclui: rotula. A aba existe para mostrar o que
ficou de fora.

### 2. `components/condominio/FinanceiroTab.tsx` (editado)

- **Sub-abas §19.1**: `Rateios` (a tabela que já existia) e `Despesas` (nova).
- **Filtro de competência** na barra das sub-abas, à direita — é escopo (§5.3),
  não busca. Um filtro só para as duas abas: é a mesma pergunta ("de qual mês
  estamos falando?"), e dois controles dariam duas respostas na mesma tela.
- **Competência vira link** na tabela de rateios: clicar abre a aba Despesas
  daquele mês. `stopPropagation`, porque a linha inteira já abre o detalhe do
  rateio — sem isso os dois gestos disparam juntos.
- Colunas da aba Despesas: Data · Descrição · Centro de custo · **Situação**
  (`Já rateada` / `Fora de rateio`, §8: texto colorido, sem pílula) · Valor,
  com rodapé de total.
- `ColumnConfigButton` e `Novo rateio` só na aba Rateios — em Despesas não há
  o que configurar nem o que criar: o lançamento nasce no Financeiro.

**Decisão registrada:** em Despesas o filtro **não** oferece "Todas".
`internal_transactions` é a maior tabela do financeiro; sem recorte seria uma
varredura que ninguém pediu. Sem escolha, a aba cai no mês corrente.

## Estado — 24/09/2026: concluído

Conferido na tela, dado real, escritas bloqueadas, zero erro de console:

| Verificação | Resultado |
|---|---|
| Sub-abas Rateios / Despesas | ✅ ambas presentes |
| Filtro de competência | ✅ `Todas · 09/2026 · 08/2026` |
| Filtrar rateios por 09/2026 | ✅ 2 → 0 (os rateios são de 08/2026) |
| Clicar na competência `08/2026` | ✅ abre Despesas daquele mês |
| Lançamentos listados | ✅ **14, somando R$ 1.144,95** |
| Marca de situação | ✅ `Já rateada` / `Fora de rateio` |
| `Novo rateio` some em Despesas | ✅ |

🔎 **O número fecha com o resto da tela.** Os 14 lançamentos e os R$ 1.144,95
são exatamente as "14 despesas" do aviso de já-rateadas e o total do rateio de
08/2026 visto no painel de detalhe. As duas telas contam a mesma história.

Mecânica: `tsc` limpo · `build` limpo · **5.208 testes** ·
`check-ui-standard.sh` limpo em `FinanceiroTab.tsx` · os 4 scripts de regra OK.
