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

- Walk do 3D acompanhar o relevo; sombra em malha grande. **Resolvidas na fase 2 (F10)**; o degrau ao sair do lote, na fase 14.
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

- [x] F17 — `superficieDeProjeto` (via na cota do platô → talude em degraus com banqueta por lance → terreno), `taludeDaAresta` (1:h por lado, vazio herda), canaletas em m lineares (pé de corte, crista de aterro, banqueta); a mesma superfície no corte (`plato.parametros`); painel "Talude e material" com banqueta/via e a tabela por lado; `aplicar_20270921000008` (5 colunas, aplicada e conferida: `altura_do_lance_m`, `largura_da_banqueta_m`, `largura_da_via_m`, `talude_por_aresta`, `perfil_polilinha`)
- [x] F18 — ferramenta **Perfil** na barra (ao lado do Corte): cliques encadeados, termina no último vértice ou com duplo clique, Esc cancela; linha roxa tracejada com rótulo na planta; origem do perfil no painel (Linha de um corte × Linha desenhada), "Traçar linha"/"Apagar linha"; a linha grava em `perfil_polilinha`
- [x] F19 — `hipsometriaDaGrade(grade, anel, {modo:'EQUIDISTANCIA', intervaloM})`: classes em cotas redondas, múltiplas do intervalo; vazio = equidistância da versão; acima de 12 classes o intervalo dobra; toggle e campo no painel
- [x] Suíte (265 arquivos, 3.757 testes, 0 falhas), typecheck, `check-ui-standard.sh` e `check-xss-sinks.sh` limpos, **`npm run verificar:build`** e `npm run build` verdes; harness com 14 vistas sem erro (4 novas: platô fase 4, hipsometria por equidistância, painel fase 4, corte com via/banqueta)
- [x] Publicado e provado — `db5f55c8` em `main` (11/09/2026), `conferir-producao.sh "Por equidistância"` achou o texto no bundle servido com o commit carimbado. Não repeti o passeio logado em produção nesta fase (a senha do agente de leitura não fica guardada); a prova de tela é o harness.

### Achados desta fase

- O teste de painel com `<input>` controlado: `fireEvent.change` para `''` num campo cujo valor já é `''` não dispara — para provar "apagar devolve `null`", o fixture precisa começar com valor preenchido.
- Dois textos "Via de serviço" no mesmo painel (rótulo do campo e do resultado) — o resultado virou "Área da via de serviço".

### Pendências da fase 4 (declaradas) — resolvidas na fase 5, abaixo

- Talude por aresta usa a aresta mais PRÓXIMA da célula; nos cantos entre dois lados com h diferentes a transição é abrupta (sem concordância).
- A banqueta é contada em área e canaleta; o volume do degrau já entra pela superfície, mas não há largura mínima de plataforma nem drenagem traçada.
- Uma linha de perfil por estudo (a premissa guarda uma). Várias linhas = lista na premissa, sem mudança de motor.

---

# Pedido posterior — 2026-09-11: fase 5 (as pendências da fase 4)

## Pedido original

> Corrigir pendências

(as três declaradas acima; e, com a senha da conta de leitura informada, o
passeio logado em produção que a fase 4 não repetiu.)

## Decisões

| Pendência | Decisão | Por quê |
|---|---|---|
| Concordância nos cantos | `distanciaAoAnelComAresta` devolve `ProximidadeAoAnel`: no leque de um canto convexo (o ponto mais próximo é o vértice) traz as DUAS arestas e um `peso` de 0 a 1 que gira da normal de uma à normal da outra; `taludeNoPonto` mistura os `h` por esse peso. Célula e corte usam a mesma proximidade | O degrau na bissetriz vinha de escolher uma aresta no empate. Interpolar o `h` pelo ângulo é a concordância que o projeto faz — sem geometria nova |
| Banqueta: plataforma completa | `canaletaDeBanquetaM` deixa de ser área ÷ largura: caminha o EIXO de cada patamar (anel afastado do platô, lance a lance, cantos em arco com `h` girando) e conta só onde a primeira célula do lance seguinte ainda é talude do mesmo lado. Patamar em que o terreno é encontrado no meio não é plataforma | É a medida que se orça (metro linear de canaleta de banqueta) e elimina o patamar parcial. Drenagem TRAÇADA continua fora: é executivo |
| Várias linhas de perfil | `perfil_polilinha` (JSONB) passa a guardar a LISTA `[[{x,y},…],…]`; a leitura aceita a forma da fase 4 (uma linha) — `linhasDoPerfilDaColuna`. Cada traçado acrescenta uma linha; o painel escolhe qual ("Linha 1, 2, …") e apaga a escolhida; a planta numera os rótulos e engrossa a ativa | Sem coluna nova nem migration de dados: só o comentário da coluna (`aplicar_20270921000009`) |

## Estado — fase 5

