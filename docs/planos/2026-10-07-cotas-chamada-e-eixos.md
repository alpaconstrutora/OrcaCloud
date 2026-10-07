# Cotas com linha de chamada + eixos com letras/números (Gerar eixos + mostrar/ocultar)

> Plano aprovado em 07/10/2026. Frente `cotas-chamada-eixos` (REGRA #8).

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
