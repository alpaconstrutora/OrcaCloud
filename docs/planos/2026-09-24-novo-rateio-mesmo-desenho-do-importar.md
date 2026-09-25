# Novo rateio com o desenho do "Importar do Comercial"

## Pedido original (literal)

> aplique o mesmo design do drawer Importar do Comercial no drawer Novo rateio

## O que havia

A prévia do "Novo rateio" tinha três desenhos diferentes empilhados:

1. **Caixa cinza de resumo** — "Despesas da competência" / "Total rateado" /
   "N lançamento(s)" em pares rótulo-valor empilhados.
2. **Tabela de despesas** hand-rolled, sem toolbar, sem ordenação, sem
   engrenagem de colunas.
3. **Cotas em cartões empilhados** — `unitLabel` sobre `clientNome` em
   `text-gray-500`, com o aviso como sufixo âmbar na mesma linha e
   `opacity-60` na unidade sem valor.

O terceiro é o mesmo dado que a sheet de **detalhe** já mostrava em tabela
(`TabelaCotas`): **duas renderizações para a mesma coisa**, e a da prévia era
justamente a do padrão antigo.

## O que foi feito

`TabelaDespesas` e `TabelaCotas` viraram `StandardTable` com `dense`
(§6.9/§6.10) — o mesmo componente e o mesmo cromo do drawer "Importar do
Comercial": busca acoplada, engrenagem de colunas, auto-ajuste, cabeçalho
ordenável, tipografia do §7 e status em texto colorido do §8.

- A prévia passou a usar **a mesma** `TabelaCotas` do detalhe, com o motivo da
  unidade em coluna **Observação** própria em vez de sufixo âmbar na linha. A
  coluna só existe quando há observação — coluna vazia em painel estreito é
  largura gasta sem dado.
- As caixas cinzas de resumo viraram **linha de totais dentro da tabela**, ao
  pé da lista que elas somam.
- Seções com título + `border-b` (§30): "Despesas que entram" e "Quem paga
  quanto", iguais a "O que ratear".
- O detalhe herdou o mesmo desenho, porque as tabelas são as mesmas.
- A edição inline da descrição (só em RASCUNHO) foi preservada dentro do
  `renderCell`.

## Dois defeitos que só a medição pegou

1. **`renderTotals` punha o total na coluna espaçadora.** O `colSpan={n-1}`
   parecia certo, mas `n` inclui o `<col>` espaçador do §6.1.1 — de 52px — e
   "R$ 586,02" saía cortado. Virou `footer`, **fora** da grade de colunas, que
   é o que o drawer "Importar do Comercial" usa: imune também a o usuário
   ocultar uma coluna pela engrenagem.
2. **A tabela de cotas media 690px numa caixa de 622px** — rolagem lateral
   permanente e "Torre Única · Estacionamento" cortado. Larguras refeitas para
   620px, e o rótulo da unidade passou a **quebrar linha** em vez de `nowrap`
   (célula cortada é lida como coluna cortada — a lição do `SupplierSelect`,
   11/09).

## Prova

Playwright no servidor da frente, 007 Bella Vista › Financeiro › Novo rateio,
competência 06/2020:

```
seções: O que ratear | Despesas que entram | Quem paga quanto
painel: 672px (624 úteis com p-6)

tabela 1  Data | Descrição | Valor        622px em 622px · não rola de lado
          rodapé: 3 lançamento(s) · R$ 586,02
tabela 2  Unidade | Quem paga | Observação | Cota
          622px em 622px · não rola de lado
          rodapé: 9 unidade(s) · R$ 586,02

células com texto cortado: nenhuma
cartões empilhados restantes: 0
```

Sheet de **detalhe** (Galeria Altavista, rascunho — as tabelas são
compartilhadas):

```
seções: Quem paga quanto | Despesas do rateio
tabela 1  Unidade | Quem paga | Cota    12 linhas · 622px em 622px
tabela 2  Descrição | Valor              1 linha  · 622px em 622px
células cortadas: nenhuma
edição inline abre campo: true · botão Salvar aparece: true · Escape fecha: true
```

Portões: `tsc --noEmit` 0 · `vitest run` 5332 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

⚠️ Sem teste novo: a mudança é de renderização, e a suíte de componentes desta
aba não existe. A prova é a medição de tela acima.