- [x] F20 — concordância nos cantos (`ProximidadeAoAnel`, `taludeNoPonto`; célula e corte). Teste: platô com aterro 1:1 ao sul e 1:4 a leste — o alcance do talude em raios pelo canto cresce monotonamente de < 6 m a > 12 m, sem degrau
- [x] F21 — canaleta de banqueta no eixo do patamar completo (cantos em arco). Teste: terreno a 104,5, platô 100, lance 2 m, banqueta 1 m, corte 1:1 → dois anéis (80 m + 2π·2,5 e 80 m + 2π·5,5) ± 10 %; terreno a 102,0 exato → zero
- [x] F22 — várias linhas de perfil (hook, canvas, painel, `linhasDoPerfilDaColuna` lê as duas formas; `aplicar_20270921000009` aplicada e conferida)
- [x] Suíte (267 arquivos, 3.766 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes; harness com 14 vistas sem erro, "Perfil 1" grossa e "Perfil 2" clara na planta
- [x] Publicado e provado — `db872e7b` em `main` (11/09/2026), `conferir-producao.sh "Linha desenhada ao longo da qual o perfil é traçado"` achou o texto no bundle servido com o commit carimbado
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod5.mjs`, conta de leitura, senha só por ambiente): estudo novo → lote pelo gesto → versão gerada → "Via de serviço" = 2 → `POST 201` com `largura_da_via_m = 2` → duas linhas pela ferramenta Perfil → `POST 200` com `perfil_polilinha` LISTA de 1 e depois de 2 → recarregar → `GET 200` lista de 2, seletor com 2 opções, via = 2 → "Apagar linha 2" → `POST 200` lista de 1, seletor some → Exibir › Hipsométrico › "Por equidistância" → "Classes em cotas redondas, de 0,50 em 0,50 m" → versão apagada pela tela; 0 erros de console/HTTP. Estudos de teste apagados por SQL depois

### Achados desta fase (só a medição pegou)

- **Com Orto ligado, o script não fecha a polilinha**: o vértice vai para a posição TRAVADA, não para o pixel clicado, e o clique de "terminar no último vértice" cai longe do vértice real. Um humano clica no vértice que vê; o script tem de segurar Shift (libera o orto) ou clicar na posição travada. Primeira rodada falhou por isso — não é bug do produto.
- O quadro do harness mostra só y de 0 a ~15 m do lote de 30 m: uma linha em y = 22 m "não aparece" e não é bug — movida para y = 3 m.

### Pendências da fase 5 (declaradas) — a primeira resolvida na fase 6, abaixo

- Drenagem traçada (canaleta como entidade com traçado, caimento e deságue) e contenção: projeto executivo, fora da estimativa.
- SRTM 30 m por Edge Function (OpenTopoData sem CORS) — desde a fase 1.

---

# Pedido posterior — 2026-09-11: fase 6 (drenagem traçada e contenção)

## Pedido original

> implementar pendencias: drenagem traçada e contenção

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Contenção = muro de arrimo por LADO do platô | `taludePorAresta[i].muro = true` (sem coluna nova). Atrás do muro nada fora do platô é tocado; no canto muro × talude o leque é do talude, sem mistura; entre dois muros, muro. `murosDeArrimo` mede por aresta: comprimento, altura máx. de corte (terreno acima) e de aterro (terreno abaixo), altura média, área de face = ∫\|terreno − platô\| ds, lado CORTE/ATERRO/MISTO | É o que se orça de um muro (m e m² de face) sem dimensionar estrutura. Lado = trecho, como o talude por aresta |
| Muro na planta e no corte | Planta: traço grosso grafite na aresta com "dentes" para fora. Corte: ao sair do platô para trás do muro a linha desce/sobe na VERTICAL (no `u` do último ponto interno) até o terreno | A convenção de desenho; a vertical no `u` certo evita a "rampa de um passo" que o primeiro print mostrou |
| Drenagem traçada | Ferramenta **Drenagem** na barra (mesmo gesto do Perfil), no SENTIDO DO ESCOAMENTO; linhas `{id, nome, tipo CANALETA\|DESCIDA\|TUBO, pontos}` na premissa (`drenagem` JSONB, `aplicar_20270921000010`); "Gerar canaletas do platô" cria as de pé de corte / crista de aterro (uma por lado com talude, sem muro), orientadas do ponto mais alto ao mais baixo | Traçada = entidade com perfil, caimento e deságue; nasce da própria conta do talude |
| Perfil da drenagem | Sobre a **superfície de projeto** (`cotaDeProjeto`: platô/via na cota, talude onde corta ou aterra, terreno no resto e atrás do muro) | É por onde a água corre depois da obra, não pelo terreno natural |
| Veredito "escoa" | O FUNDO de projeto sai na cota da superfície no início, desce ≥ caimento mínimo (`caimento_min_pct`, 0,5 %) e acompanha a superfície onde ela desce mais. Escoa enquanto a profundidade (superfície − fundo) não passa do limite (canaleta/descida 0,6 m; tubo 1,5 m). Mostra caimento da superfície, queda de execução, profundidade máx. e trechos com a superfície subindo | A canaleta ao pé do talude corre NIVELADA na superfície (platô plano) — julgá-la pelo caimento da superfície a reprovaria sempre; ela escoa porque a execução aprofunda o fundo. O primeiro print do harness mostrou exatamente isso ("Não escoa 0,00 %") |
| Fora | Dimensionamento hidráulico (vazão, seção) e estrutural do muro; drenagem no 3D | Executivo |

## Estado — fase 6

- [x] F23 — muro de arrimo por lado (motor, corte, planta, painel com checkbox e lista de muros). Testes: terreno a 104 com platô a 100 e muro a leste → nenhuma célula tocada atrás do muro, 20 m × 4 m = 80 m² de face; canto muro × talude sem mistura; corte com degrau vertical em u = 30 m e nada além
- [x] F24 — drenagem traçada (ferramenta, premissa, `cotaDeProjeto`, `analisarDrenagem` com fundo de projeto, `canaletasDoPlato`, planta com setas e deságue, seção Drenagem no painel; `aplicar_20270921000010` aplicada e conferida). Testes: rampa descendo escoa com profundidade 0; subindo enterra 20,1 m; nivelada a 0,5 % dá 0,10 m em 20 m (escoa) e 0,75 m em 150 m (canaleta não, tubo sim); vale de 15 m não escoa
- [x] Suíte (271 arquivos, 3.783 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes; harness com 17 vistas sem erro (3 novas: planta com muro e drenagem, painel fase 6, corte com muro)
- [x] Publicado e provado — `db0bc517` + `deac6a68` em `main` (11/09/2026), `conferir-producao.sh "Gerar canaletas do platô"` achou o texto no bundle servido com o commit carimbado
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod6.mjs`): estudo novo → lote → versão → "Muro de arrimo no lado 2" → `POST 201` com `talude_por_aresta[1].muro = true`, os h do lado desligados, lista "Lado 2 · 6,4 m · terreno e aterro · h máx. 1,33 m · face 3,56 m²" → descida traçada com a ferramenta Drenagem → `POST 200` com `drenagem` de 1 linha, veredito "Escoa" → recarregar → `GET 200` com a linha e o muro → apagar → `POST 200` com 0 → versão apagada; 0 erros. Estudos de teste apagados por SQL

### Achados desta fase (só a medição pegou)

- **A canaleta ao pé do talude corre nivelada**: o primeiro print do harness deu "Não escoa · 0,00 %" para todas as geradas do platô. Julgar pelo caimento da superfície reprova o caso normal; o veredito passou a ser pelo fundo de projeto e pela profundidade.
- **Platô igual ao lote → a aresta do muro é a borda da grade** e a amostra exata da cota dá `null`: o primeiro passeio em produção mostrou "terreno na cota do platô · face 0,00 m²". Corrigido amostrando recuado (`deac6a68`).
- **A face do muro saía como rampa de um passo no corte**: o degrau usava o `u` do ponto seguinte; agora usa o do último ponto interno.
- Com o platô igual ao lote (sem recuos), "Gerar canaletas do platô" gera zero — não há talude fora do lote. Não é bug; o botão fica, porque com envelope há.

### Pendências da fase 6 (declaradas) — a primeira resolvida na fase 7, abaixo

- Dimensionamento hidráulico da drenagem (vazão, seção) e estrutural do muro: executivo.
- Drenagem e muro no 3D e nos exports (DXF/KML da topografia).
- SRTM 30 m por Edge Function — desde a fase 1.

---

# Pedido posterior — 2026-09-11: fase 7 (pré-dimensionamento e a decisão técnica definitiva)

## Pedido original

> implementar / corrigir:
> 1. Dimensionamento hidráulico e estrutural
> 2. Limitações de escopo mantidas por decisão: a topografia vive fora do payload canônico (dado do mundo), o processamento é no navegador com teto de 10.000 nós por versão, e tudo é estimativa de projeto, não executivo.

Perguntado o que fazer com o item 2, a resposta foi "Qual a melhor e definitiva decisão técnica?". A decisão, tomada e registrada aqui:

