# ÒPURA Market — plano das 6 pendências (10/10/2026)

## Pedido original

> *"atualize o status de implementacao e pendencias"* → *"faça um plano para implementacao dos 6 itens"* (10/10/2026).
> Os 6 itens são a seção "Pendências" de `docs/planos/2026-10-07-opura-market-intelligence.md`.
> Plano aprovado em 10/10/2026.

## Contexto

As 7 fases do plano `docs/planos/2026-10-07-opura-market-intelligence.md` estão em produção.
A seção "Pendências" desse plano (commit `e8f2dadb`) lista 6 itens; o pedido é *"faça um plano
para implementacao dos 6 itens"*. Decisões do usuário (10/10/2026):

| Item | Decisão |
|---|---|
| 1 Feed | Guardar o link por organização+cidade **e importar todo dia por cron** |
| 3 Indicadores | **Meses de estoque**, faixas e pesos como hipóteses editáveis |
| 4 Acesso | **Teste automático + conta real de corretor** |
| 6 Ponta a ponta | **Criar no banco** organização e cidade de teste, provar e **apagar tudo** |

⚠️ **Correção na regra do item 3 (a opção que eu ofereci estava errada):** "anúncios ÷
(anúncios × VSO)" dá 1/VSO, o mesmo número em todo bairro. Meses de estoque precisa de uma
demanda **medida por bairro**. Sem dado de vendas, a medida disponível é a **saída de anúncios
do feed** (anúncio que some do feed = vendido ou retirado). Por isso o item 1 passa a marcar
anúncios que sumiram, e o item 3 só calcula onde houver histórico mínimo (hipótese editável);
sem histórico o bairro mostra "Sem histórico de saídas" em vez de um número inventado.

