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

**F2 — Ambiente com um clique** · `BlueprintCanvas.tsx`, `BlueprintEditor.tsx`, `useBlueprintEditor.ts`
- Muda: ferramenta `ambiente`. No movimento do mouse, o realce da face sob o cursor vem de `ambientesDoNivel` (~2046) + `pointInPolygon(ring)` sem os `holes`, como faz `aplicarEtiquetas`. O clique emite `NameSpace` (ou `PlaceSpaceLabel` com `at` = ponto clicado) e abre a edição do nome no lugar, com o tipo de ambiente sugerido por `usoDoNome`.
- Pronto quando: teste do acerto (ponto em ambiente com furo não acerta o furo); no app, clicar em 3 ambientes os nomeia e um Ctrl+Z desfaz o último.

**F3 — Separador de ambiente na aba Arquitetura** · `BlueprintEditor.tsx` (ribbon), `BlueprintCanvas.tsx`, `utils/blueprintExport.ts`, `utils/blueprintDxf.ts`
- Muda: botão "Separador de ambiente" na Arquitetura, que reaproveita `tool:'divisa'` com `kind:'DIVISA'` (sem bump). Traço próprio (tracejado fino) distinto de divisa de terreno; aparece no PDF e numa camada DXF própria.
- Pronto quando: teste: um retângulo + separador gera 2 spaces com áreas que somam o total; no app, a sala vira "Entrada" + "Estar" e o separador sai no PDF.

**F4 — Conta-gotas (Modificar › Igualar propriedades)** · kernel `commands.ts`/`model.ts` (**bump 0.95**), `utils/blueprintIgualar.ts` (novo, puro), `BlueprintEditor.tsx` (aba Modificar ~12861)
- Muda: comando novo `SetWallHeight`. Função pura `comandosParaIgualar(modelo, refId, alvoIds, quais)` cobre:
  - parede → espessura, camadas, altura, cortina/brise (reaproveitar a lógica de `mudarEspessura`/`mudarCamadas` com `deslocamentoParaManterFace`);
  - abertura → `SetOpeningKind`/`Size`/`Esquadria`;
  - ambiente → `SetSpaceLabelProps` (acabamentos, tipo, departamento);
  - anotação → estilo.

  Gesto: com a seleção feita, "Igualar" pede o clique na referência; checkboxes dizem o que copiar. Tudo num `runBatch`.
- Pronto quando: teste: 5 paredes recebem as camadas da referência e a face de referência não se move; tipos diferentes declaram "ignorado: tipo diferente"; no app, um Ctrl+Z desfaz as 5.

**F5 — Cota linear manual e contínua** · kernel (**bump**): `TipoDeAnotacao += 'COTA_LINEAR'` (`pontos[]`, `afastamentoMm`, `modo: 'simples'|'continua'`, `total?: boolean`); `BlueprintCanvas.tsx`, `blueprintExport.ts`, `blueprintDxf.ts`
- Muda: ferramenta Cota, com cliques encadeados e duplo clique para fechar (gesto da `'anotacao'`, `BlueprintCanvas.tsx:10164`) e OSNAP. O desenho reaproveita `desenharCadeia`/`LINHA_DE_CHAMADA`/`ondeFicaORotulo` nas três saídas.
- Pronto quando: golden do kernel; teste do total = soma dos trechos; no app, cota contínua de 4 pontos sai igual em tela, PDF e DXF (abrir o DXF).

### Bloco 2 — desenho técnico mais rico

**F6 — Biblioteca de padrões de hachura** · `utils/blueprintPadroes.ts` (novo, generaliza `tramaDoPiso`), kernel (**bump**): `padraoVisual {padrao, escala, rotacaoGraus}` em `AcabamentosDoAmbiente` (`model.ts:889`) e na camada de parede/material
- Muda: padrões = os 8 atuais + espinha de peixe, tijolo, concreto, isolamento, azulejo, terra/brita. O padrão é escolhido no ambiente e na camada; a humanizada continua adivinhando só quando não há escolha. Desenha na planta técnica (canvas `:3696`, PDF `:516`) e nas camadas de parede (`:4034`).
- Pronto quando: teste de geração de linhas por padrão/escala/rotação (contagem e ângulo); no app, banheiro em azulejo escala 3 e parede externa tijolo/isolamento/concreto, iguais em tela e PDF.

