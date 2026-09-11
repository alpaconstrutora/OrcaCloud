# Planta Inteligente › Terreno › Curvas de nível (topografia)

## Pedido original

> avalie esse PRD e inclui-lo na planta inteligente
>
> (anexo: `PRD_Modulo_Mapas_Topograficos_OPURA (1).md`, v1.0, 30/08/2026 — o
> mesmo PRD já reconciliado em
> `docs/planos/2026-08-30-reconciliacao-prd-mapas-topograficos.md`)

Sessão `5a9ec3fd-30ee-4723-b0a7-4bee36bd0996` · 2026-09-10.

## O que este pedido decide

A reconciliação de 30/08 terminou numa pergunta de portão (§7): **qual decisão
de negócio muda por causa da curva de nível?** — com duas respostas possíveis,
(a) *briefing de gleba dentro do Market Intelligence* ou (b) *implantação,
acessos e corte/aterro dentro da Planta Inteligente*. "Incluí-lo na planta
inteligente" responde **(b)**. Este plano registra a resposta e executa a
primeira fatia dela.

## Avaliação do PRD, atualizada em 10/09 (o que mudou desde 30/08)

A reconciliação de 30/08 continua valendo por inteiro (DR-01…DR-08, E-01…E-15).
Três coisas mudaram no produto desde então e mudam o tamanho do trabalho:

| Em 30/08 | Em 10/09 (lido em `origin/main` `5967f5b2`) | Consequência |
|:---|:---|:---|
| Kernel `0.8.0`, **sem** georreferência | Kernel **`0.25.0`**, com `BlueprintModel.georreferencia` (lat/long, cota, giro do norte, E/N+CRS) desde 07/09 (`f23c765f`) | A dependência que a §3.3(b) apontava como "entrega própria não orçada" **já existe**. O caminho (b) ficou alcançável. |
| Roadmap BIM na Etapa 1 | Seis etapas fechadas (`2026-09-09-status-planta-inteligente-bim.md`); corte, elevações e 3D existem | Há onde a topografia aparecer além da planta baixa: perfil no CORTE e malha no 3D (fatias futuras). |
| Nenhuma fonte de elevação medida | Medido de fora hoje: **Open-Meteo** (Copernicus GLO-90, 90 m) responde com CORS liberado; **OpenTopoData** (SRTM 30 m) responde **sem** CORS — só serve atrás de Edge Function | O adaptador remoto do navegador só pode ser o Open-Meteo hoje; SRTM 30 m exige uma function. |

O que **não** mudou e continua sendo a limitação central: **DEM público (30–90 m)
não resolve lote urbano.** Um lote de 12 × 30 m cabe dentro de UM pixel. Por
isso, dentro da Planta Inteligente, a fonte que serve de verdade é o
**levantamento do topógrafo** — os pontos cotados que todo projeto real tem —
e o DEM remoto entra como segunda fonte, para gleba, com a recusa da DR-08.

Aviso de licença (E-12, decisão jurídica pendente): a API do Open-Meteo é
gratuita para uso **não comercial**; uso comercial exige assinatura. O dado
(Copernicus DEM) é livre com atribuição. O adaptador expõe isso na proveniência
e o piloto é interno.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-10 | Quais fontes nesta fatia? | **Pontos cotados + Open-Meteo GLO-90** (navegador), com a recusa da DR-08 |
| 2026-09-10 | Onde a topografia aparece? | **Planta baixa + perfil no CORTE + malha no 3D** — as três nesta fatia |
| 2026-09-10 | O que fazer ao terminar? | **Publicar em `main` e aplicar a migration** (`db query -f`), provar de fora |

## Decisões de arquitetura (minhas, registradas)

