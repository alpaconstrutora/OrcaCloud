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
- [ ] 1
- [ ] 2
- [ ] 3

## Verificação
`npx vitest run __tests__/boletoTexto.test.ts`; script Deno com os PDFs reais
(`c:/tmp/boleto-energisa/run/ler.ts`); consulta dos 14 boletos depois do cron.