**F7 — Anotação de forma com preenchimento** · kernel (**bump**): `HACHURA` ganha `padraoVisual`, `opacidade`, `traco {tracoMm, espacoMm}`, `ordem`; modo retângulo; `BlueprintCanvas.tsx`, `blueprintExport.ts`, `PainelAnotacaoSelecionada.tsx`
- Muda: retângulo em 2 cliques; "Trazer para frente / Enviar para trás" mexem em `ordem`; fundo sólido opaco disponível.
- Pronto quando: golden; teste de ordenação; no app, tapete hachurado sobre o piso e atrás do sofá, igual no PDF.

**F8 — Esquadria configurável** · kernel (**bump**): `Opening.configuracao? {mecanismo: ABRIR|CORRER|BASCULANTE|MAXIM_AR|PIVOTANTE|FIXA|CAMARAO, folhas: {mecanismo, larguraRel}[], bandeira?: {alturaMm, mecanismo}}`; entra em `assinaturaDaEsquadria` (`model.ts:653`); canvas `:4171`; 3D `Blueprint3DViewer.tsx:319` (caixilho + folhas); `PainelParedeSelecionada.tsx`
- Muda: editor de folhas (adicionar/remover/trocar mecanismo); porta de 2 folhas (fecha o item aberto em `2026-08-14-girar-espelhar-porta.md:102`); Espaço com a abertura sob o cursor gira o sentido (`FlipOpening`). Sem `configuracao`, o desenho atual não muda (compatibilidade).
- Pronto quando: golden; teste de quantitativo (2 janelas iguais em tamanho e diferentes em folhas = 2 linhas); no app, janela 3 folhas (fixa/abrir/correr) + bandeira basculante, no 2D, no 3D e no quantitativo.

**F9 — Biblioteca de móveis arrastável** · `components/blueprint/PainelBibliotecaComponentes.tsx` (novo), `BlueprintCanvas.tsx` (drop), `BlueprintEditor.tsx`
- Muda: grade com miniatura por tipo/conjunto, busca e família; `dataTransfer` com `tipoId`; o drop converte para mm (Y espelhado) e chama `adicionarComponente(at)`. Símbolos 2D por tipo mais fiéis. Opção de exibir mobiliário na planta técnica do PDF.
- Pronto quando: teste da conversão tela→mm no drop; no app, arrastar sofá e cama os insere no ponto solto, e um Ctrl+Z desfaz.

