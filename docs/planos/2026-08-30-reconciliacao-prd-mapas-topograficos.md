# Reconciliação: PRD "Módulo de Mapas Topográficos e Curvas de Nível" × o que o ÒPURA já tem

## Pedido original

> avalie o prd
>
> (anexo: `PRD_Modulo_Mapas_Topograficos_OPURA.md`, v1.0, 30/08/2026)

E, após a avaliação apontar a colisão com módulos já em produção:

> sim
>
> (aceitando: "Quer que eu escreva o documento de reconciliação (nos moldes de
> `docs/planos/2026-08-06-reconciliacao-prd-planta-inteligente.md`, comparativo campo a campo
> `terrain_studies` × `opura_market_terrain_studies`) para virar a v1.1 deste PRD?")

Sessão de 2026-08-30.

---

## 0. Por que este documento existe

O PRD descreve o módulo **ÒPURA Terreno** como greenfield. Não é.

O §24 ("Dependências") lista como coisas a adquirir seis itens que **já estão aplicados em
produção**: PostGIS, componente de mapa, provedor de geocodificação, desenho de polígono,
cálculo geodésico de área e RLS por organização. A tabela que o §12.1 propõe criar,
`terrain_studies`, colide em nome e em papel com a `opura_market_terrain_studies` existente.

E há uma inversão pior, do mesmo tipo que já aconteceu no PRD da Planta Inteligente v1.0: **o
MVP do §5.1 permite apenas retângulo por dois pontos e adia polígono livre para a Fase 2
(§5.2) — mas polígono livre já roda hoje**, clicando no mapa. O MVP proposto é uma regressão
funcional em relação à tela que o usuário já usa.

Sem esta reconciliação, a decomposição em épicos vai (a) reconstruir mapa, busca, desenho e
cálculo de área que já existem, (b) criar a **quinta** representação de terreno do produto sem
declarar relação com as outras quatro, (c) comprar Python/GDAL num stack que é 100% TS —
repetindo o Rust/WASM já recusado no DR-04 — e (d) especificar ~20 endpoints REST para uma
aplicação que não tem camada de API.

Este documento é o insumo para uma **v1.1** do PRD. A v1.0 deve ficar intacta ao lado, marcada
"Substituída" no histórico da v1.1 — mesma convenção do
`docs/PRD_Tecnico_OPURA_Planta_Inteligente_v1.1.md`.

---

## 1. Inventário do que já existe

Levantado em 2026-08-30 lendo o código e as migrations, não de memória.

### 1.1 Tabelas geoespaciais

`CREATE EXTENSION IF NOT EXISTS postgis` está em
`supabase/migrations/20261124000000_opura_market_intelligence_mvp.sql:2`. **PostGIS está
habilitado.**

| Tabela | Papel | Geometria |
|:---|:---|:---|
| `opura_market_terrain_studies` | Estudo de terreno do Market Intelligence | `geom geometry(Point,4326)` + `polygon_geom geometry(Polygon,4326)` |
| `opura_market_listings` | Anúncios comparáveis | `geom geometry(Point,4326)` |
| `opura_market_developments` | Empreendimentos concorrentes | `geom geometry(Point,4326)` |
| `opura_market_neighborhoods` | Bairros | `geom` |
| `opura_market_monitored_competitors` | Concorrentes acompanhados por estudo | — |
| `opura_market_cities`, `..._neighborhood_history` | Catálogo e série histórica | — |

Índices GIST em todas as colunas geométricas (`20261124000000:154-157`,
`20260710000000:12`).

⚠️ **Observação de ordem de migration a verificar antes de qualquer coisa:** a migration que
faz `ALTER TABLE ... ADD COLUMN polygon_geom` tem prefixo `20260710000000` — **anterior** à
`20261124000000`, que cria a tabela e a extensão. Na ordem de prefixo o ALTER roda antes do
CREATE. As duas estão aplicadas no banco remoto, então foram aplicadas fora de ordem. Confirmar
o estado real com `npx supabase db query --linked` antes de escrever qualquer migration nova
que dependa dessas colunas.