| Limitação | Decisão definitiva | Por quê |
|---|---|---|
| Topografia fora do payload canônico | **Mantida.** O que faltava era rastreabilidade: `blueprint_snapshot_topografia` grava, a cada versão publicada, id, versão, fonte e hash da topografia em uso (metadado fora do hash da geometria; imutável; some com o snapshot; se a topografia for apagada, ficam versão/fonte/hash). O painel Versões mostra "Topografia vN · hash" | O hash do desenho só pode mudar quando o desenho muda; grade e curvas são dado do mundo. Levá-las ao payload faria versões "diferentes" com o mesmo desenho |
| Processamento no navegador, teto de 10.000 nós | **Navegador mantido; teto medido e subido para 40.000.** Bench de 11/09 (Node, lote 100 × 100 m, 40 pontos): motor inteiro em 55 ms a 10 mil nós, 70 ms a 40 mil, 160 ms a 94 mil, 230 ms a 162 mil; a LINHA gravada cresce de 280 KB → 830 KB → 1,9 MB → 2,8 MB. 40 mil é onde a versão ainda cabe folgada numa requisição | O tempo nunca foi o limite; o JSONB e o redesenho são. Edge Function não traria ganho para lote urbano e tiraria a reprodutibilidade local |
| "Estimativa, não executivo" | **Vira pré-dimensionamento com hipóteses declaradas e editáveis** (item 1). Executivo é responsabilidade técnica (ART), não software; o painel diz isso | — |

## Decisões do pré-dimensionamento (`utils/blueprintTopografiaDimensionamento.ts`, puro)

| Tema | Decisão |
|---|---|
| Vazão | Método Racional Q = C · i · A (A em m², i em mm/h → m³/s). C padrão 0,9 |
| Chuva | IDF `i = k · T^a / (t + b)^c`, padrão São Paulo (3462,7 · T^0,172 / (t + 22)^1,025), T = 10 anos, t = 10 min; k, a, b, c, T, t e C editáveis; i pode ser informada direto |
| Área contribuinte | Sugerida pela partição do lote (cada célula da grade vai para a linha de drenagem mais próxima); sobrescrevível por linha (`drenagem[i].areaContribuinteM2`) |
| Seção | Manning com lâmina de 80 %, n = 0,013; catálogo de canaletas retangulares b × b (20 a 100 cm) para canaleta/descida e tubos DN 150–1000 para tubo; a menor que leva Q na declividade de projeto (máx. entre caimento mínimo e queda de execução ÷ comprimento). Avisa velocidade < 0,6 ou > 5 m/s e vazão acima do catálogo |
| Muro | Tipo automático: ≤ 3 m gravidade (trapézio, topo 0,30, ciclópico 22 kN/m³), acima flexão (L armado: fuste H/12 ≥ 0,20, sapata H/10 ≥ 0,25, talão sob o solo). Empuxo ativo de Rankine com sobrecarga (φ 30°, γ 18, q 10). Base parte de 0,6·H e cresce de 5 cm até tombamento (≥ 2,0 gravidade / 1,5 flexão), deslizamento (≥ 1,5; atrito tan φ na base, moldado contra o solo, mais metade do passivo do embutimento) e tensão na base (≤ 200 kPa) fecharem; desiste em 1,2·H e avisa. Com 2/3 φ e sem passivo, um muro de gravidade de 3 m com sobrecarga só fechava com base maior que a altura — a primeira rodada dos testes pegou. H > 8 m: contenção especial, fora |
| Quantitativos do muro | Concreto = seção da altura máxima × comprimento; aço = 80 kg/m³ (só flexão); barbacãs a cada 1,5 m em quincôncio; dreno de pé = comprimento |
| Persistência | `hidraulica` e `estrutura` JSONB parciais em `blueprint_study_terraplenagem` (`aplicar_20270921000011`), completados com o padrão na leitura |

## Estado — fase 7

