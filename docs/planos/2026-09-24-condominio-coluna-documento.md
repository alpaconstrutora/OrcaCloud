# Condomínio › Financeiro › Despesas: coluna Documento

## Pedido original (literal)

> condomínio < aba financeiro < aba despesas: criar coluna documento e trazer o
> documento referente a deespesa. por exemplo se a desspesa teve origem em
> Financeiro < boletos a pagar, traga o boleto

## O que foi feito

Coluna **Documento**, segunda (logo depois de Código, porque as duas falam do
mesmo documento de origem), com o **nome do arquivo** do boleto como link que
abre o PDF.

`boletos` já guarda o arquivo: `documento_path`, `documento_nome`,
`documento_mime`. Medido em 24/09/2026: as **136** despesas de condomínio da
base têm arquivo — 136 de 136.

- `services/condominioRateioService.ts`: `codigosDeBoleto` virou
  **`dadosDoBoleto`**, que devolve `{ codigo, documentoPath, documentoNome }`
  numa consulta só. Best-effort como antes: sem leitura em `boletos`, as
  colunas Código e Documento ficam vazias e a lista continua de pé.
- `LancamentoDoCondominio` ganhou `documentoPath` e `documentoNome`.
- A tela abre o arquivo por `boletoService.getDocumentoUrl(path)` — o helper
  que o Boletos a Pagar já usa.

## Duas decisões que valem registro

**A URL é assinada no CLIQUE, não no carregamento.** O bucket `boletos` é
privado e a assinatura vale 15 minutos: assinar as 136 linhas ao abrir a aba
gastaria 136 chamadas para o usuário abrir, no máximo, uma — e a assinatura
teria expirado antes do clique. O serviço traz só o **path**; há teste travando
que ele nunca devolve `http…`.

**Arquivo sem nome ainda é arquivo.** `documento_nome` vazio cai para o rótulo
"Documento" em vez de a linha perder o link. O inverso também: nome sem
`documento_path` **não** vira link, porque não há o que abrir.

A aba nova é aberta com `noopener,noreferrer` — sem isso ela recebe
`window.opener` e pode navegar a nossa.

A busca passou a alcançar a coluna (o filtro promete alcançar as colunas
visíveis) e o placeholder foi atualizado.

## Prova

Playwright no servidor da frente, Bella Vista › Financeiro › Despesas,
competência 06/2020:

```
colunas: Código | Documento | Data | Descrição | Fornecedor | Origem |
         Centro de custo | Situação | (esp) | Valor
posição de "Documento": 2ª

🔗 documento_2307695_19_07_2020.pdf
🔗 documento_2307695_21_05_2020 (1).pdf
🔗 Boleto_ALPA CONSTRUTORA E INCORPORADORA LTDA - ME (6).pdf

células com texto cortado: 0
```

Clique no link:

```
assinaturas pedidas: POST object/sign/boletos/926cf626-…/2026/17852107
aba nova abriu:      …/storage/v1/object/sign/boletos/926cf626-…
URL é assinada (tem token): true
```

Testes: `__tests__/condominioLancamentoCodigo.test.ts` passou de 14 para 20 —
path nunca é URL, arquivo sem nome mantém o link, nome sem arquivo não vira
link, origem que não é BOLETO não busca documento, e boleto ausente de
`boletos` não derruba a linha.

Portões: `tsc --noEmit` 0 · `vitest run` 5338 passaram / 0 falhas · os cinco
`check-*.sh` · `npm run build`.

⚠️ Fora do escopo, visto na prova: as RPCs da Central de Controle respondem
`57014 canceling statement due to statement timeout` ao carregar a tela. É o
gargalo de banco já conhecido, não tem relação com esta mudança.