| Data | Pergunta | Decisão | Por quê |
|---|---|---|---|
| 2026-09-10 | Onde a topografia vive? | **Fora do payload canônico**, em tabela própria por estudo, versionada e imutável (`blueprint_study_topografia`) | Mesma razão da zona urbanística e da planta de fundo: é dado do MUNDO, não geometria do desenho; gravá-la no snapshot mudaria o hash porque alguém amostrou um DEM. E é grande (milhares de cotas). |
| 2026-09-10 | Quais fontes no MVP? | **Duas**: `PONTOS_COTADOS` (levantamento, TIN) e `OPEN_METEO_GLO90` (DEM remoto) | A primeira é a que serve lote; a segunda é a única chamável do navegador hoje. Mesmo pipeline (grade → curvas) para as duas. |
| 2026-09-10 | Processar onde? | **No navegador**, em TS puro (`utils/`), com o resultado + hashes persistidos | Desvio declarado do PRD §13.5. Volume dentro do lote é pequeno (teto de 10.000 nós); Edge Function entra quando o SRTM 30 m entrar (é a mesma hora em que uma function passa a ser necessária). Reprodutibilidade fica garantida pelos hashes de entrada e resultado (CA-010), não pelo lugar onde rodou. |
| 2026-09-10 | Recusa por resolução (DR-08)? | **Sim**: fonte remota é recusada quando o lado menor do lote tem menos de **3 células** da fonte | Com GLO-90 isso é 270 m. Abaixo disso a curva é ficção gráfica. A mensagem ensina o caminho: pontos cotados. |
| 2026-09-10 | Unidade | Metros para cota, mm inteiro no desenho. Sem pés (DR-06). | |
| 2026-09-10 | Exportação | **SVG e CSV** com fonte, data, algoritmo e o aviso do RF-020 embutidos. KML/DXF fora (E-03). | |
| 2026-09-10 | Imutabilidade | A tabela **não concede UPDATE** a `authenticated` — versão gerada não se edita, só se gera outra ou se apaga | RN-005 no nível do schema. |

## Plano

### F1 — Motor puro (`utils/blueprintTopografia.ts`)
**O que muda:** grade regular sobre a caixa do lote, marching squares com
`nodata`, união de segmentos, recorte no anel do lote, níveis e sugestão de
equidistância (RF-009), estatísticas (RF-013), TIN (Bowyer–Watson) para pontos
cotados, conversão local→lat/long pela georreferência, hashes de entrada e
resultado, recusa por resolução.
**Como sei que terminou:** `__tests__/blueprintTopografia.test.ts` com as
fixtures do PRD §20.2 — plano (zero curvas), rampa (paralelas), cone (anéis
fechados concêntricos), sela, `nodata`, lote côncavo, determinismo do hash,
recusa de lote pequeno com DEM.

### F2 — Fontes de elevação (`utils/blueprintElevacaoProvedores.ts`)
**O que muda:** registro de fontes com proveniência (RF-007): resolução,
referência vertical, dataset, licença, atribuição, classe. Adaptador Open-Meteo
em lotes de 100 coordenadas, com `fetch` injetável.
**Como sei que terminou:** teste com `fetch` falso prova o particionamento, a
ordem das cotas e o erro seguro em falha do provedor (CA-009).

### F3 — Persistência (`aplicar_20270921000005_blueprint_topografia.sql`, `services/blueprintTopografiaService.ts`, `types/blueprint.ts`)
**O que muda:** tabela versionada e imutável, FK composta ao estudo, RLS
`is_org_member`, sem UPDATE. Serviço `listar/criar/apagar`.
**Como sei que terminou:** migration passa em `segurancaMigrations.test.ts` e
`migrationsPrefixo.test.ts`; aplicada com `db query -f` e conferida de fora.

### F4 — Hook (`hooks/useBlueprintTopografia.ts`)
**O que muda:** estado da fonte, pontos cotados, equidistância, qualidade;
`gerar()` orquestra grade → fonte → curvas → hashes → persistir; lista de
versões; degrada sem a migration como a zona urbanística.
**Como sei que terminou:** editor abre sem a tabela e sem erro; com a tabela,
gerar cria versão e recarregar a traz de volta.

