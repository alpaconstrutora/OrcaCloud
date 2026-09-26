# Detalhe do rateio: de painel para TELA

## Pedido original (literal)

> transformar o modal Detalhe do rateio em tela.

## O que "tela" significa neste app

Não é `Sheet`, não é `Modal`, não é `fixed inset-0`. É **troca de conteúdo
in-flow**: a sidebar e o cromo do app continuam visíveis, o scroll é o da
página, e nenhum overlay é montado. Referência canônica:
`ContractDetailView.tsx`.

Essa definição custou três rejeições na história do projeto — inclusive uma em
que a tela cheia foi *escolhida pelo usuário numa pergunta minha*, o que não
conta como pedido. Aqui o pedido é literal ("transformar em tela"), e a forma
é a in-flow.

## Onde o early return mora

Em **`CondominioDetail`**, não em `FinanceiroTab`. A tela substitui o
condomínio inteiro — cabeçalho e barra de abas incluídos. Devolvê-la de dentro
da aba deixaria dois títulos empilhados, um dizendo "Financeiro" e o outro
"Rateio 0003".

`FinanceiroTab` ganhou `onAbrirRateio?`, e `abrirDetalhe` virou uma linha que
só avisa o pai. Sem o pai, o detalhe simplesmente não abre — a aba não tenta
renderizar uma tela dentro de si.

O early return fica **depois de todos os hooks** de `CondominioDetail`
(último hook na linha 243, return na 272), senão seria hook condicional.

## A migalha deixou de ser divergência

`CondominioDetail` usa migalha de pão desde 23/09, quando o usuário pediu que
o "Voltar" saísse de cima do título. Na época havia **um salto só**
(`Condomínios › condomínio`), e a §23 pede três crumbs — ficou registrado como
divergência consciente.

Com a tela do rateio são **dois saltos**
(`Condomínios › 010 - Galeria Altavista › Rateio de 08/2026`): o critério da
§23 passou a ser atendido de verdade.

`h1` em **2xl**, não 3xl — 3xl é só o topo de uma lista-raiz (§20). A raiz não
declara `px-*`: o gutter é o do `<main>` (§20.2).

## Duas correções que só apareceram na tela

**1. As tabelas estavam dimensionadas para gaveta.** `TabelaCotas` e
`TabelaDespesas` nasceram com `dense` (§6.9: `px-3`, soma de 620px) e
`maxHeight: 42vh`. Numa tela isso erra nos dois sentidos: a largura sobra toda
para o `<col>` espaçador, e a lista rola dentro de si mesma em vez de a página
rolar — com 12 cotas, a última ficava cortada atrás do rodapé.

As duas ganharam `dense?: boolean` (padrão `true`, preservando as gavetas) e um
conjunto de colunas de página (§6.6) para `dense={false}`.

**2. Ciclo de módulos.** A tela precisava de `identidadeDoCondominio`, que
morava em `CondominioDetail.tsx` — o componente que importa a tela. Função
pura, com teste próprio, num `.tsx` de 550 linhas: mudou para
`utils/condominioIdentidade.ts`. O ciclo some e o teste passou a importar da
origem certa.

## O que mudou de dono

A edição inline da descrição (só em RASCUNHO) mudou de `FinanceiroTab` para a
tela: ela edita o array de despesas, e esse estado agora é da tela. O aviso de
sucesso/erro é **inline**, não toast — esta tela não tem provedor de toast
montado, e um `useToast()` sem o renderer na árvore falha calado (já aconteceu
neste projeto).

## Prova

Playwright, Galeria Altavista › Financeiro › Ver detalhe. O teste do "é tela
mesmo" conta diálogos que **envolvem** o `h1` (contar todos dá falso positivo:
os outros Sheets do módulo ficam montados e fechados):

```
título: "Rateio de 08/2026"  (text-2xl font-black text-gray-900)
migalha: Condomínios › 010 - Galeria Altavista › Rateio de 08/2026
seções: Identificação | Quem paga quanto | Despesas do rateio
tabela 1: Unidade | Quem paga | Cota    12 linhas
tabela 2: Descrição | Fornecedor | Valor  1 linha
células cortadas: 0

diálogos ENVOLVENDO o título:        0   ✔
backdrops escuros cobrindo a página: 0   ✔
sidebar visível:                  true   ✔
VEREDITO: ✅ tela in-flow

voltar traz para a lista de rateios: true
```

Portões: `tsc --noEmit` 0 · `vitest run` 5435 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

## Fora do escopo

O **relatório do rateio** continua em `Sheet`. Ele é documento (prévia do PDF),
não tela de trabalho, e o pedido foi sobre o detalhe — mas as duas ações vivem
lado a lado na mesma linha da tabela, então vale decidir se ele acompanha.