### 1.2 Estrutura de `opura_market_terrain_studies`

Migration `20261124000000_opura_market_intelligence_mvp.sql:109-137`, mais
`20260710000000_opura_market_polygon_terrains.sql`.

| Campo | Tipo | Observação |
|:---|:---|:---|
| `id` | UUID | PK |
| `organization_id` | UUID NOT NULL | RLS |
| `name` | VARCHAR(255) NOT NULL | |
| `address` | TEXT | livre |
| `terrain_area` | NUMERIC(10,2) NOT NULL | m² |
| `coefficients_zone` | JSONB | zoneamento escolhido |
| `analysis_radius_meters` | INT DEFAULT 1000 | 500 / 1000 / 3000 / 5000 |
| `geom` | geometry(Point,4326) NOT NULL | centro do estudo |
| `latitude`, `longitude` | NUMERIC | redundantes com `geom` |
| `polygon_geom` | geometry(Polygon,4326) | **adicionada depois**, nullable |
| `recommended_product_mix` | JSONB | saída de análise |
| `recommended_standard` | VARCHAR(50) | |
| `estimated_vgv` | NUMERIC(15,2) | |
| `estimated_absorption_velocity` | NUMERIC(5,2) | |
| `risk_score` | NUMERIC(5,2) | |
| `created_by` | **VARCHAR(255)** | **e-mail, não UUID** |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

RLS: `org_access_terrain_studies` (`:190`), org-scoped via `organization_members`.

⚠️ `opura_market_cities`, `_neighborhoods`, `_listings` e `_developments` têm política
`FOR SELECT TO authenticated USING (true)` (`:173-186`) — **legíveis por qualquer usuário
autenticado, de qualquer organização**. É deliberado (catálogo de mercado é público entre
clientes?) ou é vazamento? O PRD tem um CA-008 sobre isso e a resposta precisa ser dada antes
de o módulo novo herdar o mesmo padrão.

### 1.3 Funções SQL já aplicadas

| Função | Origem | O que faz |
|:---|:---|:---|
| `calculate_polygon_area(JSONB)` | `20260710000000` | GeoJSON → `ST_Area(::geography)` → m² geodésicos |
| `get_terrain_radius_statistics(...)` | `20261124000002:10` | Estatísticas de comparáveis num raio do estudo |

⚠️ `calculate_polygon_area` foi criada com `GRANT EXECUTE ... TO anon`. Precedente ruim; o
módulo novo **não** deve copiá-lo (`REVOKE ... FROM PUBLIC` em toda RPC nova).

### 1.4 Código

| Arquivo | Linhas | Papel |
|:---|---:|:---|
| `components/OpuraMarketModule.tsx` | 3.053 | Mapa Leaflet, desenho de polígono, estudos de terreno, comparáveis |
| `services/opuraMarketService.ts` | 620 | 15 métodos; CRUD dos estudos, geocodificação, área |

Funções relevantes já implementadas:

| Função | Linha | O que já entrega |
|:---|---:|:---|
| `geocodeAddress` | `opuraMarketService.ts:338` | Nominatim (OSM), `format=json&limit=1` |
| `calculatePolygonArea` | `:367` | chama a RPC PostGIS |
| `listTerrainStudies` / `createTerrainStudy` / `deleteTerrainStudy` | `:224` / `:264` / `:325` | CRUD org-scoped |
| `getTerrainRadiusStats` | `:187` | RPC de estatísticas por raio |
| `L.map` + `L.tileLayer` | `OpuraMarketModule.tsx:844`, `:854` | mapa base OSM |
| `startDrawing` / `completeDrawing` | `:727-780` | **desenho de polígono livre**, fecha o anel, calcula centróide, chama a RPC de área |
| render do polígono em edição e salvo | `:1005-1040` | vértices, prévia da linha, polígono final |