Regras que valem para todas as frentes: uma frente por item (REGRA #8, `nova-frente.sh` →
`git push origin HEAD:main` → check-run `ci` → `conferir-producao.sh` → `fechar-frente.sh`);
plano novo em `docs/planos/2026-10-10-opura-market-pendencias.md` com o pedido literal e as
decisões acima (REGRA #6); SQL só por `npx supabase db query --linked -f`, nunca `db push`;
RPC nova com `REVOKE … FROM PUBLIC, anon` (REGRA #7); botão desligado diz o motivo; toda folga
vira hipótese editável; `check-ui-standard.sh` e `check-xss-sinks.sh` em todo arquivo tocado.

## Ordem das frentes

1. **Item 5** (CI) — pequeno e destrava as outras frentes de falhas falsas.
2. **Item 4** (acesso).
3. **Item 1** (feed agendado + saídas) — o item 3 depende do histórico que ele gera.
4. **Item 2** (localização).
5. **Item 3** (indicadores).
6. **Item 6** (provas de ponta a ponta) — por último, cobrindo tudo.

---

## Item 5 — testes da Planta estouram 5 s na CI (frente `ci-testes-lentos`)

Fato: em ~100 execuções, uma única falha por lentidão (run 37719915108, máquina ~1,6× mais lenta
até no `tsc`). Foram 8 timeouts + 1 asserção de relógio, não 14.

- `vi.setConfig({ testTimeout: 30_000 })` no topo de `__tests__/blueprintBalanceamento.test.ts`,
  `blueprintCasaDeBombas.test.ts`, `blueprintGeradorDeMassa.test.ts`,
  `blueprintGeradorPpci.test.ts` e `geoSigef.test.ts`. É o padrão já registrado em
  `__tests__/components/BlueprintEditor.test.tsx:23-33` (teto por arquivo, nunca global).
- `__tests__/blueprintLoteCusto.test.ts:98-109`: o teste quer provar "não é quadrático", mas
  compara com um teto absoluto de 3000 ms (falhou com 4813 ms). Trocar por **razão** t(1000)/t(500)
  < 3 (quadrático daria ~4), mantendo um teto absoluto folgado de 15 s só contra travamento.
- **Pronto:** os 6 arquivos passam localmente; CI verde no push.

#### Item 5 — execução (10/10/2026, frente `ci-testes-lentos`)

- ✅ `vi.setConfig({ testTimeout: 30_000 })` nos 5 arquivos.
- ✅ ⚠️ **A razão t(1000)/t(500) não servia:** medido em 10/10, dobrar as peças ainda multiplica o tempo do lote por ~3,8–4,5. O `applyBatch` continua quase quadrático, só que com constante bem menor que a do defeito antigo. Uma trava por razão falharia no código de hoje. A trava nova compara o lote com o próprio `snapshotHash` do modelo final, medido na mesma rodada: hoje 18–31 hashes; o defeito (hash por comando, simulado aplicando um a um) dá 562. Teto em 150. A curva quase quadrática do kernel fica registrada como achado para a frente da Planta.
- ✅ Os 6 arquivos: 71 testes verdes localmente.

## Item 4 — trava de acesso (frente `market-acesso`)

- `utils/acessoModulos.ts` (novo, puro): `podeAcessarMarket(group, isDevEmail): boolean`
  (true só para `USUARIO` e `DESENVOLVEDOR`, ou e-mail de dev).
- Usar a função em `components/AppRouter.tsx:264-268` (guarda) e em `components/Layout.tsx`
  (item do celular `:1349-1351`; os do computador `:879` e `:1158` já estão no bloco de
  USUARIO/dev `:835`, conferir que continuam).
- `__tests__/acessoModulos.test.ts`: os 8 valores de `ProfileGroup` (`types/users.ts:245-255`)
  × e-mail de dev ou não.
- Teste de componente em `__tests__/components/` no padrão de
  `OrganizationUsersPermissaoClique.test.tsx:76-78` (`useStore.setState({ currentProfile })`):
  o menu do celular não mostra "ÒPURA Market" para `CORRETOR` e mostra para `USUARIO`.
- **Conta real de corretor:** o login do corretor valida em `broker_profiles` com
  `is_active = true` (`services/profileService.ts:102-115`). Criar uma linha permanente para
  `agente-leitura@alpaconstrutora.com.br` (conferir as colunas obrigatórias antes; gravação
  combinada com o usuário). Prova no navegador: entrar pelo "Portal do Corretor", conferir que
  o menu não tem o Market, forçar `#/opura-market` e ver o redirecionamento. Registrar a conta
  em `reference_agente_leitura_supabase.md`.
- **Pronto:** testes verdes; prova no navegador com capturas; CI verde.

## Item 1 — feed salvo e importado todo dia (frente `market-feed-agendado`)

**Banco** (`supabase/migrations/aplicar_20271010000100_opura_market_feeds.sql`):
- Tabela `opura_market_feeds`: `id`, `organization_id`, `city_id`, `url`, `ativo`,
  `ultima_execucao`, `ultimo_resultado jsonb`, `ultimo_erro`, timestamps, `UNIQUE(org, city)`.
  RLS para membros da organização, no mesmo molde de `opura_market_city_configs`
  (`20261125000002…sql:26-37`).
- Em `opura_market_listings`: `feed_id uuid` (FK, null para planilha) e `removed_at timestamptz`.
- Cron diário às 09:00 UTC no padrão `aplicar_20270918000023_cron_segredo_dedicado.sql:74-105`
  (`net.http_post` + `fn_cron_secret()`).

**Edge Function** (`supabase/functions/opura-market-import/index.ts`):
- Novo modo `agendado`, autenticado por `chamadaDeCron` (`supabase/functions/_shared/auth.ts`).
  A organização vem da linha do feed, nunca do corpo da chamada. Percorre os feeds ativos dentro
  do orçamento de tempo e grava `ultima_execucao`, `ultimo_resultado` e `ultimo_erro`.
- No fim de cada importação de feed salvo: anúncio ativo daquele `feed_id` que não veio no XML
  passa a `listing_status = 'inactive'` com `removed_at = now()`. Se ele voltar, é reativado.
  Essa saída é a medida de demanda do item 3.
- Aceitar só `https://`, e recusar endereço de rede privada ou localhost (o servidor baixa a URL).
  A regra fica em `logica.ts`, que é pura, com teste.

**Front** (`components/market/MarketFeedPanel.tsx` + `services/opuraMarketService.ts`):
- O link vem preenchido pelo que está salvo.
- Interruptor "Importar todo dia", desligado com motivo em "Todas".
- Linha com a última importação e o resultado dela.
- O botão manual continua.

- **Pronto:**
  - Testes da lógica: URL aceita ou recusada; anúncio que sumiu fica inativo e o que voltou é
    reativado.
  - Cron listado em `cron.job`.
  - Uma execução forçada do modo `agendado` com o feed de teste do item 6 grava resultado.
  - CI verde.

## Item 2 — localização dos anúncios (frente `market-localizacao`)

Medir antes e depois: contagem por `geo_precision` (hoje 52 / 143 / 158).

- **Correção do `localizar`:** hoje o `address` do feed ("rua, número, bairro",
  `index.ts:346`) entra inteiro como rua. Assim `separarNumero` (`logica.ts:236-242`) não acha o
  número, e o bairro vai para a trava de nome. Criar `partesDoEndereco(address, bairroRaw)` em
  `logica.ts`, com testes.
- **CEP:** o feed já grava `zip_code` (`index.ts:347`). Antes de desistir, consultar o ViaCEP no
  servidor para obter logradouro e bairro, e montar mais uma consulta ao Photon. Primeiro um
  spike: chamar o ViaCEP de dentro da Supabase, porque o Nominatim dá 403 de lá. Se falhar,
  usar a BrasilAPI. O CEP nunca vira coordenada sozinho: só ajuda a montar a busca.
- **Tentar de novo:** novo modo `relocalizar` (membro da organização) para anúncios `bairro` e
  `nao_encontrado` da organização na cidade.
  - Só grava se a nova precisão for **melhor** (fonte > manual > endereco > rua > bairro); nunca
    piora.
  - Na tela, um botão "Tentar localizar de novo os aproximados (N)" no painel do feed.
- **Posição manual:** no `MarketAnuncioDetalhe`, um botão "Ajustar no mapa" abre o mapa e o
  próximo clique define a posição.
  - Grava com `geo_precision = 'manual'`, por `updateListingPosition` no service. A RLS de
    UPDATE já permite membros (`20261124000001…sql:31-47`).
  - Anúncio global: botão desligado com o motivo.
  - Migration: CHECK de `geo_precision` passa a aceitar `'manual'`.
- **Duplicados:** o gatilho só roda na primeira coordenada (`aplicar_20271007000200…sql:133`).
  Ele passa a rodar também quando a precisão sobe para `fonte`, `endereco` ou `manual`, que
  também passam a contar como precisão exata.
- **Pronto:** testes de `partesDoEndereco` e da ordem de precisão; tabela antes/depois no plano;
  ajuste manual provado no navegador e conferido no banco; CI verde.

## Item 3 — Saturação e Score Potencial (frente `market-indicadores`)

- **Banco:** RPC `get_market_neighborhood_dinamica(p_city_id, p_meses)`, SECURITY INVOKER (só
  vê o que a RLS libera, como as RPCs da Fase 4, `aplicar_20271007000300…sql:219-277`).
  - Por bairro, devolve: anúncios ativos, saídas nos últimos `p_meses` (`removed_at`), meses de
    histórico do feed, preço/m² atual e preço/m² no início da janela.
  - `REVOKE` de PUBLIC e anon.
- **`utils/opuraMarketIndicadores.ts`** (novo, puro), no molde de `utils/opuraMarketVocacao.ts`
  (`HIPOTESES_PADRAO`, `DESCRICAO_HIPOTESES`, `validarHipoteses`).
  - **Hipóteses:**
    - `janelaMeses`: 6
    - `mesesMinimosHistorico`: 3
    - faixas de meses de estoque: Escassez < 6, Saudável < 12, Atenção < 18, Saturado ≥ 18
    - pesos do score: estoque 40, tendência de preço 35, preço relativo à praça 25
    - teto de tendência: 10 %
  - **Meses de estoque** = ativos ÷ (saídas ÷ meses observados). Com histórico menor que o
    mínimo, ou zero saídas: "Sem histórico de saídas" (não calculado).
  - **Score Potencial (0–100)** = soma ponderada de três partes:
    - estoque baixo
    - preço subindo na janela (até o teto de tendência)
    - preço abaixo da média da praça
  - Cada parte vai para o `title`, para o usuário ver de onde veio o número.
  - `__tests__/opuraMarketIndicadores.test.ts` cobre: faixas, sem histórico, cada hipótese muda
    o que diz que muda, e a validação.
- **Hipóteses por organização e cidade:** coluna `hipoteses_indicadores jsonb` em
  `opura_market_city_configs`, gravada no upsert que já existe (`opuraMarketService.ts:545-600`;
  `rules` continua obrigatório). A edição fica num bloco "Hipóteses dos indicadores" no
  `MarketBairroDna`, igual ao bloco da Fase 5. Desligado em "Todas", com o motivo.
- **Tela:**
  - O `MarketBairroDna` mostra Saturação (faixa + meses) e Score Potencial no lugar de "Não
    calculado".
  - As camadas `saturacao` e `oportunidade` de `hooks/useMarketLeaflet.ts:152-157` passam a
    usar os valores calculados, não as colunas globais de `opura_market_neighborhoods`, que são
    as mesmas para todas as organizações.
  - Bairro Score continua escondido (não tem regra própria; não inventar).
- **Pronto:**
  - Testes verdes.
  - Com o histórico gerado pelo item 1 (ou o histórico de teste do item 6), o bairro mostra a
    faixa certa, conferida à mão contra o SQL.
  - Sem histórico, mostra "Sem histórico de saídas".
  - CI verde.

## Item 6 — provas de ponta a ponta com dados reais (frente `market-prova-e2e`)

Gravações combinadas com o usuário (10/10/2026), todas com `-f` e prefixo `ZZ Teste E2E`.
Antes, guardar os IDs criados para a limpeza.

- **Prova 1 (duas organizações, contagens diferentes):** criar a organização `ZZ Teste E2E
  Market` e um **segundo usuário de teste** só dela.
  - O `agente-leitura` não serve: membro das duas organizações, ele veria as duas pela RLS.
  - Primeiro, conferir se a API Admin de Auth aceita a chave atual. A CI mostrou "Legacy API
    keys are disabled", então provavelmente é preciso a chave secreta nova via
    `supabase projects api-keys`.
  - Se não der para criar o usuário: dizer isso e parar a prova 1, sem simular outra vez.
  - Importar 3 anúncios por feed com Latitude/Longitude perto de Cambuí para a organização de
    teste. No mesmo ponto e raio, o `agente-leitura` (Alpa) e o usuário de teste devem ver
    contagens diferentes, iguais ao SQL de cada um.
  - O feed de teste também serve para a execução forçada do cron do item 1.
- **Prova 5 (cidade em outro estado):** criar a cidade `ZZ Teste E2E - GO` com 2 bairros e
  centroides. O mapa deve abrir nela, e um clique deve selecionar o bairro mais próximo.
  - A cidade é global: fica visível a todos durante a prova. Janela curta, apagada logo depois.
- **Limpeza** (uma transação):
  - apagar anúncios, feed, configurações, bairros, cidade, `organization_members`, organização
    e o usuário de teste;
  - `SELECT` conferindo zero linhas com `ZZ Teste E2E`.
  - A linha de corretor do item 4 é permanente e **não** entra na limpeza.
- **Pronto:**
  - capturas das duas provas;
  - contagens registradas no plano;
  - limpeza conferida;
  - itens 1 e 5 da "Verificação de ponta a ponta" marcados como provados de verdade.

---

## Verificação geral

- Em cada frente:
  - `npm run verificar:build` (o tsc cai às vezes: repetir);
  - suíte inteira com a conta fechando (o BlueprintEditor roda à parte, por causa do Node 24);
  - `check-ui-standard.sh` nos arquivos tocados;
  - Playwright com login do `agente-leitura`: roteiro novo por frente em `c:/tmp/pwtest/`, que
    aborta escrita que não for a do teste;
  - depois do push: check-run `ci` e `conferir-producao.sh` com um texto novo da tela.
- Ao fechar o item 6, a seção "Pendências" do plano antigo fica só com o feed real da
  Conexão 381, que continua dependendo da imobiliária. A partir daí ele entra pelo mesmo
  mecanismo do item 1: é só colar o link.
- Atualizar memória (`project_opura_market_intelligence_avaliacao.md`), estado de trabalho e,
  se o conector do Claude Docs voltar, a página publicada.
