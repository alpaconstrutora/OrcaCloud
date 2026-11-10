# Espelho de Vendas 3D (Portal do Corretor + Portal do Investidor)

## Pedido original

> assista este video : https://www.instagram.com/reel/DferVZ0oDFk/?utm_source=ig_web_copy_link&obrf=NTc4MTIwNjQ2YQ==

Sessão: 31ae870f-34a6-4874-9bc7-2c6591f9d74e · 09/11/2026

O vídeo (41 s, sem narração, post da insel.immobilien, Limassol) mostra um quiosque de vendas numa tela de toque:
vista aérea do bairro com controle de horário do dia; aproximação de uma torre; a torre como mapa de
disponibilidade (cada apartamento um bloco colorido no próprio prédio, com filtros); toque numa unidade abre a
planta e a ficha ("APARTMENT B1804", 142,55 m², 2 quartos, 18º andar, botões *Window view*, *Print blueprint*,
*Show on the floor plan*); "Window view" mostra a vista da janela daquele andar, com a luz mudando do pôr do sol
para a noite.

Perguntei se era para virar proposta para o OrçaCloud ("Espelho de Vendas 3D" no Comercial ou no Portal do
Corretor) ou só a descrição do vídeo. Resposta, 09/11/2026:

> sim

Perguntei para quem é a tela na primeira versão. Resposta, 09/11/2026:

> Primeira pergunta: para quem é a tela? são dois alvos neste primeiro momento
> 1. Corretor ou vendedor atendendo o cliente (recomendo): fica no Portal do Corretor e funciona em tablet, celular e TV do estande. É o uso do vídeo, e o corretor já enxerga estoque e preço.
> 2. investidor, Portal do investidor

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | Para quem é a tela na 1ª versão? | Dois alvos: Portal do Corretor e Portal do Investidor. |
| 09/11/2026 | Como a torre é desenhada em 3D? | **Híbrida**: contorno real do Bloco da Planta quando existir; senão volumetria esquemática gerada do cadastro. |
| 09/11/2026 | O que o investidor vê de cada unidade? | **Status e preço**: cor por status, preço de tabela por unidade, VGV vendido e em estoque. Sem nome de comprador. |
| 09/11/2026 | O que entra na ficha na 1ª versão? | **Tudo do vídeo**: dados, foto de capa, planta baixa por tipologia, vista da janela por andar, luz do dia. |
| 09/11/2026 | Plano em 7 fases (um PR cada) | Aprovado, com os três pontos assumidos abaixo. |

Pontos assumidos na aprovação do plano (o usuário aprovou sem corrigir):

1. Cor de "vendida" no 3D do corretor = a mesma do 2D ao lado (hoje vermelho no `PropertyUnitMap`), para o
   seletor 2D|3D não trocar a cor da mesma unidade. No investidor, azul (a paleta de Venda de Ativos › Análise).
2. A aba nova do investidor nasce desligada para os investidores existentes; o gestor liga por investidor
   (`investors.settings.investorPortalTabs`).
3. O contorno real só aparece depois que alguém enviar o contorno pela Planta; até lá a torre é esquemática.

## O que já existia e é reaproveitado

- Estrutura da torre (pisos, elevações, alturas, unidades por andar): `utils/blueprintEstruturaDaTorre.ts` › `estruturaDaTorre`.
- Fatia do andar em unidades: `utils/blueprintUnidadesNoPavimento.ts` › `arrumarUnidades`, `arranjarAndar` — os mesmos do 3D da Planta.
- Regra única do status de venda: `lib/salesAnalysis.ts` › `saleUnitClassifier`, `SaleUnitStatus`.
- Distância entre torres: `utils/empreendimentoDistanciasEntreTorres.ts`.
- Espelho 2D: `components/analysis/UnitMirrorGrid.tsx`, `lib/rentalUnitMirror.ts`; Estoque do corretor (`PropertyUnitMap`).
- Portais: `components/portal/PortalKit.tsx`; aba-modelo do investidor `components/investor/portal/PortalSpes.tsx`.
- three ^0.169, @react-three/fiber ^9, @react-three/drei ^10 já instalados.

## Regras que valem para todas as fases