### 1.5 Dependências de front já instaladas

`leaflet@1.9.4` + `@types/leaflet`, `three@0.169` + `@react-three/fiber` + `drei`.

**Não existem** no `package.json`: `maplibre-gl`, `mapbox-gl`, `@turf/*`, `proj4`,
`d3-contour`, `geotiff`, `shapefile`, `@tmcw/togeojson`, nenhuma biblioteca de DXF.

### 1.6 Infraestrutura de processamento

- **24 Edge Functions** em `supabase/functions/`, todas Deno/TS.
- **Zero Python** no repositório. Zero GDAL, Rasterio, GeoPandas, Shapely, PyProj.
- Padrão de job assíncrono já existente: **`processing_jobs`**
  (`20260519000000_fiscal_nfe_schema.sql:134`) — tem `organization_id`, `job_type`, `status`,
  `retry_count`, `max_retries`, `payload JSONB`, `error_code`, `error_message`, `failure_type`,
  `started_at`. Ou seja: fila, retry e dead-letter já modelados, em uso pelo Fiscal.
- Agendamento: `pg_cron` em ~10 migrations.
- Storage: buckets do Supabase, padrão já usado por Docs/GED e portais.

### 1.7 Não existe hoje

Nenhuma ocorrência no repositório de: fonte de elevação (`open-elevation`, `opentopodata`,
SRTM, Copernicus, TOPODATA), marching squares, isolinha, curva de nível, cota altimétrica,
grade de amostragem, referência vertical, DEM, GeoTIFF/COG, exportação KML ou DXF.

**Esse é o greenfield real, e é menor do que o PRD sugere.**

---

## 2. Comparação campo a campo — `terrain_studies` (PRD §12.1) × o que existe

| Campo do PRD §12.1 | Já existe? | Onde | Veredito |
|:---|:---|:---|:---|
| `id` | ✅ | `opura_market_terrain_studies.id` | reusar |
| `organization_id` | ✅ | idem | reusar |
| `company_id` | ❌ | — | avaliar se o produto usa mesmo `company_id` neste contexto |
| `name` | ✅ | `name VARCHAR(255)` | reusar |
| `purpose` | ❌ | — | **novo** |
| `description` | ❌ | — | novo (baixo valor no MVP) |
| `linked_entity_type` / `linked_entity_id` | ❌ | — | **novo, e é o item mais importante do §12** |
| `display_unit` (m/ft) | ❌ | — | novo — ver DR-06, provavelmente cortar |
| `current_version_id` | ❌ | — | **novo** |
| `status` | ❌ | — | novo |
| `created_by` | ⚠️ | `VARCHAR(255)` = e-mail | **conflito de tipo — ver DR-05** |
| `created_at` / `updated_at` | ✅ | idem | reusar |
| `deleted_at` | ❌ | — | novo (RN-008 exige exclusão lógica) |
| — | ➕ | `address`, `terrain_area`, `coefficients_zone`, `analysis_radius_meters`, `recommended_*`, `estimated_vgv`, `risk_score` | **campos que o PRD ignora e que já estão lá** |

### 2.1 `terrain_study_versions` (PRD §12.2)

Nada equivalente existe. **É novo por inteiro** — e é a melhor parte do PRD, porque é onde mora
a proveniência. Duas ressalvas de campo:

| Campo | Ressalva |
|:---|:---|
| `geometry geometry(Polygon,4326)` | Duplica `opura_market_terrain_studies.polygon_geom`. Se a versão é dona da geometria (correto, pela RN-005), então `polygon_geom` no estudo vira **derivada da versão corrente** ou é aposentada. Decidir; não deixar as duas escrevíveis. |
| `area_m2` | Já calculada por `calculate_polygon_area`. Reusar a RPC, não escrever uma segunda. |
| `geometry_source` enum `drawn/property/imported/coordinates` | `property` não é alcançável hoje — ver §3.3. |