- [x] F25 — vínculo versão publicada ↔ topografia (`blueprint_snapshot_topografia` com RLS, sem UPDATE, grants só SELECT/INSERT a authenticated — conferido; `publish` devolve o id e o editor grava o vínculo; painel Versões mostra "Topografia vN · hash")
- [x] F26 — teto de nós medido e subido para 40.000 (bench registrado no código)
- [x] F27 — pré-dimensionamento hidráulico. Testes: IDF SP a T 10/t 10 = 147 mm/h; 1000 m² a 0,5 % escolhe 30 × 30 (20 × 20 leva 27 L/s, 30 × 30 leva 80); tubo usa DN; área enorme estoura o catálogo com aviso; partição do lote reparte 800/800 m² entre duas linhas
- [x] F28 — pré-dimensionamento do muro. Testes: 2,5 m vistos → gravidade, empuxo 37 kN/m, as três verificações fecham; 4,5 m → flexão com sapata e aço; φ pior engrossa a base; sobrecarga absurda não fecha e avisa; 9 m → contenção especial
- [x] Suíte (272 arquivos, 3.805 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes; harness com 17 vistas sem erro e os recortes de Drenagem e Muros conferidos; `aplicar_20270921000011` aplicada e conferida
- [x] Publicado e provado — `708b554e` em `main` (11/09/2026), `conferir-producao.sh "Chuva de projeto"` achou o texto no bundle servido
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod7.mjs`): muro no lado 2 + sobrecarga 20 → `POST 200` com `estrutura.sobrecargaKNm2 = 20` e o pré-dimensionamento na tela; descida traçada, área contribuinte 300 m² → `POST 200` com `drenagem[0].areaContribuinteM2 = 300`, seção 20 × 20, Q 11,1 L/s; C = 0,8 gravado; **Publicar versão** → `fn_blueprint_publish_snapshot 200` e `POST 201` em `blueprint_snapshot_topografia` (versao 1, hash); painel Versões: "Topografia v1 · a2f8e24a09c4". 0 erros. Estudo de teste apagado por SQL (o cascade levou snapshot e vínculo)

### Achados desta fase

- **Deslizamento com 2/3 φ e sem passivo reprova todo muro baixo com sobrecarga**: 3 m de gravidade só fechava com base maior que a altura. Moldado contra o solo mobiliza tan φ, e o embutimento dá passivo (conta-se metade). Registrado no motor.
- No passeio, um muro de 1,33 m visto com sobrecarga de 20 kN/m² deu "Não fecha" (FS desl. 1,43 na base de 1,2·H): correto — para muro baixo o empuxo da sobrecarga domina, e é o caso de dente na base ou de reduzir a sobrecarga. O aviso diz isso.
- A primeira leitura da suíte reprovou dois testes antigos que procuravam "estimativa de projeto, não o executivo" — o texto mudou de propósito para "pré-dimensionamento com hipóteses declaradas".

### Pendências da fase 7 (declaradas) — todas resolvidas na fase 8, abaixo

- Dente (chave) na base do muro para deslizamento e verificação de estabilidade global: fora do pré-dimensionamento.
- Tempo de concentração calculado (Kirpich) em vez de informado; hoje é hipótese.
- Drenagem e muro no 3D e nos exports (DXF/KML da topografia) — desde a fase 6.
- SRTM 30 m por Edge Function — desde a fase 1.

---

# Pedido posterior — 2026-09-11: fase 8 (as pendências das fases 1, 6 e 7)

## Pedido original

> Vamos corrigir as pendências.

## Decisões

| Pendência | Decisão |
|---|---|
| Dente na base | Quando tombamento e tensão fecham e só o deslizamento falha, tenta dente de 0,3 / 0,5 / 0,8 / 1,0 m antes de engrossar a base. Com dente, o passivo vale INTEIRO na profundidade embutimento + dente (é para isso que o dente existe); sem dente, metade do passivo do embutimento. O dente entra no concreto (largura do topo / do fuste) |
| Estabilidade global | Bishop simplificado, fatias verticais, sem água: FS = Σ[(c·b + W·tan φ)/mα] / Σ W·sin α. Geometria: pé em x = 0, base em y = 0, terrapleno em y = H atrás com sobrecarga, solo na frente em y = embutimento, muro como bloco B × H com o peso do concreto. Centro varre uma grade acima do muro, raio pelo ponto de saída na frente; só círculos ABAIXO da base (muro rígido). Menor FS ≥ 1,5. Coesão c editável (padrão 0, conservador) |
| Kirpich | t = 0,0195·L^0,77·S^−0,385 min, L = comprimento da linha (o talvegue é a própria canaleta), S = declividade de projeto, piso 5 min; i sai por linha. Modo `INFORMADO` mantido como opção. Padrão KIRPICH |
| DXF | Camadas `TOPO-DRENAGEM` (polilinha + seta no último trecho + nome) e `TOPO-MURO` (linha + dentes para fora), no DXF da topografia e no da prancha |
| KML | Pastas "Drenagem" e "Muros de arrimo", `clampToGround` (linhas de projeto, não medições de cota) |
| 3D | `blueprintTopografia3dExtras` (puro): linha amostrada sobre a superfície de projeto, 5 cm acima (azul escoa, vermelho não); muro como tira de triângulos do topo (máx. platô/terreno) ao pé (mín. − 0,5 m). O viewer só monta `BufferGeometry` |
| SRTM 30 m | Edge Function `topografia-elevacao`: JWT válido obrigatório, ≤ 100 coordenadas, consulta `api.opentopodata.org/v1/srtm30m` (bilinear), erro do provedor vira 502 e no cliente `FonteIndisponivel` (nunca zero). Fonte `OPENTOPODATA_SRTM30` (`API_FUNCTION`), 30 m, EGM96, PRELIMINAR_REMOTO; `amostrarRemoto` ganha `invocar` injetável e respiro de 1,1 s entre lotes (limite de 1 req/s do plano público) |

## Estado — fase 8

- [x] F29 — dente na base e estabilidade global (motor, painel com coesão e FS global). Testes: 1,33 m visto com q = 20 (o caso da fase 7) fecha com dente de 0,30 m e base < 1,2·H; φ 35° sem sobrecarga não precisa de dente; FS global cai com φ menor, sobe com coesão, > 1,5 para muro comum em areia de 30°; φ 12° reprova e avisa
- [x] F30 — Kirpich por linha (motor, painel com seletor, t e i por linha). Testes: fórmula e piso de 5 min; KIRPICH dá t = 5 e i > 160 numa linha de 30 m; INFORMADO dá t = 10 e i = 147
- [x] F31 — drenagem e muros no DXF (camadas e entidades, com e sem extras), no KML (pastas, clampToGround) e no 3D (vértices sobre a superfície + 5 cm; tira do muro do topo ao pé − 0,5)
- [x] F32 — fonte `OPENTOPODATA_SRTM30` atrás da Edge Function `topografia-elevacao`, publicada com `npx supabase functions deploy` e **provada de fora com curl**: sem token → 401; com JWT do agente de leitura (password grant) → `{"elevation":[245,0,761]}` para Pão de Açúcar, praia e São Paulo; 101 pontos → 400. `amostrarRemoto` testado com function falsa (lotes de 100, respiro de 1,1 s, erro → `FonteIndisponivel`, nunca zero)
- [x] Suíte (274 arquivos, 3.8xx testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes; harness com 18 vistas sem erro (nova: 3D com drenagem e muro)
- [x] Publicado e provado — `06393ff6` em `main` (11/09/2026), `conferir-producao.sh "SRTM 30 m (OpenTopoData)"` achou o texto no bundle servido
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod8.mjs`): muro no lado 2 com sobrecarga 20 e coesão 5 → "Fecha · gravidade · H 1,83 m · base 1,50 m · FS desl. 1,72 (dente 0,30 m) · FS global 2,72"; descida traçada → "t 5,0 min · i 175 mm/h" (Kirpich) e, trocando para informado, "t 10,0 min · i 147 mm/h"; gravações com `tc` e `coesaoKPa`; 3D com o terreno mostrou a linha azul e a face do muro sem erro; versão apagada pela tela; estudo apagado por SQL. 0 erros

### Achados desta fase (só a medição pegou)

- **Duas fontes remotas viravam dois botões "DEM público"** no painel: o rótulo era por tipo, não por fonte. Cada fonte ganhou `rotuloCurto` ("Pontos cotados", "DEM 90 m", "SRTM 30 m").
- **O dente entrava cedo demais**: com a base inicial de 0,6·H, quase todo muro ganhava dente. Política: engrossar até 0,8·H; dente só depois; então continuar engrossando.
- **"Todas as organizações" agora é nulo de verdade** (outra frente de 11/09): a planta nova pergunta a organização num diálogo, e o passeio passou a escolher.

### Pendências (declaradas)

- Projeto executivo (ART): dimensionamento definitivo da drenagem e do muro, sondagem e água no solo — fora do software.
- Licença comercial do Open-Meteo (E-12) e limite de 1000 req/dia do OpenTopoData público — decisão de negócio, não de código.

---

# Pedido posterior — 2026-09-11: fase 9 (importar pontos de topografia por arquivo)

## Pedido original

> é possivel importar ponto de topografia sgv. veja o app de referencia para o nosso PRD

O PRD não nomeia app de referência e não cita "sgv"; prevê "importação de levantamento topográfico oficial, pontos cotados, breaklines e TIN" (Fase 3), "importação GeoJSON e KML" (Fase 2) e a classe "Levantamento importado — pendente de validação" (RF-020). Perguntado o formato, a resposta foi: **CSV/TXT de estação total ou GNSS, SVG, GeoJSON/KML e DXF** — os quatro.

## Decisões

