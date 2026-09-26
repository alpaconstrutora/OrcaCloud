# Incorporação › Planta Inteligente — Topografia, Loteamento, GeoINCRA/SIGEF, REURB, CAR, Raster

> Destino definitivo no repositório (REGRA #6): `docs/planos/2026-09-25-planta-inteligente-topografia-loteamento-geo.md`.
> Este arquivo é o rascunho do plan mode; ao sair do plan mode o primeiro item é copiá-lo para lá.

## Pedido original (sessão de 2026-09-25)

> analise Algumas ferramentas para implementarmos em incorporacao < planta inteligente. Anelise o que ja temos implementado e o que falta implementar e faça um plano para implementacao
>
> essencialmente temos uma combinação de CAD + topografia + geoprocessamento + loteamentos/REURB + GeoINCRA/SIGEF + terraplenagem/volumetria + raster/ortofotos + CAR. Metrica Support
> [segue a lista completa de 35 seções do Métrica TOPO — 1. Núcleo/Projetos · 2. Banco cadastral · 3. CAD próprio · 4. Visualização · 5. Pontos topográficos · 6. Importação · 7. Exportação/locação · 8. Linhas/polilinhas · 9. Cotas e medições · 10. Topografia convencional · 11. Cartografia · 12. GeoINCRA/SIGEF · 13. ODS SIGEF · 14. Integração SIGEF · 15. Loteamentos · 16. Documentação de loteamentos · 17. Locação · 18. Cadastro urbano · 19. REURB · 20. Google/imagens · 21. CAR · 22. MDT · 23. Curvas de nível · 24. Volumetria · 25. Terraplenagem · 26. Perfis · 27. Mapas temáticos · 28. Raster · 29. Vetorização · 30. DEM · 31. CAD↔Raster · 32. KML/KMZ · 33. Formatos · 34. Automação de documentos · 35. Suporte — e o resumo em 12 macrocomponentes: CAD, Projetos, Pontos, Topografia, Cartografia, GeoINCRA, Urbano, REURB, CAR/GIS, MDT/Volumetria, Terraplenagem, Raster.]
>
> O que considero mais importante: o valor não está em possuir um CAD; está no encadeamento levantamento → pontos → geometria CAD → georreferenciamento → cálculo → documentação → locação/exportação. E em nichos: GeoINCRA → SIGEF; loteamento/REURB → memoriais + plantas individuais automáticas; MDT → terraplenagem + volumetria; ortofoto/DEM → vetorização + curvas + pontos 3D.

## Contexto

O pedido compara a Planta Inteligente (Incorporação › Planta Inteligente, `components/blueprint/*`, kernel `blueprint-kernel-ts-0.57.0`) com o catálogo funcional do Métrica TOPO (CAD topográfico brasileiro). O inventário abaixo foi lido no código em 25/09/2026 (três varreduras: kernel/topografia, CAD/editor/formatos, Incorporação/cadastros/documentos). Conclusão geral: **o motor de MDT/curvas/terraplenagem já existe e é extenso** (17 fases da topografia + P2.64/P2.65 de hoje: 10 módulos `blueprintTopografia*`, ~7.000 linhas, 28 arquivos de teste, versões imutáveis em `blueprint_study_topografia`); **o que falta é o encadeamento para fora do lote único**: cartografia real (CRS/datum), feições de levantamento, documentação do imóvel (memorial, roteiro, malha de coordenadas), loteamento (quadra/lote/via), terraplenagem de vias (eixo/greide/seções), raster georreferenciado (GeoTIFF/tiles/SHP) e as peças normativas (GeoINCRA/SIGEF, CAR, REURB).

Premissa mantida do produto (topografia fase 17): o software **não substitui o responsável técnico** — gera as peças e o fluxo de emissão; a certificação (SIGEF), o registro e a ART continuam com o profissional.

## Inventário — o que já existe × o que falta (12 macrocomponentes)

Legenda: ✅ existe · 🟡 parcial · ❌ não existe · ⛔ fora por decisão

### 1. CAD (desenho, edição, camadas, cotas, impressão)
- ✅ Famílias BIM (parede reta/curva, abertura, estrutural 6 tipos, telhado, escada, guarda-corpo, rodapé, núcleo, vaga, componente/mobiliário, redes MEP), anotações `TEXTO|LEADER|LINHA|HACHURA|COTA_ANGULAR|NUVEM` (`utils/blueprintKernel/model.ts:1890`), grupos com origem (= blocos), tabelas na prancha (`utils/blueprintTabelas.ts`).
- ✅ Edição: undo/redo por estado (`ModelHistory`, `commands.ts:4666`), `applyBatch`, copiar/colar/duplicar, mover (arraste, setas, por valor), girar, espelhar, matriz, alinhar, dividir/unir parede, estender até face (`utils/blueprintEstenderAteFace.ts`), cortar parede no pilar, laço retangular janela/cruzamento, isolar, travas por elemento.
- ✅ OSNAP 8 tipos (`utils/blueprintEncaixe.ts`), grade em mm, orto F8/Shift; pan/zoom (roda `passive:false`, ±, enquadrar, 1:100); vistas planta/situação/implantação/cobertura/forro/cortes/elevações/3D órbita+walk; pavimentos.
- ✅ Prancha: A4–A0, escalas 1:1…1:500, carimbo com CAU/CREA, conjunto de pranchas com template (`utils/blueprintPranchas.ts`, `blueprint_sheet_templates`), PDF/PNG (jsPDF), DXF R12 com camadas fixas `PLANTA-*`/`TOPO-*`.
- ❌ Camada nomeada de usuário (cor/linetype/espessura por camada), estilo de cota/texto nomeado, cota linear manual, offset/paralela, fillet/chamfer, trim genérico, escalar geometria, polar tracking, igualar propriedades, localizar objeto, laço poligonal/fence, círculo/elipse livres, imagem como entidade, malha de coordenadas na prancha, viewports múltiplos, layouts múltiplos.
- **Decisão proposta:** não replicar CAD genérico (o próprio pedido diz que o valor está no encadeamento). Entram só os comandos que as cadeias abaixo exigem: **offset/paralela** (vias e recuos do loteamento), **cota linear manual**, **malha de coordenadas na prancha**, **camada de exibição por feição de levantamento**. Fillet/chamfer/polar/viewports/layers de usuário ficam fora.

### 2. Projetos / banco cadastral
- ✅ Estudos N por org, ramos (alternativas), autosave, snapshot imutável com hash, permissões, GED/compartilhar com cliente, API/webhooks/plugins, DWG→DXF (Edge `dwg-converter`), IFC/DXF/PDF/PNG/COLLADA/BCF/XLSX.
- 🟡 Georreferência: `Georreferencia { latitude, longitude, elevacaoM, rotacaoNorteDeg, projetada?: { lesteM, norteM, crs } }` (`model.ts:2770`) — **`crs` é texto opaco; o kernel não converte nada**. Única projeção no repo: `utmParaLatLon` própria (GRS80) em `blueprintTopografiaImportacao.ts:390`; `geoParaLocal`/`localParaGeo` são plano tangente por metros/grau.
- 🟡 Cadastros: `commercial_properties` tem `registration_number` (matrícula), `registry_office` (cartório), `iptu_registration`, `type='LAND'` — **sem lat/long nem geometria**; `empreendimentos` tem `matricula` (sem cartório), `responsavel_tecnico`/`crea_cau` (texto livre), `terreno_*` (medidas, sem coordenadas); `blueprint_studies` **não tem `empreendimento_id`** (só `project_id`); `blueprint_study_urban_context.empreendimento_id` sem FK; UNIQUE por estudo = **um lote por estudo** ("gleba multi-lote está fora", literal na migration).
- ❌ Cadastro de proprietários (só `unit_occupancies.role='PROPRIETARIO'` → `clients`), de responsáveis técnicos reutilizável (só `contract_technical_responsibilities`, escopo contrato), de matrícula como entidade, de gleba autônoma. Zero ocorrências de CAR/CCIR/NIRF/INCRA/SIGEF.
- ⛔ Backups .TBKP/.ZIP — o histórico de snapshots cobre. Elipsoide configurável — SIRGAS2000/GRS80 é o único legal no Brasil desde 2015; SAD69/Córrego Alegre entram só como **origem de conversão**.

### 3. Pontos topográficos
- ✅ `PontoCotado { x, y, cotaM }` (`blueprintTopografia.ts:91`), importação de 9 formatos (`FormatoDeImportacao`: TEXTO PNEZD, GEOJSON, KML, DXF, SVG, LANDXML, perfis/curvas do ÒPURA) com separador/cabeçalho/ordem N-E/UTM detectados, ancoragem (direto/centro do lote/georreferência), linhas de quebra por código `LQ<n>`, contorno do lote pelo arquivo (P2.65: código de divisa `M1…`, polilinha DXF por camada, `Polygon` KML/GeoJSON, `<Parcel>` LandXML), proveniência sha256, DEM remoto (Open-Meteo GLO-90; SRTM 30 m via Edge `topografia-elevacao`).
- ❌ Ponto com **nome/descrição/código/símbolo** (o `P` e o `D` do PNEZD são descartados), edição de ponto, duplicados, interpolar/pontuar polilinha, ponto de locação, exportação de pontos (TXT XYZ, XLS, KML de pontos, "para estação"), GPX, Shapefile.
- ⛔ Download serial de estação total/GPS, processamento PPP (serviço externo IBGE), Topcon/Trimble proprietários.

### 4. Topografia convencional
- ✅ Quadro de divisas (`utils/blueprintTerreno.ts`: papel frente/fundos/laterais derivado, `medidaEscrituraMm`, `confrontante`, divergência com tolerância 10 mm, `erroFechamentoMm`, área/perímetro), envelope por recuos, aproveitamento, `conferirLote` (testada/área mínima da zona).
- ❌ Azimute/rumo e distância por lado (azimute existe só para insolação), nomeação de vértices (P1…Pn / M-P-V), tabela de roteiro perimétrico, **memorial descritivo do imóvel** (os únicos memoriais são o executivo de terraplenagem e o de incorporação, ambos jsPDF hardcoded), planta de situação com malha de coordenadas, restituição por memorial/matrícula (texto → polígono), divisão de áreas, locação de divisas.
- Reúso: motor docx (`services/docxRenderService.ts` + `docxFieldCatalog.ts` — sem origem `terreno`/`lote`; extensão é aditiva), `document_templates`, `EmitDocumentModal.tsx`.

### 5. Cartografia
- 🟡 Só `utmParaLatLon` (inversa) própria + `zonaUtmDe`; `IfcMapConversion` sai quando há E/N + CRS informados.
- ❌ Direta lat/long→UTM, SAD69/Córrego Alegre→SIRGAS2000, **Sistema Geodésico Local (PTL/SGL, NBR 14166 / INCRA)**, convergência meridiana e fator de escala, DMS, monografia de vértice, DXF geográfico em lat/long.

### 6. GeoINCRA / SIGEF
- ❌ Tudo: vértices M/P/V com código do credenciado, sigma E/N/h e método, tipos de limite NTGIR, confrontantes por segmento (o `confrontante` por divisa existe, mas por lado do lote, não por trecho com tipo de limite), planilha ODS SIGEF, memorial GeoINCRA, planta padrão INCRA, área em SGL, carta de anuência, relatório de vértices.
- ⛔ Integração com o portal SIGEF (sem API pública; consulta e envio são do credenciado).

### 7. Urbano / Loteamento
- 🟡 Ancestrais: `SubRegiao` do terreno (0.53.0, `model.ts:2028` — é material/permeabilidade, não lote), `Unidade` (E2.2), vagas, `empreendimento_types` com `motor_category horizontal`, `empreendimento_units` + espelho de vendas ↔ `commercial_properties` (triggers `20270815000007/8`), tabelas de preço, portal do corretor.
- ❌ Tipo de empreendimento **Loteamento** (a palavra só existe em `investor_opportunities.opportunity_type`), entidades Quadra/Lote/Via/Área pública no kernel, subdivisão automática, numeração e cotagem automáticas, conferência Lei 6.766/79 + lei municipal, memorial e planta individual por lote, tabelas de lotes/quadras/áreas, locação de lotes, campos de lote na unidade (quadra, número, testada, área, confrontantes).

### 8. REURB
- ❌ Depende de 7 (quadras/lotes), 12 (ortofoto) e 2 (proprietários/edificações). Documentos para cartório/prefeitura = templates docx.

### 9. CAR / GIS
- 🟡 KML leitura/escrita (curvas, lote), GeoJSON leitura, mapa de declividade (existe).
- ❌ Shapefile (.shp/.shx/.dbf/.prj) leitura/escrita, KMZ, atributos livres por feição, APP/Reserva Legal como feições, tabela de perímetros/áreas/coordenadas.

### 10. MDT / Volumetria
- ✅ Grade + marching squares, TIN Bowyer-Watson (não CDT; breaklines por densificação), TIN importada (LandXML/3DFACE), curvas por equidistância/intervalo/número/lista, mestras, estatísticas, hipsometria (8 classes/equidistância/arco-íris), declividade por faixas, **platô plano** (cota única, equilíbrio, corte/aterro, talude por aresta, banqueta, via de serviço, muro por aresta, empolamento/contração), drenagem + pré-dimensionamento, perfil ao longo de linha, malha 3D, walk sobre o relevo, `blueprint_study_terraplenagem`.
- ❌ Volume entre **duas superfícies quaisquer** (só platô × terreno), platô **inclinado** (greide), volume de região selecionada, método das seções, editar triangulação (trocar aresta/apagar triângulo), exportar MDT (LandXML só entra), mapa de inundação (cota de cheia), DEM raster local (só API remota por pontos).

### 11. Terraplenagem e arruamento
- ❌ Eixo de projeto com estaqueamento, greide (rampas + curvas verticais), seção tipo, seções transversais por estaca, volumes por áreas médias, nota de serviço simples/composta, exportação de cotas do greide, pontos de locação. Existe só o perfil do terreno natural e da superfície do platô (`perfilAoLongo`, `superficieDeProjeto`).

### 12. Raster / ortofoto / DEM / vetorização
- 🟡 Planta de fundo PDF/IMAGEM calibrada por 2 pontos ou escala declarada (`utils/blueprintUnderlay.ts`, `blueprint_underlays`), DXF como fundo, desenho sobre o fundo = vetorização (as ferramentas já desenham sobre o underlay).
- ❌ Ortofoto **georreferenciada** (GeoTIFF/world file) posicionada pela georreferência sem calibração manual, tiles de satélite/OSM como fundo (Leaflet só no Market Intelligence, `OpuraMarketModule.tsx:853`), DEM GeoTIFF float → grade, clip de imagem, KMZ.
- ⛔ ECW e JP2 (codecs proprietários/complexos).

### Dependências: o que há e o que não há
`package.json`: three, @react-three/fiber/drei, konva, leaflet 1.9.4, web-ifc, pdfjs-dist, jspdf, xlsx, exceljs, docxtemplater. **Não há**: proj4, shpjs, geotiff, @turf, delaunator/cdt2d, jszip. Toda a geometria é própria.

## Decisões tomadas com o usuário (25/09/2026)

1. **Escopo**: os quatro blocos entram — Loteamento + comercial; Cartografia + documentação do imóvel; Terraplenagem de vias + volumetria; Raster/GIS + GeoINCRA/SIGEF + REURB/CAR. O que fica fora está nomeado no fim.
2. **Lote = unidade do empreendimento**: tipo `Loteamento` em `empreendimento_types` (`motor_category='horizontal'`, `is_system=true`); **quadra = `empreendimento_towers`**, **lote = `empreendimento_units`** (a unidade exige `tower_id`, a cardinalidade é natural). Reaproveita espelho de vendas, tabela de preços, portal do corretor e `unit_occupancies.role='PROPRIETARIO'` sem código novo nessas telas.
3. **Cartografia com `proj4`** (dependência nova, ~150 KB) para UTM/SIRGAS2000/WGS84/SAD69/Córrego Alegre; **SGL/PTL (NBR 14166) é código próprio** (proj4 não tem). O `utmParaLatLon` próprio de `blueprintTopografiaImportacao.ts:398` vira caso de teste de equivalência, não é apagado na mesma fase.

## Decisões de arquitetura (minhas, registradas)

- **Payload canônico × tabela lateral** — critério da topografia fase 7 e da memória da escritura: vai no payload o que o usuário **desenha/edita com ferramenta do kernel** (undo, autosave em `blueprint_branches.draft_payload`, ids reatribuídos por `modelFromCanonicalPayload`); fica fora o **dado do mundo** (importado, amostrado, grande).
  - Dentro (bump + goldens): Quadra/Lote/Via/Área pública (B1); atributos de vértice da divisa — nome, tipo M/P/V, sigma, método (A1/A4).
  - Fora (tabela lateral): feições de levantamento (A2, tabela **mutável** nova — `blueprint_study_topografia` é imutável por schema), greide/seções/nota de serviço (C2), rasters (A3), emissões documentais.
  - Derivado nunca é gravado: azimute, rumo, roteiro, área SGL, faixa da via por offset, subdivisão proposta, conferência 6.766.
- **F0 (geo) não muda o kernel**: `Georreferencia.projetada.crs` continua texto (validar em `validateModel` rejeitaria payloads publicados). Interpretação e validação de EPSG moram em `utils/geo/`, com aviso no painel.
- **Lote não é `Boundary`**: `medirTerreno`/`anelDoTerreno` (`utils/blueprintTerreno.ts`) assumem UM anel; a gleba continua sendo as `Boundary`. Lote é entidade própria com `pontos`, `quadraId`, `numero`, `testadaIndex`, molde `SubRegiao` (`model.ts:2028`, comandos `AddSubRegiao/SetSubRegiaoProps/MoveSubRegiaoVertex/DeleteSubRegiao`).
- **Vínculo Planta ↔ Empreendimento pelo `uid`, nunca pelo `id`** (ids são reatribuídos ao carregar): `empreendimento_towers.blueprint_quadra_uid`, `empreendimento_units.blueprint_lote_uid`. Direção do vínculo: `empreendimentos.blueprint_study_id` (espelho de `planta_ai_study_id`, migration `20270209000000`), **não** `blueprint_studies.empreendimento_id`.
- **Sync sem motor novo**: `services/sync/` (planner/applier/conflitos) é compartilhado por adapter; entra `SyncOrigin='blueprint'` + `blueprintLoteamentoAdapter.ts` (molde `plantaAdapter.ts`) + `blueprintEmpreendimentoSync.ts` (cola, molde `plantaEmpreendimentoSync.ts`). Preço e status **nunca** saem da Planta.
- **`blueprint_study_urban_context` continua UM por estudo**: a zona e a Lei 6.766 se aplicam à **gleba**; a conferência por lote é derivada. Não criar contexto por lote.
- **CAD genérico fora**: entram só offset/paralela (via e recuo), cota linear manual, malha de coordenadas na prancha e camada de exibição por feição. Fillet/chamfer/polar/layers de usuário/viewports não entram.
- **Regras do repo**: todo service novo recebe `organization_id` do estudo (`study.organization_id`, como `useBlueprintTerraplenagem`), arquivo novo fora do `BASELINE` de `orgContextGuard` (REGRA 5); toda tabela nova com policy `is_org_member(organization_id)` sem perna `OR` e toda função com `REVOKE … FROM PUBLIC, anon` na mesma migration (REGRA 7); Edge Function nova com gate em `_shared/auth.ts`; migrations `aplicar_20270925*+` aplicadas por `db query -f`, nunca `db push`; ritual de fase do roadmap unificado (tsc, check-ui, suíte cheia, build, doc, commit, push, `conferir-producao.sh`).

## Plano — três frentes, uma fase por commit

Ordem recomendada de execução (valor primeiro, dependências respeitadas): **B1 → A0 → C1 → B2 → B3 → B4 → A1 → C2 → A2 → A3 → A4 → C3 → A5**. A0 não bloqueia B nem C (mm locais). Cada fase abaixo diz o que muda e como sei que terminou.

### Frente B — Loteamento (Terreno › grupo novo "Loteamento")

**B1 — Quadra, Lote, Via e Área pública no kernel · bump 0.57.0 → 0.58.0**
- `utils/blueprintKernel/model.ts`: `Quadra { id, uid, nome, pontos }`, `Lote { id, uid, quadraId, numero, pontos, testadaIndex, tipo: 'LOTE'|'ENCRAVADO' }`, `Via { id, uid, nome, eixo: Point[], larguraMm, calcadaMm }`, `AreaPublica { id, uid, tipo: 'VERDE'|'INSTITUCIONAL'|'VIARIO'|'RESERVA', pontos }`; listas em `BlueprintModel`; `find*`. `commands.ts`: `Add/Set*Props/Move*Vertex/Delete*` (molde SubRegiao); `canonical.ts` serializa omitindo listas vazias; `units.ts:279` bump; goldens recapturados com o rito do cabeçalho de `__tests__/blueprintKernelGoldens.test.ts`.
- `utils/blueprintLoteamento.ts` (puro, novo): `faixaDaVia(eixo, largura)` (offset dos dois lados, cantos por interseção), `medirLote` (área, testada, laterais, fundo pelo mesmo critério de `papeisSugeridos`), `confrontantesDoLote` (vizinhos por aresta compartilhada: lote, via, área pública ou divisa da gleba com o `confrontante` já gravado), `numerarQuadra` (sentido horário a partir da esquina escolhida), `areasDoLoteamento` (tabela: lotes, vias, verde, institucional, % sobre a gleba).
- `components/blueprint/BlueprintEditor.tsx` (`ABAS_DO_RIBBON`): grupo **Loteamento** na aba Terreno — Quadra, Lote, Via, Área pública, Numerar, Cotar lotes (liga as cotas derivadas por lote em `MenuExibir`). Painel de propriedades por entidade em `PainelDeTarefa` (nome/número/largura/tipo). Canvas desenha faixa da via, hachura por tipo de área pública, número no centróide do lote.
- `blueprint_objects.object_type` CHECK: `ALTER` no molde da migration da escada (`aplicar_20270919000009`) se o publish gravar essas famílias como objetos (confirmar como `SubRegiao` é publicado antes).
- Testes: `__tests__/blueprintLoteamento.test.ts` (faixa da via em polilinha com canto, lote de esquina, encravado sem via = aviso, numeração determinística), goldens, `BlueprintEditor.test.tsx` (+ grupo).
- **Terminou quando**: desenhar quadra + 3 lotes + via, numerar, cotar; Ctrl+Z desfaz o lote inteiro; publicar e reabrir mantém `uid`; DXF sai com camadas `LOTE-QUADRA/LOTE-LOTE/LOTE-VIA/LOTE-AREA`.

**B2 — Subdivisão automática e conferência Lei 6.766/79 · sem bump (derivado)**
- `utils/blueprintLoteamento.ts`: `subdividirQuadra(quadra, { testadaMinMm, areaMinMm2, profundidadeMm, viasAdjacentes })` → lista de anéis **proposta** (lotes de meio por fatias perpendiculares à testada; esquinas com testada dupla); `conferirLoteamento(model, regras)` → avisos: lote < 125 m² / testada < 5 m (art. 4º II), % áreas públicas abaixo do exigido pela lei municipal (valor da zona, com fallback declarado), lote encravado, lote sem testada em via, faixa não edificável de 15 m em rodovias/dutos (art. 4º III) se houver `Boundary kind='RESTRICAO'`.
- Regras entram pelo vocabulário da zona já existente (`utils/blueprintZonaUrbanistica.ts`, `blueprint_rule_sets`): campos `lote_area_min`, `lote_testada_min`, `areas_publicas_min_pct`.
- UI: tarefa "Lotear quadra" (drawer, parâmetros + prévia tracejada + **Aceitar** que vira `applyBatch`); relatório **Conferência do loteamento** no menu Conferência da aba Analisar.
- **Terminou quando**: quadra retangular 60×30 m com testada 12 m gera 10 lotes de meio em um lote/um Ctrl+Z; a conferência acusa lote de 100 m² e some ao corrigir; teste de determinismo (mesma entrada → mesmo hash).

**B3 — Tipo Loteamento e sync com o Empreendimento · migration, sem bump**
- Migration `aplicar_20270925000001_loteamento_empreendimento.sql`: seed `Loteamento` em `empreendimento_types` (`is_system`, `organization_id NULL`, `motor_category='horizontal'`); `empreendimentos.blueprint_study_id UUID` (sem FK, molde `planta_ai_study_id`); `empreendimento_towers.blueprint_quadra_uid UUID`, `empreendimento_units.blueprint_lote_uid UUID` + índice parcial único (molde `empr_units_instance_uidx`), `quadra TEXT`, `lote TEXT`, `testada_m NUMERIC`, `confrontantes JSONB`.
- `services/sync/types.ts`: `SyncOrigin` + `'blueprint'`, `PROVENANCE.blueprint = { towerKey: 'blueprint_quadra_uid', unitKey: 'blueprint_lote_uid' }`, `ORIGIN_LABEL`; campos novos no registry do planner (grupo `estrutura`). `services/sync/blueprintLoteamentoAdapter.ts`: payload publicado → `CanonicalTower` (quadra) / `CanonicalUnit` (lote: name "Lote 12", `typology='LOTE'`, `private_area`, `quadra`, `lote`, `testada_m`, `confrontantes`, `position_type` pela testada; `createOnly` status `DISPONIVEL`, price `null`). `services/blueprintEmpreendimentoSync.ts`: `previewSync`/`syncToEmpreendimento`/`writeBack` (área da gleba) com `buildPlan`/`applyPlan`/`materializeConflicts` + auditoria.
- `types/empreendimento.ts` + `components/empreendimento/` (aba Sincronização já existe: acrescenta a origem Planta Inteligente; Torres & Unidades mostra "Quadra"/"Lote" quando `tipo='loteamento'`, rótulo por slot da nomenclatura).
- Planta: aba Colaborar › "Enviar ao empreendimento" (drawer com prévia do plano de sync — molde da tela de sync do Planta AI).
- **Terminou quando**: estudo com 2 quadras/12 lotes publicado → sync cria 2 torres + 12 unidades com `blueprint_lote_uid`; segundo sync sem mudança = plano vazio; renomear um lote na Planta = 1 update; `commercial_properties` espelhadas pela trigger `20270815000007`; lote aparece no portal do corretor com preço da tabela; `orgContextGuard` e `segurancaMigrations` verdes.

**B4 — Documentação do loteamento: memorial e planta por lote, tabelas, KML, locação · sem bump**
- `services/docxFieldCatalog.ts`: origens `gleba` e `lote` (aditivo): nome do loteamento, quadra, número, área, testada, lados com medidas e confrontantes, coordenadas dos vértices (UTM e lat/long quando houver georreferência — A0), matrícula/cartório da gleba (`commercial_properties.registration_number/registry_office` ou `empreendimentos.matricula`). `document_templates` de fábrica: "Memorial descritivo de lote", "Memorial de área pública", "Memorial do loteamento" (tabular). Emissão em lote: um docx por lote → GED (`blueprintGedService.publicarNoGed`).
- `utils/blueprintPranchas.ts`: `TipoDePrancha` + `'LOTE'` e `'LOTEAMENTO'`; `PranchaPlanejada.loteUid`; `blueprintExport.ts`: `desenharLote` (lote em destaque, quadra em cinza, cotas dos lados, norte, malha de coordenadas quando georreferenciado — A1, tabela de vértices) e `desenharLoteamento` (planta geral com números e tabela de áreas). Conjunto de pranchas: "uma prancha por lote" no `InclusaoNoConjunto`.
- `utils/blueprintTabelas.ts`: famílias `LOTE`/`QUADRA`/`AREA_PUBLICA` com colunas (sementes: "Lotes por quadra", "Áreas do loteamento", "Cadastro urbano" = lote × proprietário via `unit_occupancies` × edificação); xlsx pelo caminho existente (`blueprintPlanilha.ts`).
- Exportação: KML do loteamento (um `Placemark` por lote, pasta por quadra; exige georreferência), pontos de locação (vértices de lote/quadra em CSV/TXT `P,N,E,Z` e KML de pontos — reaproveita `csvDaGrade`/`kmlDasCurvas` como molde).
- **Terminou quando**: emitir memorial de 12 lotes gera 12 docx no GED com confrontantes certos (teste de `confrontantesDoLote` contra fixture de quadra com esquina); conjunto A3 com 12 pranchas LOTE + 1 LOTEAMENTO; KML abre no Google Earth no lugar certo (prova com o lote de teste georreferenciado); tabela "Áreas do loteamento" fecha 100 %.

### Frente A — Cartografia, documentação do imóvel, levantamento, raster, GeoINCRA

**A0 — Módulo geodésico `utils/geo/` com proj4 · sem bump**
- `npm i proj4` (+ `@types/proj4`). `utils/geo/crs.ts`: catálogo fechado de EPSG aceitos (SIRGAS 2000 UTM 17S–25S `31977…31985`, SAD69 UTM `2917x…2918x`, Córrego Alegre, `4674`, `4326`), `lerCrs(texto)` (aceita "EPSG:31983", "SIRGAS 2000 / UTM 23S", "UTM 23S"), `zonaDaLongitude`; `utils/geo/projecao.ts`: `geoParaProjetado`, `projetadoParaGeo`, `transformarDatum`, `convergenciaMeridiana`, `fatorDeEscala`; `utils/geo/sgl.ts`: Sistema Geodésico Local NBR 14166 (origem, elevação, E/N locais ↔ geodésicas; é o que o INCRA usa para área); `utils/geo/formato.ts`: DMS, azimute↔rumo, distância e azimute entre vértices projetados.
- `blueprintTopografiaImportacao.ts`: `utmParaLatLon` passa a delegar; teste de equivalência (≤ 1 mm) contra a implementação antiga em 20 pontos do Brasil antes de remover.
- `components/blueprint/PainelTerreno.tsx` (georreferência): campo CRS vira select do catálogo com aviso quando o texto gravado não é reconhecido; mostra E/N derivados de lat/long (rotulados "derivado") e a convergência meridiana; ancoragem: "origem local = vértice X da divisa" (grava só `projetada.lesteM/norteM`, nada de UTM em mm no kernel).
- Exportação: `gerarDxf` ganha opção **DXF georreferenciado** (coordenadas em E/N metros no CRS) e **DXF em lat/long**; KML e IFC (`IfcMapConversion`) passam a usar o mesmo módulo.
- Testes: `__tests__/geo*.test.ts` contra pontos oficiais IBGE (RBMC) com SIRGAS e SAD69; ida e volta; fuso errado detectado (E fora de 160–840 km).
- **Terminou quando**: lote em Belo Horizonte informado em UTM 23S SAD69 abre em KML no lugar certo (< 1 m do SIRGAS de referência); DXF georreferenciado abre no QGIS sobre o OSM no lugar.

**A1 — Documentação do imóvel: vértices, azimutes, roteiro, memorial, malha · bump 0.58.0 → 0.59.0**
- Kernel: `model.verticesDoTerreno: VerticeDoTerreno[]` `{ uid, ponto, nome, tipo?: 'M'|'P'|'V', sigmaMm?, metodo? }` ancorado por coincidência com as pontas das `Boundary` (molde `Label/labelUid`, `model.ts:739`); comandos `SetVerticeDoTerreno`, `NomearVertices` (P1…Pn ou padrão GeoINCRA em A4) — `SetBoundaryEscritura` (`commands.ts:760`) é o molde. Bump + goldens.
- `utils/blueprintTerreno.ts`: `roteiroPerimetrico(model, geo)` derivado — vértice, E, N, lat, long, azimute (plano + verdadeiro por convergência), rumo, distância, confrontante; área pela escritura × desenho × SGL (A0). `restituirMemorial(texto)`: parser de memorial convencional ("segue com azimute 45°30'10" e distância 32,50 m até o vértice P2, confrontando com…") → polígono + confrontantes, com relatório de erro de fechamento; entrada pela tarefa "Restituir memorial" (aba Terreno › Lote) e pelo "Importar levantamento" (formato TEXTO_MEMORIAL detectado pelo conteúdo, molde `detectarFormato`).
- `QuadroDeDivisas.tsx`: colunas azimute/rumo/distância; edição do nome do vértice.
- Prancha: `TipoDePrancha` `'TOPOGRAFICA'` e `'SITUACAO'`; `desenharMalhaDeCoordenadas` (linhas E/N a cada passo redondo pela escala, rótulos nas margens, norte verdadeiro + convergência), tabela de vértices e roteiro na folha; **cota linear manual** como anotação `COTA_LINEAR` (dois pontos + afastamento) — é a única entidade CAD nova desta fase.
- Docx: origem `terreno` em `docxFieldCatalog.ts` (roteiro tabular, área, perímetro, matrícula/cartório, responsável técnico e CAU/CREA do carimbo do template de prancha); template de fábrica "Memorial descritivo convencional".
- **Terminou quando**: lote de 4 lados fechado → roteiro com 4 linhas e azimutes que fecham 360° ± tolerância; memorial docx emitido com o texto no formato convencional; restituir o próprio memorial devolve o polígono com erro de fechamento < 10 mm (ida e volta); prancha TOPOGRAFICA A1 1:500 com malha a cada 50 m.

**A2 — Feições de levantamento (planialtimétrico cadastral) · tabela lateral, sem bump**
- Hoje `pontosCotados` vive em `useState` (`hooks/useBlueprintTopografia.ts:176`) e só persiste ao gerar versão: recarregar perde a importação. Migration `aplicar_20270925000002_blueprint_levantamento.sql`: `blueprint_study_levantamento` (mutável; `(study_id, organization_id)` FK composta; `pontos JSONB` `{ x, y, cotaM, nome, codigo, descricao }`, `linhas JSONB` `{ codigo, tipo, pontos }`, `hash_pontos`, proveniência); `blueprint_study_topografia.levantamento_id` ON DELETE SET NULL (molde `blueprint_snapshot_topografia.topografia_id`). `hash_entrada` continua sobre `{x,y,cotaM}` — nome/código fora do hash (versões antigas intactas).
- `utils/blueprintTopografiaImportacao.ts`: preservar `P` e `D` do PNEZD e o `codigo` (hoje descartados); catálogo de códigos de feição (`utils/blueprintFeicoes.ts`: CERCA, MURO, MEIO_FIO, EDIFICACAO, POSTE, ARVORE, CURSO_DAGUA, ESTRADA, LQ, DIVISA…, com símbolo e traço) e leitura de linhas por código sequencial (molde `LQ<n>`) e por camada do DXF.
- `services/blueprintLevantamentoService.ts` (org do estudo), hook, `PainelTopografia.tsx`: lista editável de pontos (nome, cota, descrição, apagar, duplicados por distância < tolerância e por nome), toggle por código no `MenuExibir` (camada de exibição), símbolo e rótulo no canvas; "Interpolar pontos sobre linha" e "Pontuar polilinha" (gera pontos cotados pela TIN).
- Exportação de pontos: TXT/CSV `P,N,E,Z,D` (local, UTM com A0, lat/long), KML de pontos, DXF (`TOPO-PONTO` com atributo nome/cota já existe — acrescenta feições por camada), XLSX (caminho de `blueprintPlanilha`).
- **Terminou quando**: importar CSV de 500 pontos com códigos, recarregar a página e os 500 continuarem; a versão de topografia gerada aponta o `levantamento_id`; cerca aparece como linha própria e não como breakline; exportar e reimportar dá os mesmos nomes.

**A3 — Raster/GIS: GeoTIFF, world file, tiles, Shapefile, KMZ, inundação**
- `utils/geo/geotiff.ts` (próprio: tags TIFF, `ModelTiepoint/ModelPixelScale/GeoKey` → CRS via A0; compressão nenhuma/LZW/Deflate via `DecompressionStream`; recusa tiled/JPEG com mensagem) e world file (`.tfw/.jgw/.pgw`). Ortofoto → `Underlay` **posicionado pela georreferência** (`calibrar` recebe os dois pontos calculados, sem gesto), gravado em `blueprint_underlays` com `crs` e `bbox`. DEM GeoTIFF float32 → `GradeDeElevacao` como fonte `DEM_IMPORTADO` em `blueprintElevacaoProvedores.ts` (classe `LEVANTAMENTO_IMPORTADO` se resolução ≤ 1 m, senão `PRELIMINAR_REMOTO`; DR-08 continua valendo).
- Tiles como fundo: Edge Function `tiles-proxy` (gate `_shared/auth.ts`, cache, `User-Agent`, fonte configurável por organização: ESRI World Imagery com atribuição, OSM só em desenvolvimento pela política de uso — licença registrada como pendência de negócio E-12); no editor, "Fundo › Imagem de satélite" monta o mosaico da caixa do lote (zoom pela escala) e o posiciona pela georreferência (reprojeção Web Mercator → CRS por A0, com aviso de distorção). Vetorização = desenhar sobre ele com as ferramentas que já existem.
- Shapefile `utils/geo/shapefile.ts` (leitura `.shp/.shx/.dbf/.prj` de Point/Polyline/Polygon(Z); escrita idem; `.zip` pelo `pizzip` já presente via docxtemplater — confirmar exposição, senão `fflate`), KMZ (zip do KML). Importar SHP entra no "Importar levantamento" (contorno e feições); exportar SHP do lote, dos lotes (B), das curvas, dos pontos, com atributos.
- Mapa de inundação: `hipsometriaDaGrade` com cota de cheia informada → mancha + área atingida (toggle em Exibir).
- **Terminou quando**: ortofoto GeoTIFF do IBGE/prefeitura abre sob o lote sem calibrar, com desvio < 1 pixel nos vértices conhecidos; DEM local gera curvas iguais ao Open-Meteo na mesma gleba ± resolução; SHP exportado abre no QGIS com atributos; `curl` sem token na `tiles-proxy` dá 401.

**A4 — GeoINCRA / SIGEF · bump (atributos de vértice) + emissões**
- Kernel (sobre A1): `tipo M|P|V`, `codigoCredenciado`, `sigmaE/N/h`, `metodo` (NTGIR 3ª ed: GNSS-PPP, RTK, estação…), `tipoDeLimite` por `Boundary` (cerca, muro, estrada, curso d'água, linha seca…) e `confrontante` com CPF/CNPJ e CCIR/matrícula do vizinho. Nomeação automática no padrão `<credenciado>-M-0001`. Controle de duplicados, vértice sem sigma, cota zero.
- `utils/geo/sigef.ts`: **planilha ODS SIGEF** (zip XML `content.xml` no layout oficial: identificação, vértices com lat/long em GMS, sigma, método, tipo de limite, confrontante; modalidades por parcela/desmembramento/área encravada) — sem lib de ODS, escrita direta; área em SGL (A0) que é a que o SIGEF confere. Memorial GeoINCRA (docx, origem `terreno` + campos INCRA), carta de anuência por confrontante (docx), relatório analítico de vértices (tabela), **planta padrão INCRA** (`TipoDePrancha 'INCRA'`: malha, tabela de vértices, tipos de limite, carimbo com credenciado/ART).
- Leitura do retorno SIGEF (CSV de vértices certificados) para conferir contra o desenho (relatório de diferenças E/N).
- ⛔ Sem integração com o portal SIGEF (não há API; envio é do credenciado).
- **Terminou quando**: ODS gerada abre no LibreOffice com o layout da planilha oficial e é aceita pelo validador do SIGEF em uma parcela de teste (prova manual pelo usuário/credenciado, registrada); memorial GeoINCRA lista os vértices em GMS com 3 casas; carta de anuência por confrontante.

**A5 — CAR e REURB: documentos e atributos · sem bump**
- CAR: feições `AREA_IMOVEL`, `APP`, `RESERVA_LEGAL`, `VEGETACAO_NATIVA`, `AREA_CONSOLIDADA`, `SERVIDAO`, `HIDROGRAFIA` como tipos de `AreaPublica`/feição (B1/A2) com atributos exigidos pelo SICAR; exportação SHP (A3) e KML por tema; tabela de perímetros/áreas/coordenadas; mapa de declividade (existe) e apoio à Reserva Legal (% da área do imóvel por bioma informado).
- REURB (Lei 13.465/2017): sobre B (quadras/lotes vetorizados sobre a ortofoto de A3) + `unit_occupancies` (proprietário/ocupante) + edificações por lote (`empreendimento_unit_characteristics` já existe: área construída, uso, padrão); templates docx de fábrica: memorial por lote REURB, planta individual (B4), listagem de ocupantes para cartório e prefeitura; importação/exportação da base de ocupantes em xlsx pelo `occupancyImportService.ts` que já existe.
- **Terminou quando**: gleba com APP e RL exporta 3 SHP com atributos; um núcleo REURB de 20 lotes gera 20 memoriais + 20 pranchas + listagem de ocupantes.

### Frente C — Terraplenagem de vias e volumetria

**C1 — Platô inclinado e volume entre duas superfícies · sem bump (aquecimento, sem dependência)**
- `utils/blueprintTopografiaAnalises.ts`: `terraplenagemComTalude` aceita `plato: { cotaM } | { plano: { cotaM, declividadeLongPct, declividadeTransvPct, azimuteDeg } }`; `volumeEntreSuperficies(gradeA, gradeB, anel?)` (corte/aterro/líquido por célula, com região opcional); `areaDeSuperficie(grade, anel)`. Persistência: campos novos em `blueprint_study_terraplenagem` (migration aditiva). Painel: modo "Platô inclinado" e relatório "Volume entre versões" (escolhe duas versões de topografia — antes/depois do serviço = **medição de terraplenagem executada**).
- **Terminou quando**: platô inclinado 2 % sobre terreno plano dá corte = aterro no eixo de equilíbrio (teste analítico); volume entre versão A e a mesma versão = 0; entre A e A+1 m = área × 1 m ± 0,1 %.

**C2 — Eixo, estaqueamento, greide, seções e nota de serviço · tabela lateral**
- Eixo como polilinha própria (não depende da Via de B1): ferramenta "Eixo de projeto" no grupo Topografia; `utils/blueprintVias.ts` (puro): `estaquear(eixo, passoM=20)` (estacas 0+000, com estacas fracionárias nos vértices), `perfilDoEixo` (reusa `perfilAoLongo`), `Greide { pontos: {estaca, cotaM}[], curvasVerticais: {estaca, comprimentoM}[] }` com parábola simples, rampa máx por classe de via (aviso), `SecaoTipo { pistaMm, calcadaMm, sarjeta, taludeCorte, taludeAterro }`, `secoesTransversais(eixo, estacas, secaoTipo, greide, grade)` (terreno × projeto por estaca, offsets), `volumesPorAreasMedias` (corte/aterro por trecho, acumulado, com empolamento/contração já existentes), `notaDeServico` (simples: estaca, cota terreno, cota projeto, corte/aterro no eixo; composta: + offsets e cotas de bordo/pé/crista).
- Migration `aplicar_20270925000003_blueprint_vias.sql`: `blueprint_study_vias` (eixo por `uid` quando for Via do kernel, senão polilinha própria; greide, seção tipo, passo; FK à versão de topografia; org do estudo).
- UI: drawer "Vias e greide" (tabela de estacas com cota editável do greide, gráfico do perfil terreno × greide no `svgDoPerfil` estendido, seção por estaca), relatório Nota de serviço (xlsx/pdf), exportação de cotas do greide e pontos de locação (estaca, offset, E/N/Z) em CSV/KML.
- **Terminou quando**: eixo reto de 200 m em rampa de 1 % sobre terreno plano dá nota de serviço com 11 estacas e volumes que fecham com a fórmula das áreas médias (teste analítico); alterar uma cota do greide recalcula tudo; exportação de locação reimporta como pontos (A2).

**C3 — Via do loteamento como eixo e LandXML de saída · depende de B1 e C2**
- `blueprint_study_vias.via_uid` liga ao `Via` do kernel: eixo e largura vêm do desenho; seção tipo padrão da via; conferência "todas as vias com greide" no relatório do loteamento (B2).
- `utils/blueprintTopografiaExport.ts`: `landXmlDaTopografia` (superfície TIN + `Alignments` do eixo + `Profile` do greide + `Parcels` dos lotes) — o leitor LandXML já existe, o teste é ida e volta.
- **Terminou quando**: loteamento com 3 vias exporta LandXML que reimporta a mesma TIN e os mesmos lotes; nota de serviço por via.

## Fora do plano (registrado, não replicar sem pedido)

- CAD genérico: layers de usuário, estilos nomeados de cota/texto, fillet/chamfer, trim genérico, escalar geometria, polar tracking, igualar propriedades, laço poligonal/fence, viewports/layouts múltiplos, círculo/elipse livres, imagem como entidade.
- Aquisição de dados: download serial de estação total/GPS, PPP (IBGE-PPP é serviço externo), formatos proprietários Topcon/Trimble, GPX (entra só se pedido — o CSV cobre).
- Raster: ECW, JP2, GeoTIFF tiled/JPEG (recusa com mensagem).
- Integração com o portal SIGEF, consulta CREA/CAU, SICAR (envio é do responsável).
- DWG de saída (limitação declarada do `dwg-converter`).
- Suporte/treinamento (§35 do pedido) — não é software.
- Licenças de tiles/geocoder (E-12) — decisão de negócio, registrada como pendência.

## Verificação (por fase, o ritual do roadmap unificado)

1. `npx tsc --noEmit` · `bash scripts/check-ui-standard.sh <tsx tocados>` · `bash scripts/check-xss-sinks.sh` · `npx vitest run` (suíte cheia) · `npm run build`.
2. Fase com bump: goldens provados com a string antiga antes do bump, recaptura, motivo no cabeçalho de `__tests__/blueprintKernelGoldens.test.ts`.
3. Migration: `npx vitest run __tests__/segurancaMigrations.test.ts` e `migrationsPrefixo.test.ts`; aplicar com `npx supabase db query --linked -f <arquivo>`; `bash scripts/check-rls-postura.sh`; grants por grantee em `information_schema.role_table_grants` (a tabela nova nasce com ALL para anon/authenticated — `REVOKE … FROM PUBLIC, anon, authenticated` explícito).
4. Edge Function nova: `curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/functions/v1/<fn>" -d '{}'` tem de dar 401.
5. Prova no app real (skill `rodar-app`, escritas bloqueadas, Desfazer ao fim) do gesto principal da fase; provas geográficas com um lote de referência conhecido (KML no Google Earth / DXF e SHP no QGIS sobre OSM).
6. Doc da fase em `docs/planos/2026-09-25-planta-inteligente-topografia-loteamento-geo.md` (este plano, movido para lá no primeiro commit, com o pedido original literal); commit; push; `bash scripts/conferir-producao.sh` + CI.

---

## Estado — B1 (25/09/2026)

Publicada em dois commits: `70ce531b` (kernel + motor) e `e69f9c75` (tela).

- [x] Kernel **0.57.0 → 0.58.0**: `Quadra`, `Lote`, `Via`, `AreaPublica` em `utils/blueprintKernel/model.ts`; 16 comandos Add/Set/Move/Delete em `commands.ts`; invariantes `BAD_BLOCK`/`BAD_PLOT`/`BAD_STREET`/`BAD_PUBLIC_AREA`; canônico com a quadra do lote por **índice**; `index.ts` reexporta. Goldens provados intactos com a string antiga ANTES do bump, recapturados depois, motivo no cabeçalho de `__tests__/blueprintKernelGoldens.test.ts`. Bundle da `planta-api` regerado.
- [x] `utils/blueprintLoteamento.ts` (puro): `faixaDaVia` (offset com canto no cruzamento), `calcadasDaVia`, `medirLote` (área, perímetro, testada, papel e confrontante por lado, encravado), `areasDoLoteamento`, `numerarQuadra`, `centroide`, `rotuloDoLote`.
- [x] Editor: grupo **Loteamento** na aba Terreno (Quadra, Lote, Via, Área pública, Numerar), barra de opções por ferramenta, sequência automática de nome/número, quadra do lote derivada do desenho.
- [x] Canvas: gesto de polígono (fecha no 1º vértice) e de eixo (termina no último), prévia com a caixa da via, desenho das quatro famílias com número e área, Esc limpa.
- [x] Testes: `blueprintLoteamento.test.ts` (16), `blueprintLoteamentoCanonico.test.ts` (6), `BlueprintEditor.test.tsx` (+3). Suíte cheia **469 arquivos / 5.411 testes** verde; tsc, `check-ui-standard`, `check-xss-sinks` e `build` verdes.
- [x] Harness com portão: `docs/spikes/loteamento/` (`medir.mjs`, exit ≠ 0 reprova) — números do motor + pixels no canvas real + controle `?vazio=1`.

### Achados desta fase (só o navegador pegou)

1. **O desenho caiu dentro de `if (limitesDoNivel.length > 0)`** — o loteamento inteiro só apareceria em estudo que já tivesse divisa da gleba. Os 184 testes de componente passavam com a tela vazia, porque em jsdom o canvas é opaco.
2. **O rótulo da via usava `eixo[Math.floor(length / 2)]`** — num eixo de dois pontos isso é a ponta, e o nome da rua ficava fora da tela. Virou o ponto na metade do comprimento.
3. **A medição nasceu cega duas vezes**: a cor da caixa da via é quase o branco do fundo (contou 155 mil px de "via" na tela vazia), e a área pública é pintada com `globalAlpha` 0,7, então procurar a cor nominal dava zero e parecia "não pintou". Só o controle `?vazio=1` revelou a primeira.

### Fora desta fase (declarado)

Subdivisão automática e conferência da Lei 6.766 (B2), sync com o Empreendimento (B3), memorial e planta por lote (B4). Quadra/lote/via ainda não entram no DXF nem na prancha — entram na B4.

---

## Estado — B2 (25/09/2026)

- [x] `utils/blueprintLoteamento.ts`: `subdividirQuadra` (fatias perpendiculares ao lado de frente escolhido, profundidade declarada ou até o fundo, segunda fileira só quando cabe inteira, sobra sempre DECLARADA), `conferirLoteamento` (área e testada mínimas, encravado, sem quadra, número repetido na quadra, percentual de áreas públicas), `resumoDaConferencia`, e os pisos `AREA_MINIMA_LEI_6766_M2` / `TESTADA_MINIMA_LEI_6766_MM`.
- [x] Tarefa **Lotear quadra** (`components/blueprint/PainelLotear.tsx`), no grupo Loteamento da aba Terreno: escolhe quadra, lado da via, testada, profundidade e duas fileiras; prévia tracejada no canvas com a área de cada lote; lançar é um `runBatch` (um Ctrl+Z desfaz).
- [x] Relatório **Conferência do loteamento** (`PainelConferenciaDoLoteamento.tsx`), em drawer pelo menu Conferência da aba Analisar, com a contagem de erros no botão e o clique levando ao lote no desenho.
- [x] Testes: `blueprintLoteamentoB2.test.ts` (16) e `BlueprintEditor.test.tsx` (+3). Suíte cheia **470 arquivos / 5.435 testes** verde; tsc, `check-ui-standard`, `check-xss-sinks` e `build` verdes.
- [x] Harness `?lotear=1` com a proposta medida no canvas real (portão verde).

### Decisões desta fase

- **A zona manda; a Lei 6.766 é rede de segurança.** Os mínimos vêm de `areaMinimaDoLoteM2`/`testadaMinimaMm` da zona quando informados; senão, dos 125 m² e 5 m do art. 4º, II. A tela diz de onde veio cada número — conferir contra a lei errada é pior que não conferir.
- **O percentual de áreas públicas só REPROVA com mínimo informado.** A Lei 6.766 não fixa mais os 35% que se cita de cabeça desde a Lei 9.785/99; sem o número da lei municipal, a conferência informa o percentual e não reprova.
- **A subdivisão não grava nada** até alguém aceitar, e **a sobra é declarada** — sobra silenciosa pareceria defeito.
- **Lotear a mesma quadra duas vezes continua a numeração** em vez de recomeçar do 1, senão sairiam dois lotes "1".
- A conferência **só acusa**: projeto em andamento passa por estados inválidos o tempo todo, e travar o desenho atrapalharia em vez de ajudar.

### Achado desta fase

A medição do harness voltou a nascer cega, pelo mesmo motivo da B1 em outra cor: o **preenchimento** da prévia (`#dbeafe` a 45% sobre branco) fica quase branco, e a grade do canvas também é azulada — o critério "azul claro" contou 206 mil pixels na tela SEM proposta nenhuma. O que discrimina é o **traço** da prévia (`#2563eb`), saturado e exclusivo dela.

---

## Estado — B3 (25/09/2026)

- [x] Migration `aplicar_20270925000020_loteamento_empreendimento.sql`, **aplicada e conferida no banco**: tipo de sistema `LOTEAMENTO` (`motor_category='horizontal'`), `empreendimentos.blueprint_study_id`, `empreendimento_towers.blueprint_quadra_uid`, `empreendimento_units.blueprint_lote_uid` + `quadra`/`lote`/`testada_m`/`confrontantes`, dois índices parciais únicos e um de busca.
- [x] Motor: `SyncOrigin` ganhou `'blueprint'`; `PROVENANCE`, `ORIGIN_LABEL` e `SYNC_FIELDS` estendidos (o `Record<SyncOrigin, …>` fez o compilador apontar os três lugares).
- [x] `services/sync/blueprintAdapter.ts`: lê o **snapshot publicado**, quadra → `CanonicalTower` (com `matchName` para adoção por nome), lote → `CanonicalUnit` com área, testada, posição e confrontantes.
- [x] `services/blueprintEmpreendimentoSync.ts`: `linkStudy`, `previewSync`, `syncToEmpreendimento` — cola fina sobre `buildPlan`/`applyPlan`, com conflitos indo para a Curadoria e um evento resumo de auditoria.
- [x] Tela: cartão **Loteamento → Empreendimento** na aba Sincronização, e comando **Enviar loteamento** na aba Colaborar da Planta.
- [x] Testes: `blueprintEmpreendimentoSync.test.ts` (10). Suíte cheia **471 arquivos / 5.445 testes** verde; tsc, `check-ui-standard`, `check-org-selector-guard` e `build` verdes.

### Três achados que teriam quebrado em produção, não nos testes

1. **`empreendimento_field_proposals.origin` era CHECK fechado** (`imovib|planta_ai`). Sem ampliar, `materializeConflicts` estouraria no **primeiro conflito real** — e só há conflito quando o desenho muda depois do primeiro envio, que é justamente quando o usuário mais precisa que funcione.
2. **`empreendimento_audit_logs.source` idem**, sem `sync_blueprint`.
3. **`TOWER_COLS`/`UNIT_COLS` são listas explícitas de colunas.** Sem as colunas novas ali, o `TargetState` não enxergaria a proveniência e **cada sincronização recriaria o loteamento inteiro**, duplicando tudo em silêncio.

### Decisões desta fase

- **A fonte é o snapshot PUBLICADO, nunca o rascunho.** O rascunho muda a cada gesto (autosave de 1,5 s); sincronizar dele faria o espelho de vendas mudar debaixo do corretor enquanto alguém arrasta um vértice.
- **Sem write-back.** O desenho é a origem: mudar a área de um lote é mover vértice na planta, e reconstruir geometria a partir de uma área não tem solução única.
- **A quadra tem `matchName`** (ao contrário do cenário do Planta IA): "Quadra A" é um nome que o usuário reconhece, então uma torre criada à mão com esse nome é adotada em vez de virar torre-fantasma.
- **Tipologia fica fora do diff** (`typology: 'LOTE'` é `createOnly`): campo imutável comparado a cada sync vira conflito eterno.
- Preço e status continuam do Empreendimento, escritos só na criação — como nas outras duas arestas.

---

## Estado — B4 (26/09/2026)

- [x] `utils/blueprintMemorialLote.ts`: memorial por lote (giro frente → direita → fundo → esquerda, medida e confrontante lado a lado), memorial de área pública (art. 22 da Lei 6.766), memorial do loteamento com quadro de áreas, tabelas de lotes/quadras/vias, pontos de locação e o CSV em PNEZD.
- [x] `utils/blueprintPranchaLoteamento.ts`: `desenharLote` (lote em destaque, quadra e vizinhos em traço leve, cotas e confrontantes), `desenharLoteamento` (planta geral) e `desenharTabelasDoLoteamento`, sobre o `Desenhista` abstrato.
- [x] `services/blueprintLoteamentoDocsService.ts`: o conjunto em PDF (planta geral + uma folha por lote + quadro de áreas), o memorial em texto e o CSV de locação.
- [x] Comando **Documentos** na aba Colaborar, ao lado de "Enviar loteamento".
- [x] Testes: `blueprintMemorialLote.test.ts` (15), `blueprintPranchaLoteamento.test.ts` (9), `BlueprintEditor.test.tsx` (+2). Suíte cheia **473 arquivos / 5.471 testes** verde; tsc, `check-ui-standard`, `check-xss-sinks` e `build` verdes.

### Achado desta fase

**`boundingBox` só enxergava paredes e divisas.** Um loteamento não tem parede nenhuma: a caixa saía nula e a prancha seria declarada VAZIA com o desenho inteiro dentro do modelo. As quatro famílias entraram no enquadramento.

### Decisões

- **O memorial descreve por medidas e confrontantes**, que é a forma usual do loteamento urbano aprovado. Azimutes e coordenadas dependem de georreferência (fase A1) — e a ausência é **dita** em todo memorial (`AVISO_SEM_GEORREFERENCIA`), não omitida.
- **Download, não GED.** O memorial é peça que o responsável técnico revisa e assina; publicar direto daria ao rascunho a aparência de documento emitido.
- **A escala das folhas é a que faz caber**, e por isso não sai um denominador redondo no carimbo: dizer 1:500 numa folha que mede outra coisa é pior que não dizer escala.
- **No CSV de locação, NORTE é o Y e ESTE é o X** — a convenção da topografia. Trocar espelha o loteamento inteiro no campo sem nenhum sinal na tela.
- O `Desenhista` continua com quatro primitivas: não inventei tracejado só para a quadra, que se distingue por espessura e cor.

---

## Estado — A0 (26/09/2026)

- [x] `proj4` instalado (decisão do usuário). `utils/geo/` com quatro peças: `crs.ts` (catálogo FECHADO — SIRGAS 2000 nos 8 fusos do Brasil, SAD 69 e Córrego Alegre como herdados, WGS 84; `lerCrs` aceita código, nome e a forma curta do topógrafo; `conferirFuso` avisa quando o fuso não contém a longitude), `projecao.ts` (conversão, transformação de datum, convergência meridiana, fator de escala, distância no elipsoide), `formato.ts` (GMS, azimute, rumo, azimute verdadeiro) e `sgl.ts` (Sistema Geodésico Local da NBR 14166, área real e o desvio da área medida em UTM).
- [x] Painel do Terreno: o CRS virou **lista do catálogo**, com aviso de fuso/sistema herdado e três derivados na tela — convergência meridiana, fator de escala e quanto a área em UTM difere da real.
- [x] **O memorial ganhou coordenadas** (lacuna declarada na B4): com georreferência e CRS projetado, cada lado sai com azimute **verdadeiro** e rumo, e os vértices com E/N e grau-minuto-segundo. Sem ela, o aviso de ausência continua.
- [x] Testes: `geo.test.ts` (27) e `blueprintMemorialLote.test.ts` (+6). Suíte cheia **474 arquivos / 5.505 testes** verde; tsc, `check-ui-standard` e `build` verdes.

### Como os testes provam o que provam

Não há coordenadas "oficiais" copiadas de uma estação da rede geodésica: eu não teria como conferir esse número, e um valor inventado com cara de oficial seria pior que nenhum. O que se afirma é o verificável:

1. **Equivalência com `utmParaLatLon`**, a implementação própria em produção desde 11/09, em sete pontos do Brasil, abaixo do milímetro. Ela **não foi apagada nem passou a delegar** de propósito: virasse um repasse para o proj4, o teste compararia o proj4 com ele mesmo e um erro de parâmetro no catálogo deixaria de ser detectável.
2. Ida e volta no milímetro.
3. Propriedades que são definição: fator 0,9996 e convergência zero no meridiano central.
4. Ordem de grandeza do deslocamento SAD 69 → SIRGAS 2000 (dezenas de metros).

### Três defeitos que os testes pegaram

1. **Códigos EPSG do SAD 69 errados** — eu usei `29100 + zona`; o correto é `29170 + zona` (18S é 29188, não 29118).
2. **`gmsTexto` com zero casas de segundo escrevia `45°30'000"`**: o preenchimento pedia largura 3 quando deviam ser 2 dígitos.
3. **O sinal da convergência** — no hemisfério **sul** ela é NEGATIVA a leste do meridiano central, o contrário da intuição do hemisfério norte. O código estava certo pela fórmula; o teste é que assumira errado.

---

## Estado — A1 (26/09/2026)

- [x] Kernel **0.58.0 → 0.59.0**: `verticesDoTerreno` ({ponto, nome, tipo M/P/V?, sigmaMm?, metodo?}) **ancorado no PONTO** (o anel é derivado e renumera ao apagar uma divisa — um nome por índice apareceria no vértice errado sem erro nenhum). Comandos `SetVerticeDoTerreno` (cria ou edita pelo ponto, tolerância de 5 mm), `RemoverVerticeDoTerreno`, `NomearVerticesDoTerreno` (P1…Pn num comando só). Goldens provados intactos com a string antiga antes do bump, recapturados depois; bundle da planta-api regerado.
- [x] `utils/blueprintRoteiroPerimetrico.ts`: `roteiroPerimetrico` (derivado: sentido horário forçado com as divisas acompanhando a inversão, vértice de partida = menor sufixo numérico, E/N + lat/long + azimute VERDADEIRO + distância no terreno quando georreferenciado, fechamento angular), `memorialConvencional` (o texto da gleba inteira) e `restituirMemorial` (texto → polígono, com erro de fechamento e o que não leu DITO).
- [x] `utils/blueprintPranchaTopografica.ts`: `desenharPlantaTopografica` (divisa, vértices marcados e nomeados, cota e azimute por lado, tabela do roteiro) e `desenharMalhaDeCoordenadas` (só com georreferência; passo redondo 1/2/5×10ⁿ; rótulos E/N nas margens). `TipoDePrancha` ganhou `'TOPOGRAFICA'` (opção `incluir.topografica`, opcional para templates gravados).
- [x] Tela: **Nomear vértices** e **Roteiro** no grupo Lote da aba Terreno; o quadro de divisas ganhou as colunas Vértice (editável) e Azimute; gaveta `PainelRoteiroPerimetrico` com tabela, memorial para copiar e restituição por memorial (lança as divisas num lote só; bloqueada quando já há lote — restituir por cima seria destruição).
- [x] Testes: `blueprintVerticesDoTerreno` (8), `blueprintRoteiroPerimetrico` (10), `blueprintPranchaTopografica` (4), `BlueprintEditor` (+1). Suíte cheia **478 arquivos / 5.540 testes** verde; tsc, `check-ui-standard`, `check-xss-sinks` e `build` verdes.

### Três coisas que os testes corrigiram em mim

1. **A divisa do lote é `kind: 'TERRENO'`**, não `DIVISA` (`DIVISA` é partição interna de ambientes; `divisasDoLote` filtra por TERRENO). E o confrontante não entra no `AddBoundary` — é de `SetBoundaryEscritura`.
2. **O desenho JÁ É o terreno.** Eu esperava a distância "no terreno" maior que a do desenho perto do meridiano central; mas o modelo é em mm locais (plano do terreno), e o que encolhe por `k` é a distância na QUADRÍCULA (entre os E/N). O teste agora afirma isso: quadrícula < desenho, razão ≈ 0,99975 em BH.
3. **Rotular confrontante por índice da lista de divisas** punha "Lote 11" noutro lado físico no lote anti-horário; o teste comparava lados diferentes. O confrontante é do lado físico.

### Fora desta fase (declarado)

Cota linear manual como anotação (`COTA_LINEAR`) e a origem `terreno` no `docxFieldCatalog` — o memorial sai em texto para copiar, não em .docx por template. Planta de SITUAÇÃO como tipo próprio (a vista `situacao` já existe).

### Prova no navegador (harness `docs/spikes/terreno/quadro.html` + `medir-roteiro.mjs`, portão com exit ≠ 0)

19 verificações: coluna Vértice com os provisórios V1…V5 e "Azimute (des.)" sem georreferência; "Azimute" sem o sufixo, P1…P5 nos campos e 5 azimutes em GMS com georreferência; renomear pelo quadro grava no kernel; a gaveta traz E/N, latitude "S", longitude "W", convergência; o memorial começa em P1 e fecha o perímetro; **restituir o próprio memorial lê 5 trechos com erro de fechamento 0,000 m**; com lote desenhado, "Lançar" fica apagado e o title explica; nenhum erro de console.

### Dois achados que só o PRINT pegou (o unitário passava)

1. **Azimute escrito como `360°00'00"` e rumo `0°00'00" NW`.** 359,99999° é o norte, mas eu reduzia a [0, 360) ANTES de arredondar, e o GMS arredondava 359,99999 para 360. Correção: arredondar à precisão do texto em INTEIROS de "último dígito de segundo" (1/3600 não é exato em binário — 1296000 × (1/3600) dá 359,99999999999994 e voltava a 360), e só então reduzir. Teste novo em `geo.test.ts`.
2. **Meu teste do roteiro afirmava a física ao contrário e passava por ruído numérico.** Com o Y do desenho no norte verdadeiro (rotação 0), o azimute VERDADEIRO coincide com o de DESENHO até o segundo de arco; quem difere pela convergência é o de QUADRÍCULA (medido entre os E/N). O teste dizia "verdadeiro ≠ desenho" e passava porque o plano tangente introduz 10⁻⁷ grau. Agora afirma |verdadeiro − desenho| < 3,6" e (verdadeiro − quadrícula) = convergência.
3. O harness do quadro precisava de `ConfirmProvider` (o `QuadroDeDivisas` usa `useConfirm`) — como o da topografia já registrava.

## Estado — C1 (26/09/2026)

- [x] Motor (`utils/blueprintTopografiaAnalises.ts`, sem bump — nada do platô vive no kernel): `InclinacaoDoPlato { declividadeLongPct, declividadeTransvPct, azimuteDeg }`, `centroDoPlato` (centróide do anel), `cotaDoPlatoEm(cota, inclinacao, centro, p)`. `terraplenagemPreliminar`, `terraplenagemComTalude`, `cotaDeProjeto` e `murosDeArrimo` ganharam o parâmetro opcional `inclinacao` (`null` = a conta horizontal de sempre, byte a byte — teste `toEqual`). **A cota informada é a do CENTRO do platô**: o plano gira em torno dele, e trocar o caimento não muda a cota média. A crista do talude nasce na cota do plano NAQUELE ponto (plano extrapolado até a célula/aresta), não numa cota única.
- [x] `volumeEntreSuperficies(antes, depois, anel?)` — corte onde o depois ficou abaixo, aterro onde ficou acima, área comparada e **células sem cota contadas**; exige a MESMA malha (origem, passo, dimensões) e lança erro dito em vez de reamostrar em silêncio. `areaDeSuperficie(grade, anel?)` — área real seguindo o relevo (dois triângulos 3D por célula) × projetada.
- [x] Corte 2D (`blueprintCorte.ts`): `plato.cotaEmM?` — a linha do projeto e a crista do talude seguem o plano. 3D (`murosDeArrimo3d`): topo do muro pelo plano. Hash da base executiva só ganha a chave `inclinacao` quando ela existe — as emissões anteriores continuam valendo.
- [x] Persistência: migration `aplicar_20270926000010` (aplicada em produção por `db query -f`; conferida de fora: 3 colunas `numeric` + CHECK |caimento| ≤ 20 % e azimute em [0, 360)). Hook `useBlueprintTerraplenagem` lê/grava `inclinacao` (por ref, como `hidraulica`/`estrutura`, para não mudar a assinatura de `premissa`); `inclinacaoDaLinha` trata linha sem as colunas ou tudo zero como horizontal.
- [x] Painel: toggle **Platô inclinado** com Longitudinal / Transversal (%) / Azimute (°) — ao ligar, parte de 1 % longitudinal; azimute normalizado a [0, 360); caimento travado em ±20 %. Seção **Volume entre versões (executado)**: só com ≥ 2 versões; "antes" = versão anterior à selecionada, "depois" = a selecionada; corte/aterro/saldo/área comparada + área real e projetada; malha diferente mostra o erro.
- [x] Testes: `blueprintTopografiaFaseC1` (15 — platô a 2 % sobre terreno plano: corte = aterro = 20 m³ no eixo de equilíbrio; A×A = 0; A×A+1 m = área × 1 m ± 0,1 %; área 45° = √2 × projetada; malha diferente lança), `PainelTopografiaFaseC1` (5). Suíte cheia **479 arquivos / 5.560 testes** verde; tsc, `check-ui-standard`, `check-xss-sinks` verdes.

### Prova no navegador (harness `docs/spikes/topografia/index.html?inclinado=1|2` + `medir-c1.mjs`, portão)

20 verificações contra o painel REAL: controle sem inclinação (toggle desligado, sem campos, sem a seção de volume com uma versão só); com `?inclinado=1` toggle ligado com 2/0/0, a cota de projeto sobe 0,196 m do sul ao norte do platô de 10 m com o centro na cota informada; a seção de volume mostra no DOM o MESMO aterro que o motor (108,0 m³ = 360 m² × 0,3 m da versão "antes"), corte 0,0, antes = v0 e depois = v1. Foto do corte: o corte FRENTE percorre X, então só a inclinação TRANSVERSAL aparece nele (`?inclinado=2`, 5 % ao longo de X) — a crista esquerda nasce 0,4 m abaixo da direita, como declarado.

### Um achado do teste

`cotaDeProjeto` 0,5 m fora da borda com o plano 0,2 m acima do terreno devolvia a cota NATURAL — e está certo: a 1:1,5 o talude de aterro cai 0,33 m em 0,5 m e já alcançou o chão. O teste que esperava "> terreno" ali estava errado; agora afirma o talude a 10 cm da borda e o terreno a 50 cm.

### Fora desta fase (declarado)

Volume "de região selecionada" à mão (o `anel` de `volumeEntreSuperficies` já recorta pelo anel da versão); método das seções (vai com o eixo/estaqueamento do C2); reamostragem entre malhas diferentes — decisão: comparar só versões do mesmo lote, o erro é dito.

## Estado — C2 (26/09/2026)

- [x] `utils/blueprintVias.ts` (puro, sem bump): `estaquear` (estacas `k+f,ff` a cada passo, fracionária em cada vértice e no fim, sem duplicar a inteira que cai no vértice), `cotaDoGreide` (reta entre PIVs + parábola simétrica onde o PIV tem `curvaM`; fora do trecho é `null`, não extrapola), `rampasDoGreide`/`conferirGreide` (rampa > 12 % e curva que não cabe são DITAS), `greideDoTerreno` (partida: reta terreno→terreno), `secaoTransversal` (plataforma pista + calçadas na cota do greide, talude de cada lado até o terreno com o pé inserido EXATAMENTE na amostragem — senão o trapézio corta o triângulo), `volumesPorAreasMedias` (com empolamento/contração da premissa), `notaDeServico` simples/composta + CSV, `csvDoGreide`, `pontosDeLocacaoDaVia`/`csvDeLocacaoDaVia` (eixo, bordos, pés; PNEZD que `importarPontos` lê de volta — teste de ida e volta), `svgDoPerfilDaVia`, `svgDaSecao`.
- [x] Convenções: offset positivo à DIREITA de quem caminha no eixo; projeto − terreno positivo = aterro; estaca 0 onde o traçado começa.
- [x] Persistência: `blueprint_study_vias` (migration `aplicar_20270926000020`, aplicada em produção e conferida de fora: colunas, grants só `authenticated`, policy `is_org_member`). Grava-se eixo, passo, PIVs e seção tipo; `service`/`hook` (`useBlueprintVias`, gravação com respiro por via, degradação sem a migration).
- [x] Tela: ferramenta **Eixo de projeto** (tool `eixo-via` — `eixo` já era a malha estrutural, e colidiu no primeiro tsc) no grupo Topografia da aba Terreno, mesmo gesto do perfil; ao terminar, a via nasce e a gaveta abre. Canvas desenha o eixo em âmbar com um traço por estaca e o número das inteiras. Gaveta **Vias e greide** (`PainelViasEGreide`): via/nome/passo, seção tipo, avisos do greide, perfil terreno × greide (SVG como `<img>` data-URL, sem sink), tabela de estacas com a cota do greide editável (vira PIV; PIV removível; curva vertical por PIV interno), seção transversal da estaca clicada, volumes por trecho e totais, nota simples/composta com CSV, CSV de greide e de locação.
- [x] Testes: `blueprintVias` (17 — o caso de aceite: eixo reto de 200 m a 1 % sobre terreno plano dá 11 estacas e volumes iguais à fórmula fechada `A = h·w + h²·H`; curva vertical afasta `(g₂ − g₁)·L/8`; mudar uma cota recalcula; locação reimporta com as mesmas coordenadas), `PainelViasEGreide` (6), `BlueprintEditor` (+1). Suíte cheia verde; tsc, `check-ui-standard`, `check-xss-sinks`, build verdes.

### Prova no navegador (harness `docs/spikes/topografia/index.html?vias=1` + `medir-c2.mjs`, portão)

15 verificações contra a gaveta REAL sobre o terreno do harness: controle sem a gaveta; com a via, 7 estacas (0+0,00 … 5+3,00, 28 m a passo 5), greide de partida com as cotas do terreno nas pontas (100,36 → 102,83), PIV só nas pontas, nota com 7 linhas, volumes do DOM iguais aos do motor (corte 5,2 / aterro 42,8 m³), perfil e seção como imagem; foto da planta com o eixo e as estacas.

### Dois achados

1. **Na borda da grade a amostra é `null`** (o eixo de y = 0 a y = 30 m devolvia greide nulo e tabela vazia): o mesmo que `murosDeArrimo` já contornava. O harness passou a traçar de 1 m a 29 m; na tela real, um eixo que sai do lote mostra "sem dados" na estaca, não um número.
2. **`dangerouslySetInnerHTML` para SVG gerado aqui** é recusado pelo `check-xss-sinks.sh` e sanitizar mutilaria o gráfico: o caminho já resolvido no painel do terreno é `<img src="data:image/svg+xml…">`.

### Fora desta fase (declarado)

KML dos pontos de locação (sai o CSV, que é o que a estação total lê; KML pede georreferência e entra com o SHP/KMZ de A3); seção tipo com abaulamento/sarjeta (plataforma plana); a via do loteamento como eixo e o LandXML de saída (C3).

## Estado — A2 (26/09/2026)

- [x] `utils/blueprintFeicoes.ts` (puro): `PontoDeLevantamento` ({x, y, cota} + nome, código, descrição); catálogo FECHADO de 12 feições (cerca, muro, meio-fio, edificação, estrada, curso d'água, talude, divisa como LINHA; poste, árvore, boca de lobo/PV, marco como PONTO) com aliases usuais, cor, traço, símbolo e camada DXF `LEV-*`; `lerCodigo` ("CE1", "cerca 2", "PO luz"); `linhasDasFeicoes` (com número junta mesmo intercalado; sem número, corrida consecutiva); `contarFeicoes` (e os códigos fora do catálogo, DITOS); `duplicados` por posição (≤ 1 cm, grade de espalhamento) e por nome; `pontuarPolilinha` (cota da superfície, onde não há cota o ponto não nasce); `interpolarSobreLinha` (adensar em rampa); `csvDoLevantamento` e `kmlDoLevantamento`.
- [x] ⚠️ A LINHA DE QUEBRA continua sendo SÓ LQ/BL/BRK: uma cerca é feição, nunca breakline (teste).
- [x] Importação: `descricao` nova no ponto; o campo D do PNEZD separa CÓDIGO (1º token, com o número colado se vier "BRK 3") e DESCRIÇÃO ("CE1 cerca de arame"); com cabeçalho, coluna de descrição própria é lida. O painel deixou de jogar fora nome/código/descrição ao aceitar a importação.
- [x] Persistência: `blueprint_study_levantamento` (migration `aplicar_20270926000030`, aplicada e conferida de fora: grants só `authenticated`, policy `is_org_member`; UMA linha por estudo, mutável) com pontos, linhas de quebra, `hash_pontos` e origem; `blueprint_study_topografia.levantamento_id` (SET NULL). O hook grava com respiro de 800 ms a cada mexida, lê ao montar (o levantamento vence os insumos da última versão), e ao GERAR grava o pendente e aponta a versão para ele. A versão continua guardando e "hasheando" só {x, y, cota}: o mesmo conjunto com e sem nomes dá o MESMO `hash_entrada` (teste).
- [x] Tela: lista com o NOME no lugar do número (vazio mostra o número), borda na cor da feição, código/feição/descrição no title; acima de 20 pontos um filtro, e a lista corta em 100 dizendo quantos faltam. Seção **Feições do levantamento**: por feição, pontos e linhas, mostrar/esconder na planta, **Adensar**; códigos fora do catálogo; duplicados (Remover repetidos por posição; nome repetido pede renomear, não apaga); **Pontuar a linha do perfil** (sobre a versão selecionada); exportar pontos CSV/KML/DXF (feições em camadas `LEV-*`, nome como texto); estado da gravação. Todo botão desligado diz por quê. Planta: linhas das feições na cor/traço do catálogo, marcas pontuais com símbolo, nome do ponto com zoom; toggle **Feições do levantamento** em Exibir.
- [x] Testes: `blueprintFeicoes` (12 — inclui 500 pontos exportados e reimportados com os mesmos nomes/códigos/descrições/coordenadas, e cerca ≠ breakline), `useBlueprintTopografiaLevantamento` (3 — **500 pontos voltam depois de "recarregar"**, a versão leva `levantamento_id` e só {x,y,cota}, hash igual com e sem nomes), `PainelTopografiaFaseA2` (7); `PainelTopografiaFase9` atualizado (o nome agora viaja). Suíte cheia, tsc, `check-ui-standard`, `check-xss-sinks` e build verdes.

### Prova no navegador (harness `docs/spikes/topografia/index.html?levantamento=1` + `medir-a2.mjs`, portão)

21 verificações: controle sem a seção e com o número como placeholder; com o levantamento, 16 linhas com os nomes, title com código/feição/descrição, Cerca 4 pontos/1 linha, Muro 2/1, Poste 2, Árvore 1 (DOM = motor), XY fora do catálogo, o repetido a 3 mm acusado com o botão, KML desligado dizendo "Onde fica"; na planta, 492 px na cor da cerca (controle 0) e o muro desenhado.

### Decisões

- **Linhas das feições são DERIVADAS dos códigos**, não gravadas: o plano previa `linhas JSONB`; gravar o que se recalcula dos pontos criaria duas verdades. A tabela guarda as linhas de QUEBRA (que antes também se perdiam ao recarregar).
- **A TIN importada (por índice) não é persistida no levantamento** — qualquer edição já a descartava; volta pela versão, como antes.

### Fora desta fase (declarado)

Feições vindas de POLILINHA de DXF por camada (hoje: só pelo código dos pontos); XLSX de pontos (sai CSV, que abre no Excel); UTM/lat-long como colunas do CSV (o KML leva a georreferência); caderno de códigos por organização (o catálogo é fixo).

## Estado — A3 (26/09/2026)

- [x] `utils/geo/tiff.ts` — leitor PRÓPRIO de TIFF/GeoTIFF: little/big endian, strips e tiles, sem compressão/LZW/Deflate (`DecompressionStream`)/PackBits, preditor 2 e 3, 8/16/32 bits inteiros e 32/64 float, paleta; tags GeoTIFF (ModelPixelScale/Tiepoint/Transformation, GeoKeyDirectory com EPSG projetado/geográfico e PixelIsPoint levado ao canto do pixel, NODATA do GDAL). Recusas NOMEADAS com a saída (`gdal_translate`): BigTIFF, JPEG/WebP/LERC, planar, > 120 MP.
- [x] `utils/geo/raster.ts` — cadeia pixel → CRS do arquivo → SIRGAS 2000 → mm do desenho; CRS de LEITURA a mais (WGS 84 / UTM sul, Web Mercator) sem poluir o catálogo da tela; `crsDoWkt` (.prj ESRI/OGC); world file (centro → canto); janela de recorte (lote + margem); `encaixarOrtofoto` (semelhança + resíduo em pixels nos cantos e no centro, aviso de pixel não quadrado); RGBA da janela; `pontosDoDem` (um ponto por pixel no centro, NODATA contado, teto de 20.000 pontos com passo). `demEhPreliminar` = célula > 1,05 m (a folga é o fator de escala do UTM).
- [x] **Ortofoto → planta de fundo SEM aferir** (`utils/geo/ortofoto.ts`, botão **Ortofoto** em Planta de fundo): GeoTIFF, ou imagem + world file (+ `.prj`; sem ele vale o CRS do lote), seleção múltipla; recorta lote + 30 m, vira PNG e entra pelo `importarRaster` que já existia; o aviso diz CRS, pixel e o desvio máximo.
- [x] **DEM GeoTIFF → pontos cotados** pelo "Importar levantamento": ≤ 1 m entra como Pontos cotados (LEVANTAMENTO_IMPORTADO); acima, fonte nova `DEM_ARQUIVO` (LOCAL, classe PRELIMINAR_REMOTO) — um SRTM baixado não vira "levantamento" por ter vindo em arquivo. A fonte viaja em `origem.fonte` do levantamento (A2) e volta ao recarregar; o botão "DEM do arquivo" só aparece quando é a fonte ativa. Sem lote, o arquivo inteiro (com o teto) — a gleba pode nascer do DEM.
- [x] **Shapefile** (`utils/geo/shapefile.ts`): leitura e escrita de Point/PolyLine/Polygon (e Z), `.shx`, `.dbf` (UTF-8 + `.cpg`), `.prj`, anel externo horário; zip e **KMZ** via `pizzip` em import dinâmico. Importar: `.zip` de shapefile → GeoJSON em lat/long (com `.prj`: pontos e vértices com Z viram pontos; o 1º polígono vira contorno do lote) ou CSV local (sem `.prj`: dito, e o polígono não vira contorno); `.kmz` → KML. Exportar a versão: **SHP** (curvas, pontos com nome/código, lote, drenagem, lotes do loteamento — SIRGAS 2000 / UTM do fuso com `.prj`; sem georreferência, metros locais sem `.prj` e o NOME do arquivo diz "coordenadas LOCAIS") e **KMZ**.
- [x] **Mancha de inundação** (`manchaDeInundacao`): cota de cheia no painel → célula com cota média abaixo, pintada em azul pela mesma pintura do hipsométrico; área e lâmina máxima; o texto diz que NÃO é modelo hidráulico.
- [x] Testes: `geoRaster` (14 — contra GeoTIFFs escritos pelo **PIL**: RGB LZW, DEM float32 Deflate com NODATA, cinza 16 bits PackBits com PixelIsPoint, sem geo; LZW pelo exemplo da especificação), `geoShapefile` (6 — leitura contra zip escrito pelo **pyshp**, escrita com conferência de bytes e ida e volta), `geoImportacaoExportacao` (10 — shapefile no importador com fator de escala e convergência medidos, DEM plano ± 1 mm, SHP de saída na origem ± 1 cm, inundação), `PainelTopografiaFaseA3` (5), `ControlesDeFundo` (+2). Suíte cheia 490 arquivos / 5.653 verde; tsc, `check-ui-standard`, `check-xss-sinks`, build verdes.

### Provas fora do vitest

- **Navegador** (`docs/spikes/geo/index.html` + `medir-a3.mjs`, 11 checks): o GeoTIFF passa pelo `prepararOrtofoto` real (DecompressionStream, canvas, PNG); o PNG é decodificado de volta e **a origem do desenho cai no pixel (100, 50) do arquivo, com a cor dele (100, 50, 150)**; desvio 0,0002 px; pixel 0,5001 m; recorte 161×100 de 200×100; giro de 6,3 mrad = a convergência meridiana; DEM Deflate/float32 com 1.999 pontos e 1 NODATA.
- **Shapefile lido pelo pyshp** (`docs/spikes/geo/gerar-shp.ts` → `conferir-shp.py`, 13 checks): PolygonZ fechado e horário com área 600 m², PolyLineZ com Z, PointZ, atributos acentuados em UTF-8, `.prj` SIRGAS 2000 / UTM 23S.

### Um achado

Eu esperava que o ponto 10 m a leste e 5 m ao norte NA QUADRÍCULA caísse em (10 000, 5 000) mm no desenho. Não cai: o desenho é o plano do terreno com Y no norte VERDADEIRO — a distância muda pelo fator de escala (< 0,1 %) e a direção gira pela convergência (0,36° aqui, 6,3 mrad na ortofoto). É a mesma física da A1; o teste agora mede isso em vez de igualdade de milímetros.

### Fora desta fase (declarado)

- **Tiles de satélite como fundo (Edge Function `tiles-proxy`)** — depende da decisão de LICENÇA (pendência de negócio E-12 do plano): o ESRI World Imagery exige conta/termos para uso comercial e o OSM proíbe uso pesado de tiles. Publicar um proxy de imagens de terceiros é decisão do negócio, não de código. O caminho de GeoTIFF/world file já cobre a ortofoto que a prefeitura, o IBGE ou o drone entregam.
- Comparação "DEM local × Open-Meteo na mesma gleba" com dado real (não há DEM público no repositório; provado com plano analítico).
- ECW/JP2, GeoTIFF com JPEG interno, BigTIFF (recusa com mensagem).
- `blueprint_underlays` não ganhou colunas de CRS/bbox: a ortofoto grava o CRS no nome e a aferição verdadeira (largura em px × mm) nos `calib_*`, como o fundo de DXF.

## Estado — A4 (26/09/2026)

As regras vieram dos documentos do PRÓPRIO INCRA, baixados e lidos nesta fase (não de memória): o modelo oficial `sigef_planilha_modelo_1.4_rc5.ods`, o Manual do SIGEF (formato das células), o Manual Técnico de Limites e Confrontações 1ª ed. (LA1…LN6) e o Manual Técnico para Georreferenciamento de Imóveis Rurais 2ª ed. (métodos PG/PT/PA/PS/PB, tipos de vértice que cada um admite, código `<credenciado 4>-<tipo>-<sequencial>`).

- [x] Kernel **0.59.0 → 0.60.0**: vértice com `sigmaEMm`/`sigmaNMm`/`sigmaHMm`/`altitudeM`; divisa com `tipoDeLimite` (LA1…LN6) e `confrontanteCns`/`confrontanteMatricula`/`confrontanteDocumento`; comando `SetBoundarySigef`; `NomearVerticesDoTerreno` com `sigef: { credenciado, inicio por tipo }` (credenciado de 4 caracteres, sequência POR TIPO, continuando de onde o credenciado parou). Tudo omitido do canônico quando ausente. Rito dos goldens: com a string em 0.59.0 e tudo no lugar, 313 testes passaram sem tocar hash; só depois do bump as seis falhas foram de hash. Bundle da planta-api regerado.
- [x] `utils/geo/sigef.ts`: `perimetroSigef` (sentido horário a partir do vértice mais ao NORTE; o trecho que SAI do vértice leva limite e confrontante; azimute/distância/área/perímetro no SGL); `gmsSigef` ("45 30 25,892 W"), `metrosSigef` ("0,18"); `validarSigef` (identificação, código no padrão, tipo × código, método do catálogo × tipo de vértice, sigmas e altitude presentes, precisão máxima M 0,50 / P 0,50 em LA / P 3,00 em LN, limite e confrontante por trecho, códigos repetidos); **planilha ODS = o modelo oficial PREENCHIDO** (DOMParser/XMLSerializer, `mimetype` primeiro e sem compressão, pastas vazias preservadas; abas e parâmetros intactos) — `identificacao` B2…B16, `perimetro_1` B3/B4/B5/B9/D9/F9 e os vértices da linha 12, A…L; `memorialGeoIncra` (GMS com 3 casas, h, azimute e distância SGL, confrontante e tipo de limite, fecha no inicial); `cartasDeAnuencia` (uma por confrontante com os trechos dele); `relatorioDeVerticesCsv`; `conferirRetornoSigef` (código; longitude; latitude em GMS ou decimal → ΔE/ΔN em m, e os códigos que só existem de um lado).
- [x] `blueprint_study_sigef` (migration `aplicar_20270926000040`, aplicada e conferida de fora: grants só `authenticated`, policy `is_org_member`): a identificação do imóvel (natureza, detentor, denominação, situação, natureza da área, SNCR, CNS, matrícula, município, credenciado, RT). Vértices e trechos ficam no kernel (desfazer, snapshot). Service + hook `useBlueprintSigef`.
- [x] Tela: **SIGEF** no grupo Lote da aba Terreno → gaveta `PainelSigef` (identificação; vértices com tipo/sigmas/h/método — método incompatível com o tipo aparece desabilitado; "Nomear no padrão SIGEF" com o próximo sequencial por tipo; trechos com tipo de limite, confrontante, CNS, matrícula, CPF/CNPJ; pendências; peças; conferência do retorno). A planilha fica desligada com erro e o title diz quantos. O modelo do INCRA é servido em `public/sigef/`.
- [x] Prancha **INCRA** (`TipoDePrancha`, `incluir.incra`): a planta topográfica com o quadro de vértices do SIGEF (código, longitude, latitude, limite), área no SGL e a legenda dos limites usados.
- [x] Testes: `blueprintKernelSigef` (6), `geoSigef` (15), `PainelSigef` (5), `BlueprintEditor` (+1); goldens recapturados.

### Provas fora do vitest

- **Navegador** (`docs/spikes/geo/sigef.html` + `medir-sigef.mjs`, 9 checks): controle incompleto com 38 erros ditos e a planilha desligada explicando; completo sem pendência; o botão baixa a planilha preenchida no navegador; trocar o tipo de limite pela tabela chega ao kernel.
- **O .ods baixado lido por outro leitor** (`conferir-ods.py`, stdlib do Python, 24 checks): ODS válido (mimetype), as 8 abas na ordem, os demais arquivos do modelo intactos, as seis abas de parâmetros byte a byte iguais ao modelo, identificação e vértices nas células certas e no formato do manual.

### O que continua com o credenciado (declarado)

- **Validar e enviar**: a extensão do SIGEF no LibreOffice e o validador do portal conferem contra os imóveis já certificados — só eles sabem. A prova final ("aceita pelo validador") é manual, pelo credenciado, numa parcela de teste. Sem integração com o portal (não há API pública).
- Planilha com **uma parcela** (`perimetro_1`, lado Externo); desmembramento, várias parcelas e lado interno ficam para quando houver caso.
- Memorial e cartas saem em TEXTO (para colar no modelo de documento do escritório), não em .docx por template.

## Estado — C3 (26/09/2026)

- [x] **A Via do loteamento como eixo** (sem migration: `blueprint_study_vias.via_uid` já existia desde a C2). `resolverViasDoLoteamento`: a via de projeto LIGADA pega o eixo, o nome e a seção (pista = caixa − 2 calçadas; calçada) da Via do DESENHO, ao vivo — mexer na rua no loteamento move as estacas, as seções e a nota; greide, passo e taludes continuam do projeto. Via apagada do desenho → ÓRFÃ, com o último eixo gravado e o aviso. Gaveta Vias e greide: "Projetar <rua>" para cada Via do loteamento ainda sem projeto; nome travado na ligada (o title diz para renomear no loteamento); **Notas de todas as vias** num CSV com a coluna `via`.
- [x] **Conferência do loteamento**: regra nova `via_sem_greide` (ATENÇÃO) — Via desenhada sem projeto geométrico, ou com o greide de partida (sem PIVs).
- [x] **LandXML de saída** (`utils/geo/landxml.ts`, botão **LandXML** na versão de topografia): `<Surfaces>` com a TIN da grade da versão (nós com cota; 2 triângulos por célula, 1 quando falta um canto), `<Alignments>` com o eixo em `<Line>`s e o greide em `<Profile><ProfAlign>` (`<PVI>` e `<ParaCurve length>`; via sem PIVs sai com o greide de partida), `<Parcels>` com a GLEBA primeiro (o importador existente lê a 1ª parcela como o contorno do lote) e cada lote com a área. Ordem NORTE ESTE COTA; SIRGAS 2000 / UTM do fuso com `<CoordinateSystem epsgCode>` quando georreferenciado, metros LOCAIS (e o nome do arquivo diz) quando não. `planoDeSaida` passou a ser o plano comum do SHP e do LandXML. `lerLandXmlCompleto` lê superfície, alinhamentos com os PVIs e parcelas — a volta.
- [x] Testes: `blueprintLandXml` (9 — o aceite: loteamento com 3 vias exporta e volta com a MESMA TIN (272 pontos, 479 faces), os MESMOS lotes (vértice a vértice, área) e os perfis; o importador de pontos que já existia lê a superfície como TIN importada e o contorno da gleba; nota de serviço por via), `PainelViasEGreide` (+4), `PainelTopografiaFaseA3` (+1). Suíte cheia 494 arquivos / 5.696 verde; tsc, `check-ui-standard`, `check-xss-sinks`, build verdes.

### Prova fora do vitest

`docs/spikes/geo/gerar-landxml.ts` → `conferir-landxml.py` (15 checks): o XML lido por um parser de verdade (ElementTree, namespace do LandXML 1.2): unidades, EPSG, nome com `&` escapado, 272 pontos e 479 faces, TODA face apontando pontos existentes, ordem N E Z, três alinhamentos, perfil PVI/ParaCurve/PVI, via sem greide sem perfil, a gleba primeiro, área e anel fechado dos lotes.

### Fora desta fase (declarado)

- A superfície exportada é a TIN da GRADE da versão (de onde as curvas saem), não a triangulação original dos pontos cotados — é a mesma superfície que a tela mostra.
- Curva HORIZONTAL (arco) no eixo: o eixo é polilinha, sai como `<Line>`s.
- Seções transversais (`<CrossSects>`) no LandXML: a nota de serviço em CSV cobre o campo.