### 2.2 `terrain_elevation_points` (PRD §12.3)

40.000 linhas por versão, e **nenhum RF do MVP faz consulta espacial por ponto**: o RF-018
exporta a grade inteira em CSV e o RF-012 mostra pontos como camada opcional. O próprio PRD
hesita ("particionada ou parquet").

**Recomendação:** no MVP a grade não é tabela. É um artefato no Storage (array de
`Float32` ou CSV comprimido) referenciado pela versão, mais um `statistics JSONB` na versão
para tudo que a tela precisa. Tabela de pontos só se aparecer consulta espacial por ponto.

### 2.3 `terrain_processing_jobs` (PRD §12.5)

Sobrepõe-se quase inteiramente a `processing_jobs`. Campos do PRD que a existente não tem:
`progress_percent`, `current_stage`, `provider_request_count`, `sampled_point_count`,
`finished_at`, `error_detail_private`, `user_message`. Decidir entre estender a existente ou
criar irmã — ver DR-04.

### 2.4 `elevation_providers` (PRD §12.7)

**Novo por inteiro, e correto.** É a peça que garante que a escolha de fonte não fique
embutida no domínio. Manter como está no PRD.

---

## 3. As cinco representações de terreno

### 3.1 O mapa

| Onde | O que é "terreno" ali | Coordenadas | Área |
|:---|:---|:---|:---|
| `opura_market_terrain_studies` | ponto + polígono do lote, raio de análise, VGV/risco | **WGS84 (4326)** | `ST_Area(::geography)` |
| `imovib_studies` | parâmetros de viabilidade (`ca_basic`, `ca_max`, `occupancy_rate`, `zoning`) | **nenhuma** | não tem geometria |
| `land_deal_scenarios` | terreno como negócio (compra, permuta, opção, sociedade), ligado a `investor_opportunities` | nenhuma | — |
| Planta Inteligente › Terreno | lote como anel de divisas com **papel** (frente/fundos/laterais), **medida da escritura** e confrontante por lado | **mm inteiro, local** | `polygonArea` do anel, em mm² |
| **PRD** | polígono de análise + grade de elevação | WGS84 | `area_m2` |

### 3.2 O que isso significa

São **três geometrias incompatíveis** (WGS84 / nenhuma / mm local) e **cinco donos** do
conceito "terreno". É o mesmo quadro de `blueprint_modulos_concorrentes`, e o desfecho
conhecido desse padrão neste produto é `plant_urban_rulesets`: **tabela aplicada no banco e
morta no app**.

O PRD não menciona nenhuma das quatro. A v1.1 precisa declarar, para cada uma, se **absorve**,
**se conecta** ou **ignora** — como o DR-03 do Planta Inteligente fez com o Mapa Regulatório.

### 3.3 Duas descobertas que decidem escopo

**(a) O imóvel não tem geometria.** `commercial_properties`
(`20240219000000_commercial_module.sql:4`) tem `type` com o valor `'LAND'`, `address TEXT NOT
NULL` e `area NUMERIC` — e **nenhuma latitude, longitude ou coluna geométrica**. Nenhuma
migration posterior adiciona.

Consequência direta: a jornada §8.1 ("o sistema carrega endereço e geometria existentes") e o
item 1 do critério de conclusão §26 ("abrir um terreno cadastrado") **não são executáveis
hoje**. O melhor que se consegue é geocodificar o `address` de texto livre — o que traz o erro
do geocodificador para dentro do estudo, sem que a origem fique registrada. O PRD trata isso
como dado; é trabalho de fundação não orçado.

**(b) A Planta Inteligente não é georreferenciada.** O kernel está em
`blueprint-kernel-ts-0.8.0` (`utils/blueprintKernel/units.ts:66`) e opera em **mm inteiro
local**: não há latitude, longitude, EPSG ou ponto de amarração em nenhum arquivo de
`utils/blueprintKernel/`, `utils/blueprint*.ts` ou `types/blueprint*.ts`.