| Formato | Como entra |
|---|---|
| Texto (CSV/TXT/PNEZD) | Separador detectado (`;`, `,`, tab, espaço), vírgula ou ponto decimal, cabeçalho reconhecido por nome (N/Norte/Y, E/Este/X, Z/Cota/H, P/Ponto/Nome, D/Desc/Cod). Sem cabeçalho: a primeira sequência de três números, com o número do ponto antes e o código depois; ordem padrão **P, N, E, Z** (o PNEZD do CAD), com aviso e opção de trocar para E, N |
| Unidade | Automática pela grandeza: UTM (N 1–10 M, E 100–900 k), mm do desenho (> 5000) ou metros locais; opção manual. UTM → lat/long (Snyder, zona deduzida da georreferência, hemisfério pela latitude) → desenho por `geoParaLocal` (inverso exato de `localParaGeo`, novo) |
| GeoJSON / KML | Point e MultiPoint (GeoJSON), Placemark com Point (KML); cota na 3ª coordenada ou em propriedade/ExtendedData; exigem georreferência do lote |
| DXF | POINT com Z entra direto; POINT/CIRCLE sem Z casa com o TEXT/MTEXT numérico mais próximo (alcance 6× a altura do texto); unidade por `$INSUNITS` ou grandeza. Leitor próprio de POINT/CIRCLE/TEXT (o `dxfLeitor` da planta de fundo só lê segmentos) |
| SVG | `<circle>`, `<ellipse>` e `<rect>` pequeno casados com o `<text>` numérico mais próximo; Y invertido pela viewBox/height; escala (mm por unidade) informada, padrão 1000 |
| Ancoragem | Geográfico/UTM → georreferência; senão, se ≥ 30 % dos pontos caem no lote → direto; senão centro dos pontos no centro do lote (mesmo critério do IFC), com aviso e opção manual |
| Proveniência | Nome, formato e sha256 do arquivo (RF-014, checksum do insumo) entram em `dataset_versao` e no `hash_entrada` da versão gerada; a classe continua LEVANTAMENTO_IMPORTADO; a lista mostra a origem |
| Tela | Botão **Importar** ao lado de "Usar vértices do lote"; prévia com contagem lida/ignorada, dentro do lote, ordem, unidade, ancoragem, escala do SVG e avisos; "Substituir os pontos" / "Acrescentar aos existentes" / "Cancelar". Nada vai ao banco na importação — só na próxima versão |

## Estado — fase 9

- [x] F33 — motor `blueprintTopografiaImportacao` (4 formatos, UTM, ancoragem) e `geoParaLocal`. Testes: números com vírgula/ponto/milhar; PNEZD sem cabeçalho (P vira nome, D vira código); cabeçalho X,Y,Z e Norte/Este/Cota; tab, espaço e `;`; mm pela grandeza; ancoragem automática no centro do lote quando os pontos caem longe, e "Direto" respeitado; UTM gerado de um ponto do desenho volta a menos de 2 cm; `geoParaLocal` inverte `localParaGeo` com giro do norte a 1 mm; GeoJSON (z na coordenada ou em properties, MultiPoint, LineString ignorada, sem georreferência recusa); KML (Point, ExtendedData, LineString ignorada); DXF (POINT com Z, CIRCLE + TEXT, $INSUNITS); SVG (circle + text, viewBox, escala)
- [x] F34 — hook (`definirPontosCotados`, origem na proveniência) e painel (Importar com prévia, ordem/unidade/ancoragem/escala, Substituir/Acrescentar/Cancelar, origem na lista). Testes de painel com `File` + `FileReader` do jsdom
- [x] Suíte (276 arquivos, 3.823 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes; harness: CSV escolhido pelo Playwright mostra a prévia (4 lidos, 3 dentro do lote; trocando a ordem, 2)
- [x] Publicado e provado — `8e08f613`, `a7f15629` (prévia numa linha inteira) e a correção do parser em `main` (11/09/2026), `conferir-producao.sh "Arquivo de pontos cotados"` achou o texto no bundle servido
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod9.mjs`): `setInputFiles` de um CSV PNEZD de 5 pontos → prévia "5 pontos lidos · separador ;" → Substituir → 5 pontos na lista com "5 pontos de levantamento-teste.csv · sha256" → Gerar → `POST 201` em `blueprint_study_topografia` com `dataset_versao = "arquivo levantamento-teste.csv (texto (CSV/TXT), sha256 5e895c8e…, 5 pontos)"` e classe LEVANTAMENTO_IMPORTADO; o resultado cita o arquivo; versão apagada; estudo apagado por SQL. 0 erros

### Achados desta fase (só a medição pegou)

- **"0,500" virava cota 8,30**: a regra que decide se a primeira coluna é o número do ponto exigia a coordenada seguinte ≥ 1 — as linhas com coordenada menor que 1 perdiam a coluna. O print de produção mostrou cruzes rotuladas "8.30" e "0.50" e uma cota mínima de 54,92 m. Regra corrigida: quatro números seguidos = P, N, E, Z, sem olhar o valor.
- A prévia da importação nascia dentro da linha dos botões e saía espremida: `flex-wrap` e `basis-full` a levam para uma linha inteira.

### Pendências (declaradas)

- Breaklines e TIN importada (o PRD cita na Fase 3): hoje só pontos; a triangulação é sempre a nossa.
- SVG: `transform` não é aplicado (aviso na prévia); blocos INSERT do DXF não são lidos.
- Um "app de referência" não consta do PRD; se houver um formato específico, cabe como leitor a mais no mesmo importador.

---

# Pedido posterior — 2026-09-11: fase 10 (o "arquivo do app de referência")

## Pedido original

> arquivo exemplo do app de referencia — `Planta 10-09-2026 - perfil linha desenhada - curvas de nivel v2.svg`

O arquivo é a **exportação de perfil do próprio ÒPURA** (`svgDoPerfil`, fase 3): título "Planta 10/09/2026 — perfil (linha desenhada)", eixos de 0 a 9,8 m e de 0,8 a 3,3 m, círculos de início (2,87 m) e fim (1,00 m), legenda "exagero vertical 0,9×". É um gráfico distância × cota ao longo de uma linha, sem coordenadas de planta. O "app de referência" é o ÒPURA.

## Decisões

| Tema | Decisão |
|---|---|
| Reconhecimento | `detectarFormato(nome, texto)`: SVG com "exagero vertical" → `PERFIL_SVG`; CSV com `seq;dist_m;x_mm;y_mm;cota_m` → `PERFIL_CSV`. O resto segue pela extensão |
| SVG de perfil | `lerPerfilSvgDoOpura`: os ticks dos eixos (rótulos "d m" centrados; cotas com âncora `end`) dão a escala px → m por ajuste linear; os círculos de início/fim, rotulados com duas casas, refinam a cota; o `<path fill="none">` dá os pontos. Precisão ≈ 1 cm em cota (o gráfico tem 1 decimal nos ticks; o CSV é exato) |
| Onde apoiar | O SVG só tem distância: os pontos se apoiam na **linha de perfil em uso** (corte ou linha desenhada, já amostrada com distância e posição — `perfil.pontos` do painel), por interpolação na distância; até 2 % além do fim encosta no fim (os rótulos têm uma casa decimal). Sem linha, o importador explica o que fazer |
| CSV de perfil | `lerPerfilCsvDoOpura`: x, y em mm direto; `nodata` fica de fora |
| Colinearidade | Pontos numa reta só não triangulam: a prévia avisa para acrescentar aos existentes ou importar outro perfil que cruze |

## Estado — fase 10

- [x] F35 — leitores de perfil do ÒPURA (SVG e CSV), apoio na linha, detecção pelo conteúdo, painel. Testado com o SVG exato colado pelo usuário (43 pontos, título e legenda preservados) e com ida-e-volta real via `svgDoPerfil`/`csvDoPerfil`
- [x] Suíte (277 arquivos, 3.829 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes
- [x] Publicado e provado — `9c8f98eb` em `main` (11/09/2026), `conferir-producao.sh "perfil do ÒPURA"` achou o texto no bundle servido (outro commit avançou `main` logo depois; confirmado que `9c8f98eb` continua ancestral)
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod10.mjs`): traçou uma linha de perfil com uma dobra, exportou o SVG dela pelo próprio botão "SVG do perfil", reimportou esse mesmo arquivo — reconhecido como "perfil do ÒPURA (SVG)", 40 pontos lidos, 40 dentro do lote, SEM aviso de linha ausente (a linha em uso já era a mesma), "Substituir os pontos" habilitado e aplicado, 40 pontos cotados na lista. Zero erros de console/HTTP. Estudo de teste sem versão publicada apagado por SQL

