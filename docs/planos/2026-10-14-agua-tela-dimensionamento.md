# Água: a gaveta lança, a tela "Dimensionamento da água" dimensiona

## Pedido original

> o drawer Água fria e quente automáticas nao esta muito grande a ponto de ser necessario ser uma tela? avalie

Sessão Claude Code (VS Code) · 14/10/2026. Avaliação (sobre `origin/main`): a gaveta tem 32 campos
de hipótese em 6 grupos e a tabela de Pressões cresce com os pontos — o caso do precedente de 15/09
(quadro de cargas/unifilar viraram tela). Mas metade dela (lançar a rede) precisa do desenho à vista.
Achado na avaliação: a mudança publicada no mesmo dia (`fbc373dd`) **apertou** duas tabelas — no
drawer `xl` (576 px − `px-6` = ~528 px), a coluna "Ponto" de Pressões ficou com ~32 px e a "Previsto"
da rede com ~112 px.

Resposta do usuário:

> 1. Siga com a correção das larguras (item 1) agora e com a tela (itens 2 e 3) na mesma frente.
> 2. E sobre os dois botões: tiro?  Sim, "Lançar tudo" da gaveta já lança os dois
> 3. Aavaliar ma sequencia a gaveta de Esgoto, que tem a mesma mistura (coletor e tratamento são dimensionamento).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10 | Corrigir as larguras + criar a tela, na mesma frente? | sim |
| 14/10 | Tirar "Lançar alimentador" e "Lançar bomba e recalque" (o "Lançar tudo" já lança)? | sim |
| 14/10 | Esgoto (coletor, tratamento) | avaliar **na sequência** — fora desta frente |

Decisões minhas:
- A tela entra no mecanismo existente `telaAberta` (`TelaDaEletrica`), igual ao quadro de cargas: o
  editor fica montado e escondido; "Voltar ao editor" no cabeçalho; "Selecionar" de um ponto fecha a
  tela e seleciona no desenho. Nada de `fixed inset-0`/`Sheet` (memória "nunca tela cheia").
- Abrir a tela pelo link da gaveta FECHA a gaveta (o `Sheet` sai por portal e ficaria por cima).
- A tela usa a classe `drawer-legivel` no corpo, para os painéis (escritos em `text-xs`) lerem no mesmo
  tamanho que liam na gaveta.
- As hipóteses da pressão mudam o DN lançado (`comAjusteDePressao`): a gaveta diz a pressão mínima em
  vigor e aponta para a tela.

## Plano

**1. Larguras (`BlueprintEditor.tsx` › tabela da rede de água)** — Origem `w-32`, Pontos `w-28`,
Lançar `w-28`; Previsto fica com o resto (~176 px).
- **Como sei que terminou:** soma das colunas fixas ≤ 352 px (registrado aqui); testes da água passam.

**2. Tela `dimensionamento-agua`** — Reservação, Alimentador, Recalque, Aquecedor e Pressões, cada um num
cartão; Pressões em largura inteira. Aberta pelo ribbon (Hidráulica › grupo "Dimensionar") e pelo link
da gaveta.
- **Como sei que terminou:** teste do editor: abrir pelo ribbon mostra `data-tela="dimensionamento-agua"`
  com os 5 painéis e o editor `hidden`; "Voltar ao editor" volta; "Selecionar" de um ponto volta ao
  editor com o ponto selecionado.

**3. `PainelAlimentador` / `PainelRecalque`** — sem botão de lançar (e sem `onLancar`); o texto do
hidrômetro proposto aponta para o "Lançar tudo" da gaveta.
- **Como sei que terminou:** testes dos dois painéis sem o botão; nenhum `onLancar` restante.

**4. A gaveta** — fica: rede, hipóteses da rede (+ a regra do ajuste por pressão), verificação, rodapé;
sai: os 5 painéis; entra: um cartão "Dimensionamento" com a situação em uma linha por assunto e o link.
`ajuda` do botão do ribbon deixa de dizer "2,20 m" fixo.
- **Como sei que terminou:** teste do editor: a gaveta NÃO tem `reservacao`/`pressoes-da-agua`; tem o
  cartão com o link; clicar abre a tela e fecha a gaveta.