Consequência: **a Fase 3 do PRD (§5.2 — terreno natural × superfície de projeto, corte e
aterro) não é alcançável sem antes georreferenciar o lote do blueprint** (âncora + rotação +
declaração de CRS). Isso é uma entrega própria, com bump de `KERNEL_VERSION`, e não aparece em
nenhum lugar do PRD nem do plano §21.

O `utils/blueprintTerreno.ts` já tem o que interessa desse lado: anel do lote,
`erroFechamentoMm` (erro de fechamento explícito, não escondido) e a separação entre **medida
desenhada** e **medida da escritura**. É a disciplina que o módulo topográfico deveria herdar —
não reinventar.

---

## 4. Decisões de portão propostas

Nos moldes dos DR-01…DR-04 do Planta Inteligente. Cada uma precisa de "sim" ou "não" antes de
qualquer épico.

### DR-01 — O módulo **estende** o estudo de terreno existente; não cria um paralelo

**Proposta:** as versões topográficas penduram em `opura_market_terrain_studies`. Nasce
`terrain_study_versions` com FK para ela; **não** nasce `terrain_studies`.

**Por quê:** geometria, mapa, geocoder, cálculo de área, RLS e CRUD já estão lá e testados em
produção. Criar `terrain_studies` ao lado significa duas telas onde o usuário desenha o mesmo
lote e duas respostas para "qual é a área deste terreno".

**Alternativa se recusado:** então a v1.1 precisa dizer explicitamente o que acontece com
`opura_market_terrain_studies` — migra, coexiste ou morre — e quem passa a ser a autoridade da
área do terreno.

**Como sei que terminou:** a v1.1 tem uma seção "Relação com o Market Intelligence" e o §12.1
some ou vira "campos adicionados a `opura_market_terrain_studies`".

### DR-02 — Prefixo `terrain_*` para o que é novo, nunca `terrain_studies`

**Proposta:** `terrain_study_versions`, `terrain_contours`, `terrain_exports`,
`elevation_providers`. O nome `terrain_studies` fica **proibido** — colide por prefixo com
`opura_market_terrain_studies` e reproduz o problema `plan_*` × `plant_*` do DR-02 anterior.

**Como sei que terminou:** `grep -c 'terrain_studies' migrations` novas = 0.

### DR-03 — Motor em **TypeScript**, não Python

**Proposta:** marching squares e estatísticas em TS puro, em `utils/`, testável sem navegador —
mesmo padrão de `utils/blueprintKernel/` e `utils/blueprintElevation.ts`. Execução do job numa
Edge Function Deno. Python/GDAL só se um spike com dois braços mostrar que o braço TS **falha**
em requisito real, não por preferência.

**Por quê:** o stack é 100% TS/React/Supabase; 24 Edge Functions Deno; zero Python. Comprar
Python é uma segunda linguagem de runtime, com deploy, observabilidade e CI próprios, para
~200 linhas de algoritmo determinístico. É exatamente o Rust/WASM que o DR-04 do Planta
Inteligente recusou — e o empate lá foi resolvido a favor do TS.

**Limite honesto a testar no spike:** o teto de tempo/memória da Edge Function contra 40.000
amostras (RN-002). Se não couber, a saída é **reduzir o teto do piloto** ou fatiar o job em
blocos com `pg_cron`, antes de trocar de linguagem.

**Como sei que terminou:** o spike da Etapa 0 tem dois braços medidos e um ADR com o número.

### DR-04 — Reusar `processing_jobs`, não criar `terrain_processing_jobs`

**Proposta:** adicionar `job_type='terrain_contours'` ao enum existente e as colunas que
faltam (`progress_percent`, `current_stage`, `sampled_point_count`, `finished_at`). O
`payload JSONB` já acomoda `version_id` e parâmetros.

