# Uma aba só: a precificação passa a morar dentro da aba "Inteligência"

## Pedido original

Sessão de 2026-09-12 (Claude Code, frente `inteligencia-aba-unica`), na sequência
da simplificação do cálculo de 11/09. Mensagem do usuário, literal:

> mover o conteudo da aba Inteligência Hedônica para inteligencia

Pergunta feita antes de implementar (o pedido não dizia a forma), e resposta do
usuário: **"Compacto, acima das regras"** — bloco de precificação enxuto no topo
da aba, sem o cabeçalho azul, tabela de regras logo abaixo.

## Por que isto fecha um buraco, e não só junta duas telas

Depois de 11/09 o aluguel passou a sair de **área × regras da aba Inteligência**.
Com as duas abas separadas, a tela do botão "Aplicar" não mostrava nenhuma das
regras que o botão ia usar, e a tela das regras não tinha como aplicá-las. Quem
mexesse numa regra precisava trocar de aba para ver o efeito — e, pior, aplicava
sem ter as regras à vista.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/RentalPricingIntelligencePanel.tsx` | Vira bloco compacto: sai o cabeçalho azul de tela cheia (duplicava o título da página, §18/§20), entra a escala compacta do §16 (container `10px`, controles `h-9`/`6px`), rótulo do §21 e botão primário do §17. Um campo só, que muda de significado com o modo. Prop `buildingName` sai — o nome do prédio já está no subtítulo da tela. | `check-ui-standard.sh` exit 0; tela conferida em print. |
| 2 | `components/RentalsModule.tsx` | A aba `pricing-intelligence` deixa de existir (tipo, botão e bloco de render); a aba `intelligence` passa a renderizar o painel acima do `RentalIntelligenceTab`. | Playwright: a aba "Inteligência Hedônica" não aparece na barra; o bloco fica acima da tabela. |
| 3 | `components/RentalIntelligenceTab.tsx` | O texto do Sheet de cadastro apontava para a aba que sumiu ("ao rodar Aplicar na Inteligência Hedônica"). Passa a citar o botão desta mesma aba em Locações, e segue citando a "Inteligência de preços" em Venda; a palavra aluguel/preço acompanha o `purpose`. | `grep` por "Hedônica" não acha mais referência de navegação em Locações. |
| 4 | `__tests__/components/RentalPricingIntelligencePanel.test.tsx` | Teste novo do contrato do bloco: o mesmo campo vira base/m² ou total do prédio conforme o modo, não herda valor ao trocar de modo, e o botão trava durante a aplicação. | 6 testes passando. |

## Decisões

- **O painel foi adaptado, não só recortado e colado.** Dentro de uma aba que já
  tem título e barra de abas, o cabeçalho azul de tela cheia virava um segundo
  título competindo com o primeiro. O resto do conteúdo (explicação, modos,
  valor-alvo, aviso de substituição, botão) foi mantido item a item.
- **Ordem: aplicar em cima, regras embaixo.** Escolha do usuário entre as três
  opções apresentadas. Lê como "isto é o que vai acontecer; estas são as regras
  que mandam nisso".
- **Venda de Ativos não muda.** Continua com a "Inteligência de preços" em tela
  própria e o modelo hedônico completo — o pedido é da aba de Locações.
- **O nome "Hedônica" sai de vez da navegação de Locações.** Não sobrou aba com
  esse nome; o cálculo que ele descrevia já tinha saído em 11/09.

## Estado

- [x] 1 — bloco compacto, sem hero.
- [x] 2 — aba fundida; `pricing-intelligence` removida do tipo e do render.
- [x] 3 — texto do Sheet corrigido nos dois módulos.
- [x] 4 — 6 testes de componente novos.
- [x] Verificação: `tsc` ✅, `check-ui-standard.sh` nos dois arquivos ✅, suíte completa **278 arquivos / 3851 testes** ✅.

Prova no navegador (Playwright, dev server da frente na porta 5307, login do
agente de leitura, 010 - Galeria Altavista; todas as escritas a `/rest/v1/**`
interceptadas — nada chegou ao banco):

- Barra de abas: `Unidades · Contratos · Resultados · Renovações · Corretores ·
  Tabela de aluguéis · Inteligência` — a "Inteligência Hedônica" não existe mais.
- Na aba Inteligência: bloco de precificação em y=255, tabela de regras em y=537
  (acima, como pedido), com as 4 regras do prédio visíveis na mesma tela.
- "Aplicar Inteligência" disparado dali funciona: POST de
  `pricing_rule_applications` com 12 linhas, como quando o botão morava na aba
  separada.
