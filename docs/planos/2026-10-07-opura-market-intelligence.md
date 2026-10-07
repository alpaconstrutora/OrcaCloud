# ÒPURA Market Intelligence — do protótipo de Cambuí a um módulo que decide

## Pedido original

Sessão `1466c129-95b3-40bf-8f06-cc79c31a567e`, 07/10/2026, ~13:50:

> analise o módulo ÒPURA Market Intelligence

Depois da análise, ~14:05, na mesma sessão:

> publique e faça um plano de implementacao

A análise que originou este plano está publicada como página (link na sessão) e
resumida na memória `project_opura_market_intelligence_avaliacao`. Os fatos de
produção abaixo foram lidos no banco remoto em 07/10/2026.

## Diagnóstico em uma frase

É um protótipo de piloto para Cambuí-MG com a arquitetura de dados certa (PostGIS,
RLS por organização) e a camada de decisão errada: mistura anúncios de organizações
diferentes, inventa coordenadas, exibe seed fictícia como medição e nunca produziu um
estudo de terreno em produção.

| Fato no banco remoto (07/10/2026) | Valor |
|---|---|
| Cidades / bairros | 1 / 4, bairros com `updated_at` = 12/06 (seed, nunca recalculados) |
| Anúncios | 363 — 277 do scraper, 80 de planilha, 6 seed fictícia com `organization_id` NULL |
| Anúncios sem `geom` | 137 (invisíveis no mapa e fora da estatística do raio) |
| Anúncios marcados duplicados (`parent_listing_id`) | 32 |
| Estudos de terreno salvos | 0 |
| Regras de praça configuradas | 0 |
| `developments` / `monitored_competitors` | 0 / 0 — nenhum código escreve |
| Histórico de bairro | 18 linhas, todas seed |

Arquivos do módulo: `components/OpuraMarketModule.tsx` (3.053 linhas),
`components/ImportListingsModal.tsx`, `components/CityRulesModal.tsx`,
`services/opuraMarketService.ts`, `types/market.ts`, migrations
`20261124000000..2`, `20261125000002`, `20260710000000`. Rota `opura-market`
liberada para todo perfil em `AppRouter.tsx` (`allowed = true`).

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 07/10/2026 | D1 — Apagar a seed fictícia (6 anúncios org NULL de ZAP/OLX/VivaReal + 18 linhas de histórico 2025-12 a 2026-05)? | **Apagar.** |
| 07/10/2026 | D2 — `developments` / `monitored_competitors` (0 linhas, sem código que escreva) | Recomendação adotada sem pergunta: manter as tabelas, remover `listDevelopments` morto do service. |
| 07/10/2026 | D3 — Bairro Score / Saturação / Score Potencial até existir regra? | **Esconder** ("não calculado"); só preço, ticket, área e concorrentes passam a ser recalculados. |
| 07/10/2026 | D4 — Cadastro de cidade/bairro: tela ou SQL? | **Tela ADMIN mínima já neste plano** (item 4.4). |
| 07/10/2026 | D5 — Acesso ao módulo? | **Só ADMIN e USER** (item 6.6). |

## Plano