### Achado desta fase

O pedido original ("arquivo exemplo do app de referência") era, na verdade, uma exportação do próprio ÒPURA — o "app de referência" citado no PRD é o próprio produto. Vale como lembrete: antes de escrever um leitor para "o formato de outro sistema", vale conferir se o arquivo não é uma saída nossa.

### Pendências (declaradas)

- O apoio do perfil SVG na linha usa a distância do INÍCIO dela; se o usuário girou ou inverteu a linha entre exportar e reimportar, o apoio sai errado sem aviso adicional além do de comprimento.
- Precisão do SVG reimportado ≈ 1 cm (arredondamento dos rótulos do gráfico); quem precisa de precisão exata deve reimportar o CSV do mesmo perfil, não o SVG.

---

# Pedido posterior — 2026-09-12: fase 11 (curvas de nível num SVG)

## Pedido original

> identificar as curvas de nivel ao importar um arquivo svg

Até a fase 9 o importador de SVG só via MARCAS (círculo + número ao lado). Uma planta topográfica em SVG é feita de POLILINHAS com a cota escrita sobre elas — e essas ficavam de fora.

## Decisões

| Tema | Decisão |
|---|---|
| O que é curva | `<path>` (M/L/H/V/Z absolutos e relativos; Bézier/arco entram só pelo ponto final, com aviso), `<polyline>` e `<polygon>` com ≥ 3 vértices. `verticesDoPath` é o parser próprio |
| De onde vem a cota | `data-cota` / `data-elevation` / `data-z` no elemento (o SVG do ÒPURA e vários GIS escrevem assim) ou o texto numérico mais próximo da linha — cada texto serve a UMA curva (a mais próxima, dentro do alcance de 4× o tamanho da fonte), e os textos já usados por marcas não concorrem. Curva sem rótulo fica de fora e é contada na prévia |
| Curva → pontos | `pontosDasCurvas`: reamostra ao longo do comprimento a um passo tal que o total fique perto de 1.500 pontos (milhares de vértices por curva só pesam a versão), conservando as pontas; cada ponto leva `codigo = "curva <cota>"` |
| SVG do ÒPURA | `CURVAS_SVG`, reconhecido por `data-cota` + `scale(1,-1)`: coordenadas já em mm do desenho, Y **como está** (o grupo vira a tela, não o número); os pontos cotados originais (cruz azul + texto) também voltam; ancoragem direta, com "centro do lote" como opção para SVG de outro estudo |
| Prévia | "N curvas de nível (+M sem cota)" ao lado da contagem de pontos |

## Estado — fase 11

