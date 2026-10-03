# Criar o lote DIGITANDO na Planta Inteligente

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026. Pedido, literal:

> hoje o terreno ou lote é criado apenas desenhando. implementar também digitando

Perguntas feitas em plan mode e respostas do usuário:

- *Quais formas de digitar?* → **as quatro**: "Frente × fundo (retângulo)", "Lados: medida + ângulo",
  "Azimute/rumo + distância", "Coordenadas dos vértices".
- *E quando as medidas não fecham?* → "Mostrar e deixar decidir (Recomendado)": mostrar o erro e a prévia; abaixo da
  tolerância fechar sozinho; acima, oferecer a divisa de ajuste ou a distribuição do erro pelos lados.

## O que já existia (e por que não bastava)

- `restituirMemorial` (Roteiro perimétrico, A1) lia memorial colado — mas estava **inalcançável**: o botão Roteiro só
  liga com lote, e o "Lançar" da restituição só ligava sem lote. Além disso não girava pelo norte do estudo (o memorial
  do próprio Roteiro, com azimute verdadeiro, voltava girado num estudo com `rotacaoNorteDeg`), jogava fora o erro de
  fechamento e não trazia confrontante nem nome de vértice.
- `importarPontos` (levantamento) já convertia UTM e georreferência, mas pedia cota em toda linha.
- Fora isso, o lote só nascia clicando com a ferramenta Terreno.

## O que foi feito

### Motor puro — `utils/blueprintLoteDigitado.ts`

- `direcaoDoAzimute(az, rotacaoNorteDeg)` — o inverso exato de `azimuteDaDirecao`; todo modo com azimute respeita o
  norte do estudo.
- Geradores: `loteRetangular` (papéis já definidos, na convenção do `papeisSugeridos` — direita de quem está na rua),
  `lotePorLadosEAngulos` (percurso horário, ângulo interno no vértice inicial; o do 1º vértice só confere o fechamento
  angular), `lotePorAzimutes` (azimute ou rumo, verdadeiros), `lotePorCoordenadas` (reaproveita `importarPontos`,
  acrescentando a cota 0; locais vão para a origem pelo 1º vértice, UTM cai pela georreferência).
- `fecharLote(lote, decisao)`: tolerância = maior entre 10 mm e perímetro/5000; abaixo dela distribui (Bowditch) e diz;
  acima exige `DISTRIBUIR` ou `DIVISA_DE_AJUSTE`. Recusa contorno que se cruza, sem área, ou com lado nulo.
- `comandosDoLote(model, levelId, lote, {substituir, medidasDaEscritura})`: UMA lista de comandos (um Ctrl+Z desfaz) —
  `DeleteBoundary`/`RemoverVerticeDoTerreno` do lote atual (só com `substituir`), `AddBoundary` com papel,
  `SetBoundaryEscritura` (medida digitada e confrontante) e `SetVerticeDoTerreno`, com os ids lidos de uma simulação
  por `applyBatch` (determinísticos: o editor, partindo do mesmo modelo, cria os mesmos).
- `restituirMemorial` passou a ler "até o vértice X", "confrontando com …" e o vértice inicial; `lerAngulo` exportado.

### Tela — `components/blueprint/PainelLoteDigitado.tsx` (gaveta)

- Abas: Frente × fundo · Lados e ângulos · Azimutes/rumos · Coordenadas · Memorial (colar). Tabelas aceitam colar do
  Excel; o memorial lido pode ir para a tabela de azimutes para corrigir.
- Prévia SVG (a frente em traço grosso; o vão em vermelho quando não fecha; a divisa de ajuste em laranja), área,
  perímetro, erro de fechamento linear e angular, e a escolha de como fechar quando passa da tolerância.
- "As medidas digitadas são as da escritura" (ligado por padrão); "Substituir o lote atual" quando já há lote, com
  `useConfirm`. "Lançar o lote" desligado sempre diz o motivo.
- Entradas: botão **Digitar** no grupo Lote da aba Terreno; "Criar o lote digitando" em Dados do lote quando não há lote;
  o Roteiro aponta para a aba Memorial (a restituição mudou-se para cá).

### Fora do escopo

- `lancarLoteDoArquivo` (contorno do levantamento importado) continua com o seu `runBatch` próprio: já funcionava e o
  contorno do arquivo não tem medida digitada nem papel.
- Sem migration: só comandos existentes do kernel.

## Verificação

- `__tests__/blueprintLoteDigitado.test.ts` (25): leitura de medida/ângulo/rumo, inverso do azimute, retângulo e papéis
  contra `papeisSugeridos`, lados+ângulos (quadrado, trapézio, ângulo trocado), azimutes com norte girado, fechamento
  AUTO/DISTRIBUIR/DIVISA_DE_AJUSTE, laço recusado, coordenadas locais/NE/UTM, comandos (papéis, escritura, vértices,
  substituir, divisa de ajuste) e a volta do memorial do Roteiro num estudo georreferenciado com norte girado 30°.
- `__tests__/components/PainelLoteDigitado.test.tsx` (7) e `BlueprintEditor.test.tsx › criar o lote digitando` (2).
- Ritual da publicação + prova no app real com estudo descartável "ZZ TESTE" (banco conferido antes/depois).

---

## Parte 2 — editar o lote que já existe

Mesma sessão, 03/10/2026, logo depois da publicação. Pedido, literal:

> se o lote jaestiver sido criado, e ao clicar em digitar,carregar os valores do lote e permita editar(alteraR)

### O que foi feito

- `loteExistente(model)` lê o lote fechado no sentido do Roteiro (horário, a partir do vértice de partida): anel,
  azimute verdadeiro e distância de cada lado, ângulo interno de cada vértice, e a HERANÇA de cada lado (papel,
  confrontante, medida da escritura, dados do SIGEF) e de cada vértice (nome, tipo, sigmas, altitude). Retângulo com
  os quatro papéis também vira frente, profundidade, "voltada para" e a ponta esquerda da frente.
- Os geradores ganharam `origem`: o lote editado fica onde está, não vai para a origem do desenho.
- `aplicarHeranca` leva para o contorno novo o que cada lado/vértice tinha — o que está digitado na tela vence.
  Nas abas com linha por lado a herança viaja com a linha; no retângulo, por papel; nas coordenadas e no memorial,
  pelo nome do vértice (sem nomes, pela posição quando a contagem é a mesma; o lado só herda com as duas pontas
  casadas).
- `comandosDoLote` usa a escritura herdada quando "as medidas digitadas são as da escritura" está desmarcado (o padrão
  na edição) e regrava SIGEF e dados dos vértices.
- Tela: com lote, "Digitar" abre em modo edição — faixa "Editando o lote atual", todas as abas preenchidas (retângulo
  abre em Frente × fundo; o resto em Azimutes/rumos), coordenadas do desenho mantidas, botão "Aplicar as alterações",
  sem a confirmação de "substituir" (nada se perde; Ctrl+Z desfaz).

### Verificação

- Unitários: ida e volta SEM mudar nada pelas abas de azimutes, lados e ângulos e retângulo devolve o MESMO lote, no
  mesmo lugar, com escritura, papel, SIGEF e vértices; mudar uma distância muda só a geometria; o retângulo cresce
  para a direita a partir da ponta esquerda; casamento por nome/posição nas coordenadas.
- Componente (3) e editor (1): valores carregados, aplicar sem confirmação, reabrir mostra o lote alterado.