**Por quê:** fila, retry, dead-letter e a disciplina de `error_code` estável já existem e já
foram exercitadas pelo Fiscal (inclusive as ações manuais de dead letter). Uma segunda máquina
de estados significa dois lugares para olhar quando algo trava.

**Ressalva:** verificar se `raw_document_id UUID NOT NULL` inviabiliza o reuso — se sim, é uma
migration para torná-lo nullable, não um motivo para tabela nova.

**Como sei que terminou:** decisão registrada, e a migration correspondente escrita.

### DR-05 — `created_by` é UUID de `auth.users`, e o RLS é por `organization_members`

**Proposta:** todo campo novo usa `created_by UUID REFERENCES auth.users(id)`.
`opura_market_terrain_studies.created_by VARCHAR` (e-mail) fica como está — não se mexe em
tabela em produção por estética — mas **nada novo nasce com e-mail**.

**Por quê:** já existe histórico de RLS quebrada por `user_id` × e-mail em 19 tabelas. Deixar
o PRD sem decidir garante que a próxima tabela repita.

**Como sei que terminou:** o §12 da v1.1 declara o tipo e cita a regra.

### DR-06 — Cortar `display_unit` (metros/pés) do MVP

**Proposta:** metros, ponto. Pés entram quando existir usuário que peça.

**Por quê:** o PRD paga por essa dualidade em cinco lugares (RF-002, RF-009, RF-012, RF-018,
RN-001) e o produto atende o Sul de Minas. É complexidade sem demanda.

### DR-07 — §14 (contratos REST) é reescrito para o padrão do produto

**Proposta:** os ~20 endpoints `/api/terrain-*` viram: services em
`services/terrainStudyService.ts` (REGRA 5), RPCs para validação/estimativa, **uma** Edge
Function para o job, Storage com URL assinada para download.

**Por quê:** o ÒPURA não tem camada de API própria. Do jeito que está, o §14 especifica um
servidor que não existe, e a decomposição em épicos vai orçá-lo.

**Como sei que terminou:** o §14 da v1.1 não tem nenhuma rota `/api/`.

### DR-08 — O produto **recusa**, não só avisa, quando a fonte não suporta a área

**Proposta:** critério de aceite novo — se a área tem menos que N pixels reais da fonte
(sugestão inicial: 25, ou seja ~5 × 5 células), o sistema **não gera**. Área mínima do piloto
declarada no §1.

**Por quê:** o PRD é honesto sobre falsa precisão (RN-003, §15.3, tabela de riscos), mas
nenhum critério de aceite do §19 trava — o CA-002 só cobre área **grande demais**. Com DEM de
30 m, um lote urbano de 20 × 30 m cabe em um pixel; curva de 1 m ali é ficção gráfica, e a
persona 6.1 ("triagem de terreno") é justamente quem vai pedir isso.

**Consequência de produto que precisa ficar escrita:** o módulo serve **gleba e loteamento**,
não lote urbano. Isso muda o §1 e o público-alvo.

**Como sei que terminou:** existe CA-013 no §19 e um teste que o cobre.

---

## 5. Emendas propostas ao PRD

Cada emenda tem **o que muda** e **como sei que terminou**.

