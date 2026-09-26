# Relatório de rateio: anexar os comprovantes

## Pedido original (literal)

> incluir checkbox para que o usuário escolha ou nao incluir os boletos
> (comprovando as depesas) no relatatório

## O que foi feito

No rodapé da sheet **Relatório de rateio** (Condomínio › Financeiro), ao lado
do "Baixar PDF": **"Incluir os comprovantes (N documentos)"**. Marcado, o PDF
ganha, depois do corpo, uma página por página de cada comprovante — o boleto,
o XML da NF-e ou a minuta do contrato, pelo mesmo resolvedor por origem da aba
Despesas.

- **Nasce desmarcado.** Anexar leva segundos e engorda o arquivo; quem quer a
  prova marca, quem só quer o demonstrativo baixa rápido.
- **Some quando não há comprovante nenhum** — caixa que não muda nada só ensina
  a ignorar a caixa.
- **O botão conta em voz alta**: "Anexando 3 de 12…". Um botão parado por
  segundos lê como travado.
- **Cada página anexada tem legenda**: "Comprovante 2/12 · página 1 de 2 —
  Consumo de Energia · R$ 72,14". Sem ela, doze boletos no fim do documento não
  dizem a qual despesa cada um pertence.
- **O que não entrou é DITO**: página final "Comprovantes que não entraram",
  com o motivo, e o aviso na tela também. Anexo que falta em silêncio é pior
  que anexo que falta.
- A numeração do rodapé é **refeita** depois dos anexos — senão as páginas novas
  saem sem número e o "1 / 3" do corpo vira mentira.

## Por que rasterizar

Não há biblioteca de **merge** de PDF no projeto (`jspdf` escreve, não junta;
não existe `pdf-lib`). O que existe é `pdfjs-dist`, já usado em
`utils/pdfToImage.ts` com o mesmo import de worker, e o precedente de
`docxRenderService.docxBlobToPdf`, que também rasteriza. Cada página vira
canvas → JPEG (qualidade 0,72, escala 2) → página do relatório.

O custo é o texto do anexo não ser selecionável. Para comprovante é aceitável:
o que se quer dele é a prova visual. O corpo do relatório continua vetorial.

Teto de 10 páginas por comprovante: boleto com 30 páginas é erro de upload, e
não pode travar o navegador. O excedente é dito na página de falhas.

## Aparar a margem branca

Medido no primeiro boleto anexado (Energisa): a página de origem é **larga** e
a fatura ocupa só a faixa esquerda. Encaixada inteira, virava uma tira de ~5 cm
num A4, ilegível impressa. `aparaMargemBranca` recorta o branco (com
tolerância, porque PDF escaneado raramente tem 255 puro) antes de decidir
retrato/paisagem — o formato que importa é o do conteúdo, não o da folha.

## Só do lado de dentro

O condômino **não** ganha o checkbox. O bucket `boletos` só abre para membro
da organização (`boletos_select_org`), e o condômino entra por token de portal
sem ser membro. Não é limitação a corrigir: é a permissão funcionando.

## Um defeito que só a prova pegou

A primeira execução baixou o PDF com o checkbox marcado, a contagem certa no
rótulo… e **zero** anexos, sem nenhuma assinatura de URL. O `map` que monta o
modelo do relatório em `FinanceiroTab` descartava o campo `documento`. Como ele
é opcional, o TypeScript não acusou. Corrigido, e há comentário no ponto.

## Prova

Playwright no servidor da frente, Galeria Altavista › Relatório do rateio:

```
checkbox presente, começa desmarcado

MARCADO    → rateio_08-2026.pdf · 320 KB · 3 páginas · 3,3 s
             bucket assinado: boletos
             aviso: "baixado com 1 comprovante(s)"
DESMARCADO → rateio_08-2026.pdf · 21 KB · 1 página · 82 ms
             nenhuma assinatura
```

As páginas de anexo foram renderizadas no Chrome e conferidas: legenda,
fatura da Energisa centralizada, a segunda página na largura inteira (legível:
"0800 701 0326"), rodapé "2 / 3".

Testes: `__tests__/condominioDescricaoDoRateio.test.ts` de 12 para 16 — boleto
traz o arquivo com o bucket, fechado também traz, despesa sem lançamento e
origem sem arquivo não inventam comprovante. A rasterização roda em
canvas/pdfjs do navegador e é provada pela tela, não por teste unitário.

Portões: `tsc --noEmit` 0 · `vitest run` 5517 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build` (worker do pdfjs sai como asset próprio,
carregado só no clique).
