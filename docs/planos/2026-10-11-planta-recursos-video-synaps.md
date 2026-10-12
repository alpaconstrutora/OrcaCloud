# Planta Inteligente — recursos vistos no vídeo do Synaps.app

> Frente (REGRA #8): `C:\D\frentes\planta-recursos-synaps` · branch `feat/planta-recursos-synaps`.
> Plano aprovado no plan mode em 11/10/2026 ("continue").

## Pedido original (sessão 44176441-24f4-4417-a402-1439bafb908c · 2026-10-11)

> voce consegue assistir um video do youtube?

> sao funcionalidades para aplicar no incorporacap > planta inteligente: https://www.youtube.com/watch?v=HCw1RL0cnkA&t=80s

> sim

> continue

(o "continue" aprovou o plano ao sair do plan mode. O "sim" respondeu: "Quer que eu escreva o plano em `docs/planos/` (REGRA #6) para o bloco 1, ou para
tudo em fases?" — tratado como **tudo, em fases**, bloco 1 primeiro.)

## Contexto

- Vídeo: "Is AutoCAD dead? Testing the new alternative" (Melos Azemi, 22/09/2026, 16 min) — demo do
  Synaps.app. Lido pela legenda pt-BR (yt-dlp); quadros não foram vistos.
- ⚠️ O checkout de integração estava **452 commits atrás** de `origin/main`. Todo o levantamento
  abaixo foi refeito sobre `origin/main @ 3fb4fe5a` (git grep/show). Kernel: `0.94.0`
  (`utils/blueprintKernel/units.ts:626`).
- O plano da topografia (25/09, item 1 do inventário) tinha **proposto** não fazer "igualar
  propriedades" e adiado a cota linear manual. Aquilo era corte de escopo meu, não decisão do usuário;
  este pedido o supera.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 11/10 | Render por IA (exige fornecedor de imagem, custo por imagem) | **Incluir já.** Fase F14 começa por proposta de 2–3 fornecedores com preço; usuário escolhe antes de codar |
| 11/10 | Rastrear planta de imagem/foto/PDF escaneado | **Fase final, com Claude visão**, sempre com confirmação humana antes de gravar |
| 11/10 | Móveis no 3D | **Modelos glTF** (campo opcional por tipo, fallback para a caixa) |
| 12/10 | F14.0 — qual fornecedor de imagem (comparação abaixo, na F14) | **Adiado pelo usuário:** "deixe tudo pronto para o F14.0, voltemos a concluir os fornecedores posteriormente. E vamos para a próxima fase" → segue a F15; F14.1+ continua bloqueada até a escolha |

## Levantamento (origin/main) — o que muda em relação à primeira resposta

| Recurso do vídeo | Estado real | Onde encaixa |
|---|---|---|
| Parede, encaixe, comprimento digitado, eixos, prancha A4→PDF/DXF/PNG, colaboração | ✅ existe | — |
| Paredes multicamadas | ✅ (cor chapada por função, sem hachura) | F6 |
| Conta-gotas / igualar propriedades | ❌ — `PainelSelecaoMultipla.tsx` só conta/move/exclui; **não há `SetWallHeight`** | F4 |
| Separador de ambiente | 🟡 kernel tem `Boundary kind:'DIVISA'` que já entra no arranjo (`arrangement.ts:437`); UI escondida em Terreno › Divisa | F3 |
| Ambiente com um clique (hover realça) | ❌ — `PlaceSpaceLabel` só usado pela importação DXF | F2 |
| Cota manual / contínua | ❌ — só cadeias automáticas (`utils/blueprintCotas.ts`) e `COTA_ANGULAR` | F5 |
| Atalhos de ferramenta (W, P…) | ❌ — só F8, Ctrl+Z/D/A/C/V, setas, Esc, Del | F1 |
| Hachura de piso escolhida, com escala/rotação | 🟡 só na humanizada, padrão adivinhado (`utils/blueprintHumanizada.ts:40,145,256`) | F6 |
| Polígono/retângulo com preenchimento + ordem | 🟡 anotação `HACHURA` (alfa fixo 0,25, sem escala/rotação/retângulo/z-order) | F7 |
| Janela com folhas, bandeira, mecanismo | ❌ — `Opening.kind` = door/window/passage/sliding; 3D é só furo | F8 |
| Biblioteca de móveis arrastável | 🟡 catálogo fechado ~28 tipos, menu + clique (`MenuComponentes.tsx:686`); 3D = `BoxGeometry` | F9, F10 |
| Gerar planta no contorno por texto | 🟡 **motor existe** (`utils/blueprintGerador.ts`, `blueprintPrograma.ts`, Edge `planta-ia` + `interpretarPedidoLocal`); falta contorno desenhado, polígono não-retangular e lote de comandos | F11 |
| Câmera 2D com altura/focal + prévia 3D | 🟡 só passeio 1ª pessoa (`Blueprint3DViewer.tsx:1856`), `fov:45` fixo, sem vistas salvas | F12, F13 |
| Render por IA + segmentar/trocar elemento | ❌ — nenhum fornecedor de imagem; roadmap unificado o excluía (`2026-09-18…:21`) | F14 |
| Rastrear planta de imagem | 🟡 PDF vetorial ✅ ("Gerar paredes do PDF", `utils/blueprintVetor.ts`); raster ❌ (adiado 09/08) | F15 |

## Regras transversais (valem para toda fase)

- Mudança de modelo = **bump do kernel** + goldens + validação em `model.ts` + **regerar o bundle da
  `planta-api`**.
- Gerador/ação em massa usa comandos em lote (`AddWalls`/`AddOpenings`/`PlaceSpaceLabels`) e um único
  `editor.runBatch` (= um desfazer).
- Tela nova/alterada: ler `docs/ui_ux_guia_unificado.md` + `UI_PATTERNS.md`; `check-ui-standard.sh`
  nos `.tsx` tocados. Botão desabilitado sempre diz o motivo.
- Migration/Edge Function: REGRA #7 (as três perguntas); nunca `db push`.
- Cada fase: commit + push em `main` + `scripts/publicar-producao.sh` + **ler o check-run `ci`**;
  só marcar ✅ com prova no app.

## Plano

### Bloco 1 — ganhos rápidos

**F0 — Frente e plano no repositório**
- Muda: `nova-frente.sh planta-recursos-synaps`; copiar este arquivo para `docs/planos/2026-10-11-planta-recursos-video-synaps.md`.
- Pronto quando: o arquivo está commitado em `main`.

**F1 — Atalhos de ferramenta** · `utils/blueprintAtalhos.ts` (novo), `BlueprintEditor.tsx` (efeito de teclado em ~3117), `Ribbon.tsx`
- Muda: mapa `Record<tecla, BlueprintTool>` (W parede, J janela, D porta, P polígono/hachura, R ambiente, S separador, C cota, M medir, Esc sai). Ignora INPUT/TEXTAREA/SELECT e teclas com Ctrl. A letra aparece no tooltip de cada botão do ribbon.
- Pronto quando: teste puro do mapa (sem colisão com Ctrl+*/Espaço/setas); no app, W arma a parede e digitar W num input de nome não arma.
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - Letras finais: **V** selecionar · **H** mover vista · **W** parede · **R** parede em retângulo ·
    **P** porta · **J** janela · **M** medir linha. P ficou com **porta** (português, e o polígono de
    N lados é raro); as letras das fases seguintes nascem com elas: **A** ambiente (F2), **S**
    separador (F3), **C** cota (F5).
  - O listener fica num `useEffect` próprio depois de `escolherComponente` (não no de Ctrl+Z), para a
    tecla passar pelo MESMO caminho do clique no menu (porta/janela = mesma ferramenta, subtipo
    diferente).
  - **Só em vista de planta e nunca com `pointerLockElement`**: o passeio 3D anda com W/A/S/D
    escutando a janela inteira (`Blueprint3DViewer.tsx`, `utils/blueprint3dWalk.ts`) — sem essa
    trava, cada passo no 3D armaria a parede.
  - A letra aparece como `<kbd>` à direita do item no menu Componentes e no tooltip dos botões
    `Ferramenta` (derivada de `letraDoAtalho`, a mesma regra do teclado).
  - Prova: `__tests__/blueprintAtalhos.test.ts` 6/6; `tsc exit=0`; `check-ui-standard` limpo nos 2
    `.tsx`.
  - ⚠️ **Defeito pego no app real (11/10)**: a 1ª versão travava o atalho em `vistaDePlanta !== null`,
    mas `vistaDePlanta` só existe nas vistas ESPECIAIS (situação, forro…) e é `null` na planta baixa
    comum — os atalhos não funcionavam onde se desenha. A trava passou a ser `!emVista`, a MESMA
    condição que mostra a barra de opções. O teste de unidade não pegava (testa a regra da tecla, não
    a vista). E o 1º roteiro "aprovou" o W porque o editor já abriu em "Parede" (ferramenta guardada
    de outra sessão): agora cada tecla tem de MUDAR o rótulo.
  - **Prova no app (11/10, dev server da frente, conta agente-leitura, "Planta 14/09/2026")**: V, W,
    R, P, J, M, H, A — cada uma muda a barra para a sua ferramenta; Shift+W não arma; com foco no
    campo de nome, W vira texto e não arma a parede. Sem escrita no estudo: `draft_saved_at` e
    `draft_hash` iguais antes e depois (as 2 POST vistas são RPCs `STABLE` da Central de Controle).

**F2 — Ambiente com um clique** · `BlueprintCanvas.tsx`, `BlueprintEditor.tsx`, `useBlueprintEditor.ts`
- Muda: ferramenta `ambiente`. No movimento do mouse, o realce da face sob o cursor vem de `ambientesDoNivel` (~2046) + `pointInPolygon(ring)` sem os `holes`, como faz `aplicarEtiquetas`. O clique emite `NameSpace` (ou `PlaceSpaceLabel` com `at` = ponto clicado) e abre a edição do nome no lugar, com o tipo de ambiente sugerido por `usoDoNome`.
- Pronto quando: teste do acerto (ponto em ambiente com furo não acerta o furo); no app, clicar em 3 ambientes os nomeia e um Ctrl+Z desfaz o último.
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - Ferramenta `ambiente` (botão "Ambiente" no grupo Construir da Arquitetura, atalho **A**).
    Função pura `utils/blueprintAmbienteNoPonto.ts` — o MESMO teste serve ao realce (movimento) e
    ao clique, para o que se clica ser o que estava aceso.
  - O clique NÃO grava sozinho: abre o campo "Nome do ambiente" na barra de opções, já com o nome
    atual e a área; **Enter** grava com `NameSpace` (substitui a etiqueta, não empilha), **Esc**
    cancela, e a ferramenta segue armada para o próximo. Trocar de ferramenta esquece o clicado.
  - **Sem sugestão de tipo pelo nome**: o renomear da lista lateral também não a faz; manter os dois
    caminhos iguais. Se a sugestão vier, entra nos dois de uma vez.
  - Prova: `__tests__/blueprintAmbienteNoPonto.test.ts` (3, inclusive o pátio dentro da casa e o
    modelo real do kernel); harness `docs/spikes/ambiente-um-clique/` em Chrome com canvas REAL —
    8/8, e **reprova** (4 ❌, exit 1) com o X do clique espelhado, cada rodada com servidor novo.
  - ⚠️ **Defeito pego no app real (11/10)**: o campo nascia com `autoFocus`, mas dentro do
    `pointerdown` do canvas — o `mousedown` seguinte devolvia o foco ao canvas, e era preciso clicar
    de novo no campo para digitar. Agora o foco (e a seleção do texto) vem num `setTimeout(0)`
    depois do clique; digitar já substitui o nome.
  - **Prova no app (11/10, mesma sessão da F1)**: com a ferramenta armada pela tecla A, clicar num
    ambiente abre "Nome do ambiente" com o nome atual ("Ambiente 2"), a área (25,7 m²), o foco e o
    texto selecionado; o ambiente aparece realçado; Esc fecha sem gravar. Print:
    `C:/tmp/f1f2-app/1-ambiente-realcado-e-nome.png`.
  - ~~Não provado no app~~ → **Prova COM ESCRITA (11/10, autorizada pelo usuário: "pode usar a planta
    26/09/2026")**: com a ferramenta Ambiente, digitar "Sala Teste" + **Enter** gravou o nome (o campo
    reaberto mostra "Sala Teste"). ✅
  - **Ctrl+Z: NÃO provado — e o motivo é o editor estar certo.** No estudo havia OUTRA PESSOA no ramo
    (o usuário com a planta aberta), e o desfazer fica desligado nesse caso (`desfazerBloqueado =
    colab.participantes.length > 0`; o botão diz "Desfazer — desligado enquanto há outra pessoa neste
    ramo", lido no app). O Ctrl+Z não fez nada, como devia. Para provar o desfazer do nome falta um
    estudo sem mais ninguém aberto.
  - ✅ **Fechado (11/10, estudo novo que o usuário criou para isso — "Planta 11/10/2026" de 18:18,
    ramo `10acbfa3…`, sem mais ninguém: botão "Desfazer (Ctrl+Z)")**: Enter gravou "Sala Teste" e o
    **Ctrl+Z desfez** (o campo reaberto volta vazio).

**F3 — Separador de ambiente na aba Arquitetura** · `BlueprintEditor.tsx` (ribbon), `BlueprintCanvas.tsx`, `utils/blueprintExport.ts`, `utils/blueprintDxf.ts`
- Muda: botão "Separador de ambiente" na Arquitetura, que reaproveita `tool:'divisa'` com `kind:'DIVISA'` (sem bump). Traço próprio (tracejado fino) distinto de divisa de terreno; aparece no PDF e numa camada DXF própria.
- Pronto quando: teste: um retângulo + separador gera 2 spaces com áreas que somam o total; no app, a sala vira "Entrada" + "Estar" e o separador sai no PDF.
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - Ferramenta PRÓPRIA `separador` (botão "Separador" no grupo Construir, atalho **S**), e não um
    botão para a `divisa`: reaproveitada, a barra diria "Divisa" e ofereceria "Faixa restrita do
    lote" dentro da Arquitetura. No canvas, `ehDivisa = tool === 'divisa' || tool === 'separador'`
    nos 6 pontos do gesto; o separador grava SEMPRE `kind: 'DIVISA'`. A barra diz o que a linha é.
  - ⚠️ **Achado no caminho — rodapé no meio da sala.** O separador é um lado dos dois ambientes, e o
    rodapé derivado (perímetro − portas) e o gerador de trechos (`sugerirRodapes`) punham rodapé
    ao longo dele, onde não há parede. Já valia para a DIVISA da aba Terreno; com o separador na
    Arquitetura viraria comum. Corrigido no kernel: `ladoSemParede` / `comprimentoSemParedeMm`
    (`quantities.ts`) — lado sobre DIVISA e fora de parede do MESMO pavimento. **quant-1.26.0 →
    1.27.0** (17 testes que fixam a versão atualizados, como em toda subida); planta sem separador
    não muda. Separador desenhado sobre parede não desconta.
  - **PDF**: a DIVISA sai TRACEJADA (`segmentoTracejado`, extraído do `tracejado` de anel — como
    anel de 2 pontos sairia ida e volta, quase contínuo). **DXF**: camada própria
    `PLANTA-SEPARADORES` com LTYPE novo `TRACEJADO` (tabela LTYPE 2 → 3; teste do DXF atualizado).
  - 3D: não muda (o 3D só lê limites `TERRENO`, via `divisasDoLote`).
  - `planta-api`: bundle do kernel regerado (`scripts/build-planta-api-kernel.mjs`) — o teste de
    frescor acusou `quant-1.26.0`.
  - Prova: `__tests__/blueprintSeparadorAmbiente.test.ts` (6: 2 ambientes somando a área; rodapé
    24 m com parede no meio × 18 m com separador × 24 m com separador sobre parede; gerador sem trecho
    no separador; DXF na camada tracejada). Harness `docs/spikes/separador-ambiente/` em Chrome com
    canvas REAL e `kindDaDivisa = 'RESTRICAO'`: 6/6, e **reprova** (exit 1) com o separador herdando a
    opção da Divisa. **No app** (conta agente-leitura, sem clique no canvas): S e o botão armam a
    ferramenta, barra e tooltip certos, estudo intacto (`draft_hash` igual).
  - Harness: "Divisas do lote" abre sozinho ~1 s após carregar quando o lote está fechado e sem lados
    classificados, e cobre o ribbon até Esc — o roteiro espera o diálogo com `pointer-events:auto`
    (os três diálogos do editor ficam SEMPRE no DOM).
  - **Prova COM ESCRITA no app (11/10, "Planta 26/09/2026", autorizada)**: tecla S, separador vertical
    em x = 6 m cruzando as duas paredes do ambiente de 8,45 × 4,25 m → dois ambientes clicáveis (a
    etiqueta antiga ficou do lado em que estava; o outro nasceu sem nome); nomeados "Entrada" e
    "Estar". **No banco**, depois do autosave: 4 paredes, **1 limite `DIVISA`, 2 ambientes, etiquetas
    "Entrada | Estar"** (`draft_saved_at` 17:41). ✅
  - **PDF tracejado**: provado pela própria função de exportação (`desenharPlanta` com o
    `DesenhistaDeProva`): o separador de 3 m sai em ≥ 9 traços verticais de ≤ 2 mm; sem separador,
    nenhuma linha de limite. O teste **reprova** com o traço contínuo de antes (mutação conferida).

**F4 — Conta-gotas (Modificar › Igualar propriedades)** · kernel `commands.ts`/`model.ts` (**bump 0.95**), `utils/blueprintIgualar.ts` (novo, puro), `BlueprintEditor.tsx` (aba Modificar ~12861)
- Muda: comando novo `SetWallHeight`. Função pura `comandosParaIgualar(modelo, refId, alvoIds, quais)` cobre:
  - parede → espessura, camadas, altura, cortina/brise (reaproveitar a lógica de `mudarEspessura`/`mudarCamadas` com `deslocamentoParaManterFace`);
  - abertura → `SetOpeningKind`/`Size`/`Esquadria`;
  - ambiente → `SetSpaceLabelProps` (acabamentos, tipo, departamento);
  - anotação → estilo.

  Gesto: com a seleção feita, "Igualar" pede o clique na referência; checkboxes dizem o que copiar. Tudo num `runBatch`.
- Pronto quando: teste: 5 paredes recebem as camadas da referência e a face de referência não se move; tipos diferentes declaram "ignorado: tipo diferente"; no app, um Ctrl+Z desfaz as 5.
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - **SEM bump do kernel** (o rascunho previa 0.95): `SetWallHeight` não muda o FORMATO do modelo —
    `Wall.heightMm` sempre existiu — e todas as subidas do histórico (`units.ts`) foram por formato. O
    caso de versão misturada na colaboração já é tratado: o cliente antigo recusa o comando e mostra
    "Um comando de X foi recusado aqui… recarregue" (`useBlueprintColaboracao.ts`). A `planta-api` só lê
    estudos publicados e não recebe comandos — bundle não regerado.
  - `SetWallHeight` recusa ≤ 0, milímetro fracionado e **baixar a parede abaixo do topo de uma
    abertura dela** (a janela furaria a parede; o modelo já tinha essa invariante para abertura).
  - Escopo copiado: **parede** = composição (camadas ou espessura, face traçada parada) e altura;
    **abertura** = tipo, tamanho (largura/altura/peitoril) e esquadria. **Ficaram de fora**: cortina/brise
    da parede, acabamentos/tipo de AMBIENTE (ambiente não entra na seleção do canvas) e estilo de
    anotação — próximos candidatos, se pedidos.
  - Cada destino é aplicado num RASCUNHO, na ordem: o que o kernel recusa (porta larga demais, parede
    mais baixa que a janela) vai para "ignorados" com a mensagem DELE, e os outros seguem — uma recusa
    não derruba o lote inteiro.
  - Botão "Igualar" em DOIS lugares: aba Modificar e o painel "Seleção múltipla" (que é o que está
    aberto logo depois de selecionar — a aba Modificar não abre sozinha). A escolha do que copiar é
    lembrada (`blueprint:oQueIgualar`, normalizada contra localStorage estragado).
  - ⚠️ **Defeito pego no app real**: com a seleção cheia, clicar na referência (já selecionada) começava
    o ARRASTE da seleção inteira e o clique nunca chegava ao editor — e dava para arrastar 51 peças sem
    querer. Agora a seleção ESVAZIA enquanto se escolhe a referência (os destinos ficam no modo) e volta
    ao aplicar ou desistir (Esc, Cancelar, outra ferramenta).
  - Prova: `__tests__/blueprintIgualar.test.ts` (9: comando de altura e suas recusas; camadas + altura
    em 3 paredes traçadas pela face com o anel fechado; homogênea tira camadas; só o marcado; recusa do
    kernel vira "ignorado" com o motivo e o resto passa; outro tipo e já-igual ditos; abertura que não
    cabe). **No app, com escrita ("Planta 26/09/2026")**: Ctrl+A (51 peças) → Igualar → clique na parede
    de 250 mm → aviso "4 paredes igualadas à referência; 46 ficaram de fora: não é parede, como a
    referência".
  - ⚠️ **No banco ficaram 3 das 4 paredes a 250** (`wal_0002`, a esquerda, a 150, `draft_saved_at`
    18:05:46). A regra rodada FORA do navegador sobre esse rascunho real gera os 4 comandos certos
    (incluindo `wal_0002`) e deixa as 4 a 250 — o lote do editor estava completo. O mais provável é a
    gravação de OUTRA sessão aberta no mesmo ramo (o usuário estava no estudo: era o que desligava o
    Ctrl+Z na F2) — cada cliente grava o próprio rascunho e o último vence. O rascunho não guarda quem
    gravou, então isso NÃO está provado. **Refazer a prova com o estudo sem mais ninguém.**
  - **Ctrl+Z desfaz as 5: não provado** — mesma razão da F2 (desfazer desligado com outra pessoa no ramo).
  - ✅ **Fechado (11/10, "Planta 11/10/2026" de 18:18, sem mais ninguém no ramo)**: referência de 250 mm
    traçada abaixo da sala, Ctrl+A, Igualar, clique nela → "4 paredes igualadas à referência"; **no
    banco, as 4 paredes da sala a 250**; Ctrl+Z → **no banco, as 4 de volta a 150**. Com o estudo
    sozinho, o banco bateu com o aviso — reforça que o "3 de 4" de antes foi a gravação da outra sessão.
  - ⚠️ **Defeito achado no caminho — a vista SALTAVA a cada parede desenhada.** O
    `PainelRevisaoDePontas` (P2.52) fica montado sempre que há ponta solta e centralizava a vista na
    "ponta atual" ao montar e a cada ponta NOVA — e toda parede aberta tem ponta. Medido no app: no
    segundo clique da parede, um marco fixo do desenho pulou de (436, 715) para (757, 550). Agora a vista
    só acompanha depois que alguém COMEÇA a revisar (botão novo "Ir até ela", anterior/próxima,
    consertar, "não é problema"). Depois da correção, o mesmo marco ficou parado em todos os passos.
    Teste do painel atualizado para o requisito novo (+ caso "ponta nova não mexe na vista").

**F5 — Cota linear manual e contínua** · kernel (**bump**): `TipoDeAnotacao += 'COTA_LINEAR'` (`pontos[]`, `afastamentoMm`, `modo: 'simples'|'continua'`, `total?: boolean`); `BlueprintCanvas.tsx`, `blueprintExport.ts`, `blueprintDxf.ts`
- Muda: ferramenta Cota, com cliques encadeados e duplo clique para fechar (gesto da `'anotacao'`, `BlueprintCanvas.tsx:10164`) e OSNAP. O desenho reaproveita `desenharCadeia`/`LINHA_DE_CHAMADA`/`ondeFicaORotulo` nas três saídas.
- Pronto quando: golden do kernel; teste do total = soma dos trechos; no app, cota contínua de 4 pontos sai igual em tela, PDF e DXF (abrir o DXF).
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - **Sem campo novo no modelo** (o rascunho previa `afastamentoMm`, `modo`, `total`): só o valor
    `COTA_LINEAR` no enum. Os pontos são os MEDIDOS em sequência e o ÚLTIMO é por onde passa a linha
    (o clique de colocação do CAD). Dois medidos = simples; mais = contínua, e o total sai sempre numa
    segunda linha. Direção = do 1º ao último medido (cota ALINHADA). Números DERIVADOS
    (`trechosDaCotaLinear`, no kernel ao lado de `anguloDaCota`) — clicar fora de ordem não cria trecho
    negativo; ponto fora da reta conta pela projeção.
  - **Kernel 0.94.0 → 0.95.0** com o ritual: com a string em 0.94.0 e tudo no lugar, goldens 7/7; depois
    do bump, as 6 falhas foram só de hash (cada hash antigo aparecia UMA vez no arquivo). Invariante nova:
    1º e último medidos não coincidem. 31 testes que fixavam a versão atualizados. Bundle da
    `planta-api` regerado.
  - Desenho único em `cotaLinearDesenhada` (`utils/blueprintAnotacoes.ts`) — tela, PDF e DXF: linha de
    cota, chamadas com folga, traço oblíquo 45°, número no formato das cotas automáticas
    (`rotuloDeCota`), texto nunca de cabeça para baixo. **DXF na camada `PLANTA-COTAS`** (onde o CAD
    procura cota). Para o número da cota vertical subir junto da linha, `Desenhista.texto` ganhou
    `opcoes {anguloGraus, centralizar}` e o `texto` do DXF, rotação (50) e centro (72/11/21) — OPCIONAIS:
    a saída antiga não muda (teste confere que nenhum outro TEXT ganhou 50/72). No jsPDF a centralização
    com texto girado é feita à mão (`getTextWidth`).
  - Menu Inserir › Anotações › **Cota linear** (ícone `RulerDimensionLine`) e **atalho C**.
  - ⚠️ **Defeitos achados no caminho:** (1) os `switch` de canvas/PDF/DXF não são exaustivos — o `tsc`
    passou sem o caso novo e a cota sairia em branco nos três; casos acrescentados à mão. (2) A barra de
    opções mostrava o id cru **"anotacao"** para QUALQUER anotação — agora mostra o tipo ("Cota linear",
    "Texto"…). (3) **No app real a cota gravava 5 pontos e total 0,88 m numa sala de 15,85 m**: a trava
    ortogonal prendia cada clique ao ANTERIOR, o clique de colocação caía sobre a reta dos medidos e o 2º
    clique do duplo virava ponto extra. Agora a cota linear trava pelo 1º ponto (como a angular pelo
    vértice) — no clique e na prévia.
  - Prova: `__tests__/blueprintCotaLinear.test.ts` (14: números, desenho, seleção, kernel, PDF girado e
    centrado, DXF em PLANTA-COTAS com 50 = 90 e saída antiga intacta) + atalho C. Harness
    `docs/spikes/cota-linear/` em Chrome com canvas REAL e orto ligado: 4 pontos (3 na mesma reta + a
    colocação travada pelo 1º) — e **reprova** (5 pontos) com a trava pelo anterior. A prévia desenha
    5,20 + 6,80 e o total 12,00.
  - **No app com escrita: parcial.** Na "Planta 11/10/2026" a tecla C armou "Cota linear" e a cota foi
    gravada e desfeita pelo Ctrl+Z (banco conferido) — mas com o defeito (3), que foi corrigido DEPOIS. A
    rodada com a correção parou na trava de segurança: havia outra pessoa no ramo. **Falta refazer a prova
    no app com o estudo sozinho.**
  - ✅ **Fechado (11/10, depois que o usuário fechou a "Planta 11/10/2026")**: tecla C → "Cota linear";
    3 cliques ao longo da parede de baixo + duplo clique abaixo → **no banco, 1 COTA_LINEAR com 4 pontos**
    (1800,2000) (8216,2000) (17800,2000) e a colocação (1800,875), abaixo da parede; **Ctrl+Z → banco sem
    cota**. O total gravado é **16,00 m**, não os 15,85 m entre EIXOS: com "Clique: na face" (o padrão da
    barra) a captura encaixa no CANTO DA FACE — 1875 − 75 = 1800 e 17725 + 75 = 17800 são os cantos
    externos das paredes de 150 mm. É a cota EXTERNA da sala (eixo + 2 × 7,5 cm), o que se cota em planta.

### Bloco 2 — desenho técnico mais rico

**F6 — Biblioteca de padrões de hachura** · `utils/blueprintPadroes.ts` (novo, generaliza `tramaDoPiso`), kernel (**bump**): `padraoVisual {padrao, escala, rotacaoGraus}` em `AcabamentosDoAmbiente` (`model.ts:889`) e na camada de parede/material
- Muda: padrões = os 8 atuais + espinha de peixe, tijolo, concreto, isolamento, azulejo, terra/brita. O padrão é escolhido no ambiente e na camada; a humanizada continua adivinhando só quando não há escolha. Desenha na planta técnica (canvas `:3696`, PDF `:516`) e nas camadas de parede (`:4034`).
- Pronto quando: teste de geração de linhas por padrão/escala/rotação (contagem e ângulo); no app, banheiro em azulejo escala 3 e parede externa tijolo/isolamento/concreto, iguais em tela e PDF.
- **Feito na execução (11/10), com mudanças em relação ao rascunho:**
  - **Um campo só, na `CamadaParede`** (`hachura?: { padrao, escalaPct, rotacaoGraus }`), e não um
    `padraoVisual` no ambiente E no material: o PISO do ambiente já é uma lista de `CamadaParede`, então
    o mesmo campo serve à parede, ao piso (a camada do TOPO, a de acabamento) e ao forro. Escala em %
    INTEIRO (10–1000) e giro inteiro [0, 360) — o kernel não guarda fração.
  - Catálogo `PADROES_DE_MATERIAL`: diagonal, cruzada, azulejo, porcelanato, tábua, espinha de peixe,
    tijolo, concreto, isolamento. Os 8 da humanizada continuam lá, adivinhados como antes; terra/brita
    ficaram fora (é tema do terreno, com sub-região própria).
  - **Kernel 0.95.0 → 0.96.0** com o ritual: com a string em 0.95.0 e campo + validação única
    (`assertHachuraDaCamada`, chamada nas 3 validações de camadas) + canônico único (`camadaCanonica`/
    `camadaDoCanonico`, trocando 15 pontos que repetiam a forma da camada), 411 testes de kernel/goldens/
    camadas/acabamentos/telhado/IFC passaram; depois do bump só hashes. Camada sem hachura sai SEM a chave
    (teste). `clonarCamadas` copia a hachura (sem isso o Ctrl+Z mudaria junto). Bundle da planta-api regerado.
  - Geometria única `utils/blueprintPadroes.ts` (`linhasDoPadrao`): ANCORADA na origem do modelo (dois
    ambientes vizinhos alinham juntas — teste), girada por `rotacaoGraus` + ângulo da parede (o tijolo corre
    ao longo dela), recortada com furos (`recortarSegmento`), teto de 6000 segmentos.
  - Tela: hachura dentro da faixa de cada camada (com "Camadas" ligado) e no piso da planta técnica. PDF:
    piso hachurado e, nas paredes que declararam padrão, JUNTAS entre camadas + hachura (parede sem padrão
    sai como sempre — teste conta ZERO traços novos).
  - Edição: `CampoDeHachura` (padrão, escala %, giro °; valores corrigidos para a faixa na entrada) nas
    camadas da parede (`PainelCamadasParede`) e do piso/forro (`EditorDeCamadas`). Tirar a hachura REMOVE
    a chave (`camadaComHachura`).
  - DXF: fora desta fase (o DXF segue sem hachuras, como já declarava).
  - Prova: `__tests__/blueprintPadroes.test.ts` (13). ✅ **No app com escrita (11/10, "Planta 11/10/2026",
    estudo sozinho)**: selecionar a parede de baixo → "Dividir em camadas" → hachura Tijolo (aparecem escala
    e giro) → **no banco, a camada com `hachura: TIJOLO, 100 %, 0°`** → Ctrl+Z ×2 → parede homogênea de novo.

**F7 — Anotação de forma com preenchimento** · kernel (**bump**): `HACHURA` ganha `padraoVisual`, `opacidade`, `traco {tracoMm, espacoMm}`, `ordem`; modo retângulo; `BlueprintCanvas.tsx`, `blueprintExport.ts`, `PainelAnotacaoSelecionada.tsx`
- Muda: retângulo em 2 cliques; "Trazer para frente / Enviar para trás" mexem em `ordem`; fundo sólido opaco disponível.
- Pronto quando: golden; teste de ordenação; no app, tapete hachurado sobre o piso e atrás do sofá, igual no PDF.
- **Feito na execução (11/10, kernel 0.97.0):**
  - Modelo: a `Anotacao` ganhou `material?` (o `HachuraDaCamada` da F6 — padrão, escala, giro), `fundo?`
    (`#rrggbb`, OPACO; o "Sólida" de antes segue translúcido), `tracejadoMm?` (traço × espaço próprios),
    `plano?: 'FUNDO'` e `ordem?`. Material, fundo e plano só na HACHURA (validação no kernel). Sem os campos,
    o canônico sai SEM as chaves (teste) — desenho antigo só muda pela versão. `SetAnotacaoProps` com `null`
    remove a chave. A `opacidade` livre do rascunho virou o `fundo` opaco: era o caso do vídeo.
  - Ordem: `anotacoesNaOrdem(lista, 'FRENTE'|'FUNDO')` (estável por `ordem`). A passada do FUNDO é desenhada
    logo depois do piso — **abaixo das paredes e dos móveis** — na tela e no PDF (teste: no PDF, o polígono da
    região de fundo sai antes da silhueta da parede e o da frente, depois). "Enviar para trás" leva ao FUNDO
    (só HACHURA); "Trazer para frente" põe acima de todas da frente; botão sem efeito diz por quê.
  - Retângulo: "Retângulo hachurado" no menu Anotações — dois cliques nos cantos opostos (`cantosDoRetangulo`),
    sem orto. DXF: a região usa as linhas do material quando há (`linhasDaRegiao`).
  - ⚠️ Achado pela prova no app: sem fundo, o seletor de cor mostrava branco, e escolher branco não dispara
    mudança — **o fundo branco nunca era gravado**. Agora, sem fundo aparece "Pôr fundo branco"; o seletor de
    cor só aparece quando já há fundo.
  - Prova: `__tests__/blueprintRegiaoHachurada.test.ts` (10) + goldens. ✅ **No app com escrita (11/10,
    "Planta 11/10/2026", estudo sozinho)**: Inserir › Anotações › Retângulo hachurado → 2 cliques → selecionar
    → "Pôr fundo branco" → "Enviar para trás" → **no banco, 4 vértices, `fundo: #ffffff`, `plano: FUNDO`** →
    Ctrl+Z ×3 → banco sem região. Print: o fundo branco cobre o piso do ambiente.

**F8 — Esquadria configurável** · kernel (**bump**): `Opening.configuracao? {mecanismo: ABRIR|CORRER|BASCULANTE|MAXIM_AR|PIVOTANTE|FIXA|CAMARAO, folhas: {mecanismo, larguraRel}[], bandeira?: {alturaMm, mecanismo}}`; entra em `assinaturaDaEsquadria` (`model.ts:653`); canvas `:4171`; 3D `Blueprint3DViewer.tsx:319` (caixilho + folhas); `PainelParedeSelecionada.tsx`
- Muda: editor de folhas (adicionar/remover/trocar mecanismo); porta de 2 folhas (fecha o item aberto em `2026-08-14-girar-espelhar-porta.md:102`); Espaço com a abertura sob o cursor gira o sentido (`FlipOpening`). Sem `configuracao`, o desenho atual não muda (compatibilidade).
- Pronto quando: golden; teste de quantitativo (2 janelas iguais em tamanho e diferentes em folhas = 2 linhas); no app, janela 3 folhas (fixa/abrir/correr) + bandeira basculante, no 2D, no 3D e no quantitativo.
- **Feito na execução (11/10, kernel 0.98.0, quant-1.28.0):**
  - Modelo: `Opening.configuracao? { folhas: {mecanismo, larguraPct}[], bandeira?: {alturaMm, mecanismo} }` —
    mecanismos FIXA, ABRIR, CORRER, BASCULANTE, MAXIM_AR, PIVOTANTE, CAMARAO; largura em % INTEIRO somando
    100 (fração em ponto flutuante no hash mudaria com a ordem das somas); 1–6 folhas; bandeira só
    fixa/basculante/maxim-ar/pivotante, de 100 mm até (altura do vão − 300). Só porta e janela:
    `SetOpeningKind` para correr/vão livre DESCARTA a configuração. O `mecanismo` único do rascunho virou
    o mecanismo POR folha (a janela do vídeo mistura fixa, abrir e correr).
  - As folhas vão da ponta da dobradiça para a outra: "Girar" (`FlipOpening` hinge) espelha a esquadria
    inteira sem reescrever a lista; "Espelhar" (swing) troca o lado da abertura.
  - `SetOpeningConfiguracao` (null remove) e `AddOpening` aceita a configuração. Omitida do canônico
    quando ausente (teste).
  - Assinatura: sufixo `|cfg:…` SÓ quando há configuração — a chave de quem não tem é a de antes, byte a
    byte (é id de linha de orçamento persistido; teste). Quadro: a linha ganha `configuracao` por extenso;
    mesma medida com folhas diferentes = duas linhas (teste); o painel Esquadrias e a planilha (coluna
    "Folhas" no fim) mostram.
  - Geometria única `utils/blueprintFolhas.ts`: `simboloDasFolhas` (segmentos em mm — canvas, PDF e DXF
    desenham a MESMA conta; no DXF só a abertura configurada ganha traço, o DXF de antes não muda — teste)
    e `pecas3dDasFolhas` (caixilho, montantes, travessa e vidro da bandeira, pano de cada folha — vidro;
    na porta, folha opaca, salvo a fixa lateral; a de correr em trilhos alternados). Sem configuração,
    tudo como antes.
  - Painel "Folhas" (dentro do painel da esquadria): Configurar folhas → mecanismo e % por folha (a
    vizinha cede a diferença; fora da faixa o painel diz a faixa e não grava), + Folha, Dividir por
    igual, tirar folha, Pôr bandeira (altura e mecanismo), Desenho padrão. Botão sem efeito diz por quê.
  - Espaço: com UMA abertura selecionada (Selecionar ativo), espelha o lado em que ela abre — mas não em
    campo de texto nem com o foco num botão (lá Espaço é clicar). "Sob o cursor" virou "selecionada":
    previsível, e sem um segundo teste de acerto.
  - Igualar (F4): a opção "Esquadria (catálogo e folhas)" leva as folhas junto, depois do tipo e do
    tamanho que as validam (teste).
  - ✅ **Pendências fechadas (11/10, pedido: "Implemente 1. o catálogo… 2. elevações e cortes… 3. a
    travessa no 3D… na sequência seguir com F9"):**
    1. CATÁLOGO: migration `aplicar_20271011009000_blueprint_opening_types_configuracao.sql` (só ADD COLUMN
       `configuracao JSONB NULL`, idempotente; sem policy/função — REGRA #7 não se aplica), aplicada com
       `db query -f` e conferida em `information_schema`. "Salvar tipo" (painel da abertura e quadro de
       esquadrias) leva as folhas; "Aplicar tipo" aplica as folhas no mesmo lote (tipo sem folhas volta a
       abertura ao desenho padrão, como o vidro). A leitura (`configuracaoDaColuna`) só aceita a forma do
       kernel; lixo vira desenho padrão.
    2. ELEVAÇÃO E CORTE: a projeção (`projetarElevacao`, reaproveitada pelo corte para o que fica atrás do
       plano) leva as folhas no plano da fachada (trecho `u`, lado da dobradiça) e a cota da bandeira;
       `simboloDaElevacao` desenha montantes, travessa e a convenção (V tracejado para a dobradiça na de
       abrir, V para cima no maxim-ar, X na basculante, eixo na pivotante, seta na de correr) — a MESMA
       conta na tela (`ElevationCanvas`), no PDF e no DXF (`ELEVACAO-ABERTURAS`). Sem folhas, o retângulo
       de sempre e nenhuma chave nova na projeção (teste). O vão CORTADO pelo plano segue como retângulo.
    3. TRAVESSA NO 3D: peça própria `TRAVESSA` — vão inteiro, 70 mm de altura, 15 mm saliente de cada face
       do caixilho, quase preta (#0f172a) — não some mais no quadro de longe.
    - Prova: `blueprintFolhas.test.ts` (28), `blueprintCatalogoFolhas.test.ts` (3),
      `components/PainelEsquadria.test.tsx` (+1); suíte inteira 841 arquivos / 8564 testes.
      ✅ **No app com escrita (12/10, "Planta 11/10/2026" liberada pelo usuário; estado dele conferido por md5
      do rascunho antes e depois)**: janela de teste em x=14 m (longe das 2 janelas do usuário) com 3 folhas +
      bandeira → nome JF8T → "Salvar tipo" numa organização (Alpa) → **no catálogo, as 3 folhas + bandeira** →
      "Desenho padrão" (sem folhas no banco) → "Aplicar tipo" (as folhas voltaram) → elevação "Fundos" com
      montantes, travessa e os tracejados. Limpeza: rascunho com o MESMO md5 de antes; o tipo JF8T apagado pela
      API com a sessão do usuário (a 1ª tentativa deu 401 — cabeçalho capturado ANTES do login; refeita com o
      token da sessão, HTTP 200) e catálogo conferido vazio no banco.
  - Prova: `__tests__/blueprintFolhas.test.ts` (23). ✅ **No app com escrita (11/10, "Planta 11/10/2026",
    estudo sozinho)**: J + clique na parede de cima → Configurar folhas → + Folha → folha 1 Fixa, folha 2 De
    abrir → Pôr bandeira → **no banco, FIXA 33 / ABRIR 33 / CORRER 34 + bandeira BASCULANTE 400**; largura
    99 % recusada com "Cabe de 5 a 61 %"; Espaço → `swingReversed` false → true; quadro de esquadrias com a
    linha "3 folhas: fixa · de abrir · de correr + bandeira basculante"; 3D com caixilho, montantes e panos;
    Ctrl+Z ×7 → banco de volta a só a porta. Prints: planta de perto (fixa no eixo, montantes, a de abrir com
    o arco, a de correr no trilho deslocado), espelhada, quadro e 3D.
    ⚠️ A 1ª e a 2ª rodada pararam ANTES do desfazer (seletor do quadro errado) e deixaram a janela no
    rascunho — apagada pelo app (selecionar + Delete) e conferida no banco nas duas vezes; o roteiro agora
    desfaz num `finally`.

**F9 — Biblioteca de móveis arrastável** · `components/blueprint/PainelBibliotecaComponentes.tsx` (novo), `BlueprintCanvas.tsx` (drop), `BlueprintEditor.tsx`
- Muda: grade com miniatura por tipo/conjunto, busca e família; `dataTransfer` com `tipoId`; o drop converte para mm (Y espelhado) e chama `adicionarComponente(at)`. Símbolos 2D por tipo mais fiéis. Opção de exibir mobiliário na planta técnica do PDF.
- Pronto quando: teste da conversão tela→mm no drop; no app, arrastar sofá e cama os insere no ponto solto, e um Ctrl+Z desfaz.
- **Feito na execução (11/10, sem bump de kernel — nada muda no modelo):**
  - `utils/blueprintBiblioteca.ts` (puro): o catálogo como itens (conjuntos com a caixa dos filhos), a busca
    sem acento/caixa por todas as palavras, o filtro por família (+ "Conjuntos"), `tipoDoArraste` (só tipo
    do catálogo), `pontoDoSoltar` (desfaz a vista: Y do modelo SOBE; arredonda a 10 mm) e
    `miniaturaDoComponente` (o símbolo da planta encaixado num quadrado de SVG; conjunto = um contorno por
    filho).
  - Painel "Biblioteca" (seção NOVA do painel lateral, não modal — a planta fica livre para receber o soltar;
    fechada por padrão, abre pelo botão Biblioteca da Arquitetura, ao lado de Mobiliário): busca, família,
    grade 3 colunas com miniatura, rótulo e medida em cm. Arrastar → o canvas aceita só o tipo próprio
    (`application/x-opura-componente`) e põe a peça no ponto solto pelo MESMO `adicionarComponente` do clique
    (louça lança os pontos no mesmo lote; um Ctrl+Z). Clicar arma a ferramenta (caminho do teclado).
  - Símbolos por TIPO: `tracosDoComponente` (fonte única — o canvas perdeu o `switch` próprio que copiava
    `tracosDoSimbolo`): sofá com os assentos, solteiro com um travesseiro, mesa com as cadeiras, cadeira com
    o assento, rack com a TV, estante com prateleiras, criado e escrivaninha com gaveta, bancada seca com o
    rodabanca, geladeira com o puxador. Fogão e louças como antes (teste da humanizada intacto).
  - PDF: opção "Mobiliário" no exportar (ao lado de Cotas, desligada por padrão) — a planta TÉCNICA sai com
    contorno + símbolo de cada peça em traço fino cinza; o pai do conjunto não (é agrupamento); a humanizada
    segue com os coloridos dela (teste). DXF: fora desta fase.
  - Prova: `__tests__/blueprintBiblioteca.test.ts` (12), `components/PainelBibliotecaComponentes.test.tsx` (4).
    ✅ Olhar SÓ-LEITURA no app ("Planta 26/09/2026", 11/10): o botão Biblioteca abre a seção; 28 peças com
    miniatura; "cama" acha casal, solteiro e o conjunto de dormitório; a miniatura é arrastável; o rascunho
    do estudo NÃO mudou (draft_saved_at igual antes e depois). ✅ **Com escrita (12/10, "Planta 11/10/2026")**:
    sofá e cama arrastados da Biblioteca caíram no ponto solto (sofá em 5,96/4,05 m para o alvo 6,0/4,0; cama
    idem ±15 cm) e o Ctrl+Z devolveu o rascunho ao md5 de antes.

**F10 — Modelos glTF dos componentes** · `FichaDoComponente` (`model.ts:1736`) ganha `modelo3d?` (fora do hash, como o `uid`); bucket `blueprint-modelos-3d` + migration (REGRA #7); `utils/blueprintModelos3d.ts`; `Blueprint3DViewer.tsx:1387`
- Muda: curadoria de modelos **CC0** (fonte e licença registradas por arquivo, em `docs/planos/…` + tabela de créditos); `useGLTF` com escala para a ficha (largura × profundidade × altura); fallback para a caixa se faltar ou falhar; peso máximo por modelo. O IFC continua com a caixa.
- Pronto quando: teste do encaixe de escala; no app, a sala mobiliada mostra modelos, um tipo sem modelo mostra caixa, e a aba Network mostra o cache dos modelos.
- **Feito na execução (11/10, sem bump de kernel — o modelo não guarda nada disto):**
  - **Decisão (minha, registrada):** os modelos moram como arquivos ESTÁTICOS do app (`public/modelos-3d/`),
    não num bucket com migration como o rascunho dizia. São CC0, públicos, iguais para toda organização e
    versionados com o código que os encaixa; bucket pediria RLS/migration para guardar o que não é dado de
    ninguém. Fora do precache do PWA (`globPatterns` não pega `.glb`): só baixam quando o 3D os pede; o
    `useGLTF` os reaproveita na sessão e a CDN no navegador. `*.glb binary` no `.gitattributes`.
  - Fonte e licença: **Kenney — Furniture Kit 2.0** (kenney.nl/assets/furniture-kit), **CC0 1.0**; o
    `License.txt` do pacote vai junto (`public/modelos-3d/kenney/LICENSE-Kenney-Furniture-Kit.txt`). Baixado em
    11/10/2026 numa pasta isolada; cada arquivo conferido como glTF 2.0 binário autocontido (sem uri externa,
    sem imagem) — e o teste reconfere a cada rodada. 19 arquivos, 456 KB no total, o maior 54 KB (teto 120 KB).

    | Tipo | Arquivo (CC0, Kenney) |
    |---|---|
    | CAMA_CASAL | `kenney/bedDouble.glb` |
    | CAMA_SOLTEIRO | `kenney/bedSingle.glb` |
    | CRIADO | `kenney/cabinetBedDrawer.glb` |
    | ARMARIO | `kenney/bookcaseClosedDoors.glb` |
    | ESTANTE | `kenney/bookcaseOpen.glb` |
    | SOFA | `kenney/loungeSofa.glb` |
    | POLTRONA | `kenney/loungeChair.glb` |
    | MESA_JANTAR | `kenney/table.glb` |
    | CADEIRA | `kenney/chair.glb` |
    | RACK | `kenney/cabinetTelevision.glb` |
    | ESCRIVANINHA | `kenney/desk.glb` |
    | BANCADA | `kenney/kitchenSink.glb` |
    | BANCADA_SECA | `kenney/kitchenCabinet.glb` |
    | GELADEIRA | `kenney/kitchenFridgeLarge.glb` |
    | FOGAO | `kenney/kitchenStove.glb` |
    | MAQUINA | `kenney/washer.glb` |
    | VASO | `kenney/toilet.glb` |
    | LAVATORIO | `kenney/bathroomSink.glb` |
    | BOX | `kenney/shower.glb` |

    Sem modelo, de propósito (seguem CAIXA): as reservas de climatização (condensadora, evaporadora, casa de
    máquinas, exaustor — são LUGAR, não equipamento), o TANQUE (o kit não tem) e os conjuntos (desenham os
    filhos). A peça SUGERIDA pelo mobiliário automático também segue caixa translúcida (é proposta).
  - `utils/blueprintModelos3d.ts`: a tabela tipo → arquivo/fonte/licença/giro e `encaixeDoModelo` (escala POR
    EIXO para as medidas da peça — a ficha ou a que o usuário editou — e o centro da caixa do modelo na origem).
  - 3D: o móvel dentro do grupo da peça; enquanto carrega, a caixa (`Suspense`); se o arquivo falhar, a caixa
    (`FalhaDoModelo`) — nunca um buraco na cena. Selecionado: a caixa da peça em azul translúcido por cima.
    IFC segue com a caixa.
  - Orientação provada POR IMAGEM no spike `docs/spikes/moveis-3d/` (sem banco): giro 180° põe a frente do
    móvel na frente da peça (o armário girado 180° na planta mostra as portas para o lado girado; com giro 0 as
    portas e a cabeceira ficavam contra a parede de trás). Tanque sem modelo = caixa. Console limpo; os 19 `.glb`
    com 200.
  - Prova: `__tests__/blueprintModelos3d.test.ts` (6). ✅ No app (12/10, só leitura, "Planta 11/10/2026"):
    3D visto de cima com o armário, a cama de casal e os criados como MODELOS (3 `.glb` com 200, console
    limpo, rascunho intocado). Produção serve o `.glb` com `model/gltf-binary`.

### Bloco 3 — IA e visualização

**F11 — Gerar planta dentro de um contorno desenhado** · `utils/blueprintGerador.ts`, `TelaGerador.tsx`, `BlueprintEditor.tsx` (~5613–5690)
- Muda: o envelope pode vir de um polígono selecionado (anotação HACHURA/LINHA fechada ou ambiente). `maiorRetanguloInscrito` é trocado por uma decomposição do polígono ortogonal em retângulos, com as faixas recortadas contra o polígono, e o aviso de área perdida vira percentual. `comandosDeGeometria` passa para `AddWalls`/`AddOpenings`/`PlaceSpaceLabels` (como `blueprintPlantaDaUnidade.ts:581`). O pedido em texto reaproveita o PainelIa/`planta-ia`.
- Pronto quando: teste: contorno em L de 161 m² com "3 quartos" usa ≥ 90 % da área e não gera parede fora do polígono; teste da contagem de comandos (lote); no app, desenhar o L, digitar e receber a planta editável.
- **Feito na execução (12/10, pedido: "pode usar a 'Planta 11/10/2026' e depois do teste seguir para F11"; sem
  bump de kernel):**
  - `utils/blueprintContorno.ts` (puro): `ehOrtogonal`, `retangulosDoContorno` (fatias em X e em Y, fundidas;
    fica a decomposição de MAIOR retângulo principal), `trechosNaBorda` (os trechos de um lado que caem na borda,
    com a normal externa S/N/L/O — anel horário ou anti-horário) e `subtrairBorda`.
  - Gerador: contorno ORTOGONAL (L, U, T…) é usado INTEIRO — o maior retângulo é o principal (zonas, corredor,
    recozimento, como antes) e os outros são ANEXOS: recebem íntimos (depois, serviço) até a parte de área
    deles, pelo MESMO treemap em faixas com a 1ª faixa encostada no lado comum com a casa (a suíte encosta na
    casa; o banheiro da suíte fica atrás dela). Sem íntimo no principal, o corredor sai. Externas = arestas do
    contorno; internas = lados dos ambientes MENOS a borda; janelas e entrada nos trechos de borda (com a
    normal); "lados externos" pelo contorno quando há anexo. Contorno OBLÍQUO segue no maior retângulo, com
    aviso do percentual que ficou de fora. Anexo com menos de 1,50 m não recebe ambiente (aviso).
    1ª versão punha os ambientes do anexo numa linha só → banheiro de 1,15 × 7 m; trocada pelo treemap.
  - Aplicar = `comandosDeAplicacao`: `AddWalls` + `AddOpenings` (por `wallUid`) + `PlaceSpaceLabels` num
    `runBatch` — UM Ctrl+Z tira a planta inteira (antes eram dois lotes, e o 1º Ctrl+Z tirava só os nomes).
  - UI: "Gerar planta aqui" no painel da REGIÃO HACHURADA (abre Gerar com ela como contorno); a tela Gerar diz
    "Contorno DESENHADO: N m²" com "voltar ao envelope do lote", e oferece "Gerar dentro da região selecionada".
    O pedido em TEXTO segue na Conversa (PainelIa), que muda o programa e re-gera — sobre o contorno em uso.
  - Testes que mudaram por requisito: o L do `blueprintGerador.test.ts` deixou de ser "o maior retângulo" (agora
    "Contorno ortogonal … 100 % da área"), e o 2Q que antes não cabia no L agora cabe (o aviso de área mínima
    passou a ser conferido num envelope pequeno de verdade).
  - Prova: `__tests__/blueprintContorno.test.ts` (5) e `__tests__/blueprintGeradorContorno.test.ts` (5: o L de
    161 m² com o programa de 3 quartos em 3 sementes — ≥ 90 % da área em ambientes, nenhuma parede fora do
    polígono, todos fechados/nomeados e com porta, a ala recebe ambiente, entrada pela frente; aplicar = 3
    comandos de lote; oblíquo avisa). Diagnóstico da semente 1: ala de 5 × 7 m com a suíte (5 × 5,4) e o
    banheiro da suíte atrás; 16 paredes, 13 portas, 9 janelas, nota 86.
    ✅ **No app com escrita (12/10, "Planta 11/10/2026")**: L de 33,20 m² desenhado como região hachurada dentro
    da sala → "Gerar planta aqui" → a tela diz "Contorno DESENHADO: 33,20 m²" → semente 2 quartos no programa
    (o estudo não tinha) → de volta ao Gerar, o contorno continua → 4 alternativas → "Aplicar neste pavimento":
    **4 → 17 paredes no banco, 8 ambientes nomeados**, a planta seguindo os dois braços do L → **um Ctrl+Z** a
    tira inteira → limpeza: rascunho com o MESMO md5 de antes e o programa apagado pela API com a sessão (204).
    Os ambientes saíram apertados (sala 4,95 m²) porque o L cabia na sala existente — 33 m² para um programa
    de ~60 m²; a tela marca as áreas em vermelho.

**F12 — Câmera** · kernel (**bump**): família `Camera {posicao, alvo, alturaOlhoMm, focalMm, nome}`; ferramenta de 2 cliques no 2D; `Blueprint3DViewer.tsx` (Canvas `:2242`, `Percorrer`); `utils/blueprintBcf.ts` (`PerspectiveCamera`)
- Muda: o símbolo da câmera com cone no 2D; prévia 3D do ponto de vista; lista de vistas salvas; mexer na janela atualiza a prévia; o BCF exporta a câmera em perspectiva quando há uma.
- Pronto quando: golden; teste de conversão focal→fov; no app, a câmera na sala abre o 3D daquele ponto e o BCF reabre a vista no viewer.
- **Feito na execução (12/10, kernel 0.99.0):**
  - Modelo: família `cameras?` — pavimento, posição, alvo (≠ posição), altura do olho (0,30–20 m, padrão 1,60),
    focal EQUIVALENTE a 35 mm (10–200, padrão 24) e nome ("Câmera N"). `AddCamera`/`SetCameraProps`/
    `DeleteCamera`; `TranslateEntities` com `cameraIds` (posição e alvo juntos; mover no 2D e no 3D);
    `RemoveLevel` leva as câmeras do pavimento. Omitida do canônico (geometria e identidade) quando não há.
    Classificada como REFERÊNCIA nas camadas por disciplina (como o corte): esconder a arquitetura não some
    com a vista salva — o portão de "coleção nova precisa ser classificada" pegou a falta.
  - `utils/blueprintCamera.ts`: a lente preserva o ângulo HORIZONTAL (o do cone na planta; 24 mm = 73,7°) e o
    vertical sai do formato da tela; o cone; o olho no mundo do 3D (câmera nivelada); o tópico BCF.
  - Planta: Inserir › Câmera (2 cliques, prévia do cone; Orto como o corte — Shift solta), símbolo violeta com
    cone translúcido e nome; clicar no corpo seleciona. Painel: nome, altura do olho, lente (atalhos 16/24/35/
    50 mm com o ângulo), "Ver no 3D".
  - 3D: seletor "Ponto de vista" (Livre ou as câmeras dos pavimentos à vista); a câmera vai ao olho, a órbita
    gira em torno do alvo, e mexer na planta atualiza o 3D (é o mesmo modelo). ⚠️ Achado pela prova: o
    `PontoDeVista` vinha ANTES do `Enquadrar` na árvore e o enquadramento automático da montagem passava por
    cima (o 3D abria de fora) — trocado de ordem; com câmera salva o limite polar da órbita vai a 90°.
  - BCF: cada câmera vira o tópico "Vista — nome" com `PerspectiveCamera` (olho, direção, Z para cima,
    `FieldOfView` vertical do quadro de 35 mm); sem câmera, a vista ortogonal de sempre.
  - ⏳ Fica para depois: prévia 3D DENTRO do painel da câmera na planta (hoje é "Ver no 3D"), e a câmera no DXF/PDF.
  - Prova: `__tests__/blueprintCamera.test.ts` (9) + goldens. ✅ **No app com escrita (12/10, "Planta 11/10/2026")**:
    Inserir › Câmera, 2 cliques (o 2º com Shift, em diagonal) → **no banco, posição 4,0/3,0 m e alvo 12,0/5,6 m**
    → lente 35 mm (banco: 35) → "Ver no 3D": o 3D abre DE DENTRO da sala, à altura do olho, olhando o alvo;
    "Livre" volta à órbita e a câmera volta ao mesmo ponto → Exportar BCF: tópico "Vista — Câmera 1" com
    `PerspectiveCamera` (olho 4/3/1,6 m, direção 0,95/0,31/0) → Ctrl+Z → rascunho com o MESMO conteúdo de antes.
    ⚠️ O md5 do rascunho inteiro mudou só no carimbo `kernel` (o servidor local já grava 0.99.0); conferido
    que, com o carimbo devolvido a 0.98.0, o md5 é o original — o parser não recusa carimbo mais novo, então
    a produção (0.98.0) abre o rascunho normalmente.

**F13 — Captura da imagem do 3D** · `Blueprint3DViewer.tsx` (`preserveDrawingBuffer` só na captura, `gl.domElement.toBlob`)
- Muda: "Exportar imagem" da câmera ativa em PNG, na resolução escolhida; pode entrar como imagem na prancha.
- Pronto quando: no app, o PNG baixado corresponde à câmera e não sai preto (o teste é abrir o arquivo).
- **Feito na execução (12/10, sem bump de kernel):**
  - A captura NÃO lê o canvas da tela (sem `preserveDrawingBuffer` ele vem preto, e na resolução da janela):
    desenha a cena de novo num `WebGLRenderTarget` do tamanho pedido (MSAA ×4, sRGB) e lê os pixels de lá —
    `Captura` no viewer publica a função; a aba chama. HD, QHD e 4K, reduzidos na mesma proporção se a placa
    não aceitar (`dimensoesDaCaptura`). Com câmera salva, a LENTE dela no formato da imagem; sem, a órbita.
  - Os ajudantes saem da imagem: grade do chão, alça de mover e contorno da caixa de corte levam
    `userData.naoCapturar` e ficam invisíveis só durante o desenho. A seleção sai destacada (o botão diz).
  - A captura confere a si mesma: menos de 1 % de pixels com conteúdo = recusa com o motivo (nunca baixa PNG
    preto). Nome: `estudo--vista--dia.png`.
  - UI: "Exportar imagem" + resolução na barra do 3D, ao lado de "Ponto de vista".
  - ⏳ Fica para depois: a imagem como figura NA PRANCHA (o plano dizia "pode entrar").
  - Prova: `__tests__/blueprintCaptura.test.ts` (5). No spike dos móveis (sem banco): PNG HD 1920 × 1080 e 4K
    3840 × 2160, 0 % de pixels escuros, igual à tela e SEM a grade. ✅ **No app com escrita (12/10, "Planta
    11/10/2026")**: câmera criada → "Ver no 3D" → Exportar imagem HD → `planta-11-10-2026--camera-1--2026-10-12.png`,
    1920 × 1080, 0 % escuro, a vista DE DENTRO da sala (aberturas, sombras, criado) → Ctrl+Z → rascunho com o
    mesmo conteúdo de antes (md5 sem o carimbo do kernel).

**F14 — Render por IA** · Edge Function `planta-render` (nova, padrão `planta-ia`: CORS, auth, chave só no servidor, REGRA #7 pergunta 3), `services/blueprintRenderService.ts`, tabela `blueprint_renders` + bucket (migration, RLS por org), `PainelRender.tsx`
- **F14.0 (portão):** comparar 2–3 fornecedores de imagem que aceitem imagem de entrada e edição por máscara (preço por imagem, latência, termos de uso comercial e de dados). O usuário escolhe; a decisão é registrada na tabela de decisões. Sem isso, F14.1+ não começa.
- F14.1: captura (F13) + descrição derivada do modelo (ambiente, acabamentos, móveis) + prompt do usuário + "sem estilo" → imagem gravada por estudo/câmera.
- F14.2: edição por prompt ("piso espinha de peixe clara") sobre a imagem anterior.
- F14.3: segmentar/substituir elemento. As máscaras vêm do **nosso** modelo (render de IDs por objeto na mesma câmera), sem depender de segmentação do fornecedor. Também trocar por imagem enviada.
- Limite de uso por organização (contador na tabela) e custo visível antes de gerar.
- Pronto quando: REGRA #7 respondida no plano; função recusa sem JWT (provar com curl); no app, câmera → render → editar piso → trocar o rack, imagens persistidas e reabríveis.
- **F14.0 — comparação feita em 12/10/2026, ESPERANDO A ESCOLHA do usuário** (preços das páginas oficiais
  nessa data; o que veio de terceiros está marcado). Para retomar: apresentar esta tabela, o usuário escolhe,
  registrar na tabela de decisões e só então abrir a F14.1.

  | | Google — Gemini 3.1 Flash Image | BFL — FLUX (Kontext + Fill) | OpenAI — gpt-image-2 |
  |---|---|---|---|
  | Preço/imagem | 1K US$ 0,067 · 2K 0,101 · 4K 0,151 (lote: metade) | Kontext [pro] US$ 0,04 · Fill [pro] (máscara) 0,05 · FLUX.2 [pro] desde 0,045 | por token; 1024² ≈ 0,006 baixa · 0,053 média · 0,21 alta (terceiros) |
  | Imagem de entrada (captura F13) | sim | sim (Kontext) | sim (edits) |
  | Edição por texto (F14.2) | sim, conversacional | sim (Kontext) | sim |
  | **Máscara (F14.3)** | **não há parâmetro** — só por texto | **máscara de verdade** (Fill [pro]) | aceita, mas "usa a máscara como guia, pode não seguir o formato exato" |
  | Latência | segundos (não medido) | assíncrona com consulta (não medido) | "até 2 min" em prompt complexo |
  | Uso comercial | sim | explícito: "você é dono do Output", uso comercial | sim |
  | Dados | pago: não treina; 55 dias para abuso | termos NÃO dizem se treina nem retenção; BFL é dona de "data sets criados a partir do uso" | API não treina por padrão; 30 dias para abuso |

  Ciclo render + 2 edições + 1 troca: BFL ≈ US$ 0,17 · OpenAI média ≈ 0,21 (+ tokens de entrada) · Google 1K ≈ 0,27.
  **Recomendação apresentada:** BFL (único com máscara exata, que é o que a F14.3 precisa — as máscaras vêm do
  NOSSO modelo; o mais barato), mandando só a imagem do 3D e a descrição dos ambientes (sem cliente/endereço)
  por causa dos termos vagos. Alternativa: Google, se a clareza dos termos de dados pesar mais que a máscara.
  Qualquer que seja, `planta-render` terá um adaptador por fornecedor. Opção oferecida: rodar os três na mesma
  captura da "Planta 11/10/2026" (< US$ 1, precisa de uma chave de cada) antes de escolher.
  Stability ficou de fora (página de preços não abriu; Inpaint/Search&Replace/Structure = 5 créditos = US$ 0,05
  segundo terceiros).
  Fontes: ai.google.dev/gemini-api/docs/pricing · ai.google.dev/gemini-api/docs/abuse-monitoring ·
  docs.bfl.ml/quick_start/pricing · bfl.ai/legal/developer-terms-of-service · help.bfl.ai (uso comercial) ·
  developers.openai.com/api/docs/pricing · developers.openai.com/api/docs/guides/image-generation ·
  blog.segmind.com, enter.converge.ai (preço por imagem do gpt-image-2).

**F15 — Rastrear planta de imagem (Claude visão)** · Edge Function (estender `planta-ia` com modo `rastrear` ou nova `planta-rastrear`), `PainelGerarParedes.tsx`, `utils/blueprintVetor.ts`
- Muda: imagem/PDF escaneado sobre a planta de fundo **calibrada** (a escala vem da calibração, não da IA) → JSON de segmentos de parede, aberturas e nomes → mesmo pós-processamento do vetorizador (fechar vãos, T, espessuras) → prévia sobreposta → o usuário confirma → `AddWalls`/`AddOpenings`/`PlaceSpaceLabels`. Nada é gravado sem confirmação.
- Pronto quando: teste do pós-processamento com uma resposta JSON fixa; no app, um escaneado de exemplo gera paredes alinhadas ao fundo e o resultado mostra quantas paredes foram aceitas e quantas descartadas.
- **Feito na execução (12/10, pedido: "deixe tudo pronto para o F14.0 … e vamos para a próxima fase"; sem bump de
  kernel, sem migration):**
  - `utils/blueprintRastrear.ts` (puro): `recorteDaRegiao` (região em mm → pixels do fundo), `tracadoDaResposta`
    (saneia a resposta: número inválido, fora da imagem, tipo desconhecido → recusado e contado), `limiarDeOtsu`,
    `refinarNoRaster` — **a parede proposta é CONFERIDA no próprio fundo**: perfil de cobertura escura através do
    eixo; parede = uma faixa da espessura de parede (cheia) OU um par de linhas finas a uma espessura (contorno, com
    ou sem hachura); vence a mais larga que contém a linha proposta; sem candidato = "sem traço de parede no fundo
    sob ela" (é o filtro de alucinação) —, `ajustarPontas` (estica/recolhe pelo fundo), `juntarSobrepostos`,
    `encostarPontas` (ponta no EIXO da perpendicular: L e T), `rastrear` (tudo, com espessura no centímetro e
    corte de esbeltez do vetorizador), `hospedarAberturas` (por `wallUid`, sem sobrepor: o kernel recusaria o
    lote) e `comandosDoRastreio` (AddWalls → conexões em T do editor sobre o modelo SIMULADO → AddOpenings
    hospedadas nas paredes já corrigidas → PlaceSpaceLabels com o tipo pelo nome) — um `runBatch`.
  - Edge `planta-ia`, modo `rastrear`: imagem (≤ 1568 px de lado) → Claude com visão, ferramenta `emitir_tracado`
    (paredes pelo eixo, aberturas pelas ombreiras, nomes), em pixels; a escala NÃO é pedida. Modelo
    `PLANTA_RASTREAR_MODELO` (padrão claude-opus-5-5, recuo para claude-sonnet-4-6). Publicada; sem JWT → 401.
    REGRA #7: não cria policy nem função SQL; a chave fica só no servidor.
  - Tela: "Importar › Do PDF ou imagem" ganhou "Rastrear com IA — planta escaneada ou foto" (região compartilhada
    com o caminho do PDF; botão desligado diz o motivo). A prévia chega com o painel RECOLHIDO — tracejada sobre o
    fundo, com a pílula "Lançar N parede(s) rastreada(s)" / "Voltar à gaveta"; o resumo diz propostas, aceitas,
    descartadas e por quê.
  - ⚠️ **A chave `ANTHROPIC_API_KEY` não está nos segredos do Supabase** (conferido 12/10): a função responde 503
    e a tela diz "IA não configurada ou indisponível (a chave ANTHROPIC_API_KEY não está no Supabase)". Vale
    também para a conversa da E6.4/M5c (que hoje cai no intérprete local). Basta o usuário cadastrar a chave —
    nenhuma mudança de código.
  - Prova do pipeline numa imagem "escaneada" de verdade (ruído + desfoque, paredes cheias de 12 px, interna pelo
    contorno, porta com arco, janela, cama e uma cota): as 5 paredes nos eixos exatos com 20 cm medidos; a COTA e
    uma parede inventada recusadas ("sem traço"); porta 90 cm, janela 1,51 m; 2 ambientes fechados.
  - **Prova no app (estudo "Planta 11/10/2026")**: importar o escaneado como fundo, aferir (gravada pela API com a
    sessão), "Rastrear" com a função REAL → a tela diz que falta a chave; com a resposta da IA SIMULADA (rota
    interceptada, mesma resposta acima) → imagem enviada 1400 × 900 no modo "rastrear", "7 propostas → 5 aceitas ·
    2 descartadas · 2 × sem traço de parede no fundo sob ela", prévia sem gravar, Aplicar → banco +5 paredes nos
    eixos (±2 cm, 20 cm) +2 aberturas +2 nomes → Ctrl+Z → md5 do rascunho idêntico; prancha e arquivo removidos.
  - Testes: `__tests__/blueprintRastrear.test.ts` (14) e `components/PainelGerarParedes.test.tsx` (+3).
  - Pendente (precisa da chave): medir a qualidade com o Claude de verdade em plantas reais do usuário.

## Estado
- [x] F0 — `9e4ae93e` · [x] F1 — provada no app 11/10 · [x] F2 — provada no app com escrita, Ctrl+Z incluso
  · [x] F3 — `932030a5`, provada no app com escrita + PDF/DXF por teste · [x] F4 — `892681e4`, provada no
  app com escrita: banco 4×250 e Ctrl+Z 4×150 · [x] F5 — `90d58534`, kernel 0.95.0, provada no app com escrita
  (cota gravada e desfeita) + PDF/DXF por teste
- [x] F6 — `b4b0ffe1`, kernel 0.96.0, provada no app com escrita + tela/PDF por teste · [x] F7 — kernel 0.97.0,
  provada no app com escrita (fundo branco + plano FUNDO gravados e desfeitos) + PDF por teste · [x] F8 —
  kernel 0.98.0 / quant-1.28.0, provada no app com escrita (3 folhas + bandeira, Espaço, quadro, 3D) + PDF/DXF por teste · [x] F9 — provada no app com escrita (arrastar → ponto solto → Ctrl+Z) · [x] F10 — modelos glTF CC0 (Kenney), provado no spike 3D + produção servindo os .glb
- [x] F11 — `51135a40`, contorno L/U/T inteiro + aplicação em um lote; provada no app · [x] F12 — kernel 0.99.0, câmera na planta → 3D do olho → BCF em perspectiva; provada no app com escrita · [x] F13 — PNG do 3D (HD/QHD/4K) por render fora da tela; provada no app · [ ] F14.0 — comparação feita, escolha ADIADA pelo usuário (12/10) · [ ] F14.1 · [ ] F14.2 · [ ] F14.3 · [x] F15 — rastrear com Claude visão + conferência no fundo; provada no app com resposta simulada (falta a chave ANTHROPIC_API_KEY no Supabase)

## Verificação (por fase)
1. `npx vitest run __tests__/<arquivos da fase>` + goldens do kernel quando houver bump; `npm run typecheck` (ler `exit=` por grep).
2. `bash scripts/check-ui-standard.sh <tsx tocados>`; `npx vitest run __tests__/orgContextGuard.test.ts` se tocar service/org.
3. Prova no app com harness Playwright (ver `index_harness_navegador`): o roteiro do "Pronto quando" da fase, com print.
4. Push em `main` → `scripts/publicar-producao.sh "<texto da tela nova>"` → ler o check-run `ci` verde.
5. Bump de kernel → regerar e publicar o bundle da `planta-api`.
