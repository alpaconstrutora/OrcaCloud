# Relatório de rateio — a prestação de contas da competência

## Pedido original (literal)

> implementar relatório de rateio

Respostas do usuário às perguntas de escopo:

- **Formato:** PDF **e** visualização na tela
- **Escopo:** um rateio (uma competência)
- **Alcance:** também o condômino, no portal

## O que já existia — e o que não existia

Levantamento antes de escrever qualquer linha:

- **Zero exportação no módulo de condomínio.** `FinanceiroTab.tsx` (2.058
  linhas) não tinha nenhum `pdf`/`excel`/`download`. O termo "prestação de
  contas" não aparece no repositório.
- **Não há helper de PDF compartilhado.** Cada domínio reimplementa o seu; o
  molde de fato é `services/pdfReportService.ts` (paleta, `sectionHeader`,
  rodapé paginado, total em negrito via `didParseCell`), do qual o
  `academyCertificadoService` também partiu.
- **O portal já tinha o dado.** `client_portal_get_condominio*` devolve
  `despesas` e `cotas` (com a flag `minha`) no mesmo payload que a aba já
  carrega. **Nenhuma RPC nova foi preciso.**
- **A privacidade já estava decidida.** Comentário em `CondominioTab.tsx:420`:
  decisão do usuário em 23/09/2026 entre "só a minha", "minha + despesas" e
  "tudo" → **o rateio INTEIRO**, "transparência de assembleia". O relatório do
  condômino traz as cotas de todas as unidades, com a dele em destaque.

## O desenho

**Um modelo puro, dois consumidores.** `utils/relatorioRateio.ts` recebe
`EntradaRelatorio` e devolve `RelatorioRateio`. O admin traduz de
`Rateio + DespesaRateio[] + CotaDoRateio[]`; o portal, de
`PortalRateioCondominio`. Se cada lado montasse o seu, o síndico e o condômino
acabariam com dois documentos que discordam — e é o mesmo rateio.

**O PDF é gerado no navegador e baixado; não é guardado.** O documento é
derivado: sai inteiro dos dados que a tela já tem. Gravá-lo num bucket criaria
uma segunda verdade que envelhece — rateio corrigido e PDF antigo no Storage.
Por isso `doc.save()`, e não o upload que o `pdfReportService` faz.

**`import()` dinâmico** para jsPDF + autotable, como em
`boletoService.exportarPDF`: quem abre a aba quase nunca baixa o relatório.
Confirmado no build — `jspdf.plugin.autotable` saiu em chunk próprio (31 kB).

### Os avisos

O que separa um documento de uma tabela impressa. Quem recebe a prestação de
contas não tem como saber **por que** a soma não fecha, e a pergunta volta ao
síndico como desconfiança. O modelo emite, antes das tabelas:

- rateio ainda em rascunho — os valores podem mudar;
- soma das cotas diferente do total das despesas, **com o valor**;
- despesas listadas que não somam o total gravado ("refaça o cálculo antes de
  distribuir");
- unidades sem responsável financeiro, com a contagem.

Vêm **antes** das tabelas de propósito: são o que muda a leitura dos números
abaixo, e aviso no rodapé é aviso que ninguém lê.

## Onde entra

| Superfície | Como |
|---|---|
| Condomínio › Financeiro › Rateios | Ação **Relatório do rateio** na linha → sheet com o documento na tela + **Baixar PDF** |
| Portal do Cliente › Condomínio › Financeiro do condomínio | **Baixar PDF** no cabeçalho de cada competência |

A sheet é **própria**, e não um botão no "Ver detalhe": o detalhe é tela de
trabalho (corrige descrição em rascunho), o relatório é o documento que sai
daqui para o condômino. Misturar faz a tela de trabalho parecer o documento
oficial.

## Prova

**Admin** — Galeria Altavista › Financeiro › Relatório do rateio:

```
seções: Identificação | Despesas da competência | Rateio por unidade
tabela 1  Descrição | Valor      1 linha  · 622px em 622px
tabela 2  Unidade | Quem paga | Cota   12 linhas · 622px em 622px
células cortadas: 0
avisos: rascunho · 2 unidade(s) sem responsável financeiro
PDF: rateio_08-2026.pdf · 20.592 bytes · assinatura %PDF- ✔
```

**Condômino** — pelo link real `/portal-cliente?token=…`, como ele entra
(Defensoria Pública de Minas Gerais, 3 unidades no Galeria Altavista):

```
aba Condomínio → Financeiro do condomínio → Baixar PDF
PDF: rateio_08-2026.pdf · 20.601 bytes · %PDF- ✔
Sala 201/202/203 em negrito azul — a cota de quem está lendo
```

Os dois PDFs foram **renderizados e conferidos página a página** (Chrome,
print), não só medidos em bytes.

⚠️ A comparação dos dois pegou uma divergência real: o documento do síndico
dizia **Tipo: Ordinário** e o do condômino **Ordinária**, porque o portal usa
"Taxa ordinária" no card. É o mesmo documento — o campo não pode sair com duas
palavras em duas mãos. Unificado em "Ordinário"; o card do portal mantém o
texto dele.

Testes: `__tests__/relatorioRateio.test.ts` (17) — título com e sem número,
nome de arquivo sem `/` nem `:`, soma sem erro de ponto flutuante, cada um dos
quatro avisos, e datas que não voltam um dia no fuso local.

Portões: `tsc --noEmit` 0 · `vitest run` 5377 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

## Fora do escopo, visto na prova

As RPCs do portal (`getReceivablesByToken`) responderam `57014 canceling
statement due to statement timeout` numa das execuções. É o gargalo de banco
já conhecido, sem relação com esta mudança.