**F10 — Modelos glTF dos componentes** · `FichaDoComponente` (`model.ts:1736`) ganha `modelo3d?` (fora do hash, como o `uid`); bucket `blueprint-modelos-3d` + migration (REGRA #7); `utils/blueprintModelos3d.ts`; `Blueprint3DViewer.tsx:1387`
- Muda: curadoria de modelos **CC0** (fonte e licença registradas por arquivo, em `docs/planos/…` + tabela de créditos); `useGLTF` com escala para a ficha (largura × profundidade × altura); fallback para a caixa se faltar ou falhar; peso máximo por modelo. O IFC continua com a caixa.
- Pronto quando: teste do encaixe de escala; no app, a sala mobiliada mostra modelos, um tipo sem modelo mostra caixa, e a aba Network mostra o cache dos modelos.

### Bloco 3 — IA e visualização

**F11 — Gerar planta dentro de um contorno desenhado** · `utils/blueprintGerador.ts`, `TelaGerador.tsx`, `BlueprintEditor.tsx` (~5613–5690)
- Muda: o envelope pode vir de um polígono selecionado (anotação HACHURA/LINHA fechada ou ambiente). `maiorRetanguloInscrito` é trocado por uma decomposição do polígono ortogonal em retângulos, com as faixas recortadas contra o polígono, e o aviso de área perdida vira percentual. `comandosDeGeometria` passa para `AddWalls`/`AddOpenings`/`PlaceSpaceLabels` (como `blueprintPlantaDaUnidade.ts:581`). O pedido em texto reaproveita o PainelIa/`planta-ia`.
- Pronto quando: teste: contorno em L de 161 m² com "3 quartos" usa ≥ 90 % da área e não gera parede fora do polígono; teste da contagem de comandos (lote); no app, desenhar o L, digitar e receber a planta editável.

**F12 — Câmera** · kernel (**bump**): família `Camera {posicao, alvo, alturaOlhoMm, focalMm, nome}`; ferramenta de 2 cliques no 2D; `Blueprint3DViewer.tsx` (Canvas `:2242`, `Percorrer`); `utils/blueprintBcf.ts` (`PerspectiveCamera`)
- Muda: o símbolo da câmera com cone no 2D; prévia 3D do ponto de vista; lista de vistas salvas; mexer na janela atualiza a prévia; o BCF exporta a câmera em perspectiva quando há uma.
- Pronto quando: golden; teste de conversão focal→fov; no app, a câmera na sala abre o 3D daquele ponto e o BCF reabre a vista no viewer.

**F13 — Captura da imagem do 3D** · `Blueprint3DViewer.tsx` (`preserveDrawingBuffer` só na captura, `gl.domElement.toBlob`)
- Muda: "Exportar imagem" da câmera ativa em PNG, na resolução escolhida; pode entrar como imagem na prancha.
- Pronto quando: no app, o PNG baixado corresponde à câmera e não sai preto (o teste é abrir o arquivo).

**F14 — Render por IA** · Edge Function `planta-render` (nova, padrão `planta-ia`: CORS, auth, chave só no servidor, REGRA #7 pergunta 3), `services/blueprintRenderService.ts`, tabela `blueprint_renders` + bucket (migration, RLS por org), `PainelRender.tsx`
- **F14.0 (portão):** comparar 2–3 fornecedores de imagem que aceitem imagem de entrada e edição por máscara (preço por imagem, latência, termos de uso comercial e de dados). O usuário escolhe; a decisão é registrada na tabela de decisões. Sem isso, F14.1+ não começa.
- F14.1: captura (F13) + descrição derivada do modelo (ambiente, acabamentos, móveis) + prompt do usuário + "sem estilo" → imagem gravada por estudo/câmera.
- F14.2: edição por prompt ("piso espinha de peixe clara") sobre a imagem anterior.
- F14.3: segmentar/substituir elemento. As máscaras vêm do **nosso** modelo (render de IDs por objeto na mesma câmera), sem depender de segmentação do fornecedor. Também trocar por imagem enviada.
- Limite de uso por organização (contador na tabela) e custo visível antes de gerar.
- Pronto quando: REGRA #7 respondida no plano; função recusa sem JWT (provar com curl); no app, câmera → render → editar piso → trocar o rack, imagens persistidas e reabríveis.

**F15 — Rastrear planta de imagem (Claude visão)** · Edge Function (estender `planta-ia` com modo `rastrear` ou nova `planta-rastrear`), `PainelGerarParedes.tsx`, `utils/blueprintVetor.ts`
- Muda: imagem/PDF escaneado sobre a planta de fundo **calibrada** (a escala vem da calibração, não da IA) → JSON de segmentos de parede, aberturas e nomes → mesmo pós-processamento do vetorizador (fechar vãos, T, espessuras) → prévia sobreposta → o usuário confirma → `AddWalls`/`AddOpenings`/`PlaceSpaceLabels`. Nada é gravado sem confirmação.
- Pronto quando: teste do pós-processamento com uma resposta JSON fixa; no app, um escaneado de exemplo gera paredes alinhadas ao fundo e o resultado mostra quantas paredes foram aceitas e quantas descartadas.

## Estado
- [ ] F0 · [ ] F1 · [ ] F2 · [ ] F3 · [ ] F4 · [ ] F5
- [ ] F6 · [ ] F7 · [ ] F8 · [ ] F9 · [ ] F10
- [ ] F11 · [ ] F12 · [ ] F13 · [ ] F14.0 · [ ] F14.1 · [ ] F14.2 · [ ] F14.3 · [ ] F15

## Verificação (por fase)
1. `npx vitest run __tests__/<arquivos da fase>` + goldens do kernel quando houver bump; `npm run typecheck` (ler `exit=` por grep).
2. `bash scripts/check-ui-standard.sh <tsx tocados>`; `npx vitest run __tests__/orgContextGuard.test.ts` se tocar service/org.
3. Prova no app com harness Playwright (ver `index_harness_navegador`): o roteiro do "Pronto quando" da fase, com print.
4. Push em `main` → `scripts/publicar-producao.sh "<texto da tela nova>"` → ler o check-run `ci` verde.
5. Bump de kernel → regerar e publicar o bundle da `planta-api`.