Ordem é por risco: primeiro o que vaza ou mente, depois o que prende a Cambuí, por
último o que é só dívida de código. Cada fase fecha sozinha e pode ser publicada
sozinha (REGRA #8: uma frente, uma pasta).

### Fase 1 — Fechar os vazamentos entre organizações (banco)

**1.1 `supabase/migrations/20271007000000_opura_market_raio_por_org.sql`** (nova)
- O que muda: `get_terrain_radius_statistics` recriada como `SECURITY INVOKER`
  (a policy `allow_select_market_listings` — org NULL OU membro — passa a filtrar
  por dentro), distância volta a `ST_DWithin(geom::geography, ponto::geography,
  p_radius_meters)` em metros, `REVOKE ALL ... FROM PUBLIC, anon` +
  `GRANT EXECUTE ... TO authenticated`. Cabeçalho responde às duas perguntas da
  REGRA #7.
- Como sei que terminou: script `scripts/verificar-opura-market-rls.sql` rodado
  com `SET ROLE authenticated` e claims de dois usuários de orgs diferentes
  devolve `total_listings` diferentes para o mesmo ponto/raio (hoje devolve
  igual); `curl` com a chave `anon` → `42501`; o mesmo ponto com raio 1000 m
  devolve a mesma contagem que `SELECT count(*) ... WHERE ST_DWithin(geography)`.

**1.2 mesma migration — trigger `fn_deduplicate_market_listing`**
- O que muda: cláusula `AND organization_id IS NOT DISTINCT FROM NEW.organization_id`
  (anúncio só vira filho de anúncio da MESMA origem: mesma org, ou ambos globais);
  divisão protegida com `NULLIF(area_private, 0)`; distância em `geography`, 30 m.
- Como sei que terminou: inserir dois anúncios idênticos em orgs diferentes → ambos
  com `parent_listing_id` NULL; na mesma org → o segundo aponta para o primeiro;
  anúncio existente com `area_private = 0` não dispara erro de divisão.

**1.3 mesma migration — reparo dos vínculos cruzados já gravados**
- O que muda: `UPDATE ... SET parent_listing_id = NULL` onde filho e pai têm
  `organization_id` distintos. Idempotente.
- Como sei que terminou: a consulta
  `SELECT count(*) FROM opura_market_listings c JOIN opura_market_listings p ON
  p.id = c.parent_listing_id WHERE c.organization_id IS DISTINCT FROM p.organization_id`
  devolve 0 (medir ANTES e registrar o número aqui).

**1.4 aplicação**: `npx supabase db query --linked -f <arquivo>` (nunca `db push`,
ver CLAUDE.md). Registrar data e resultado da verificação nesta seção.

#### Fase 1 — execução (07/10/2026, frente `market-fase1`)

Arquivo único: `supabase/migrations/aplicar_20271007000100_opura_market_raio_e_dedup_por_org.sql`
(itens 1.1, 1.2 e 1.3). Aplicado no remoto em 07/10/2026 com `db query -f`.

**Medição ANTES (banco remoto):**

| Medida | Valor |
|---|---|
| Vínculos `parent_listing_id` entre organizações diferentes | **0** |
| Anúncios por organização | Alpa 357 · globais (org NULL) 6 |
| Raio 1 km no centro de Cambuí, conta em graus × em metros | 114 × 114 |
| Usuários com conta fora da Alpa | nenhum |

**O que a medição corrigiu na análise de 07/10:**
- O gatilho de deduplicação **não** é `SECURITY DEFINER`, então já respeitava a RLS
  de quem importa. O cruzamento entre organizações só acontecia com anúncio
  **global** ou com usuário membro das duas. O conserto segue válido, mas o
  mecanismo é mais estreito do que a análise disse.
- O erro de graus é pequeno nesta latitude (círculo ~8 % mais largo no sentido
  leste-oeste; mesma contagem em 1 km). O defeito grave era o vazamento.
- O vazamento da RPC era real: a conta sem vínculo recebia **114** anúncios no
  raio, quando só **5** são globais.

**Prova** — `bash scripts/verificar-opura-market-rls.sh <email-membro>` (tudo em
`BEGIN … ROLLBACK`; a conta "de fora" é um JWT simulado sem vínculo, porque não
existe conta real fora da Alpa). O modo `--ensaio <migration>` aplica a migration
dentro da transação e desfaz — foi rodado antes da aplicação e passou.

| Checagem | Antes | Depois (aplicado) |
|---|---|---|
| RPC, membro da Alpa | 114 | 114 (= gabarito) |
| RPC, conta sem vínculo | **114** (vazamento) | **5** (= gabarito, só globais) |
| RPC com papel `anon` (SQL) | 42501 (já fechado em 16/09) | 42501 |
| RPC com a chave publicável (REST, de fora) | — | HTTP 401 |
| Vínculos cruzados | 0 | 0 |
| Gatilho: privado igual a global | (não testável: caía antes) | sem pai |
| Gatilho: privado repetido na mesma org | — | pai = o primeiro privado |
| Gatilho: área privativa 0 | **erro 22012 divisão por zero** | sem erro, segundo vira filho |
| Anúncios de teste sobrando | — | 0 |

Também: `__tests__/segurancaMigrations.test.ts`, `migrationsPrefixo.test.ts` e
`deduplication.test.ts` — 3 arquivos, 6 testes, verdes. Definições gravadas: RPC
`LANGUAGE sql`, `SECURITY INVOKER`, ACL sem PUBLIC/anon; índice
`idx_opura_market_listings_geog` criado.

**Fica para a Fase 7.1:** a deduplicação do SERVICE (`importListingsInBatch`) ainda
compara o lote com tudo que a RLS mostra, incluindo os globais — um anúncio privado
igual a um global é descartado no front antes de chegar ao gatilho. Precisa da
mesma regra de "mesma origem".

### Fase 2 — Parar de inventar dados

**2.1 `components/ImportListingsModal.tsx`**
- O que muda: remove o sorteio de coordenada em torno do centro de Cambuí quando a
  geocodificação falha; grava `latitude/longitude/geom` NULL; o resumo final diz
  "N anúncios sem localização (não aparecem no mapa nem na análise de raio)".
- Como sei que terminou: importar planilha com um endereço inexistente → anúncio
  salvo com `geom` NULL, resumo informa a contagem, pino não aparece no mapa;
  `grep -n "Math.random" components/ImportListingsModal.tsx` = 0.

**2.2 `supabase/migrations/20271007000001_opura_market_estudo_guarda_estatistica.sql`** (nova)
- O que muda: `opura_market_terrain_studies` ganha `radius_stats JSONB` (as
  estatísticas reais do raio no momento da análise).
- Como sei que terminou: coluna existe; `createTerrainStudy` grava e o select lê.

**2.3 `services/opuraMarketService.ts` + `components/OpuraMarketModule.tsx` (reabrir estudo)**
- O que muda: `createTerrainStudy` grava `radius_stats`; `handleSelectSavedStudy`
  deixa de montar `statsMock` (total = VGV/400000, área 80…) e mostra o gravado;
  estudo antigo sem `radius_stats` mostra "estatísticas não guardadas" em vez de
  número.
- Como sei que terminou: salvar um estudo, reabrir → mesmos números da análise
  original; `grep -n "statsMock" components/` = 0.

**2.4 `supabase/migrations/20271007000002_opura_market_refresh_bairro.sql`** (nova)
- O que muda: função `fn_opura_market_refresh_neighborhoods(p_city_id)` recalcula
  `price_per_m2_medio`, `ticket_medio`, `area_media`, `competitors_count`,
  `dominant_typology` a partir dos anúncios ativos e não-duplicados do bairro
  (apenas os globais, org NULL — os privados são de quem importou) e grava a
  linha do mês em `opura_market_neighborhood_history`; `pg_cron` mensal.
  `bairro_score`, `saturation_level`, `potential_score` ficam NULL até existir
  regra explícita (ver decisão D3) e a UI mostra "não calculado".
- Como sei que terminou: rodar a função → `updated_at` dos 4 bairros = hoje,
  médias batem com `AVG` manual, histórico ganha 1 linha por bairro com a data
  do mês; o gráfico "Evolução" mostra só pontos reais.

**2.5 mesma migration de 2.4 — apagar a seed fictícia (D1)**
- O que muda: `DELETE FROM opura_market_listings WHERE organization_id IS NULL AND
  source IN ('ZAP','OLX','VivaReal')` (6 linhas hoje; conferir e registrar a contagem
  antes) e `DELETE FROM opura_market_neighborhood_history WHERE recorded_date <
  '2026-06-01'` (18 linhas). Idempotente.
- Como sei que terminou: as duas contagens devolvem 0; nenhum pino "Global" no mapa;
  o gráfico "Evolução" fica vazio até o primeiro refresh real (2.4).

### Fase 3 — Scraping e geocodificação saem do navegador

**3.1 `supabase/functions/opura-market-scraper/index.ts`** (nova Edge Function)
- O que muda: recebe `{ cityId, url, maxPages, organizationId }` com o JWT do
  usuário; valida que o usuário é membro da organização (não confiar no body);
  baixa as páginas direto (sem corsproxy/allorigins), extrai JSON-LD `Product`,
  geocodifica no Nominatim com `User-Agent` identificado e 1 req/s com cache por
  bairro, grava com a mesma deduplicação (trigger + checagem no lote), devolve
  `{ imported, deduplicated, notGeocoded, pagesRead }`.
- Como sei que terminou: `curl` com JWT válido importa anúncios para a org do JWT;
  sem JWT → 401; com `organizationId` de org alheia → 403; os anúncios aparecem na
  tabela da tela.

**3.2 mesma função, modo `import`** (ou função irmã `opura-market-import`)
- O que muda: recebe as linhas já mapeadas da planilha e faz geocodificação +
  gravação no servidor; a tela só envia e espera.
- Como sei que terminou: planilha de 50 linhas importa com a aba do navegador
  fechada no meio sem perder o lote (o trabalho é do servidor).

**3.3 `services/opuraMarketService.ts`**
- O que muda: `runScraper()` e `importListings()` chamam as functions;
  `geocodeAddress` e `importListingsInBatch` deixam de ser chamados pela UI
  (manter `importListingsInBatch` só se a function reusar o código via import; se
  não, remover).
- Como sei que terminou: `grep -rn "corsproxy\|allorigins\|nominatim" components/
  services/` = 0.

**3.4 `components/OpuraMarketModule.tsx`**
- O que muda: apaga `handleTriggerScraping` e `handleRunScraper` (duas cópias de
  ~230 linhas); os dois botões chamam o service; status/resultado vêm da resposta.
- Como sei que terminou: uma única função de captura; o componente perde ≥ 450
  linhas.

### Fase 4 — Tirar Cambuí do código

**4.1 `supabase/migrations/20271007000003_opura_market_bairro_centroide.sql`** (nova)
- O que muda: `opura_market_neighborhoods` ganha colunas geradas
  `centroid_lat`/`centroid_lng` (`ST_Y/ST_X(ST_Centroid(geom))`), porque o
  PostgREST devolve `geometry` como WKB hexadecimal e a tela hoje nem tenta ler.
- Como sei que terminou: select devolve números para os 4 bairros; bairro inserido
  com geom em outra cidade devolve o centroide certo.

**4.2 `services/opuraMarketService.ts` + `types/market.ts`**
- O que muda: `OpuraMarketNeighborhood` ganha `centroidLat/centroidLng`; `listCities`
  devolve também o centro da cidade (centroide dos bairros, calculado no service).
- Como sei que terminou: tipo compila; teste unitário do cálculo do centro.

**4.3 `components/OpuraMarketModule.tsx`**
- O que muda: centro inicial do mapa = centro da cidade ativa (`fitBounds` nos
  bairros); círculos/rótulos dos bairros e "bairro mais próximo do clique" usam o
  centroide do banco em vez do `if (name === 'Centro')`; remove a guarda
  `activeCity.name !== 'Cambuí'`; textos "em Cambuí"/"Cambuí - MG" viram
  `city.name - city.state`.
- Como sei que terminou: `grep -c "Cambuí\|CAMBUI\|-22\.61\|-46\.0" components/
  OpuraMarketModule.tsx components/ImportListingsModal.tsx` = 0; inserir cidade de
  teste com um bairro em outro estado → mapa abre nela e o clique seleciona o
  bairro certo.

**4.4 cadastro de praça pela tela (D4)**
- `supabase/migrations/20271007000004_opura_market_cadastro_praca.sql` (nova): policies
  de INSERT/UPDATE em `opura_market_cities` e `opura_market_neighborhoods` restritas a
  administrador (usar o helper de admin já existente no schema — conferir o nome real
  em `pg_proc` antes de escrever; REGRA #7 no cabeçalho).
- `services/opuraMarketService.ts`: `createCity`, `createNeighborhood`,
  `updateNeighborhood` (ponto do bairro em WKT `SRID=4326;POINT(lng lat)`).
- `components/market/MarketCityDrawer.tsx` (novo): drawer padrão (`SheetPanel` com
  `p-6`, malha §30) com nome, UF e lista de bairros; cada bairro recebe o ponto
  clicando no mapa do painel (reusa o Leaflet já montado). Botão visível só para ADMIN.
- Como sei que terminou: ADMIN cria uma cidade com 2 bairros pela tela → aparecem no
  seletor e no mapa; USER não vê o botão; USER forçando o INSERT recebe 42501.

### Fase 5 — Toda folga vira hipótese editável

**5.1 `utils/opuraMarketVocacao.ts`** (novo, função pura)
- O que muda: `calcularVocacao(stats, regras, hipoteses)` com `hipoteses =
  { coeficienteAproveitamento: 4, eficienciaVenda: 0.82, custoObraM2: 2500,
  taxaOcupacao: 60, velocidadeAcimaDoLimiar: 6.5, velocidadeAbaixoDoLimiar: 8.2,
  limiarPrecoM2: 4500, pesoConcorrenciaNoRisco: 4, divisorPrecoNoRisco: 120,
  areaComumFator: 0.25 }` — padrões iguais aos valores que hoje estão fixos.
- Como sei que terminou: `__tests__/opuraMarketVocacao.test.ts` com os padrões
  reproduz EXATAMENTE o resultado atual para um caso conhecido (golden: stats de
  um ponto real de Cambuí) e muda quando uma hipótese muda; valida faixas.

**5.2 `types/market.ts` + `components/OpuraMarketModule.tsx` (painel Vocação)**
- O que muda: tipo `OpuraMarketHipoteses`; bloco "Hipóteses" no painel com um
  campo por folga, `title` explicando o efeito; `coefficients_zone` do estudo passa
  a guardar as hipóteses usadas (já guarda `ca/to`); PDF e payload do IMOVIB
  (`handleCreateViability`: `ca_max`, `occupancy_rate`, `construction_cost_sqm`)
  leem das hipóteses.
- Como sei que terminou: mudar CA de 4 para 2 reduz o VGV pela metade na tela, no
  estudo salvo e no estudo do IMOVIB criado; o PDF lista as hipóteses.

### Fase 6 — Código e UI

**6.1 quebrar `components/OpuraMarketModule.tsx`**
- O que muda: `components/market/MarketMapPanel.tsx`, `MarketListingsTable.tsx`,
  `MarketScraperPanel.tsx`, `MarketStudiesPanel.tsx`, `MarketListingDetail.tsx`,
  `hooks/useOpuraMarket.ts` (dados/estado); apaga os ~270 linhas de JSX atrás de
  `{false ? …}` e o `activeTab` vestigial.
- Como sei que terminou: nenhum arquivo do módulo > 600 linhas;
  `grep -n "false ?" components/market/` = 0; checagem de tipos por arquivo verde.

**6.2 `components/market/MarketMapPanel.tsx` — mapa persistente**
- O que muda: o contêiner do mapa fica sempre montado (escondido com `hidden`
  quando a aba não é o mapa) e recebe `invalidateSize()` ao reaparecer; o mapa não
  é mais destruído a cada troca de aba.
- Como sei que terminou: "Ver no Mapa" na Tabela de Ocorrências abre o mapa
  centrado no anúncio em zoom 17 (hoje abre em Cambuí, sem foco).

**6.3 avisos e confirmações**
- O que muda: 38 `alert()` → `useToast` (com `localToast` renderizado, ver memória
  do toast mudo); 3 `window.confirm` → `useConfirm`; pílulas `rounded-full +
  uppercase` (§8) viram texto colorido; busca da tabela em `usePersistedState` (§3).
- Como sei que terminou: `grep -rc "alert(\|window.confirm" components/market/` =
  0; `bash scripts/check-ui-standard.sh` sai 0 para todos os arquivos do módulo.

**6.4 botões que dizem por quê**
- O que muda: com organização vazia (seletor em "Todas"), Importar / Capturar /
  Salvar estudo / Regras da Praça ficam desabilitados com `title` "Selecione uma
  organização no topo para importar/salvar" — hoje falham com erro genérico de RLS.
- Como sei que terminou: com "Todas" selecionado os quatro botões estão desligados
  e o motivo aparece no hover.

**6.5 PDF (`handleExportPDF`)**
- O que muda: cabeçalho imprime o nome da organização (do store) em vez do UUID.
- Como sei que terminou: PDF gerado mostra o nome.

**6.6 `components/AppRouter.tsx` + `components/Layout.tsx` (D5)**
- O que muda: `activeView === 'opura-market'` passa de `allowed = true` para
  permitir só ADMIN e USER, com a MESMA fonte de perfil que os módulos de
  engenharia usam no mesmo bloco (conferir memória "role × org.role" antes); os três
  itens de menu `opura-market` no `Layout.tsx` somem para os demais perfis.
- Como sei que terminou: BROKER logado não vê o item e, forçando a rota, cai no
  fallback de "sem acesso"; ADMIN e USER seguem entrando.

### Fase 7 — Testes e verificação

**7.1 `services/opuraMarketService.ts` + `__tests__/deduplication.test.ts`**
- O que muda: `importListingsInBatch` passa a comparar só com anúncios da MESMA
  origem (mesma organização, ou ambos globais), como o gatilho desde a Fase 1;
  caso novo no teste — anúncios iguais em orgs diferentes NÃO são deduplicados
  entre si no lote nem contra o banco; `neighborhoodId` null não quebra a consulta
  de existentes (hoje vira a string `'null'` e o erro é engolido).
- Como sei que terminou: teste verde; a suíte inteira fecha a conta (total de
  arquivos/testes igual ao esperado, não só "0 falhas" no tail).

**7.2 `scripts/verificar-opura-market-rls.sh`** (novo; era `.sql` no plano — virou
`.sh` porque `db query` só imprime o último resultado e a prova precisa trocar de
papel entre checagens)
- O que muda: as checagens de 1.1–1.3, cada uma em `BEGIN … ROLLBACK`, com modo
  `--ensaio` para provar uma migration antes de aplicá-la.
- Como sei que terminou: roda sem erro e todas as contagens batem com o esperado
  descrito em cada item. ✅ Feito na frente da Fase 1 (07/10/2026), resultado na
  seção "Fase 1 — execução".

## Decisões já tomadas

As cinco perguntas D1–D5 foram respondidas em 07/10/2026 (tabela "Decisões tomadas
com o usuário", acima) e incorporadas nos itens 2.5, 4.4 e 6.6. Não há decisão aberta.

## Estado

Plano aprovado em 07/10/2026. Cada fase abre como frente própria (REGRA #8), na
ordem abaixo.

- [x] Fase 1 — 4 de 4 (frente `market-fase1`, migration aplicada e provada em 07/10/2026; commit na branch `feat/market-fase1`, ainda não publicado em `main`)
- [ ] Fase 2 — 0 de 5
- [ ] Fase 3 — 0 de 4
- [ ] Fase 4 — 0 de 4
- [ ] Fase 5 — 0 de 2
- [ ] Fase 6 — 0 de 6
- [ ] Fase 7 — 1 de 2 (7.2 feito junto com a Fase 1)

## Verificação de ponta a ponta (ao fim de tudo)

1. Logado como usuário da org A, selecionar a cidade, clicar no mapa, raio 1 km,
   "Calcular Vocação": total de anúncios bate com a consulta SQL com `geography`
   filtrada pela RLS de A. Repetir como usuário da org B: número diferente.
2. Importar planilha com 3 endereços válidos e 1 inválido: 3 pinos, resumo "1 sem
   localização", nenhum pino aleatório.
3. Capturar 2 páginas do portal: resposta da Edge Function com contagens; sem
   proxy de terceiros no Network do navegador.
4. Mudar CA nas hipóteses de 4 para 2 → VGV cai pela metade; salvar estudo;
   reabrir → mesmos números; PDF com nome da org e hipóteses.
5. Inserir cidade de teste em outro estado com um bairro → mapa abre nela, clique
   seleciona o bairro.
6. Seletor em "Todas as organizações" → botões de escrita desligados com motivo.
7. `bash scripts/check-ui-standard.sh` verde nos arquivos do módulo; suíte do
   Vitest com a conta fechando; `curl` anon na RPC → 42501.