**5. Verificação** — `check-ui-standard.sh`, `tsc`, editor sozinho + painéis + hidráulica com a conta
fechando; nenhum `utils/` tocado.

## Estado

- [x] 1 Larguras — Origem `w-32` (128) + Pontos `w-28` (112) + Lançar `w-28` (112) = 352 px fixos;
  "Previsto" fica com ~176 px (antes ~112). A tabela de Pressões foi para a tela (largura inteira).
- [x] 2 Tela `dimensionamento-agua` — ribbon Hidráulica › grupo "Dimensionar" (contagem = pontos com
  pressão insuficiente) e o link do cartão da gaveta; 5 painéis em cartões (grade de 2 colunas +
  Pressões em largura inteira). Teste do editor: abre pelo cartão (gaveta fecha, nenhum `role=dialog`
  em volta), "Selecionar" de um ponto volta ao editor, abre pelo ribbon, "Voltar ao editor" volta.
- [x] 3 `PainelAlimentador`/`PainelRecalque` sem botão nem `onLancar`; o texto do hidrômetro proposto
  aponta para o "Lançar tudo" da gaveta. Testes ajustados.
- [x] 4 Gaveta — `ResumoDoDimensionamentoDaAgua` (novo, teste 3/3) antes das hipóteses; hipóteses da
  rede com a regra do ajuste por pressão (que CONTRADIZIA o texto antigo "sem pressão disponível":
  `comAjusteDePressao` sobe o DN dos sugeridos até a mínima) e o link da tela; `ajuda` do ribbon lê
  a cota do ramal.
- [x] 5 Verificação (14/10/2026): `check-ui-standard.sh` 0 alertas nos 4 arquivos de tela; `tsc` exit 0,
  0 erros; editor sozinho 252/252; 36 arquivos (painéis + resumo + hidráulica + memoriais + Saídas
  de Incêndio + guarda de cabeçalho) 292/292. Nenhum arquivo de `utils/` tocado.

## Publicação

14/10/2026: `d73f51b7` empurrado para `main` (`f28fe96a..d73f51b7`). Check-run `ci` = success.
`conferir-producao.sh "Dimensionamento da água" "Abrir dimensionamento"`: os dois textos no bundle
servido (domínio em `82a2029`, que contém o commit). Conferência VISUAL na tela ainda não feita.

## Conferência visual (14/10/2026, a pedido do usuário)

> 1. Conferência visual. Não abri nenhuma das telas no navegador. Voce nao consegue testar com email e senha?

App real (dev server de uma frente no `main`), conta `agente-leitura`, planta DESCARTÁVEL criada pelo
serviço com o desenho pronto e arquivada no fim (autorizado pelo usuário). Roteiro:
`c:/tmp/pwtest/conferencia-hidro.cjs` — 20 portões, todos ok na 2ª rodada; sem erro de JS/console/HTTP;
plantas `b3fee1b8…` e `33c107bd…` com `status = ARQUIVADO`.

Achados da 1ª rodada, corrigidos nesta frente:
- **Meu (de `d73f51b7`):** antes do lançamento, o cartão "Dimensionamento" dizia "Pressões: os 3 ponto(s)
  atendem" — ponto sem rede é `NAO_AVALIADO` e era contado como atende. Agora: "N ponto(s) sem rede —
  lance para avaliar". Teste unitário novo.
- **Anterior a hoje:** a Ventilação dizia "Todo desconector ventilado…" logo acima de "VS sem
  ventilação… ventile à mão" (sem comando ≠ tudo ventilado). Agora, com avisos: "Nada que o lançamento
  automático consiga ventilar — veja abaixo o que fica à mão."
- **Anterior a hoje:** o botão "Lançar (3)" do rodapé do esgoto quebrava em duas linhas; `whitespace-nowrap`
  + `shrink-0` (portão: altura 36 px).

Verificação: `check-ui-standard.sh` 0 alertas; `tsc` 0 erros; editor 252/252; 32 arquivos 255/255.

Publicação dos achados: `5dfdfbcc` empurrado (`b12e517b..5dfdfbcc`), check-run `ci` = success; `conferir-producao.sh` achou "sem rede — lance para avaliar" e "Nada que o lançamento automático consiga ventilar" no bundle servido (domínio em `5dfdfbc`).