- Portal lê **só por RPC** (SECURITY DEFINER, join direto nas tabelas; `vw_unit_property_map` não é acessível ao
  anon). Toda função nova leva `REVOKE ... FROM PUBLIC, anon` e os grants na mesma migration (REGRA #7).
- Migration: arquivo `aplicar_<prefixo>_*.sql`; nunca `supabase db push`. Prefixo conferido contra todos os nomes.
- Coluna nova só entra em lista de `select` (`TOWER_COLS` etc.) depois de aplicada no banco: push em `main` é deploy.
- Nunca tela cheia; cena com altura fixa; legenda HTML com números (§28.4); botão desligado diz o motivo; sem
  `dark:`; `prefers-reduced-motion` respeitado.
- three/fiber/drei entram **só por `React.lazy`**; conferir no `vite build` que não entram no chunk de entrada
  dos portais. O modelo da cena só faz `import type` do kernel da Planta.
- Toda folga do desenho esquemático é hipótese editável (`HIPOTESES_PADRAO_DO_ESPELHO`), nunca constante escondida.

## Plano

A F1 do plano aprovado foi partida em duas (09/11/2026): o modelo puro não depende do banco e sobe sozinho; o
contorno materializado precisa de migration aplicada antes do código que lê a coluna.

### F1a — Modelo puro da cena

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoDeVendas3d.ts` (novo) | `montarCenaDoEspelho({ torres, pavimentosPorTorre, statusPorUnidade, distancias, hipoteses })` → `{ prismas, torres, caixa, avisos }`; `contagemPorStatus`; `HIPOTESES_PADRAO_DO_ESPELHO`. Contorno da Planta quando a torre o traz (`contorno`), senão retângulo esquemático; todas da Planta = coordenadas do desenho, senão lado a lado. | `npx vitest run __tests__/espelhoDeVendas3d.test.ts` verde. |
| `__tests__/espelhoDeVendas3d.test.ts` (novo) | 18 casos: um prisma por unidade; fatias somam o andar; térreo = 0; elevação digitada; subsolo; andar sem unidade; esquemático; paridade com `arranjarAndar`; coordenadas da Planta; lado a lado; distância declarada; contorno inválido; status do cadastro × mapa; contagem; quadra fora; torre vazia; caixa da cena. | Os 18 passam. |
| `utils/blueprintEstruturaDaTorre.ts` | `PE_DIREITO_DO_CALCULO_MM` passa a ser exportada (a altura do prisma sem pé-direito é a mesma do cálculo da elevação). | `npx vitest run __tests__/blueprintEstruturaDaTorre.test.ts` segue verde. |
| `docs/planos/2026-11-09-espelho-de-vendas-3d.md` (novo) | Este plano. | Versionado no PR da F1a. |

Mudou em relação ao plano aprovado: o arquivo é `utils/espelhoDeVendas3d.ts` (não `lib/espelho3d.ts`) — a
geometria que ele reusa mora em `utils/`, e `utils/blueprint3dEspelho.ts` já existe com outro sentido (o
espelhamento do 3D da Planta). A cor não vai no prisma: o prisma leva o `status`, e quem desenha escolhe a cor
(o corretor e o investidor usam paletas diferentes, ponto assumido 1).

### F1b — Contorno materializado na torre

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110200000_torre_contorno_na_planta.sql` (novo) | `empreendimento_towers` ganha `contorno_na_planta jsonb` (anel em mm), `contorno_frente jsonb`, `contorno_norte_deg numeric`, `contorno_atualizado_em timestamptz` (+ CHECK de que o contorno é lista). Reescreve `fn_broker_portal_get_espelho` e `fn_espelho_de_vendas_das_obras` com o MESMO corpo mais as três chaves do contorno. | Aplicada no banco: as 4 colunas existem; privilégios das duas funções iguais aos de antes; `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `utils/espelhoContornoDaTorre.ts` (novo) | `contornosDasTorres` (do modelo aberto: um contorno por torre, do bloco de TORRE casado com ela), `contornoDaLinha` (do jsonb do banco para a cena; fora do formato = null, torre esquemática), `mesmoContorno`. | `npx vitest run __tests__/espelhoContornoDaTorre.test.ts` verde (10 casos). |
| `services/espelhoDeVendasService.ts` | `contornosGravados(torreIds)` (tolerante à coluna ausente), `gravarContornos(lista)` (confere a linha que voltou: UPDATE barrado pela RLS não dá erro) e `estruturaDoPredio` passa a trazer o contorno. | Typecheck; coberto pelos testes de quem usa. |
| `utils/espelhoDoEstoque.ts`, `utils/espelhoDoInvestidor.ts` | A torre leva `contorno: contornoDaLinha(t)`. | Casos novos nos dois testes: com contorno → origem `PLANTA` nas coordenadas do desenho; sem ele ou estragado → `ESQUEMATICA`. |
| `components/blueprint/BlueprintEditor.tsx` | `contornosDaPlanta` (dos papéis do ajuste ao Empreendimento), `contornosNoBanco` (o que cada torre tem gravado) e `contornoNoEspelho` para o painel do bloco: quantas torres estão com o contorno diferente do desenho, quando foi o último envio, e o envio. | `BlueprintEditor.test.tsx` segue verde; enviar numa planta com torres grava as linhas (conferido no banco). |
| `components/blueprint/PainelBlocoSelecionado.tsx` | No trecho do Empreendimento: a situação do contorno nos portais ("nunca enviado", "o desenho mudou desde …", "é o deste desenho") e o botão "Enviar contorno ao Espelho 3D", desligado com o motivo quando não há o que enviar; o erro de gravação aparece no painel. | `npx vitest run __tests__/components/PainelBlocoSelecionadoContorno.test.tsx` verde (5 casos). |
| `__tests__/espelhoDoInvestidor.test.ts` | A trava do texto vale também para a migration que reescreve as funções: só entram as chaves do contorno; unidade do investidor com as mesmas 16 chaves; a do corretor sem preço nem status. | 3 casos novos passam. |

Mudou em relação ao plano aprovado (10/11/2026):
- As colunas NÃO entraram em `TOWER_COLS` de `empreendimentoService` (usada em toda leitura de torre): o contorno
  é lido à parte, tolerante à coluna ausente. Assim o código pode ir ao ar antes da migration sem derrubar nenhuma
  tela de torre.
- O envio é só pela ação explícita no painel do bloco; "ao publicar" ficou de fora (o painel mostra quando o desenho
  mudou desde o último envio, que é o risco que o envio automático cobriria).
- O aviso de contorno desatualizado mora na Planta (painel do bloco), e não no `TowerEditor`: é lá que se sabe se o
  desenho mudou, e é lá que se reenvia.

### F2 — Componente `<Espelho3D>` (`components/espelho3d/`)

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoDeVendas3dMalha.ts` (novo) | O que a cena e a casca combinam, sem three: `gruposDoEspelho` (uma malha por status + a dos pisos sem unidade; subsolo fora do desenho), `iniciosDasFaces`/`prismaDaFace` (de qual unidade é o triângulo tocado), `PALETA_PADRAO_DO_ESPELHO`, `resumoDoEspelho`. | `npx vitest run __tests__/espelhoDeVendas3dMalha.test.ts` verde (7 casos). |
| `lib/salesAnalysis.ts`, `components/sales/SalesAnalysisOverview.tsx` | A paleta de status (`SALE_STATUS_COLORS`) sai do componente da Análise e passa a morar na lib: o donut e o espelho pintam com a mesma. | `salesAnalysis.test` e `SalesUnitMirror.test` seguem verdes. |
| `components/espelho3d/Espelho3D.tsx` (novo) | Casca: a legenda com contagens É o controle "Destacar" (rádios, desligado com o motivo quando é zero); desenho em altura fixa (`h-[60vh] min-h-[360px]`); ficha ao lado; lista por andar com roving tabindex. Props `cena`, `dados`, `paleta`, `mostrarPreco`, `acoesDaFicha`, `onSelecionar`. | `npx vitest run __tests__/components/Espelho3D.test.tsx` verde (13 casos). |
| `components/espelho3d/FichaDaUnidade.tsx` (novo) | Torre, andar, status (quadrado da legenda + nome), foto de capa, tipologia, área, dormitórios, banheiros, vagas, preço (só com `mostrarPreco`), ações de quem chama. | Coberta pelo teste da casca. |
| `components/espelho3d/Espelho3DCena.tsx` (novo, lazy) | `<Canvas flat frameloop="demand">` + `OrbitControls`; uma malha por status; toque por raycast (`faceIndex` → unidade) com `ehClique`; enquadramento pelo formato da tela; escolhida com contorno escuro; apagado translúcido no destaque. | `node docs/spikes/espelho-vendas-3d/passeio.mjs` com exit 0. |
| `components/espelho3d/webglDisponivel.ts` (novo) | Sem WebGL, ou se o desenho quebrar depois de montado, a lista por andar é a tela. | Teste da casca (2 casos) + passo "sem WebGL" do passeio. |
| `docs/spikes/espelho-vendas-3d/` (novo) | Harness (`index.html`, `main.tsx`: Torre A com contorno em L, Torre B esquemática) e `passeio.mjs`. | Passeio verde contra servidor novo. |

Mudou em relação ao plano aprovado (09/11/2026):
- A ficha NÃO usa `StatusPill`/`DetailField` do `PortalKit`: o Estoque do corretor é tela do app (§8, status em
  texto) e só o investidor está na exceção do §24. O status na ficha é o quadrado da legenda + o nome, cor
  semântica, igual nos dois.
- A legenda e o "Destacar" são um controle só (a contagem ao lado de cada status), em vez de dois.
- `Espelho3DCena.tsx` leva `@ts-nocheck`, como `Blueprint3DViewer.tsx`: os tipos intrínsecos do
  `@react-three/fiber` estão fora do programa TS do projeto. O que dá para tipar ficou em
  `utils/espelhoDeVendas3dMalha.ts`; a cena se confere pelo passeio do harness.
- O subsolo não entra no desenho 3D (aparece na lista por andar).

### F3 — Portal do Corretor: seletor "2D | 3D" no Estoque

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoDoEstoque.ts` (novo) | `montarEspelhoDoEstoque({ imoveis, negocios, estrutura })` → `{ cena, dados, fonte, semPosicao }`: a forma da torre vem do Empreendimento quando o prédio tem unidade ligada a imóvel que o corretor vê; senão do próprio estoque (bloco e andar do imóvel). Prisma chaveado pelo id do IMÓVEL. `statusDoEspelhoDoCorretor` (o status efetivo do 2D) e `PALETA_DO_CORRETOR` (vendida vermelha). | `npx vitest run __tests__/espelhoDoEstoque.test.ts` verde (15 casos, com a matriz de paridade com `saleUnitClassifier`). |
| `utils/espelhoDeVendas3d.ts` | `unidadesOcultas`: a unidade que o corretor não vê guarda o lugar na torre, neutra (sem id, nome nem status). | Caso novo em `__tests__/espelhoDeVendas3d.test.ts`. |
| `supabase/migrations/aplicar_20271109950000_broker_portal_espelho.sql` (novo) | `fn_broker_portal_get_espelho(p_token text) → jsonb`: mesma validação/visibilidade de `fn_broker_portal_get_units`; torres + pavimentos + unidades (só geometria; `property_id` só do imóvel visível), **sem preço nem status**. `REVOKE` de PUBLIC e anon + `GRANT` a anon/authenticated + verificação embutida. | Aplicada no banco; token inexistente devolve `valid=false`; `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `services/espelhoDeVendasService.ts` (novo) | `estruturaPorToken` (RPC, pelo link) e `estruturaDoPredio` (tabelas, dentro do app), no mesmo formato. | Coberto pelo hook; erro ou função ausente = desenho pelo estoque. |
| `components/broker/useBrokerPortal.ts` | `visaoDoEstoque` persistida, `motivoSem3d` (Locação; "Geral" com mais de um prédio), `estoqueEm3d`, `espelhoDoEstoque`. Carrega a estrutura só quando o 3D abre. | Typecheck; testes do portal seguem verdes. |
| `components/broker/EstoqueEm3D.tsx` (novo) | `SeletorDaVisaoDoEstoque` (3D desligado com o motivo) e `EstoqueEm3D`: `<Espelho3D>` com a paleta do corretor, preço, e a ficha com Fazer proposta, Reservar (48h) e Somar à proposta; unidade não disponível diz por quê; conta os imóveis sem lugar na torre. | `npx vitest run __tests__/components/EstoqueEm3D.test.tsx` verde (9 casos). |
| `components/BrokerPortal.tsx`, `components/broker/BrokerPortalMobile.tsx` | O seletor ao lado da finalidade (computador) e sob o filtro (celular); o 3D no lugar do `PropertyUnitMap` quando ligado. | Passeio do harness (`?corretor=1`) com exit 0; conferência em produção depois do merge. |

Mudou em relação ao plano aprovado (09/11/2026):
- **O 3D não depende do Empreendimento.** Medido no banco em 09/11/2026: 3 dos 21 empreendimentos têm prédio no
  estoque, 27 das 88 unidades têm imóvel ligado, e 59 imóveis do estoque não têm unidade no Empreendimento; o único
  token de corretor ativo vê 13 imóveis, nenhum ligado a torre. Só com a estrutura do Empreendimento o 3D ficaria
  desligado para quase todo o estoque. Por isso a segunda fonte: o bloco e o andar do próprio imóvel.
- A RPC devolve TODAS as unidades da torre (a que o corretor não vê vem sem `property_id`), para a torre sair
  inteira; o plano dizia "só unidades visíveis".
- O código vai ao ar antes da migration sem quebrar: sem a função, o desenho sai do estoque.
- O prefixo `20271109900000` já estava em uso em `main` (`empreendimento_tipo_estrutura`); ficou `20271109950000`.
- A paleta do corretor não passou pelo validador do §28.4 (o script não está nesta máquina): a contagem na
  legenda é a codificação secundária.

Conferência em produção (10/11/2026, portal aberto pela equipe como o corretor "geraldo", prédio 011 - Garden
Cambuhy): o seletor aparece, o 3D abre, o toque numa unidade abre a ficha certa (Unidade 202, Torre A, Tipo 4,
127 m², R$ 1.029.641) com Fazer proposta, Reservar (48h) e Somar à proposta. **Defeito achado:** a legenda dizia
9 disponíveis + 5 reservadas (14) enquanto o 2D mostrava 34 unidades e 4 vendidas; a Torre B saiu inteira neutra e
a tela avisava "20 unidades … só no espelho 2D". Causa: bastava UMA unidade ligada para o Empreendimento vencer, e
no Garden só 17 dos 41 imóveis estão ligados (os 41 têm bloco e andar). Correção (PR seguinte): vale a fonte que
acha lugar para mais imóveis; o Empreendimento só vence no empate. Por prédio, hoje: Garden 17/41 ligados → estoque;
Bella Vista 9/9 → Empreendimento; os outros seis com andar → estoque; "Lote Vale do Sol" sem andar → sem 3D.

### F4 — Portal do Investidor: aba "Espelho de Vendas"

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110100000_investor_portal_espelho.sql` (novo) | Quatro funções: `fn_espelho_de_vendas_das_obras(org, obras[])` e `fn_obras_do_investidor(investidor, org)` — internas, sem EXECUTE para a API; `fn_investor_portal_get_espelho(p_token)` — o link (anon + authenticated, autoriza pelo token); `fn_investor_get_espelho(p_investor_id)` — o app logado (só authenticated; autoriza equipe da organização do investidor, superadmin ou o próprio investidor pelo e-mail). Devolve por obra: torres, pavimentos, unidades (geometria, ficha, `status` já resolvido, `price` de tabela) e `vgv_vendido` somado. Nada de negociação nem de comprador. | Aplicada no banco e conferida (privilégios, token inexistente → `valid=false`); `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `utils/espelhoDoInvestidor.ts` (novo) | `montarEspelhoDoInvestidor(obra)` → `{ cena, dados, resumo }`: unidade não vendável guarda o lugar, neutra; resumo com vendidas/vendáveis, VGV vendido (do banco), VGV em estoque (preço de tabela do que não foi vendido nem permutado), sem preço e fora do desenho. | `npx vitest run __tests__/espelhoDoInvestidor.test.ts` verde (12 casos). |
| `__tests__/espelhoDoInvestidor.test.ts` (novo) | Trava o TEXTO da migration: nenhuma chave de negociação/comprador/corretor/imóvel no retorno; as chaves da unidade são exatamente as combinadas; "vendida" são as `ETAPAS_VENDIDA` do front; a ordem do CASE é a de `saleUnitClassifier.statusOf`; internas sem GRANT. | Os 5 casos da trava passam. |
| `services/investorPortalTokenService.ts` | `getEspelho({ token } \| { investorId })`; função ausente ou sem permissão = []. | Coberto por `PortalEspelho.test.tsx`. |
| `components/investor/portal/PortalEspelho.tsx` (novo) | A aba: carrega o próprio dado, `KpiStrip` (unidades vendidas, VGV vendido, VGV em estoque), abas de obra quando há mais de uma, `<Espelho3D mostrarPreco moldura={false}>` sem ações; estados de carregando, erro com "Tentar de novo" e vazio. | `npx vitest run __tests__/components/PortalEspelho.test.tsx` verde (8 casos); passeio do harness (`?investidor=1`) com exit 0. |
| `components/InvestorDashboard.tsx` | Aba `espelho` ("Espelho de Vendas") em `TABS`, `TabId`, `TAB_TITLES` e no conteúdo — a mesma tela para o link e para o app. `ABAS_QUE_NASCEM_DESLIGADAS`: investidor nunca configurado vê todas menos ela; o gestor liga em "Configurar abas". | Typecheck; a aba aparece para o gestor e não para o investidor até ser ligada. |
| `components/espelho3d/Espelho3D.tsx` | Prop `moldura` (padrão true): o portal do investidor já tem o card. | Testes do componente seguem verdes. |

Mudou em relação ao plano aprovado (10/11/2026):
- O STATUS é resolvido no banco (e não no navegador com a lista de negociações): assim nenhuma negociação, nem o id
  dela, chega ao investidor. A regra é a mesma de `saleUnitClassifier.statusOf`, presa pelo teste do texto da migration.
- A aba carrega o próprio dado, fora do `Promise.all` do portal: quem não abre o espelho não paga por ele, e erro
  aqui não derruba as outras abas.
- Uma função para o link e outra para o app logado, em vez de "gestor lendo as tabelas": a mesma tela nos dois.
- As obras do investidor incluem as de SPE em que ele é sócio, além de participação e do vínculo antigo.
- A forma da torre é só a do Empreendimento (o investidor chega à unidade pela obra → torre); não há a segunda
  fonte do corretor.

⚠️ **Não dá para conferir com dado real hoje** (medido em 10/11/2026): há 1 investidor cadastrado, nenhum link de
portal ativo e NENHUM vínculo de investidor com obra (0 participações, 0 sócios de SPE, 0 obras com `investor_id`).
O corpo da função foi provado por leitura contra as quatro obras com torre (Bella Vista: 7 vendidas, 1 em
negociação, 1 disponível, VGV vendido R$ 3.255.000; as chaves da unidade são só as 16 combinadas). A tela foi
conferida no harness, com dados de mentira.

### F5 — Planta baixa por tipologia

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110500000_empreendimento_tipologia_plantas.sql` (novo) | Tabela `empreendimento_tipologia_plantas` (empreendimento + `tipologia_chave` única; RLS pela organização do empreendimento, a mesma regra de `empreendimento_towers`; fechada para anon). Bucket público de imagem `empreendimento-midia` (5 MB; JPG, PNG, WebP), com policies só para `authenticated` da organização — sem SELECT para anon, para ninguém de fora LISTAR o bucket. Reescreve `fn_broker_portal_get_espelho` e `fn_espelho_de_vendas_das_obras` com o MESMO corpo mais a chave `plantas`; no investidor, a tipologia da unidade cai na do imóvel do estoque quando a unidade não tem a sua. | Aplicada no banco: a verificação embutida passa; privilégios das duas funções iguais aos de antes; `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `utils/espelhoPlantaDaTipologia.ts` (novo) | `chaveDaTipologia` (sem acento, caixa, espaço sobrando), `plantasPorChave`, `plantaDaUnidade`, `tipologiasDoEmpreendimento` (a lista do cadastro: tipologias das unidades e dos imóveis do prédio, com a planta; a planta órfã no fim). | `npx vitest run __tests__/espelhoPlantaDaTipologia.test.ts` verde (11 casos). |
| `services/empreendimentoTipologiaPlantasService.ts` (novo) | `listar`, `doPredio`, `tipologiasNoCadastro`, `salvar` (sobe a imagem, grava por `empreendimento_id,tipologia_chave`, confere a linha que voltou e apaga o arquivo solto se a linha não ficou), `remover`. | Typecheck; coberto pelos testes de quem usa. |
| `components/empreendimento/PlantasPorTipologiaSecao.tsx` (novo) + `TowerEditor.tsx` | Seção "Plantas por tipologia" em Torres & Unidades (com o empreendimento em mãos e torre cadastrada): um cartão por tipologia com o `<ImageDropzone>`; não se digita tipologia. | `npx vitest run __tests__/components/PlantasPorTipologiaSecao.test.tsx` verde (8 casos); subir uma planta no Garden Cambuhy e vê-la na lista. |
| `services/espelhoDeVendasService.ts`, `components/broker/useBrokerPortal.ts` | `estruturaPorToken` e a nova `estruturaDoApp` devolvem `{ torres, plantas }`; o portal passa as plantas do prédio escolhido a `montarEspelhoDoEstoque`. | Typecheck; ficha no Estoque › 3D mostra a planta. |
| `utils/espelhoDoEstoque.ts`, `utils/espelhoDoInvestidor.ts`, `utils/espelhoDeVendas3dMalha.ts` | `DadosDaUnidade.plantaUrl`: a planta da tipologia do imóvel (corretor) ou da unidade (investidor; a obra traz `plantas`). | Casos novos nos dois testes. |
| `components/espelho3d/FichaDaUnidade.tsx` | Trecho "Planta da tipologia …" com a miniatura; tocar amplia num diálogo central (`Modal`, nunca tela cheia), Esc fecha. | 2 casos novos em `Espelho3D.test.tsx`; passeio do harness: "a planta ampliada não ocupa a tela inteira". |
| `__tests__/espelhoDoInvestidor.test.ts` | A trava do texto vale para a migration nova: tabela com RLS e fechada para anon; bucket sem policy para anon; nas funções só entram as chaves da planta; plantas do corretor só dos prédios que ele vê; unidade do investidor com as mesmas 16 chaves. | 5 casos novos passam. |

Mudou em relação ao plano aprovado (10/11/2026):
- O cadastro é uma seção própria abaixo das torres, e não dentro da aba Unidades de cada torre: a planta é do
  EMPREENDIMENTO (vale para todas as torres), e as tipologias vêm das duas fontes — em produção, o Garden Cambuhy tem
  Tipo 1–4 nas unidades do Empreendimento e Tipo 1–8 nos imóveis do estoque.
- As policies do bucket não foram copiadas de `commercial-property-photos`: lá há SELECT para anon (lista o bucket);
  aqui a URL pública serve a imagem e só membro da organização lista.
- Limite de 5 MB e JPG/PNG/WebP: é o que o `<ImageDropzone>` anuncia e aceita.

### F6 — Vista da janela

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110600000_empreendimento_tower_vistas.sql` (novo) | Tabela `empreendimento_tower_vistas (tower_id, andar_de, andar_ate, orientacao, imagem_url, imagem_path, legenda)` com CHECK da faixa em ordem e da orientação conhecida; RLS pela organização do empreendimento da torre; fechada para anon. A imagem vai no bucket `empreendimento-midia` da F5 (`…/vistas/`). Reescreve `fn_broker_portal_get_espelho` e `fn_espelho_de_vendas_das_obras` com o MESMO corpo mais a chave `vistas` em cada torre. | Aplicada no banco: a verificação embutida passa; privilégios das duas funções iguais aos de antes; `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `utils/espelhoVistaDaJanela.ts` (novo) | `vistaDaUnidade(vistas, andar, orientacao)`: das faixas que contêm o andar, a da mesma face vence a de qualquer face; depois, a mais estreita; vista de outra face nunca serve. `orientacaoDoImovel` (`NORTH` → `NORTE`), `rotuloDaVista`, `problemaDaVista`. | `npx vitest run __tests__/espelhoVistaDaJanela.test.ts` verde (10 casos). |
| `services/empreendimentoTowerVistasService.ts` (novo) | `listar`, `dasTorres`, `adicionar` (sobe a foto, grava, confere a linha que voltou e apaga o arquivo solto se não ficou), `remover`. | Typecheck; coberto pelos testes de quem usa. |
| `components/empreendimento/VistasDaTorreSecao.tsx` (novo) + `TowerEditor.tsx` | Seção "Vista da janela" dentro do card da torre: lista das vistas com o que cada uma cobre, e o formulário (do andar, até o andar, face, legenda, foto); "Adicionar vista" desligado dizendo o que falta. | `npx vitest run __tests__/components/VistasDaTorreSecao.test.tsx` verde (9 casos); cadastrar uma vista numa torre do Garden Cambuhy. |
| `services/espelhoDeVendasService.ts` | `estruturaDoPredio` traz `vistas` de cada torre (tolerante à tabela ausente). | Typecheck. |
| `utils/espelhoDoEstoque.ts`, `utils/espelhoDoInvestidor.ts`, `utils/espelhoDeVendas3dMalha.ts` | `DadosDaUnidade.vista`: ausente = o prédio não tem vista (a ficha nem fala nisso); `null` = tem, mas nenhuma cobre a unidade; senão `{ url, legenda, cobre }`. No corretor o imóvel acha a torre pela unidade ligada e, sem ligação, pelo nome do bloco (a regra do contorno). | Casos novos nos dois testes. |
| `components/espelho3d/FichaDaUnidade.tsx` | Botão "Vista da janela": abre a foto num diálogo central com a legenda e a faixa; desligado, com o motivo no `title` e escrito embaixo (em tablet não há hover). | 3 casos novos em `Espelho3D.test.tsx`; passeio do harness. |
| `__tests__/espelhoDoInvestidor.test.ts` | A trava do texto vale para a migration nova: tabela com RLS e fechada para anon; nas funções só entram as chaves da vista e nenhuma de antes sai; a vista sai pela torre que a função já entregava. | 4 casos novos passam. |

Corrigido junto (achado conferindo a F5 em produção, 10/11/2026): o 3D rotulava a unidade por `number || name`; no Garden
Cambuhy o `number` de todo imóvel é 1201 (o número do endereço), e a lista e a ficha diziam "Unidade 1201" para as 34.
Passa a ser `name || number`, como o espelho 2D.

Mudou em relação ao plano aprovado: a ficha só mostra o botão quando o prédio tem alguma vista cadastrada (desligado,
com o motivo, quando nenhuma cobre a unidade). Um botão sempre desligado em todo prédio sem vista seria só ruído.

### F7 — Luz do dia

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoDeVendas3dLuz.ts` (novo) | Os quatro momentos (`LUZES_DO_DIA`: amanhecer, dia, entardecer, noite): céu, chão, ambiente, sol (cor, força, direção), contraluz, arestas e janelas acesas. "Dia" são os números da cena de antes. `corSobALuz` (a conta do material fosco, para a trava) e `janelaAcesa` (hash estável do id). | `npx vitest run __tests__/espelhoDeVendas3dLuz.test.ts` verde (36 casos): em toda luz, nas duas paletas, em três faces e com a unidade acesa ou não, cada status não escurece, mantém o matiz da legenda e fica distante dos outros e do piso neutro. |
| `components/espelho3d/Espelho3DCena.tsx` | Luzes, chão e arestas vêm do preset. À noite o grupo de cada status se parte em dois (acesas e apagadas): a acesa emite a cor do PRÓPRIO status. A unidade escolhida fica sempre acesa. | Passeio do harness nas quatro luzes, sem erro de console. |
| `components/espelho3d/Espelho3D.tsx` | Rádios "Luz do dia no desenho" (Amanhecer, Dia, Entardecer, Noite) ao lado da legenda, só quando há desenho; o céu é o gradiente do preset atrás do canvas transparente; a dica sobre o céu fica clara à noite. | 4 casos novos em `Espelho3D.test.tsx`: trocar a luz não fecha a ficha, não desfaz o destaque e não muda a legenda. |

Mudou em relação ao plano aprovado (10/11/2026):
- O arquivo é `utils/espelhoDeVendas3dLuz.ts` (ao lado de `espelhoDeVendas3dMalha.ts`), e não `lib/espelho3dLuz.ts`.
- A janela acesa brilha na cor do status, e não num amarelo de janela: um amarelo por cima de "Em negociação"
  (âmbar) e de "Disponível" (verde) era justamente o que a trava de legibilidade proíbe.
- A luz colorida do amanhecer e do entardecer é fraca; quem carrega o clima é o céu. Luz laranja forte aproximava
  "Vendida" (vermelho, no corretor) de "Reservada" (âmbar).
- A escolha da luz não é guardada: todo mundo abre no "Dia".

## Estado

- [x] F1a — modelo puro da cena (PR #284, `dd1701ee`)
- [x] F1b — contorno materializado na torre: #296 (`05a3d997`) + correção da fonte do estoque (este PR); migration `aplicar_20271110200000_torre_contorno_na_planta.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: 4 colunas + CHECK; privilégios das duas funções iguais aos de antes). Contorno das Torres A e B do Garden Cambuhy enviado em 10/11/2026 pelo botão da Planta ("Planta 26/10/2026") e conferido no banco. Achado ao conferir no Portal do Corretor: o Garden usa a fonte do ESTOQUE (torres pelo bloco do imóvel), que não lia o contorno — a torre do bloco agora leva o da torre de mesmo nome no Empreendimento (`chaveDaTorre`)
- [x] F2 — componente `<Espelho3D>` (PR #287)
- [x] F3 — Portal do Corretor: #290 (`7debce99`) + correção da fonte por cobertura #292 (`c5f65dc7`); migration `aplicar_20271109950000_broker_portal_espelho.sql` aplicada em 09/11/2026; reconferido em produção em 10/11/2026 (Garden Cambuhy: 34 unidades — 23 disponíveis, 7 reservadas, 4 vendidas — igual ao banco). Não conferidos em produção: celular e acesso por link
- [ ] F4 — Portal do Investidor: em `main` (#294, `bda7f3f6`), no ar; migration `aplicar_20271110100000_investor_portal_espelho.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: as duas internas sem EXECUTE para a API; a do link para anon; a do app só authenticated; token inexistente → `valid=false`). FALTA conferir com um investidor ligado a uma obra com torres — hoje não há nenhum vínculo investidor ↔ obra no banco
- [x] F5 — planta baixa por tipologia: #300 (`e48e216c`); migration `aplicar_20271110500000_empreendimento_tipologia_plantas.sql` aplicada em 10/11/2026 com autorização do usuário; as 8 plantas do Garden Cambuhy (Tipo 1 a 8) foram subidas pelo usuário e a ficha foi conferida em produção no Portal do Corretor (unidade de Tipo 3 com a planta carregada)
- [ ] F6 — vista da janela: #304 (`9f24410c`), no ar; migration `aplicar_20271110600000_empreendimento_tower_vistas.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: tabela com RLS e sem SELECT para anon; as duas funções com `vistas` e `plantas` e os privilégios de antes; VGV vendido do Bella Vista igual). FALTA cadastrar as vistas de verdade (o usuário faz depois) e conferir a ficha nos portais
- [x] F7 — luz do dia (este PR): sem migration

## Riscos

- Contorno desatualizado se o Bloco mudar sem reenvio → `contorno_atualizado_em` visível no `TowerEditor`.
- Celular com 400–600 unidades → validar a geometria mesclada; plano B `InstancedMesh` no esquemático.
- Regra de status em três lugares (TS do corretor, TS da Análise, SQL do investidor) → fixture único de casos.
- F6 depende de o usuário ter as imagens de vista; sem elas o botão fica desligado com o motivo.

## Verificação

- Por fase: `npx vitest run <arquivos da fase>`, `npm run typecheck`, `bash scripts/check-ui-standard.sh <tsx tocados>`,
  `npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts __tests__/segurancaMigrations.test.ts`.
- Migration aplicada e conferida de fora (`npx supabase db query --linked`), `bash scripts/check-rls-postura.sh`.
- Playwright pelo link de token: corretor (Estoque → 3D → unidade → ficha → Proposta; 390 px; WebGL desligado →
  lista) e investidor (aba Espelho; KPIs batendo com a Análise; resposta da rede sem dado de comprador).
- `vite build`: three fora do chunk de entrada dos portais.
- Depois do merge: `bash scripts/conferir-producao.sh` e o check-run `ci` do commit.
