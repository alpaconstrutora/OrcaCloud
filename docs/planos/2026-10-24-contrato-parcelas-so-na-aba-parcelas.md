# Contrato › Financeiro: parcelas só na sub-aba Parcelas

## Pedido original

Sessão de 24/10/2026, ~11:30:

> suprimentos > contratos > aba financeiro:
> As parcelas aparecem em dois lugares, ana aba dados gerais Condições de Pagamento e na ana parcelas .
> manter apenas em um local, e o local escolhido e na aba parcelas

## O que havia

`ContractDetailView` › Financeiro tem duas sub-abas. **Dados Gerais** embute o `ContractModal`
(`variant="inline"`, seções Valores / Pagamento / Centro de Custo); com Condição "Parcelado" a seção
**Condições de Pagamento** mostrava, abaixo dos campos que montam o plano, a tabela editável
**"Cronograma de Parcelas"** (# · Tipo · Vencimento · Valor + Total). A sub-aba **Parcelas** mostra os
lançamentos que esse cronograma gera — as mesmas parcelas, duas vezes.

## Decisão

- Sai de Dados Gerais **só a lista**. Ficam os campos que montam o plano (Entrada, Vencimento da
  Entrada, Nº de Parcelas, Periodicidade, 1º Vencimento) e a frase-resumo ("Entrada de R$ … + 3×
  semestral de R$ …"): são a *condição* de pagamento, não as parcelas.
- O aviso **"Soma das parcelas difere do valor do contrato"** continua, agora como linha com
  "Redistribuir igualmente": mudar o Valor Original **não regera** o cronograma sozinho
  (`regerarCronograma` só roda ao mexer nos campos do plano), e sem a tabela o cronograma velho
  seguiria para o Salvar em silêncio.
- A **gaveta** (contrato novo / editar pela lista) mantém a tabela: contrato novo ainda não tem
  sub-aba Parcelas.
- Perde-se em Dados Gerais a edição de **vencimento** linha a linha do cronograma; o valor de uma
  parcela já se altera na sub-aba Parcelas ("Alterar valor", que reescreve `payment_schedule[n-1]`).

## Itens

1. [x] **`components/ContractModal.tsx`** — tabela "Cronograma de Parcelas" só com `!inline`; no
   embutido, aviso de divergência + "Redistribuir igualmente". Comentário do cronograma atualizado.
   Pronto quando: o harness `docs/spikes/contrato-parcelado/?salvo=1` não mostra a tabela, mostra
   Nº de Parcelas, e o aviso aparece ao mudar o Valor Original e some ao redistribuir — conferido
   por Playwright em 24/10 (0 tabela, 1 campo, aviso 0 → 1 → 0, sem erro de página).
2. [x] **`__tests__/components/ContractModalParcelasSoNaAba.test.tsx`** — embutido sem tabela e com
   os campos; divergência avisa e redistribui; gaveta com tabela. Pronto quando: 2 dos 3 vermelhos
   no código antigo e 3/3 verdes no novo — conferido.
3. [x] `tsc --noEmit` rc=0; `check-ui-standard.sh components/ContractModal.tsx` 0 violações.
4. [x] PR + CI + publicação — PR #131, `ci` 30m54s verde; squash `28fb2181` em 24/10/2026; CI do main verde no
   28fb2181; `conferir-producao.sh "Soma das parcelas (R$ "` (texto que não existia antes) ✅ com o domínio em 97fea73.
