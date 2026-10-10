# Cotas com linha de chamada + eixos com letras/números (Gerar eixos + mostrar/ocultar)

> Plano aprovado em 07/10/2026. Frente `cotas-chamada-eixos` (REGRA #8).

## Status (atualizado em 10/10/2026)

**Tudo publicado** — CI verde e domínio conferido em cada entrega; frentes fechadas.

| Entrega | Commit | Data |
|---|---|---|
| Linhas de chamada (tela, PDF, DXF) · cotas do lote no PDF/DXF · nome vertical = letra · Eixos automáticos · Exibir › Eixos · eixos no PDF/DXF | `e6fe6e58` | 07/10 |
| Eixos pelos lados do lote (estudo sem paredes nem blocos) | `20b64b9f` | 08/10 |
| Cotas e eixos pelos detalhes do lote (recuo, faixas de restrição, divisas) | `a5513115` | 08/10 |
| Bolha do eixo por fora das cotas · renumerar ao gerar de novo | `a6fa1789` | 08/10 |
| Bolhas escalonadas (zigue-zague) | `a2175a43` | 08/10 |
| Número do trecho curto de cota escrito por fora (tela e PDF) | `d607c5d6` | 08/10 |
| Aba Estrutural no ribbon (plano próprio: `2026-10-08-aba-estrutural.md`) | `05d1b43d` | 08/10 |

### Pendências — RESOLVIDAS em 10/10/2026

As 8 foram feitas (plano `2026-10-10-pendencias-cotas-eixos.md`): (1) recuo da zona nas cotas do PDF/DXF e o envelope
desenhado; (2) Exibir › "Cotas das sub-regiões"; (3) eixo traço-ponto no DXF (LTYPE `EIXO`, `CONTINUOUS` declarado);
(4) número curto por fora também no DXF (regra única `ondeFicaORotulo`); (5) largura real do texto no PDF; (6) nada
selecionado depois de criar eixos e lançamentos automáticos; (7) aviso dos eixos na convenção antiga; (8) bolha sempre
fora do desenho inteiro.

### Observação nova (10/10/2026, não pedida)

- PDF: com a edificação perto da divisa (2 m), as cadeias das paredes e as do lote se sobrepõem na lateral — os números
  se misturam. Já acontecia antes; tratar seria afastar a cadeia do lote além da faixa das cadeias das paredes.

## Contexto

Pedido, literal, com dois prints (o lote 10 × 30 com as cotas por fora, e uma planta baixa de referência com cadeias e
eixos A–D / 1–7): *"temos dos prints, um com um terreno com medidas e outro com um exemplo referencial de como gostaria
que as medidas fossem. é um exemplo de uma planta e nao de um terreno mas serve para ao proposito. 1. veja que o inicio e
fim das cotas encostam aonde inicia e termina a medida. 2. veja que também tem eixos identificados com numeros e letras.
opcao de exibir ou nao eixos"*.

Respostas do usuário: **botão "Gerar eixos"** (cria eixos DE VERDADE, editáveis; valem para Pilares automáticos);
**letras nos eixos VERTICAIS (A, B… da esquerda p/ direita) e números nos HORIZONTAIS (1, 2… de cima p/ baixo)**, como na
referência; **linhas de chamada na tela E na exportação** (PDF/SVG e DXF).

O que existe (origin/main @ a5209a3e):
- Canvas: `desenharCadeia` (`BlueprintCanvas.tsx` ~4476) desenha a linha de cota e o tique a 45°, **sem linha de
  chamada**; usado pelas cadeias das paredes (~4562, `mostrarCotas`) e pelas do lote/massa (~5557, `cadeiasDoLote`).
- PDF/SVG (`utils/blueprintExport.ts` `desenharCotas` ~1484): já tem chamada, mas colada no eixo da parede e sem
  ultrapassar a linha; não exporta as cadeias do lote. DXF (`utils/blueprintDxf.ts` `entidadesDeCota` ~1174): só a linha
  e o texto — sem tique e sem chamada; não exporta lote.
- Eixos: `Eixo {id, uid, nome, a, b}` (sem nível), `AddEixo/SetEixoProps/MoveEixoVertex/DeleteEixo`; nome automático no
  `AddEixo` (hoje **horizontal = letra**); ferramenta Eixo (Arquitetura › Estrutural); canvas desenha traço-ponto + bolinha
  nas duas pontas (~7618). Sem geração automática, sem mostrar/ocultar, sem eixos na exportação. Pilares automáticos usam
  os cruzamentos (`cruzamentosDeEixos`).

## Abordagem

### 1. Linhas de chamada (as três saídas com a MESMA regra)
- `utils/blueprintCotas.ts`: `CadeiasDoLado` ganha `faceExternaMm` — a meia espessura máxima das paredes que formam o
  lado (o contorno corre pelo EIXO; a chamada tem de nascer na FACE). `CadeiasDoLote` usa 0 (a divisa é a linha).
- Regra única (exportada como constantes em `blueprintCotas.ts`): para cada ponto de quebra de cada cadeia, linha de
  chamada de `faceExterna + folga do objeto` até `afastamento da linha + ultrapassagem`; o tique a 45° no cruzamento.
  Na tela em px (folga 4 px, ultrapassagem 4 px), no PDF em mm de papel (1 mm / 1,5 mm), no DXF em mm reais
  proporcionais à escala que o DXF já usa.
- Canvas: dentro de `desenharCadeia` (vale para paredes e lote). PDF: ajustar o trecho existente (início na face + folga,
  fim além da linha) e estender às cadeias de esquadria/interna. DXF: acrescentar tique e chamada na `PLANTA-COTAS`.
- Exportação passa a incluir as **cadeias do lote/massa** (`cadeiasDoLote`, mesma conta do canvas — extrair o cálculo das
  quebras para uma função pura em `blueprintCotas.ts`, usada pelos três).

### 2. Eixos — nome pela referência
- `AddEixo` (kernel): eixo **vertical (|dy| > |dx|) → próxima letra**; **horizontal → próximo número**. Só afeta eixos
  NOVOS (nomes gravados não mudam). Atualizar `__tests__/blueprintEixos.test.ts`.

### 3. "Gerar eixos" (tarefa com prévia, como Pilares automáticos)
- Puro `utils/blueprintEixosAutomaticos.ts`: `propostaDeEixos(model, levelId, hip)` → linhas a partir da EDIFICAÇÃO do
  pavimento: eixos das paredes ortogonais (ignorando as menores que `comprimentoMinimoDaParedeMm`) e lados dos blocos de
  massa; junta linhas a menos de `juntarAMenosDeMm`; cada eixo atravessa o desenho (edificação ∪ lote) e passa
  `alemDoDesenhoMm` de cada lado (para a bolinha cair por fora das cotas). Nomes: verticais A, B… da esquerda p/ direita,
  horizontais 1, 2… de cima p/ baixo (Y do modelo cresce para cima), continuando depois dos nomes já usados; pula linha
  que já tem eixo (mesma reta, ±tolerância). Paredes não ortogonais ficam de fora e isso é dito.
- Hipóteses na tela (memória: folga é hipótese): **além do desenho** (padrão 3 m), **parede mínima** (padrão 1,50 m),
  **juntar linhas a menos de** (padrão 10 cm).
- Gaveta "Eixos automáticos" (Arquitetura › Estrutural, ao lado da ferramenta Eixo): prévia tracejada no canvas, a lista
  (A–D, 1–7), aviso de que os eixos valem para Pilares automáticos; **"Criar N eixos"** = um lote de `AddEixo` com nome
  (um Ctrl+Z). Botão desligado SEMPRE com motivo (sem paredes nem blocos → "Desenhe paredes ou blocos: os eixos saem da
  edificação").

### 4. Mostrar/ocultar eixos
- `usePersistedState('blueprint:mostrarEixos', true)`; item **"Eixos"** em Vista › Exibir (planta e vistas); entra em
  `CamadasDaPlanta` (`eixos`, padrão true) e em `configuracaoDeVista`/`aplicarConfiguracaoDeVista`; prop `mostrarEixos`
  no canvas (oculto = não desenha nem dá encaixe). Não vira camada de disciplina (teste `blueprintCamadasPorDisciplina`).
- Exportação: eixos com bolinha e nome no PDF/SVG (`Desenhista` ganha `circulo?`; sem ele, polígono de 24 lados) e no DXF
  (`circulo()` existente, camada nova `PLANTA-MALHA-EIXOS`), seguindo o mesmo "mostrar eixos".

### Arquivos
`utils/blueprintCotas.ts`, `components/blueprint/BlueprintCanvas.tsx`, `utils/blueprintExport.ts`, `utils/blueprintDxf.ts`,
`utils/blueprintKernel/commands.ts`, novo `utils/blueprintEixosAutomaticos.ts`, nova gaveta
`components/blueprint/PainelEixosAutomaticos.tsx`, `components/blueprint/BlueprintEditor.tsx`,
`utils/blueprintTemplatesDeVista.ts`, e quem implementa `Desenhista` (`services/blueprintExportService.ts`). Sem migration.

## Verificação
- `blueprintCotasPorLado`: `faceExternaMm` = meia espessura; as quebras da chamada = as da cadeia; o teste
  "tela × PDF × DXF" continua com os mesmos rótulos e passa a contar chamadas e tiques no DXF; cadeias do lote no PDF e DXF.
- `blueprintEixos`: nome vertical = letra, horizontal = número. `blueprintEixosAutomaticos`: planta da referência
  simplificada (casa 10 × 15 com paredes) → A–D e 1–N nas posições certas; bloco de massa → 2 + 2 eixos; parede curta
  ignorada; linhas juntadas; eixo existente não duplica; nomes continuam a sequência.
- Canvas (contexto falso): linha de chamada em cada quebra (do objeto + folga até além da linha); eixos ocultos não
  desenham bolinha (`fillText` da letra some).
- Editor: gaveta Eixos automáticos (motivo do botão sem edificação; criar = um Ctrl+Z); item "Eixos" em Exibir.
- Ritual: tsc, check-ui-standard, org guard, XSS, suíte cheia com a conta (`--maxWorkers=4`), build.
- App real (estudo descartável com lote, paredes simples e um bloco): prints com cotas encostando nas pontas e eixos
  A/B/1/2; ocultar eixos; exportar PDF da prancha e conferir. Push → `conferir-producao.sh` → check-run `ci`.

## Execução (07/10/2026)

- **Linhas de chamada** — regra única em `utils/blueprintCotas.ts` (`LINHA_DE_CHAMADA`, `chamadasDoLado`): uma chamada
  por quebra do lado, da FACE do objeto + folga (tela 4 px · papel 1 mm) até a linha de cota mais externa que quebra
  ali + ultrapassagem (4 px · 1,5 mm). `CadeiasDoLado.faceExternaMm` = meia espessura da parede mais grossa do lado; lote = 0.
  Canvas (`desenharChamadas`, paredes e lote), PDF (`desenharCotas` reescrito por lado: antes nascia no EIXO e só nas
  quebras de total/parcial) e DXF (tique a 45° + chamada, que não existiam). Folgas da chamada são convenção GRÁFICA
  (não mudam número do projeto) — por isso constantes, não hipóteses.
- **Cotas do lote na exportação** — `cadeiasDoContorno` + `anelDoLoteFechado` (a mesma conta da tela) no PDF e no DXF;
  sem os blocos de massa, que a prancha não desenha (o lado reparte só pelo contorno das paredes).
- **Nome do eixo** — `AddEixo`: vertical → letra, horizontal → número (`eixoEhVertical`, `proximoNomeDeEixo` no kernel).
  Só eixos novos; nome gravado não muda.
- **Eixos automáticos** — `utils/blueprintEixosAutomaticos.ts` (`propostaDeEixos`) + gaveta `PainelEixosAutomaticos`
  (Arquitetura › Estrutural › Eixos automáticos). Hipóteses: além do desenho 3 m, parede mínima 1,50 m, juntar a
  menos de 10 cm. Prévia na tabela e tracejada no desenho; "Criar N eixo(s)" = um lote (um Ctrl+Z); desligado com o
  motivo no `title`.
- **Mostrar/ocultar** — `blueprint:mostrarEixos` (padrão ligado), item "Eixos" em Vista › Exibir (planta e vistas),
  `CamadasDaPlanta.eixos`; oculto = sem desenho, sem seleção, sem encaixe.
- **Eixos na exportação** — PDF/PNG: traço-ponto + bolha (`Desenhista.circulo?`, senão polígono de 24 lados) e nome;
  a caixa do modelo passa a incluir os eixos. DXF: camada nova `PLANTA-MALHA-EIXOS` (LINE + CIRCLE + TEXT). Seguem o
  "Eixos" de Exibir (`OpcoesExportacao.eixos`); a planta humanizada nunca leva.
- **Enquadrar** passa a incluir os eixos visíveis (achado na prova no app: as bolhas A–D ficavam fora da tela).

## Verificação

- Testes: `blueprintCotasPorLado` (+5: face externa, `chamadasDoLado`, DXF com tique e chamada, PDF com chamada da
  face, cotas do lote no PDF/DXF), `blueprintEixosAutomaticos` (13, novo), `blueprintEixos` (nome vertical = letra),
  `BlueprintCanvasMedidasLoteMassa` (+1: chamadas do lote 32/54 px), `BlueprintCanvasEixos` (3, novo),
  `BlueprintEditor` (+4: gaveta sem/ com edificação, um Ctrl+Z, item Eixos). Suíte cheia: 7749 = 7715 + 34 pulados, 0 falha.
- App real (estudo descartável, apagado depois): lote e paredes com chamadas; gaveta A–D / 1–2; prévia tracejada;
  criar grava os 6 no rascunho; Exibir › Eixos oculta e guarda a chave; PDF A3 1:100 com bolhas e chamadas.

## Complemento (08/10/2026) — eixos pelos lados do lote

Pedido: com o print de um estudo que só tem o lote 10 × 30, *"como exibir os eixos?"*; à oferta "gerar eixos também a
partir dos lados do lote quando ainda não há paredes nem bloco", *"quero"*.

- `HipotesesDeEixos.usarLadosDoLote` (padrão LIGADO), caixa "Usar os lados do lote (sem paredes nem blocos)" na gaveta.
- Só vale SEM edificação no pavimento: com parede ou bloco, a malha continua saindo da estrutura (o lote não entra).
- Lote fechado (`anelDoLoteFechado`); lado oblíquo fica de fora; lado abaixo da "parede mínima" também. Origem "Lado do lote".
- Testes: `blueprintEixosAutomaticos` (+4, lote 10 × 30 → A, B / 1, 2), `BlueprintEditor` (+1, gaveta só com o lote).

## Complemento (08/10/2026) — os DETALHES do lote nas cotas e nos eixos

Pedido, com o print do lote 10 × 30 com eixos e o envelope recuado: *"as medidas e eixos contemplam inicio e fim do
terreno e isso esta correto, porem tem que considerar outras pontos. como por exemplo na imagem existe um recuo que deve
ser incluindo tanto nas medidas e eixos"*; e *"todos os detalhes devem ser considerados, seja recuo ou outra informacao
semelhante"*.

- `detalhesDoLote(limites, envelope)` (`utils/blueprintCotas.ts`): vértices do ENVELOPE recuado (cada peça — recuos e
  recortes das restrições), do retângulo de cada FAIXA DE RESTRIÇÃO (APP, curso d'água, servidão, não edificável) e as
  pontas das DIVISAS internas. Entra em `cadeiasDoContorno` como quebra: o recuo de frente vira trecho da lateral.
- Tela: o envelope só reparte quando está À VISTA (Exibir › Envelope). PDF/DXF: restrições e divisas (estão no modelo);
  o envelope não — os recuos são da zona e a prancha não desenha o envelope.
- Eixos (sem edificação): além dos lados, as linhas do envelope ("Recuo"), das faixas ("Faixa de restrição") e das
  divisas ("Divisa"). Linha juntada fica com a origem mais forte (lote > recuo > restrição > divisa). Caixa da gaveta
  renomeada "Usar o lote — lados, recuos e restrições".
- Corrigido junto: `envelopePecas` faltava na lista de dependências do desenho do canvas.
- Fica de fora (a pedir se quiser): SUB-REGIÕES (grama, piso, deck…) — acabamento, não limite.
- Prova no app: lote 10 × 30 com recuo frente 5 m / fundos 3 m → laterais 3,00 | 22,00 | 5,00; eixos A, B / 1–4
  (2 e 3 nas linhas do recuo). Suíte: 7797 = 7763 + 34 pulados, 0 falha.

## Complemento (08/10/2026) — eixos por fora das cotas e renumeração

Pedido, com o print do lote 10 × 30 com os eixos A, B, 1, 2 e o recuo: *"1. cotas e eixo se sobrepondo. eixos devem
ficar mais externos. 2. recuos ficou sem eixos. qual o criteio usado para criar eixos?"*

- Causa do 1: o eixo passa 3 m (mm do MODELO) além do desenho, e a cota fica a distância fixa em PIXEL (ou mm de
  papel) — em zoom afastado os 3 m viram poucos pixels e a bolha caía nas cadeias. Agora a bolha é empurrada NA HORA DE
  DESENHAR para além da faixa que as cotas ocuparam (`bolhasDoEixo`, `faixaVazia/crescerFaixa`): canvas (px), PDF (mm
  de papel; as cotas passaram a ser desenhadas antes dos eixos) e DXF (mm reais). Vale em qualquer zoom.
- Causa do 2: eixo só nasce no clique em "Eixos automáticos", e os do print foram criados antes da versão que conta os
  recuos. Gerar de novo dava "3" e "4" ENTRE o 1 e o 2. Nova hipótese `renumerar` (padrão ligado): a sequência é
  remontada em ordem e os existentes de nome automático (A…, B1…, 1, 2…) ganham o nome da posição (`SetEixoProps`, no
  mesmo lote, um Ctrl+Z). Nome dado à mão e linha de referência sem nome ficam; o nome à mão não é reusado. Eixo
  vertical com número (convenção anterior a 07/10) vira letra.
- Gaveta: a tabela mostra a sequência inteira ("Já existe — era 2"); botão "Criar N eixo(s) e renumerar M".

## Complemento (08/10/2026) — bolhas escalonadas

Pedido: *"1. escalonar bolhas"* (depois de avisado que, em zoom afastado, as bolhas de eixos a ~1,5 m um do outro se
encostavam).

- `bolhasDosEixos` (`utils/blueprintEixosAutomaticos.ts`): primeiro cada bolha vai para fora das cotas
  (`bolhasDoEixo`); depois, em cada lado (pontas que saem para cima, baixo, esquerda, direita — só eixos ortogonais), em
  ordem ao longo do lado, a bolha que encostaria numa já posta vai para a fileira seguinte (`2 × raio + respiro` mais
  para fora), e a linha do eixo vai até ela. Zigue-zague: 1 dentro, 2 fora, 3 dentro…
- Tela (eixos do modelo e da prévia juntos), PDF e DXF usam a mesma regra.


## Complemento (08/10/2026) — número do trecho curto por fora

Pedido: *"quero sim"* (à oferta: com zoom afastado, o recuo de 1,50 m só mostrava os tiques; escrever o número ao lado
do trecho quando não cabe, como na prancha).

- Tela (`desenharCadeia`) e PDF (`desenharCotas`): o número que não cabe vai para fora — antes do início no 1º trecho
  da cadeia, depois do fim no último, do outro lado da linha num trecho do meio. Na tela, se ainda assim cair em cima
  de outro rótulo, fica de fora. O rótulo de fora entra na faixa das cotas (as bolhas dos eixos vão além dele).
- DXF: o texto já saía sempre (o CAD não esconde texto por tamanho).