- [x] F36 — `verticesDoPath`, `lerCurvasDoSvg`, `pontosDasCurvas`, `CURVAS_SVG`, prévia. Testes: parser de path (absoluto/relativo/H/V/Z/subcaminhos/Bézier pelo ponto final); reamostragem conserva as pontas; ida e volta real com `svgDasCurvas` (pontos a ≤ 1,5 mm das curvas, cota exata, 5 pontos cotados originais recuperados, retriangular reconstrói o relevo com erro ≤ 0,3 m); SVG genérico de CAD com polilinhas rotuladas (2 com cota, 2 sem, marca continua funcionando, Y invertido pela viewBox); `data-cota` vence o texto e polygon fecha
- [x] Suíte (278 arquivos, 3.862 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes
- [x] Publicado e provado — `50e98497` em `main` (12/09/2026), `conferir-producao.sh "curvas de nível do ÒPURA"` achou o texto no bundle servido
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod11.mjs`): v1 com 5 curvas a cada 0,50 m → botão SVG exportou 6.726 bytes com 5 `data-cota` → reimportação reconhecida como "curvas de nível do ÒPURA (SVG)", "135 pontos lidos · 5 curvas de nível · 135 dentro do lote" → Substituir → 135 pontos na lista → v2 gerada a partir deles: cotas 100,00 a 102,59 m, as mesmas 5 curvas a cada 0,50 m, `POST 201` com `pontos_cotados = 135` e a proveniência citando o SVG. Zero erros. Estudo de teste apagado por SQL

### Achado desta fase (só a medição pegou)

- **O Y do SVG do ÒPURA não se nega**: os `d` dos paths trazem as coordenadas cruas do desenho e é o grupo `scale(1,-1)` que vira a tela. A primeira versão negava e o ponto caía 2·y fora da curva (11 m) — o teste de ida e volta pegou antes de sair.

### Pendências (declaradas)

- Bézier e arcos entram só pelo ponto final: uma curva de nível suavizada em spline sai mais grosseira que o traço (a prévia avisa). Amostrar a Bézier de verdade é trabalho pequeno se aparecer um arquivo assim.
- `transform` em elementos do SVG genérico continua sem ser aplicado (aviso desde a fase 9).

---

# Pedido posterior — 2026-09-12: fase 12 (o mapa como o Contour Map Creator)

## Pedido original

> olha o print de como deve ser as curvas de nivel. acesse o site para implementar igual https://contourmapcreator.urgr8.ch/

O print: relevo preenchido por uma rampa azul → ciano → verde → amarelo → vermelho, curvas coloridas pela cota, pontinhos da amostragem sobre o mapa e uma legenda com um quadrado por nível.

## Análise do site (lido o JavaScript servido)

| O que ele faz | Como |
|---|---|
| Elevação | Mapzen/Terrarium pelo backend `/getdata2`, numa grade de N×M pontos sobre a caixa do mapa ("Sampling grid") |
| Curvas | CONREC (marching-squares clássico) nos níveis pedidos |
| Níveis | três modos: **Number** (N níveis, passo = (máx − mín)/(N + 1), i = 1..N — estritamente dentro), **Custom** (lista digitada) e **Interval** (a partir do mínimo) |
| Cores | `value2RGB(v, min, max)` normalizada pelo **primeiro e último nível** (não pelo mín/máx do terreno): 1.024 degraus azul → ciano → verde → amarelo → vermelho; abaixo satura em azul, acima em vermelho |
| Preenchimento | um retângulo por célula da grade, na cor da cota média da célula |
| Curvas | traço na cor do nível; "plot sampling points" desenha os nós da grade; "rounding for legend" arredonda os rótulos |
| Legenda | um quadrado 20×20 por nível, do mais alto ao mais baixo |
| Exporta | SVG com as células, curvas e legenda; KML com um estilo por nível; m ou ft |

## Decisões

| Tema | Decisão |
|---|---|
| Rampa | `rgbArcoIris(t)` é a tradução literal de `value2RGB` (mesmos 5 pontos e a mesma saturação). `corArcoIrisDaCota(cota, primeiroNível, últimoNível)` normaliza como lá |
| Níveis | `modoNiveis` na geração: EQUIDISTANCIA (o de sempre, cotas redondas), NUMERO (`niveisPorNumero`, a conta do site, teto 200) e PERSONALIZADO (`lerListaDeNiveis` aceita vírgula, ponto e vírgula, espaço e vírgula decimal; `niveisPersonalizados` fica só com o que cai dentro). O modo **Interval** do site não ganhou botão: a equidistância nossa já é "intervalo", só que ancorada em cotas redondas em vez de no mínimo — mais útil em planta |
| Persistência | `modo_niveis` + `niveis_m` na versão (migration `aplicar_20270921000013`; nasceu 0012 e foi renumerada antes de aplicar por colisão com outra frente). `equidistancia_m` continua NOT NULL: nos modos novos guarda o menor passo entre níveis (`equidistanciaEquivalente`), que é o que o hipsométrico por equidistância e a proveniência leem. O hash da entrada inclui modo e níveis |
| Área | "Só o lote" (o de sempre) ou "Retângulo inteiro" (a caixa do lote, como o site cobre a caixa do mapa) — escolhido ao gerar, gravado no `anel` da versão |
| Hipsometria | terceiro modo **Arco-íris** (`CONTINUO`): 48 bandas da rampa entre o primeiro e o último nível da versão; abaixo/acima satura. Ao lado: "Curvas coloridas pela cota" e "Casas na legenda" (0–3), lembrados no navegador; legenda com um quadrado por nível, do mais alto ao mais baixo |
| Canvas | `corDaCurva` pinta traço e rótulo de cada curva na cor do nível; `nosDaGrade` (Exibir › "Nós da grade") desenha os nós da grade como pontinhos na cor da cota — o "plot sampling points" |
| Exportação | com o Arco-íris ligado, o SVG sai com `<g class="celulas">` (um `rect` por célula, cor da média dos 4 cantos), curvas e rótulos na cor do nível e `<g class="legenda">`; o KML sai com um `<Style id="nivel-i">` por nível (`corKml` = aabbggrr). Sem o Arco-íris, tudo como antes (marrom) |
| Pés | não (DR-06: metros) |

## Estado — fase 12

- [x] F37 — motor: `rgbArcoIris`/`corArcoIris`/`corArcoIrisDaCota`, `niveisPorNumero`, `niveisPersonalizados`, `lerListaDeNiveis`, `equidistanciaEquivalente`, `gerarCurvasNosNiveis`, `faixaDeCotas`, `gerarCurvas` delegando; hipsometria `CONTINUO`; hash com modo e níveis
- [x] F38 — persistência (`modo_niveis`, `niveis_m`), hook (modo, nº de níveis, lista, área), painel (toggle de níveis, campos por modo, "Arco-íris", curvas pela cota, casas, legenda por nível; "Curvas: 7 em 7 níveis"), canvas (`corDaCurva`, `nosDaGrade`), editor (Exibir › "Nós da grade", lembranças `blueprint:curvasPelaCota`/`nosDaGrade`/`casasDaLegenda`), exportação SVG/KML colorida
- [x] Testes: `blueprintTopografiaFase12` (12: os 5 pontos da rampa e a saturação, monotonia, `niveisPorNumero(886, 906, 7) = 888,5 … 903,5`, lista, `lerListaDeNiveis`, equidistância equivalente, curvas nos níveis e o antigo intacto, hash, 48 bandas, SVG com células/cores/legenda, KML com estilos, ida e volta com 7 níveis) e `PainelTopografiaFase12` (3: os três modos e seus campos, área, arco-íris + legenda). Os 8 fixtures de painel ganharam os campos novos
- [x] Harness `?cmc=1` (`docs/spikes/topografia`): planta com o preenchimento arco-íris, 7 curvas coloridas, nós da grade; painel com "Nº de níveis", legenda por nível — fotografado, 0 erros
- [x] Migration `aplicar_20270921000013` aplicada com `db query -f` e conferida de fora: `modo_niveis text NOT NULL DEFAULT 'EQUIDISTANCIA'` com CHECK dos três valores, `niveis_m jsonb`
- [x] Suíte (281 arquivos, 3.892 testes, 0 falhas — a única falha da primeira rodada era o prefixo 0012 repetido, resolvido renumerando), typecheck, `check-ui-standard.sh` nos 3 `.tsx`, `check-xss-sinks.sh`, `npm run verificar:build` e `npm run build` verdes
- [x] Publicado e provado — `80715ac1` em `main` (12/09/2026), `conferir-producao.sh "Contour Map Creator"` achou o texto no bundle servido; correção do botão SVG publicada em seguida
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod12.mjs`): estudo novo → lote → "Nº de níveis" = 7 → Gerar: "Curvas 7 em 7 níveis", `POST 201` com `modo_niveis = NUMERO`, 7 `niveis_m` (100,32 … 102,27) e `equidistancia_m = 0,324` → Exibir › Hipsométrico + "Arco-íris" + "Curvas coloridas pela cota" + Exibir › "Nós da grade": planta com o preenchimento arco-íris, 7 curvas coloridas com a cota, nós da grade; legenda com 7 itens do vermelho (102,27) ao azul (100,32) → botão SVG (após `eb1a2cc6`): 96.822 bytes com `<g class="celulas">` (1.167 células), 7 curvas do `#0000ff` ao `#ff0000` e `<g class="legenda">`. Zero erros. Versão apagada pela tela; estudos por SQL

### Achados desta fase (só a medição pegou)

- **O botão SVG exportava sem cores em produção**: chamava `exportar('svg')` sem os `extras` (só DXF e KML passavam). O passeio pegou (`celulas=false`, curvas `#92400e`); o teste de painel agora confere que o clique leva `cores` com o Arco-íris e nada sem ele.

- `lerListaDeNiveis('101,5 102,0 102,5')` partia nas vírgulas e lia 6 números. Regra: se há espaço ou ponto e vírgula ENTRE números, a vírgula é decimal; senão, separa.
- O 0012 já estava tomado por `pricing_rule_applications` (outra frente, mesmo dia); o teste de prefixo pegou antes de aplicar.

### Pendências (declaradas)

- O modo **Interval** do site (a partir do mínimo) não existe como botão; a equidistância em cotas redondas cobre o caso em planta. Se alguém precisar de "a partir do mínimo", é `niveisPersonalizados` com a lista gerada — trabalho pequeno.
- DEM público continua recusado por resolução em lote urbano (DR-08); o site aceita qualquer área porque desenha gleba, não lote.
- Sem pés (DR-06).

