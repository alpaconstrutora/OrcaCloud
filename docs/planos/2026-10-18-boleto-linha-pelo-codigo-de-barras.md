# Boleto — linha digitável pelo código de barras do PDF e entrada manual segura

## Pedido original

Sessão de 18/10/2026 (Claude Code, VS Code). Durante o teste de pagamento de boleto
real pela Asaas (plano `2026-10-16-asaas-pendencias-e-pix.md`), o boleto #1486 —
reaviso da Energisa — não tinha linha digitável (o PDF não a imprime; só desenha as
barras). A linha foi decodificada à mão, conferida na Asaas e gravada por SQL. Ao fim,
apontei duas lacunas e o usuário respondeu, literal:

> implemente os dois

As duas lacunas, como foram apresentadas:
1. "a linha digitável é só leitura no cadastro do boleto — quando a leitura falha, o
   boleto fica impagável pela Asaas";
2. "o leitor não tenta decodificar o código de barras desenhado quando o texto não
   traz a linha".

**Correção da premissa 1 (lida no código antes de implementar):** o cadastro JÁ tem
entrada manual — a caixa "Extração com baixa confiança" (`BoletoFormModal`, aparece com
`confidence_score < 80`) chama `boletoService.aplicarLinhaDigitavelManual`. O que falta
nela é segurança: em boleto APROVADO ela regrava valor/vencimento/multa a partir da
linha sem atualizar o título em Contas a Pagar (linha errada = Asaas paga outra conta),
e a linha repetida cai no índice único `boletos_org_linha_digitavel_uq` com erro cru.

## Decisões de desenho

- **Decodificação pura** em `utils/codigoBarrasI25.ts` (zero import de DOM/pdf.js):
  recebe a imagem (largura, altura, RGBA — o formato do `ImageData`), varre linhas,
  acha o padrão de início do Interleaved 2 of 5 com zona quieta, classifica barras e
  espaços em estreito/largo pela largura do início, decodifica 22 pares (44 dígitos,
  FEBRABAN) e confere o fim. Só aceita código cujo DV confere (`parseLinhaDigitavel`);
  vota entre as linhas varridas e exige um mínimo de linhas concordando.
- **Arrecadação 44 → linha de 48** (`febrabanRules.codigoBarrasArrecadacaoToLinha48`):
  4 blocos de 11 + DV de cada bloco (mod10 se o 3º dígito é 6/7, mod11 se 8/9).
  `linhaDoCodigoDeBarras(cb44)` escolhe bancário (47) ou arrecadação (48) pelo 1º dígito.
- **Navegador** (`utils/boletoParser.ts`): `lerCodigoDeBarrasDoPdf(bytes)` renderiza as
  2 primeiras páginas com pdf.js (escala 4) e chama o decodificador. `extractFromPdfFile`
  tenta o código de barras quando o texto não traz a linha (sem texto ou sem linha);
  o resultado vem com `metodo='ocr_local'` (já aceito pelo CHECK do banco) e um aviso.
- **Captura por e-mail** (Edge Function, Deno): não renderiza PDF — sem mudança. Para
  esses (e para boletos já cadastrados), a caixa da entrada manual ganha o botão
  "Ler do código de barras do PDF", que lê o PDF guardado no navegador e preenche o
  campo para o usuário conferir e validar.
- **Entrada manual segura** (`aplicarLinhaDigitavelManual`): `programado`/`pago`/
  `cancelado` recusam; `aprovado` grava só as colunas da linha (linha, código de barras,
  DV, banco, erros, método) e recusa se o valor da linha diverge do valor do boleto;
  rascunho/revisão seguem como hoje (a linha preenche o formulário). Duplicata → mensagem
  clara. A caixa some para `programado`/`pago`/`cancelado`.

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | `febrabanRules`: `codigoBarrasArrecadacaoToLinha48`, `linhaDoCodigoDeBarras` | teste com o código real do #1486 → linha conferida pela Asaas | ✅ `codigoBarrasI25.test.ts` (3 testes de regra) |
| 2 | `utils/codigoBarrasI25.ts` + `__tests__/codigoBarrasI25.test.ts` (codificador sintético no teste: bancário, arrecadação, ruído ao lado, DV errado recusado, larguras não inteiras) | teste verde | ✅ 9/9 + amostra real: 26 de 28 PDFs com código lidos certo, 0 errado (falharam: escaneado a 72 dpi; BB com barras em imagens de 1 px que renderizam quebradas) |
| 3 | `boletoParser`: `lerCodigoDeBarrasDoPdf` + tentativa no `extractFromPdfFile` | typecheck; prova com o PDF do #1486 no app | ✅ tsc 0; Chromium + Vite importando o módulo: #1486 → linha certa em 594 ms, extração `ocr_local` sem erros, R$ 61,65, venc. 02/10; 3 bancários com código em imagem = código do banco |
| 4 | `boletoService.aplicarLinhaDigitavelManual` seguro (status, valor, duplicata, método) | teste da regra pura + typecheck | ✅ `boletoLinhaManual.test.ts` 8/8; achado extra: a entrada antiga gravava null em beneficiário/CNPJ/multa |
| 5 | `BoletoFormModal`: botão "Ler do código de barras do PDF", caixa escondida em programado/pago/cancelado | `check-ui-standard` exit 0 | ✅ exit 0 (clique na tela fica com o usuário no #1486: a senha da conta de leitura não é guardada) |
| 6 | Publicação + conferência no domínio | `conferir-producao.sh "Ler do código de barras do PDF"` | ⏳ |

## Resultado (18/10/2026)

- Suíte de boleto: 25 arquivos, 279 testes verdes; `deno check` dos módulos de regra compartilhados verde
  (a captura por e-mail não muda de comportamento — o parâmetro novo é opcional e ela não o passa).
- Armadilha registrada: renderizar com transparência dá RGB 0 (preto) no fundo e engole a primeira barra
  de código embutido como imagem — o navegador pinta o canvas de branco antes de renderizar.
- Código em pé (lateral da página): a varredura também percorre colunas.