### F5 — Painel (`components/blueprint/PainelTopografia.tsx`) + canvas
**O que muda:** seção "Curvas de nível" dentro do painel Terreno (slot, como a
zona): fonte, pontos cotados (tabela §6.9), equidistância com sugestão,
qualidade, Gerar, estatísticas, proveniência, aviso RF-020, versões, exportar.
Canvas desenha curvas (mestras mais grossas, com cota) e pontos cotados; toggle
"Curvas de nível" no menu Exibir.
**Como sei que terminado:** `check-ui-standard.sh` limpo; conferido por print no
app; a curva clicada mostra a cota (RF-012) — fatia posterior se não couber.

### F6 — Exportação (`utils/blueprintTopografiaExport.ts`)
**O que muda:** SVG (curvas, limite, cotas nas mestras, título, escala, norte
quando há giro, aviso e proveniência em `<metadata>` e em texto) e CSV da grade
(RF-018). Download pelo mesmo `baixarArtefatos` das outras exportações.
**Como sei que terminou:** teste abre o SVG e o CSV e encontra fonte, data,
algoritmo e o aviso.

### F7 — Perfil do terreno no CORTE (`utils/blueprintCorte.ts`, `ElevationCanvas.tsx`)
**O que muda:** `projetarCorte` recebe opcional `terreno: { cotaEmM(p), cotaZeroM }`
(dado do mundo entra como parâmetro, nunca no modelo) e devolve
`perfilDoTerreno` — pedaços `{u,v}` amostrados ao longo do plano de corte, com o
`u` ABSOLUTO (armadilha nº 1 do plano de 05/09) e a inversão exata
`p = u·base.u + (corte.a·d)·base.d`. `nodata` quebra a polilinha, não interpola.
`bboxDoCorte` inclui o perfil; **`linhaDoSolo` continua sendo o piso**. O canvas
desenha o perfil logo após a linha do solo, com hachura de terra até `vMin`.
`cotaZeroM = georreferencia.elevacaoM`; sem ela, a cota média do levantamento,
com aviso.
**Como sei que terminou:** teste em `blueprintCorte.test.ts` com um plano
inclinado conhecido: o `v` do perfil nos extremos bate com a conta à mão; sem
terreno, a projeção é byte a byte a de antes.

### F8 — Malha do terreno no 3D (`utils/blueprintTopografia.ts:malhaDaGrade`, `Blueprint3DViewer.tsx`, `blueprint3dEnquadramento.ts`)
**O que muda:** malha indexada em números crus (sem `THREE`, testável fora do
`@ts-nocheck`), em coordenadas de mundo SEM negar `y` (padrão `geometriaDaAgua`),
células com `nodata` sem triângulo, decimada a ≤ 20 mil triângulos. O viewer
troca o plano chato pela malha quando há versão selecionada; a grade do chão
desce abaixo do ponto mais baixo. `enquadramentoDoModelo` ganha o relevo e
passa a mover `topo/fundo` (hoje o lote só toca X/Z).
**Como sei que terminou:** caso novo em `blueprint3dEnquadramento.test.ts` (uma
colina de 8 m entra na caixa); teste de `malhaDaGrade` (contagem de triângulos,
`nodata` não gera triângulo, `minY/maxY`).

## Fora desta fatia (declarado)

- Walk acompanhar o relevo (`Percorrer` força o olho a 1,6 m do zero) e sombra
  numa malha de 300 m — próxima fatia.