---

# Pedido posterior — 2026-09-12: fase 13 (modo Intervalo)

## Pedido original

Sobre as três pendências declaradas na fase 12, o usuário respondeu:

> 1. implementar
> 2. ok
> 3. somente metros

Ou seja: o modo **Interval** do Contour Map Creator entra; a recusa do DEM público em lote urbano (DR-08) fica; sem pés (DR-06) fica.

## Decisões

| Tema | Decisão |
|---|---|
| O que é | `INTERVALO`: níveis em mín + passo·i, i = 1, 2, … enquanto < máx — `niveisPorIntervalo`. O próprio mínimo fica de fora (curva na cota mínima é um ponto). Teto de 200 com a mesma mensagem da equidistância |
| Diferença da equidistância | a equidistância ancora em MÚLTIPLOS do passo (100,50 · 101,00 · 101,50 — cotas redondas, o padrão de planta); o intervalo ancora no MÍNIMO do terreno (100,82 · 101,32 · 101,82 num terreno que começa em 100,32). A ajuda do painel diz isso |
| Campo | o mesmo estado da equidistância (`equidistanciaM`, com a sugestão como placeholder), rotulado "Intervalo a partir do mínimo (m)" — um número só, sem um estado novo para a mesma pergunta |
| Persistência | `modo_niveis = 'INTERVALO'`, `niveis_m` = a lista efetiva, `equidistancia_m` = o próprio passo pedido (não o menor passo entre níveis, que é igual). Migration `aplicar_20270921000014` só troca o CHECK |
| Rótulos | com 4 botões, "Nº de níveis" virou "Número" (o campo abaixo continua "Número de níveis") para caber numa linha; a estatística da versão diz "6 · 0,50 m do mínimo" |

## Estado — fase 13

- [x] F39 — `niveisPorIntervalo`, `ModoDeNiveis` com o quarto valor, hook (`INTERVALO` usa o passo como `equid` e erro próprio quando não cabe), painel (botão, campo, ajuda, estatística), harness `?intervalo=1`
- [x] Testes: `blueprintTopografiaFase13` (4: exclui o mínimo e o máximo exato; a mesma faixa e passo dão cotas não redondas, diferentes da equidistância; teto; hash) e `PainelTopografiaFase13` (3: quarto botão, campo/ajuda/placeholder e o estado compartilhado, estatística)
- [x] Migration `aplicar_20270921000014` aplicada e conferida de fora: CHECK com os 4 valores
- [x] Suíte (283 arquivos, 3.899 testes, 0 falhas), typecheck, `check-ui-standard.sh`, `check-xss-sinks.sh`, `verificar:build`, `build` verdes; harness fotografado sem erros (toggle de 4 botões e a estatística numa linha só)
- [x] Publicado e provado — `8d24a5f2` em `main` (12/09/2026), `conferir-producao.sh "Intervalo a partir do mínimo"` achou o texto no bundle servido
- [x] **Passeio logado em produção** (`c:/tmp/pwtest/topografia-prod13.mjs`): estudo novo → lote com cotas 100 / 100,8 / 102,6 / 101,5 → toggle "Equidistância | Intervalo | Número | Lista" → Intervalo = 0,3 m (placeholder 0,50) → Gerar: "Curvas 8 · 0,30 m do mínimo", `POST 201` com `modo_niveis = INTERVALO`, `niveis_m = [100,3 … 102,4]`, `equidistancia_m = 0,3` — cotas a partir do mínimo, não múltiplos redondos. Zero erros. Versão apagada pela tela; estudo por SQL

---

# Pedido posterior — 2026-09-12: fase 14 (passeio 3D)

## Pedido original

> passeio 3d

(Escolhido da lista de pendências abertas. O item vinha da fase 1: "walk do 3D acompanhar o relevo".)

## O que se achou antes de escrever código

O passeio JÁ acompanhava o relevo desde a fase 2 (`bfa3feb0`, F10): `Percorrer` recebe `alturaDoChao(x, z)` e a cada quadro põe o olho a 1,6 m do chão amostrado na grade. A lista de pendências da fase 1 é que não tinha sido anotada. Em vez de reimplementar, a fase 14 PROVA de ponta a ponta e conserta o que a prova pegou.

## Decisões

| Tema | Decisão |
|---|---|
| Prova | `docs/spikes/topografia/passear.mjs`: abre a vista 3D do harness (R3F real, swiftshader), entra em "Percorrer", anda 1,5 s com W, D e S e, a cada parada, lê a posição da câmera pelo registro de raízes do R3F (`_roots`, exposto pelo harness em `window.__topografia.camera`) e compara com a cota do chão sob ela + 1,6 m. É um PORTÃO (sai 1 se o olho não estiver sobre o relevo ou se andar não mudar a altura) |
| Fora do lote | `amostradorDoChao(grade)`: dentro, a bilinear de sempre; fora da grade ou sobre `nodata` (a margem em volta do lote, que a triangulação não cobre), a cota do **nó válido mais próximo** (busca por anéis, cache por célula — é chamada a cada quadro). O editor e o harness passam isto ao `Percorrer`; o corte, a malha e os muros continuam com `amostradorDaGrade` (fora do lote é fora mesmo) |
| Ao entrar | o olhar é nivelado (mantém a direção no plano, zera a inclinação): a órbita vinha olhando para BAIXO, para o centro do desenho, e a pé isso era olhar para os próprios pés |

## Estado — fase 14

- [x] F40 — `amostradorDoChao`, `alturaDoChao3d` do editor e `chao3d` do harness usando-o; nivelamento ao entrar; `passear.mjs`
- [x] Testes: `blueprint3dRelevoWalkSombra` +2 (fora da grade = borda; sobre `nodata` = nó válido mais próximo; grade vazia = null; altura contínua ao cruzar a divisa)
- [x] Portão do passeio no harness: ao entrar y = chão + 1,600; após W/D/S o olho fica a 1,6 m do chão em cada parada (erro < 2 cm); a altura variou 0,57 m andando; 0 erros
- [x] typecheck, `check-ui-standard.sh` (Blueprint3DViewer, BlueprintEditor), `check-xss-sinks.sh`, `verificar:build`, `build` verdes. Suíte: 3.900 passam; a única falha é `WarrantyModule.test.tsx` ("pílula de estado"), que já falha em `origin/main` sem estas mudanças (commit `814dd59f` de outra frente ativa) — não é desta frente
- [ ] Publicado e provado
- [ ] Passeio logado em produção

### Achados desta fase (só a medição pegou)

- **Degrau na divisa**: ao sair do lote a pé, o chão caía do relevo (−0,58 m no harness) para o zero de uma vez, e voltar subia de novo. A grade tem margem e os nós fora do casco dos pontos são `nodata`; trazer o ponto para a caixa da grade não bastava — precisou ser o nó válido mais próximo.
- **Olhar para os pés**: a inclinação da órbita vinha junto para o modo a pé.

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