| # | Seção | O que muda | Como sei que terminou |
|---:|:---|:---|:---|
| E-01 | §0 (novo) | Seção "Relação com módulos existentes" com o inventário do §1 deste documento e os DR-01…DR-08 | A v1.1 abre declarando o que já existe |
| E-02 | §5.1 | **Polígono livre entra no MVP** (já existe); retângulo por dois pontos vira atalho opcional | §5.2 não lista mais "desenho poligonal livre" |
| E-03 | §5.1 | Sai do MVP: KML, `display_unit`, as 4 classes de RF-020 (nasce com uma), notificações (§18), aprovação técnica (RN-006) | Backlog P0 do §22 com ≤ 9 itens |
| E-04 | §12.1 | `terrain_studies` deixa de existir; vira extensão de `opura_market_terrain_studies` | §12.1 renomeado |
| E-05 | §12.3 | `terrain_elevation_points` sai do MVP; grade vira artefato no Storage + `statistics JSONB` | §12.3 marcado "Fase 2, se necessário" |
| E-06 | §12.5 | `terrain_processing_jobs` vira extensão de `processing_jobs` | §12.5 renomeado |
| E-07 | §13.4 | Python/GDAL sai como recomendação; entra "TS puro, com spike de dois braços" | §13.4 não cita Rasterio/GeoPandas como padrão |
| E-08 | §14 | Reescrito para services + RPC + Edge Function + Storage assinado | Nenhuma rota `/api/` |
| E-09 | §15.4 | Explicitar o caso brasileiro: SRTM referencia **EGM96**; a RN da prefeitura referencia **Imbituba/MAPGEO**. O usuário vai comparar e achar que o sistema erra por metros | §15.4 tem um parágrafo "Brasil" |
| E-10 | §19 | CA-013: recusa por resolução insuficiente (DR-08) | CA-013 existe |
| E-11 | §24 | Remover as 6 dependências já satisfeitas; **adicionar** duas reais: geometria em `commercial_properties` e georreferência do lote do blueprint | §24 tem os dois itens novos |
| E-12 | §24 / §22 | Licenciamento de tiles e geocoder vira **item P0**, não dependência de rodapé — hoje o app usa `tile.openstreetmap.org` direto e Nominatim público com `User-Agent: OpuraMarketIntel/1.0`, e ambos têm política contra uso pesado | P0 do §22 tem o item |
| E-13 | §17 (novo item) | Declarar qual decisão de negócio muda por causa da curva — ver §7 deste documento | §17 abre com a resposta |
| E-14 | §10 | Referenciar `docs/ui_ux_guia_unificado.md` e os padrões de toolbar/tabela/`ActionIconButton` | §10 cita o guia |
| E-15 | §12.8 / RF-001 | Declarar o comportamento em **"Todas as organizações"** (REGRA 1: org obrigatória na escrita, nunca bloqueante na leitura) | RF-001 tem o parágrafo |

---

## 6. O que sobra de genuinamente novo

Descontado tudo que já existe, o greenfield real é:

1. **Adaptador de fonte de elevação** (`elevation_providers` + a interface `ElevationProvider`
   do §13.3) — novo, e a peça mais bem desenhada do PRD.
2. **Grade de amostragem** e normalização de `nodata` (RF-008, RF-010).
3. **Marching squares** + união de segmentos + recorte no polígono (RF-011).
4. **Versionamento com proveniência e hash** (§12.2, RN-005, CA-010).
5. **Estatísticas altimétricas** (RF-013).
6. **Camada de curvas no mapa** com cota clicável (RF-012) — sobre o Leaflet que já está lá.
7. **Exportação SVG e CSV** (RF-016, RF-018).
8. **Fixtures geoespaciais** (§20.2) — plano, rampa, cone, sela, depressão, `nodata`.

Oito itens. O PRD tem 22 no P0.

---

## 7. A pergunta de portão que o PRD não faz

**Qual decisão de negócio muda por causa da curva de nível?**

O §17 lista integrações genéricas ("registrar premissas", "criar risco") e nenhum RF liga a
saída ao orçamento ou ao planejamento. Duas respostas possíveis, e elas dimensionam produtos
muito diferentes:

**(a) "Produzir um briefing melhor para o topógrafo e triar gleba."** Então o MVP é: polígono
(já existe) + uma fonte + curvas + estatísticas + SVG/CSV, dentro do Market Intelligence, **sem
fila, sem versionamento imutável, sem aprovação, sem notificações**. Cabe em ~5 semanas, não
12–19.

**(b) "Alimentar implantação, acessos e corte/aterro."** Então o destino é o kernel da Planta
Inteligente, a Fase 3 do §5.2 **é** o produto, e o caminho crítico começa pela georreferência
do lote (§3.3b) — que o PRD não orça.