- SRTM 30 m / NASADEM via Edge Function `terrain-elevation` (com gate próprio,
  REGRA #7 pergunta 3) — entra quando a licença dos provedores for decidida.
- Corte e aterro, declividade, perfil por linha, KML/DXF, aprovação técnica,
  notificações — Fase 2/3 do PRD.
- Geometria em `commercial_properties` (§3.3a da reconciliação) — fundação de
  outro módulo.
- Clicar numa curva para ver a cota — a cota já vai escrita nas mestras.

## Estado

- [x] F1 — motor puro + testes (`utils/blueprintTopografia.ts`, 35 casos)
- [x] F2 — fontes de elevação + teste com fetch falso (8 casos)
- [x] F3 — migration + serviço + tipo
- [x] F4 — hook (`hooks/useBlueprintTopografia.ts`)
- [x] F5 — painel + canvas + toggle "Curvas de nível" em Exibir
- [x] F6 — exportação SVG/CSV + teste (7 casos)
- [x] F7 — perfil no corte (`perfilDoTerreno`, 5 casos)
- [x] F8 — malha no 3D + enquadramento (3 casos)
- [x] Suíte (251 arquivos, 3.665 testes, 0 falhas), typecheck limpo, `check-ui-standard.sh` limpo nos 7 `.tsx` tocados
- [x] Conferência por print — harness `docs/spikes/topografia/` (componentes REAIS: canvas da planta + painel, `ElevationCanvas` no corte, `Blueprint3DViewer`), 5 vistas sem erro de console. Dois achados só do print: o campo de cota em `w-14` cortava "100,60" (→ `w-16`) e o placeholder da equidistância saía "0.5" (→ "0,5"). ⚠️ Não foi dirigido o app COM LOGIN (a senha do agente de leitura não fica gravada) — ver "Verificação" abaixo para o roteiro.
- [x] Migration aplicada (`db query -f`) e conferida de fora — ⚠️ achado: os privilégios padrão do Supabase davam ALL a `anon`/`authenticated`; `REVOKE … FROM PUBLIC` não os alcança. Corrigido na própria migration (`REVOKE … FROM PUBLIC, anon, authenticated`) e reaplicado: `authenticated` = SELECT/INSERT/DELETE, `anon` = nada
- [x] Publicado — commit `af81229b` em `main` (10/09/2026); `conferir-producao.sh "Curvas de nível"` achou o texto no bundle servido (o domínio já servia `12b27bd`, de outra frente, que o contém)

### Dirigido em PRODUÇÃO com a conta de leitura (10/09/2026, noite)

Script Playwright (senha só por variável de ambiente): criou um estudo, desenhou
o lote pelo gesto (4 cliques + fechamento no 1º vértice), "Usar vértices do
lote", 4 cotas, Gerar → v1 (5 curvas a 0,50 m, 1.230 amostras, 56,32 m²),
`POST 201` em `blueprint_study_topografia`; recarregou → v1 voltou (`GET 200`);
3D com o terreno ligado mostrou a malha inclinada; apagar pela tela →
`DELETE 204`. Zero erros de console além do ruído conhecido da Central de
Controle. Os três estudos de teste foram apagados por SQL depois.

**Achado que só a produção pegou:** estudo SÓ com lote (sem parede) — a vista
de corte dizia "Nada para mostrar — desenhe paredes" por cima do perfil do
terreno. O harness tinha casa e não viu. Corrigido na frente
`corte-terreno-sem-paredes`: a guarda de vazio do `ElevationCanvas` passa a
considerar `perfilDoTerreno` (teste `ElevationCanvasCorteSoTerreno.test.tsx`).

⚠️ Durante a corrida, um deploy no meio da sessão trocou o hash do chunk
`Blueprint3DViewer` e o `import()` preguiçoso deu 404 — página aberta antes do
deploy não acha o chunk novo. Não é defeito deste módulo, mas é o sintoma que
um usuário com a aba aberta há horas vai ver ao abrir o 3D pela primeira vez.

### Pendências desta fatia (declaradas)

- Walk do 3D acompanhar o relevo; sombra em malha grande.
- SRTM 30 m / NASADEM via Edge Function `terrain-elevation` — depende da decisão de licença (E-12).
- Cota ao clicar na curva (RF-012) — a cota já vai escrita nas mestras.

---

# Pedido posterior — 2026-09-10: fase 2

## Pedido original

> Vamos implementar 1,3 e 4

(sobre a lista de pendências: 1 = walk do 3D acompanhar o relevo + sombras;
3 = cota ao clicar na curva; 4 = o que ficou fora da fatia 1.)

Sessão `5a9ec3fd-30ee-4723-b0a7-4bee36bd0996` · 2026-09-10.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-10 | Quais partes do item 4? | **Declividade por faixas, corte e aterro preliminar, exportação KML e DXF.** Aprovação técnica/notificação e geometria em `commercial_properties` ficam fora. |
| 2026-09-10 | Superfície de projeto do corte e aterro? | **Um platô no envelope** (ou no lote, sem recuos), cota única digitada, com sugestão da cota que equilibra corte e aterro. |

## Plano — fase 2

### F9 — Análises puras (`utils/blueprintTopografiaAnalises.ts`)
**O que muda:** declividade por célula (gradiente central, %) e faixas 0–5 / 5–15 /
15–30 / >30 % com área por faixa dentro do lote; terraplenagem preliminar por
célula (platô numa cota × terreno natural → corte, aterro, saldo, alturas
máximas) e cota de equilíbrio; `curvaSob` (índice da curva a uma tolerância).
**Como sei que terminou:** testes — plano dá 0 %; rampa de 0,5 m/m dá 50 %
em toda célula (faixa >30 %); platô na cota de equilíbrio dá corte ≈ aterro;
platô acima do máximo dá só aterro com volume = Δ × área; `curvaSob` acha a
curva certa e recusa fora da tolerância.

### F10 — Walk no relevo e sombras (`utils/blueprint3dWalk.ts`, `blueprint3dEnquadramento.ts`, viewer)
**O que muda:** `alturaDoOlho(chaoM)`; `Percorrer` recebe `alturaDoChao(x, z)`
e põe a câmera a 1,6 m do CHÃO, por quadro; `sombraDaCena(spread)` dimensiona a
câmera de sombra da luz pelo tamanho da cena; a malha do relevo passa a
projetar sombra.
**Como sei que terminou:** testes das duas funções puras; no harness 3D a casa
projeta sombra no relevo.

### F11 — Cota ao clicar na curva (canvas + painel)
**O que muda:** no modo Selecionar, clique que não acerta peça nenhuma mas
acerta uma curva destaca a curva e mostra a cota e o comprimento no painel
(e um rótulo no ponto clicado). Escape/clique fora limpa.
**Como sei que terminou:** teste do `curvaSob`; print do harness com a curva
destacada.

### F12 — Declividade e corte/aterro na tela
**O que muda:** toggle "Declividade" em Exibir pinta as células por faixa (sob
as curvas) e o painel mostra a legenda com área por faixa; seção "Corte e
aterro" no painel: base (envelope/lote), cota do platô com sugestão de
equilíbrio, volumes, hachura de corte/aterro na planta e linha do platô no
corte. Premissa persistida em `blueprint_study_terraplenagem` (uma por estudo,
upsert, degrada sem migration).
**Como sei que terminou:** migration passa nos testes de segurança/prefixo e é
aplicada e conferida de fora; prints do harness (planta com faixas; planta com
hachura; corte com o platô).

### F13 — KML e DXF
**O que muda:** `kmlDasCurvas` (LineString por curva em lat/long com cota,
pontos cotados como Placemark, aviso na descrição — exige georreferência);
`dxfDaTopografia` (arquivo próprio em mm, camadas `TOPO-CURVA`,
`TOPO-MESTRA`, `TOPO-PONTO`, `TOPO-TEXTO`) e as MESMAS camadas dentro do DXF
da prancha (`OpcoesDxf.topografia`), para as curvas caírem sobre a planta no
CAD sem alinhar nada à mão.
**Como sei que terminou:** testes abrem o KML e o DXF e acham camadas,
coordenadas e aviso; botão KML desabilitado sem georreferência, com o motivo.

## Estado — fase 2

- [x] F9 — análises puras + testes (`utils/blueprintTopografiaAnalises.ts`, 10 casos)
- [x] F10 — walk no relevo (`alturaDoOlho`, `Percorrer` com `alturaDoChao`) + sombras (`sombraDaCena`; relevo projeta sombra)
- [x] F11 — cota ao clicar (`curvaSob` no canvas, rótulo no ponto, faixa no painel com Limpar)
- [x] F12 — declividade (toggle em Exibir, células pintadas, legenda com áreas) e corte/aterro (base, cota com equilíbrio, volumes, hachura na planta, platô no corte); `blueprint_study_terraplenagem` com hook que grava com respiro de 500 ms
- [x] F13 — KML (exige georreferência; botão explica quando não há) e DXF (arquivo próprio + camadas `TOPO-*` no DXF da prancha via `PainelVersoes`)
- [x] Suíte (259 arquivos, 3.722 testes, 0 falhas), typecheck, `check-ui-standard.sh` limpo nos 7 `.tsx`; harness com 8 vistas sem erro. Achados do print: os 4 botões de exportação não cabiam numa linha (→ `flex-wrap`, "CSV"); a cota do platô calculada saía com 10 casas (→ ao centímetro)
- [x] Migration aplicada e conferida de fora (`authenticated` = SELECT/INSERT/UPDATE/DELETE, `anon` = nada)
- [x] Publicado — `bfa3feb0` em `main` (10/09/2026), `conferir-producao.sh "Corte e aterro"` provou o domínio servindo o commit

### Pendências da fase 2 (declaradas)

- Talude, empolamento e compactação no corte/aterro — é projeto, não viabilidade.
- Perfil ao longo de uma linha livre (RF-013 pós-MVP); mapa hipsométrico.
- Aprovação técnica e notificação; geometria em `commercial_properties` (fora por decisão).

---

# Pedido posterior — 2026-09-10: fase 3

## Pedido original

> Implementar :
> Talude, empolamento e compactação no corte e aterro (é projeto, não viabilidade).
> Perfil ao longo de uma linha livre e mapa hipsométrico.

Sessão `5a9ec3fd-30ee-4723-b0a7-4bee36bd0996` · 2026-09-10.

## Decisões (minhas, registradas — a confirmar)

| Pergunta | Decisão | Por quê |
|---|---|---|
| Como o talude entra na conta? | Superfície de projeto FORA do platô: na cota do platô ± distância à borda ÷ h (talude 1:h), para cada célula; corte onde o terreno está acima dela, aterro onde está abaixo, nada onde o talude já encontrou o chão | É a geometria real do offset de talude, célula a célula, sem malha de projeto |
| Empolamento e contração | Corte em banco × (1 + empolamento %) = volume solto (transporte); aterro compactado × (1 + contração %) = banco necessário; saldo em banco = corte − banco necessário → bota-fora (sobra) ou empréstimo (falta) | Convenção corrente de orçamento de terraplenagem |
| Padrões | Talude de corte 1:1,5 · aterro 1:1,5 · empolamento 25 % · contração 15 %, editáveis e gravados na premissa | Valores de solo comum; a tela diz que são premissa |
| A "linha livre" do perfil | É a linha do **Corte** (ferramenta que já existe: dois cliques em qualquer direção). O perfil é a leitura em gráfico — distância × cota absoluta — com estatísticas | Não inventar um gesto novo (memória: família nova desenha ≠ alcança); a função pura aceita polilinha para o futuro |
| Hipsometria | 8 classes de cota em intervalos iguais entre mínimo e máximo dentro do lote, rampa verde→vermelho; exclusiva com a declividade no Exibir | Duas pinturas sobrepostas não se leem |

## Plano — fase 3

### F14 — Talude, empolamento e contração (`blueprintTopografiaAnalises.ts`, corte, painel, migration)
**O que muda:** `terraplenagemComTalude` (interior do platô como antes + faixa de talude fora dele), `balanço de materiais` (solto, banco necessário, bota-fora/empréstimo); colunas `talude_corte_h`, `talude_aterro_h`, `empolamento_pct`, `contracao_pct` em `blueprint_study_terraplenagem`; a linha do platô no corte ganha os taludes até encontrar o terreno; hachura da faixa de talude na planta.
**Como sei que terminou:** testes — platô num terreno plano acima dele: talude de corte fora da borda com volume esperado; empolamento 25 % dá solto = 1,25 × banco; contração 15 % dá banco necessário = 1,15 × aterro; migration nos testes de segurança/prefixo, aplicada e conferida.

### F15 — Perfil altimétrico (`perfilAoLongo`, `estatisticasDoPerfil`, `svgDoPerfil`, `csvDoPerfil`, painel)
**O que muda:** seção "Perfil" no painel: escolhe um corte, mostra gráfico distância × cota, comprimento, cotas de início/fim, desnível, subida/descida acumuladas, declividade média e máxima; exporta CSV e SVG.
**Como sei que terminou:** rampa conhecida dá declividade média exata; nodata quebra o gráfico; print do harness com o gráfico.

### F16 — Mapa hipsométrico (`hipsometriaDaGrade`, canvas, painel)
**O que muda:** toggle "Hipsométrico" em Exibir pinta as células por classe de cota; legenda com faixa e área por classe.
**Como sei que terminou:** rampa de 10 m em 8 classes dá 1/8 da área em cada; print do harness.

## Estado — fase 3

- [x] F14 — `terraplenagemComTalude` (faixa de talude fora do platô, balanço banco/solto, bota-fora/empréstimo), 4 parâmetros gravados (`aplicar_20270921000007`, aplicada e conferida), taludes no corte, faixa mais clara na planta, "Talude e material" no painel
- [x] F15 — `perfilAoLongo`/`estatisticasDoPerfil` (polilinha, nodata quebra), `svgDoPerfil`/`csvDoPerfil`, seção "Perfil altimétrico" no painel (corte escolhido, gráfico, estatísticas, exportação)
- [x] F16 — `hipsometriaDaGrade` (8 classes), toggle "Hipsométrico" exclusivo com a declividade, legenda com áreas
- [x] Suíte (263 arquivos, 3.742 testes, 0 falhas), typecheck, `check-ui-standard.sh` limpo; harness com 10 vistas sem erro
- [x] Publicado e provado — `c1e55212` em `main` (11/09/2026, 00h), `conferir-producao.sh "Talude e material"` achou o texto no bundle servido. Antes disso, `7596600a` foi para `main` mas **o build da Vercel reprovou** duas vezes: `scripts/check-xss-sinks.sh` (roda só dentro do `verificar:build`) recusa `dangerouslySetInnerHTML` sem `sanitizeHtml()` — o gráfico do perfil era injetado assim. Um laço encadeado marcou "provado" antes da prova passar; esta linha corrige o registro. Correção: o gráfico vai como `<img>` com data URL de SVG (não é sink). Lição: rodar `npm run verificar:build` antes de empurrar — typecheck e suíte não cobrem essa trava.

### Achados desta fase (só a medição pegou)

- **A caixa do corte é vazia num estudo só com lote**: a amostragem do platô e do perfil ia de −2 a 2 m em volta da origem e o talude nunca era percorrido. Agora o intervalo cobre o anel do platô, os vértices do lote e, com talude, 30 m de alcance a mais.
- **Início e fim do perfil eram as pontas da linha** — que quase sempre caem fora do lote — e desnível/declividade saíam vazios. Passaram a ser o primeiro e o último ponto COM cota, e a declividade média é sobre esse trecho.
- A altura máxima de aterro fica na célula mais BAIXA (o teste esperava a mais alta).
- Rótulo final do eixo X do gráfico cortado na borda → margem direita maior.

### Pendências da fase 3 (declaradas)

- Banqueta, canaleta e via de serviço no talude; talude por trecho (hoje um só h por lado).
- Perfil por polilinha desenhada (a função já aceita; a tela usa a linha do corte).
- Hipsometria com classes por equidistância (hoje intervalos iguais).

---

# Pedido posterior — 2026-09-10/11: fase 4

## Pedido original

> IMPLEMENTAR AS 3 PENDENCIAS

(as três da fase 3: banqueta/canaleta/via de serviço e talude por trecho;
perfil por polilinha desenhada; hipsometria por equidistância.)

Sessão `5a9ec3fd-30ee-4723-b0a7-4bee36bd0996` · 2026-09-11.

## Decisões (minhas, registradas — a confirmar)

| Pergunta | Decisão | Por quê |
|---|---|---|
| Banqueta | Patamar horizontal de largura `b` a cada lance de altura `hL` no talude (padrões 2 m a cada 6 m). A altura do talude a uma distância `d` da borda vem do perfil em degraus; a banqueta entra na área e como canaleta de banqueta | É a geometria de norma (DNIT/ABNT) para talude alto; um só parâmetro por eixo |
| Via de serviço | Faixa de largura `w` (padrão 0) em volta do platô, NA cota do platô, antes de o talude começar; entra nos volumes do platô e na área | É a "berma de pé" que o orçamento pede; modelar uma rampa de acesso é projeto viário |
| Canaleta | Metros lineares: pé de corte (borda do platô onde o vizinho é talude de corte), crista de aterro (idem, aterro) e banquetas (área de banqueta ÷ largura) | O que o orçamentista quantifica; sem traçado de drenagem |
| Talude por trecho | Por ARESTA do platô: cada lado pode ter o próprio 1:h de corte e de aterro; vazio herda o padrão. A célula usa a aresta mais próxima | Trecho = lado do platô; é assim que se fala ("o talude dos fundos a 1:2") |
| Perfil desenhado | Ferramenta **Perfil** na barra: cliques encadeados, termina clicando no último vértice ou com duplo clique, Esc cancela; UMA linha por estudo, gravada na premissa; origem do perfil no painel: Corte ou Linha desenhada | É a "linha livre" do PRD sem tocar no kernel (a linha não é conteúdo do desenho) |
| Hipsometria por equidistância | Modo "iguais (8)" ou "por equidistância" com intervalo digitado (padrão = a equidistância da versão); mais de 12 classes multiplica o intervalo | Classes em cotas redondas é o que a prancha topográfica usa |

## Estado — fase 4

- [ ] F17 — banqueta, via, canaleta, talude por aresta (motor, corte, painel, migration)
- [ ] F18 — ferramenta Perfil e perfil por linha desenhada
- [ ] F19 — hipsometria por equidistância
- [ ] Suíte, typecheck, `check-ui-standard.sh`, **`npm run verificar:build`**, prints; migration aplicada; publicado e provado

## Verificação

1. Desenhar um lote fechado (ferramenta Terreno).
2. Fonte **Pontos cotados**: "Usar vértices do lote", digitar cotas diferentes
   (ex.: 100, 101, 103, 102), Gerar → curvas paralelas atravessando o lote,
   estatísticas coerentes (mín/máx = as cotas digitadas).
3. Fonte **Open-Meteo**: sem georreferência → aviso; com lat/long e lote pequeno
   → recusa com a mensagem da DR-08; com lote grande (≥ 270 m) → gera.
4. Gerar duas vezes com os mesmos parâmetros → mesmo `hash_resultado`.
5. Recarregar a página → versão volta; escolher outra versão troca as curvas.
6. Exportar SVG e CSV → abrir fora e achar o aviso e a fonte.
7. Menu Exibir › "Curvas de nível" desliga a camada.
