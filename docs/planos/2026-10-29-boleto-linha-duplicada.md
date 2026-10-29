# Boleto — linha digitável que já é de outro boleto: avisar na hora, perto do botão

## Pedido original

Sessão de 29/10/2026 (Claude Code, VS Code). Primeira mensagem, literal (com print da
caixa "Extração com baixa confiança" do boleto #0380, campo preenchido com
`42297042020000246975700002558526181780000123000`):

> financeiro > boletos a pagar: verifique por que o app conseguiur ler o código de barra
> do boleto #0380, porem recebo Avisos de validação: Linha digitável não encontrada no
> texto extraído

Diagnóstico apresentado (conferido no banco):

- "Ler do código de barras do PDF" só **preenche o campo**; nada é gravado até
  "Validar linha digitável". O aviso é o resultado guardado do upload de 01/07/2026
  (o texto do PDF não tinha a linha). No #0380: `linha_digitavel` NULL, sem
  `extracao_manual` na auditoria.
- A linha lida é válida (DVs conferem; banco 422, R$ 1.230,00), mas **já é do boleto
  #0377** — o mesmo boleto da DESTRO em outro PDF, enviado 4 s antes. "Validar" cai no
  índice único `boletos_org_linha_digitavel_uq` e a mensagem ("Outro boleto desta
  organização já tem essa linha digitável.") aparece no **topo da tela**, longe do botão.

Propus três melhorias; o usuário respondeu, literal:

> sim

As três, como foram apresentadas:
1. Ao ler o código de barras, já avisar que essa linha é do boleto #0377, com link para
   ele, antes de você clicar em "Validar".
2. Mostrar o erro do "Validar" logo abaixo do botão, não só no topo da tela.
3. Na recusa por duplicidade, dizer o número do outro boleto em vez de só "outro boleto".

## Decisões de desenho

- **Mesma definição de "mesma linha" que o banco**: mesma organização, mesma
  `linha_digitavel`, `duplicado_de IS NULL`, outro `id` — é o predicado do índice
  `boletos_org_linha_digitavel_uq`. Consulta em `boletoService.boletoComMesmaLinha`.
- **Texto do aviso em função pura** (`utils/boletoLinhaManual.ts` →
  `mensagemLinhaDuplicada`), usada pelo aviso da tela e pela recusa do service.
- `aplicarLinhaDigitavelManual` confere ANTES do update e recusa com o número; o 23505
  continua tratado (corrida), também com o número quando a consulta acha.
- Na tela, a caixa ganha um erro próprio (`erroLinha`) logo abaixo dos botões; os erros
  de leitura/validação da linha vão para lá, não para o topo. Com duplicata detectada,
  "Validar" fica desligado **com o motivo** no `title`, e aparece "Abrir boleto #0377".
- "Abrir" usa o `abrirBoletoPorId` que o `BoletoManager` já tem; o formulário ganha
  `key` pelo id do boleto para remontar com os campos do outro.

## Itens

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 1 | `utils/boletoLinhaManual.ts`: `mensagemLinhaDuplicada` + teste em `__tests__/boletoLinhaManual.test.ts` | teste vermelho antes, verde depois | ✅ 2 vermelhos → 10/10 verdes (+ `rotuloDoBoleto`) |
| 2 | `boletoService.boletoComMesmaLinha` + recusa nomeada em `aplicarLinhaDigitavelManual` (antes do update e no 23505) | typecheck 0; consulta real devolve #0377 para a linha do #0380 | ✅ tsc 0 erros; predicado no banco → #0377 (Rascunho, R$ 1.230,00, 27/02/2020) |
| 3 | `BoletoFormModal`: aviso após ler o código, erro abaixo dos botões, Validar desligado com motivo, "Abrir boleto #…" (prop `onAbrirOutroBoleto`); `BoletoManager` passa `abrirBoletoPorId` e `key` | `check-ui-standard` exit 0 nos 2 arquivos; tela no navegador com o #0380 | ✅ exit 0 nos 2; app local (frente, porta 3100): ler o código no #0380 → aviso com #0377 abaixo dos botões, Validar desligado; "Abrir boleto #0377" abre o #0377 (doc BOL-002-000-0037.pdf). Nada gravado (updated_at dos dois igual ao de 28/10). Suíte de boletos 192/192 |
| 4 | Publicação + conferência no domínio | CI verde; `conferir-producao.sh "já é do boleto"` | ✅ PR #255, CI verde, domínio serve `ae9694b` com o texto |

## Pedido posterior — 29/10/2026

Com print da caixa no boleto BOL-004-0061.pdf, literal:

> mover a sessao Extração com baixa confiança para o painel lateral direito

| # | O que muda | Como sei que terminou | Estado |
|---|---|---|---|
| 5 | A caixa "Extração com baixa confiança" sai de baixo do documento e vai para a coluna direita, logo acima de "Cobrança" (onde a linha preenchida aparece). Só move o bloco; o comportamento é o mesmo | diff só com linhas movidas (+ comentário); `check-ui-standard` exit 0; tela local mostra a caixa à direita, acima de Cobrança | ✅ diff conferido; tsc 0 erros; exit 0; testes do boleto 202/202; tela local (#0884) com a caixa entre "Documento" e "Cobrança" |