Escolher (a) ou (b) antes de decompor em épicos. Fazer as duas ao mesmo tempo é como o produto
chegou a ter cinco terrenos.

---

## 8. MVP redesenhado, se a resposta for (a)

| # | Entrega | Como sei que terminou |
|---:|:---|:---|
| 1 | `elevation_providers` + adaptador da fonte escolhida no spike | Uma fonte cadastrada devolve grade para um polígono conhecido |
| 2 | `terrain_study_versions` pendurada em `opura_market_terrain_studies`, com proveniência e hash | Duas gerações com mesmos parâmetros dão o mesmo `result_hash` |
| 3 | Grade + `nodata` + estatísticas, em TS puro em `utils/` | Testes rodam sem navegador, com as fixtures do §20.2 |
| 4 | Marching squares + recorte no polígono | Cone dá anéis concêntricos; sela dá a topologia certa; nenhuma curva fora do polígono |
| 5 | Job em `processing_jobs` + Edge Function | Job falho vira dead letter, não versão concluída (CA-009) |
| 6 | Camada de curvas no Leaflet, cota ao clicar | Verificado no navegador com Playwright (`serviceWorkers:'block'`) |
| 7 | Recusa por resolução insuficiente (DR-08) | Lote de 600 m² com fonte de 30 m é recusado com mensagem que ensina o que fazer |
| 8 | Exportação SVG + CSV com aviso embutido | Arquivo aberto fora do sistema carrega fonte, data, CRS e o aviso do RF-020 |

Fora do MVP: KML, DXF, GeoJSON, pés, aprovação, notificações, comentários, declividade,
perfil, hipsométrico, 3D, corte/aterro, importação de levantamento.

---

## 9. Riscos que esta reconciliação **não** resolve

1. **A fonte de elevação segue indefinida** (§25.1). É a variável que decide se o produto vale.
   O spike da Etapa 0 continua sendo o portão real. Candidatos a medir contra terrenos com
   levantamento conhecido em Cambuí / Extrema / Pouso Alegre: SRTM 30 m, Copernicus GLO-30,
   NASADEM, TOPODATA (INPE). Todos a verificar quanto a cobertura, licença e referência
   vertical — nenhum está no repositório hoje.
2. **Licença de tiles e geocoder** (E-12) é decisão jurídica, não técnica.
3. **A geometria de `commercial_properties`** (§3.3a) é fundação de outro módulo. Se ninguém
   assumir, a jornada §8.1 continua não executável e o critério §26.1 não fecha.
4. **O `USING (true)` das tabelas de mercado** (§1.2) precisa de veredito antes de o módulo
   herdá-lo.

---

## 10. Próximo passo

1. Levar os **DR-01…DR-08** para decisão. Sem eles, a decomposição em épicos parte do PRD v1.0
   e reconstrói o que existe.
2. Responder à pergunta do §7: **(a)** ou **(b)**.
3. Aplicar as emendas E-01…E-15 numa `docs/PRD_Modulo_Mapas_Topograficos_OPURA_v1.1.md`,
   deixando a v1.0 intacta e marcada "Substituída" no histórico da v1.1.
4. Só então: Etapa 0 (spike da fonte + braço TS × Python).

---

## Referências

- `docs/planos/2026-08-06-reconciliacao-prd-planta-inteligente.md` — o precedente deste formato
- `docs/planos/2026-08-06-emendas-prd-planta-inteligente.md` — formato das emendas
- `docs/PRD_Tecnico_OPURA_Planta_Inteligente_v1.1.md` — convenção de versionamento de PRD
- `REGRAS_DE_OURO_ARQUITETURA.md` — REGRA 1 (organização), REGRA 3 (schema primeiro),
  REGRA 5 (service layer)
- `docs/ui_ux_guia_unificado.md`
