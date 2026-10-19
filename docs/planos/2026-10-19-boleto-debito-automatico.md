# Boleto: fatura em débito automático entra sem valor

## Pedido original

> suprimentos > Boletos a Pagar > a captura automatica por email conseguiu identificar a data, credor, mas não o valor dos seguintes boletos. Analise
>
> #1457 #1468 #1466 #1460 #1456 #1471 #1469 #1465 #1455 #1470 #1467 #1464 #1461

Sessão `d0ca5b1c-ae98-4b59-bf0b-6246a601d64d` · 19/10/2026.

Depois da análise, foram propostos 3 itens: (1) o leitor lê o "TOTAL A PAGAR" de fatura
em débito automático; (2) preencher o valor dos 14 já capturados; (3) investigar as 153
linhas de extrato iguais nas contas "Sicredi" e "Sicredi - Garden". Resposta do usuário:

> faça a 1, 2 e 3

## Diagnóstico (19/10/2026)

- Os 14 boletos (os 13 do pedido + #1459, no mesmo estado) são DANF3E da Energisa com
  "FATURA A SER QUITADA ATRAVÉS DE DÉBITO AUTOMÁTICO". Não há linha digitável nem código
  de barras. `extractFromPdfText` cai no ramo "sem linha", que só preenche o vencimento.
  O valor só nascia da linha.
- O valor está impresso em "TOTAL A PAGAR R$ 102,46". Os PDFs abrem sem senha.
- Reproduzido fora da produção: os 14 PDFs baixados do bucket, rodando `pdf.ts` +
  `boletoTexto.ts` da function em Deno, dão `valor null` como em produção.

## Plano

### 1. Leitor — `utils/boletoTexto.ts`
**Muda:** sem linha digitável, quando o texto diz que a fatura é quitada por débito
automático (frase de quitação, nunca o anúncio "Cadastre sua fatura em Débito
Automático"), o valor vem de "TOTAL A PAGAR R$ …" (confiança 60, um valor só; se houver
dois valores diferentes, não escolhe). Entra o aviso `AVISO_DEBITO_AUTOMATICO` (não pagar
por boleto/PIX, conciliar com o débito do extrato) e `raw.debitoAutomatico = true`. O
erro `ERRO_SEM_LINHA` continua: não há linha, e o boleto segue em revisão.
**Pronto quando:** testes novos em `__tests__/boletoTexto.test.ts` passam (trecho real da
fatura; anúncio sem quitação não dá valor; milhar; valores divergentes) e os 14 PDFs
reais rodados em Deno dão o valor certo.

### 2. Os 14 já capturados
**Muda:** a releitura da Edge (`reprocessarParados`) já relê boleto em revisão sem linha e
só preenche campo vazio. Depois de publicar a function com o leitor novo, zerar
`email_capture_messages.reprocessado_em` dos 14 e deixar o cron reler.
**Pronto quando:** os 14 boletos têm `valor` igual ao "TOTAL A PAGAR" do PDF, com o aviso
de débito automático em `erros_validacao`, e nenhum outro campo preenchido foi trocado.

### 3. Extrato repetido nas duas contas Sicredi (só investigação)
**Muda:** nada no banco. Relatar o achado com números e o que falta para decidir.
**Pronto quando:** o relato existe com contagem por mês e o uso de cada lado.

## Estado
- [x] 1: `86f441e4`, PR #58 (CI verde no `a01b9390`). 40/40 testes do leitor, os 14 PDFs
  reais dão o valor certo em Deno, `tsc` rc=0, `deno check` rc=0. Edge Function publicada
  pelo usuário em 19/10/2026 (o auto mode barrou o deploy); conferido de fora: 401 sem
  header. **Falta o merge do PR** (front/upload manual), que fica com o usuário.
- [x] 2: `reprocessado_em` zerado nos 14 (19/10/2026, depois do deploy); o cron releu em
  2 rodadas (21:15 e 21:30 UTC). Conferido no banco: os 14 com `valor` = "TOTAL A PAGAR"
  do PDF, campo preenchido só `valor` (auditoria `reprocessamento`), vencimento intacto,
  status `revisao`, aviso de débito automático em `erros_validacao`.
- [x] 3: investigado (abaixo). Nada alterado no banco.

## Item 3: extrato repetido nas duas contas Sicredi (19/10/2026)

Contas: `Sicredi` (3fba3210, org Alpa, nº cadastrado "1234") e `Sicredi - Garden`
(91853f74, org Construção do Edifício Garden Cambuhy SPE, nº 99019-2).

- São duas contas bancárias reais: no mesmo dia (02/02/2026) cada uma tem o próprio IOF e
  os próprios juros de cheque especial, com referências diferentes.
- 153 linhas idênticas (mesmo `external_id`, data, valor e direção), em 3 meses:

  | mês | linhas Garden | linhas Alpa | iguais | lote Garden | lote Alpa |
  |---|---|---|---|---|---|
  | 12/2025 | 5 | 63 | 5 (todas as da Garden) | 25/05 | 13/03 |
  | 01/2026 | 79 | 64 | 64 (todas as da Alpa) | 23/05 | 14/07 |
  | 06/2026 | 84 | 84 | 84 (o mês inteiro) | 11/08 | 16/07 |

  Junho/2026 soma R$ 66.402,29 de débitos e R$ 62.223,00 de créditos lançados em dobro.
- Os dois lados estão em uso: classificados por regra, centros de custo, e 1 vínculo em
  cada lado em 06/2026, **o mesmo título** (adiantamento LABOR de Rogério da Silva Santos,
  R$ 648,40, org Garden) casado com as duas cópias.
- Contradição que impede decidir só pelo banco: as 14 faturas Energisa trazem o mesmo
  domicílio de débito (Sicredi 0230 / 55883-5), mas os débitos aparecem ora numa conta do
  app (fev, abr), ora na outra (mar, abr, mai). Ou seja, além das cópias exatas, pode haver
  meses inteiros importados na conta errada. Nenhuma das duas contas tem 55883-5 cadastrado.
- Os lotes antigos são anteriores ao registro em `bank_statement_imports` (sem `acct_id`
  do OFX) — a conta de origem de cada arquivo não está gravada.

**Para decidir (usuário):** qual conta do app é a 0230 / 55883-5, e de que conta vieram
os extratos de dez/2025, jan/2026 e jun/2026. Com isso: apagar o lado errado com tabela
de reversão, passando classificação e vínculo para o lado que fica, como em
o extrato Sicredi 2024 em dobro (`extrato_duplicado_*_reversao_20261017`).

## Verificação
`npx vitest run __tests__/boletoTexto.test.ts`; script Deno com os PDFs reais
(`c:/tmp/boleto-energisa/run/ler.ts`); consulta dos 14 boletos depois do cron.
