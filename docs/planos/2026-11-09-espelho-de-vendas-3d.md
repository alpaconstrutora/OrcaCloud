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

### Pedido de 10/11/2026 — "Ver decorado" (F8 e F9)

Sessão: 55997973-a400-4cc1-9c2d-3a4a7714d48b · 10/11/2026, com as sete fases já no ar.

> assista esse video e analise: https://www.instagram.com/reel/Dfia8V0vTp0/?utm_source=ig_web_copy_link&psln=NTc4MTIwNjQ2YQ==

O vídeo (16 s, post pago da Higgsfield, perfil lynam_up) é um site de venda de uma torre de alto padrão: a foto
da fachada com um balão de unidades disponíveis em cada andar ao passar o cursor; o toque abre o **corte 3D da
unidade mobiliada** (vista de cima, sem teto, com a ficha ao lado) e depois as **imagens de cada ambiente
decorado** com o nome embaixo (Primary Bedroom, Great Room, Spa Bath). Na análise: o mapa por andar e a ficha
nós já temos e melhores (status vivo do banco, não uma foto); o que falta é o corte 3D mobiliado e as imagens
dos ambientes — e imagem gerada por IA na venda precisa do aviso "imagem ilustrativa" (CDC, arts. 30 e 37).

> Outra frente avançou e fez implementação no espelho de vendas 3d. Verifique novamente e faça uma nova fase do plano

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 09/11/2026 | Para quem é a tela na 1ª versão? | Dois alvos: Portal do Corretor e Portal do Investidor. |
| 09/11/2026 | Como a torre é desenhada em 3D? | **Híbrida**: contorno real do Bloco da Planta quando existir; senão volumetria esquemática gerada do cadastro. |
| 09/11/2026 | O que o investidor vê de cada unidade? | **Status e preço**: cor por status, preço de tabela por unidade, VGV vendido e em estoque. Sem nome de comprador. |
| 09/11/2026 | O que entra na ficha na 1ª versão? | **Tudo do vídeo**: dados, foto de capa, planta baixa por tipologia, vista da janela por andar, luz do dia. |
| 09/11/2026 | Plano em 7 fases (um PR cada) | Aprovado, com os três pontos assumidos abaixo. |
| 10/11/2026 | De onde vêm o corte 3D mobiliado e as imagens dos ambientes ("Ver decorado")? | **Os dois, em etapas**: F8 com imagens enviadas pela incorporadora por tipologia (render do arquiteto ou gerado fora do app); F9 com o corte gerado pela Planta, que substitui a imagem do corte quando a tipologia estiver desenhada. |
| 10/11/2026 | Quem vê o "Ver decorado"? | **Corretor e Investidor**: a ficha é a mesma nos dois portais; as imagens não mostram preço nem pessoa. |

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

Corrigido depois de ir ao ar (10/11/2026, print do usuário do Portal do Investidor do Garden Cambuhy: *"veja que foi
gerado errado. tudo separado"*, com o print da Planta do mesmo empreendimento): a obra do Garden traz também a torre
"Lote" do "021 - Lote Vale do Sol", ligado à MESMA obra e sem contorno. A regra era "uma esquemática põe TODAS lado a
lado", e as Torres A e B — encostadas na Planta — saíam separadas. Agora as torres da Planta ficam sempre nas
coordenadas do desenho e só as esquemáticas vão lado a lado, à direita do grupo (`montarCenaDoEspelho`). Provado com o
JSON real da função do investidor: A→B = (0, 26 000) mm no desenho e na cena (antes, (23 500, 0)). Fica com o usuário
decidir se o "Lote Vale do Sol" é mesmo dessa obra.

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
- **Revertido em 10/11/2026** (pedido do usuário: *"trazer as garagens e subsolos para o espelho"*): o subsolo entra
  no desenho. No Garden Cambuhy a Torre B tem 8 apartamentos nos pavimentos -1 e -2 (desnível) e as duas torres têm
  estacionamentos de -1 a -4 — nada disso aparecia. A unidade do subsolo tem a cor do status; o estacionamento sem
  unidade é piso neutro. Com subsolo, o chão fica translúcido (35 %, sem gravar profundidade) e o que está abaixo do
  térreo aparece através; a câmera enquadra do subsolo mais fundo ao topo; tocar numa unidade do subsolo abre a ficha.

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

Corrigido depois de ir ao ar (10/11/2026), com o usuário tentando cadastrar: *"carreguei as imagens mas nao tem botão
salvar ou algo do tipo e as imagens nao permanecem"*. A foto escolhida era só prévia até clicar num botão branco
"Adicionar vista", desligado enquanto a faixa de andares estivesse vazia. Agora a foto vem primeiro, a faixa já nasce
preenchida com os andares da torre (do térreo ao último com unidade), o botão é o azul "Salvar vista" e, com a foto
escolhida, a tela avisa que ela ainda não foi gravada.

#### F6 — complemento: vista de uma unidade específica (10/11/2026)

Pedido do usuário, com a F6 no ar: *"não seria melhor também opção para vincular a vista da janela com uma unidade
específica?"*. A unidade de canto, ou a que dá para o vizinho, tem vista diferente das outras do mesmo andar.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110800000_vista_da_janela_por_unidade.sql` (novo) | `empreendimento_tower_vistas.unit_id` (NULL = vista de faixa), índice único (uma vista por unidade) e gatilho que recusa unidade de OUTRA torre (a RLS olha a torre). Reescreve as duas funções do espelho com o MESMO corpo mais `unit_id` e `unit_name` em cada vista. | Aplicada no banco: a verificação embutida passa; privilégios das duas funções iguais aos de antes. |
| `utils/espelhoVistaDaJanela.ts` | `vistaDaUnidade(…, unidade)`: a vista cadastrada para a unidade vence qualquer faixa, e só ela a recebe. Casa pelo id; o imóvel do estoque sem unidade ligada, pelo nome. | 6 casos novos em `espelhoVistaDaJanela.test.ts`. |
| `services/empreendimentoTowerVistasService.ts` | Lê `unit_id` e o nome da unidade, tolerante à coluna ausente (cai para as vistas de faixa); `adicionar` aceita `unidade`; "já tem uma vista" e "falta aplicar a migration" com o motivo. | Typecheck; coberto pelos testes de quem usa. |
| `components/empreendimento/VistasDaTorreSecao.tsx`, `TowerEditor.tsx` | Campo "Vale para": "Uma faixa de andares" ou uma unidade da torre (a que já tem vista fica desligada, dizendo por quê). Escolhida a unidade, somem a faixa e a face. | 4 casos novos em `VistasDaTorreSecao.test.tsx`. |
| `utils/espelhoDoEstoque.ts`, `utils/espelhoDoInvestidor.ts` | Passam a unidade a `vistaDaUnidade`. | 1 caso novo em cada teste. |

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

### F8 — "Ver decorado": corte 3D e ambientes por tipologia (imagens enviadas)

Na ficha da unidade, ao lado de "Vista da janela", o botão "Ver decorado" abre um diálogo central (nunca tela
cheia) com o corte 3D mobiliado da tipologia e as imagens dos ambientes, uma de cada vez, com o nome do ambiente
embaixo. As imagens são cadastradas uma vez por tipologia do empreendimento, como as plantas da F5. Toda imagem
aparece com o selo **"Imagem ilustrativa"** por cima — sempre, sem opção de desligar (decorado não é memorial
descritivo; ver Riscos).

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271110990000_empreendimento_tipologia_decorado.sql` (novo) | Tabela `empreendimento_tipologia_decorado (empreendimento_id, tipologia, tipologia_chave, papel, legenda, ordem, imagem_url, imagem_path, origem, planta_assinatura, planta_estudo_id)`: `papel` `CORTE` \| `AMBIENTE` (CHECK); índice único parcial — um `CORTE` por tipologia; `AMBIENTE` exige `legenda`; `origem` `ENVIADA` \| `PLANTA` (padrão `ENVIADA`; `PLANTA` e as duas colunas `planta_*` são preenchidas pela F9 — nascem aqui para a F9 não precisar de migration). RLS pela organização do empreendimento (a regra da F5); fechada para anon. Imagem no bucket `empreendimento-midia` (`…/decorado/`). Reescreve `fn_broker_portal_get_espelho` e `fn_espelho_de_vendas_das_obras` com o MESMO corpo da migration vigente mais a chave `decorado` (lista de `{ tipologia_chave, papel, legenda, ordem, imagem_url, origem }`) ao lado de `plantas`. | Aplicada no banco (com autorização própria do usuário): a verificação embutida passa; privilégios das duas funções iguais aos de antes; `segurancaMigrations.test` e `migrationsPrefixo.test` verdes. |
| `utils/espelhoDecoradoDaTipologia.ts` (novo) | `decoradoDaUnidade(decorados, tipologia)` → `{ corte, ambientes }` (casando por `chaveDaTipologia` da F5; ambientes pela `ordem`, empate pela legenda) ou `null`; `rotuloDoSelo(origem)` ("Imagem ilustrativa" / "Gerado do projeto · mobiliário ilustrativo"); `problemaDoDecorado` (o que falta para salvar). | `npx vitest run __tests__/espelhoDecoradoDaTipologia.test.ts` verde: casa com acento/caixa diferentes; só ambientes sem corte; só corte; ordem; tipologia sem decorado → `null`; prédio sem nenhum → ausente. |
| `services/empreendimentoTipologiaDecoradoService.ts` (novo) | `listar`, `doPredio`, `salvar` (sobe a imagem, grava, confere a linha que voltou e apaga o arquivo solto se não ficou — o padrão da F5/F6), `remover`, `reordenar`. Tolerante à tabela ausente ("falta aplicar a migration", com o motivo). | Typecheck; coberto pelos testes de quem usa. |
| `components/empreendimento/DecoradoPorTipologiaSecao.tsx` (novo) + `TowerEditor.tsx` | Seção "Decorado por tipologia" logo abaixo de "Plantas por tipologia": um cartão por tipologia (a mesma lista de `tipologiasDoEmpreendimento`), com o lugar do corte 3D e a lista de ambientes (miniatura, legenda, subir/descer, remover). Foto primeiro, legenda depois, botão azul "Salvar imagem" e o aviso "ainda não foi gravada" enquanto não salvar (lição do #315). Texto fixo no cartão: "Nos portais, toda imagem aparece com o selo 'Imagem ilustrativa'". | `npx vitest run __tests__/components/DecoradoPorTipologiaSecao.test.tsx` verde (salvar desligado dizendo o que falta; ambiente sem legenda não salva; aviso de não gravada; reordenar); subir o corte e dois ambientes de um Tipo do Garden Cambuhy e conferir as linhas no banco. |
| `services/espelhoDeVendasService.ts`, `components/broker/useBrokerPortal.ts` | `estruturaPorToken` e `estruturaDoApp` devolvem também `decorado` (tolerante à chave ausente); o portal passa a lista a `montarEspelhoDoEstoque`. | Typecheck. |
| `utils/espelhoDoEstoque.ts`, `utils/espelhoDoInvestidor.ts`, `utils/espelhoDeVendas3dMalha.ts` | `DadosDaUnidade.decorado`: ausente = o prédio não tem decorado (a ficha nem fala nisso); `null` = tem, mas não desta tipologia; senão `{ corte, ambientes }`. No investidor, a tipologia que já cai na do imóvel (F5) vale aqui também. | 1 caso novo em cada teste. |
| `components/espelho3d/FichaDaUnidade.tsx` (+ `components/espelho3d/DecoradoDaUnidade.tsx` novo, se a ficha passar de ~250 linhas) | Botão "Ver decorado" ao lado de "Vista da janela", desligado com o motivo no `title` e escrito embaixo quando a tipologia não tem. O diálogo (`Modal` 2xl): imagem grande, setas e miniaturas, ← → do teclado, legenda e "2 de 5"; o corte é sempre a primeira; selo de `rotuloDoSelo` sobre a imagem, legível em qualquer fundo. Trocar de unidade fecha. | Casos novos em `__tests__/components/Espelho3D.test.tsx`: botão some sem decorado no prédio; desligado com motivo; ordem corte → ambientes; setas e teclado; selo sempre presente. Passeio do harness: "o decorado não ocupa a tela inteira". |
| `docs/spikes/espelho-vendas-3d/main.tsx`, `passeio.mjs` | Decorado de mentira numa tipologia do harness (corte + 3 ambientes) e o passo do passeio. | `node docs/spikes/espelho-vendas-3d/passeio.mjs` com exit 0. |
| `__tests__/espelhoDoInvestidor.test.ts` | A trava do texto vale para a migration nova: tabela com RLS e fechada para anon; nas funções só entra a chave `decorado` e nenhuma de antes sai; `planta_assinatura` e `planta_estudo_id` não saem para o portal; unidade do investidor com as mesmas 16 chaves. | Casos novos passam. |

Pedido de execução, 10/11/2026 (mesma sessão):

> Faça a f8
> Já deixo autorizado aplicações no banco

Mudou em relação ao plano (10/11/2026):
- O prefixo planejado `20271110970000` estava tomado pelo PR aberto `feat/colaborador-cpf-vazio-banco`; ficou
  `20271110990000`. As duas funções do espelho foram geradas por script a partir de `aplicar_20271110800000`, depois
  de conferir que o corpo no banco era IGUAL ao do arquivo (o #316, `aplicar_20271110950000`, só reescreveu os embrulhos
  do investidor). É a 6ª reescrita das duas.
- `decoradoParaAFicha` decide o "ausente × null" da ficha (o mesmo contrato da vista da F6), e o decorado de dois
  empreendimentos no mesmo prédio com a mesma tipologia NÃO se mistura: vale o do primeiro (como a planta).
- O cadastro escolhe a tipologia num seletor (uma tipologia aberta por vez) em vez de um cartão por tipologia: com
  corte, lista de ambientes e formulário, oito cartões abertos (o Garden tem Tipo 1–8) eram uma parede.
- O corte grava ao escolher a imagem (como a planta: não há outro campo); o ambiente tem o botão azul "Salvar
  ambiente" porque precisa do nome.
- Até 12 ambientes por tipologia (`MAXIMO_DE_AMBIENTES`), conferido no front.
- Achado no passeio do harness, não nos testes: a imagem do diálogo não tinha caixa própria e, sem tamanho intrínseco
  (SVG), sumia com altura 0 — agora a caixa tem altura fixa e a imagem cabe nela; o passeio mede a altura.
- Testes: `__tests__/espelhoDecoradoDaTipologia.test.ts` (12), `__tests__/components/DecoradoPorTipologiaSecao.test.tsx`
  (9), 4 casos novos em `Espelho3D.test.tsx`, 1 em `espelhoDoEstoque.test.ts` e 1 + 5 da trava em
  `espelhoDoInvestidor.test.ts`; passeio do harness com 8 conferências novas.

Fora desta fase, de propósito: gerar imagem por IA dentro do app (custo por imagem e o risco do selo ficar de fora
na hora de exportar) e o "balão por andar sobre a foto da fachada" do vídeo — o desenho 3D com status vivo já faz
isso melhor.

### F9 — Corte 3D gerado pela Planta

A Planta já tem a unidade autônoma como objeto (`Unidade` em `utils/blueprintKernel/model.ts`: número, `tipologia`,
as etiquetas dos ambientes que a compõem) e os móveis como componentes do kernel (`FamiliaDeComponente`:
mobiliário, louça, bancada, armário). A F9 tira dali o corte 3D mobiliado de UMA unidade de cada tipologia e o
envia para o lugar do corte da F8, com `origem = PLANTA`. Os ambientes (as imagens decoradas) continuam enviados.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoDecoradoDaPlanta.ts` (novo, puro) | `cenaDoDecorado(model, unidadeId)` → paredes dos ambientes da unidade até o pé-direito, sem laje nem teto; pisos por ambiente; vãos de porta e janela; os componentes dentro dos ambientes; caixa e enquadramento de cima a ~45°. `assinaturaDoDecorado` (muda quando parede, vão, componente ou etiqueta da unidade muda — para o "o desenho mudou desde o envio"). `problemaDoDecorado` (unidade sem ambiente, sem tipologia, tipologia que o Empreendimento não tem, sem parede). Reaproveita as peças do 3D da Planta (`utils/blueprint3dPecas.ts`) — o levantamento da fase confirma quais servem antes de escrever. | `npx vitest run __tests__/espelhoDecoradoDaPlanta.test.ts` verde: só os ambientes da unidade entram (a vizinha fica fora); parede geminada uma vez só; componente fora da unidade fora; assinatura estável com a mesma geometria e diferente ao mover uma parede ou um móvel; cada problema com o motivo. |
| `components/blueprint/RetratoDoDecorado.tsx` (novo, `React.lazy`) | Renderiza a cena fora da tela num canvas de tamanho fixo, com a luz "Dia" de `LUZES_DO_DIA` (F7), e devolve o PNG. Sem WebGL → não há botão (motivo escrito). | Passeio de um harness da Planta: o PNG sai com o tamanho combinado e não é uma imagem vazia (conferência de pixels). |
| `components/blueprint/TelaUnidades.tsx` + `BlueprintEditor.tsx` | Em cada unidade com tipologia, quando o estudo está ligado a um Empreendimento (pela zona, `blueprint_study_urban_context.empreendimento_id`, como na F1b): a situação do corte nos portais ("nunca enviado", "o desenho mudou desde …", "é o deste desenho", "a tipologia usa imagem enviada") e o botão "Enviar corte ao Espelho 3D", desligado com o motivo. Uma unidade por tipologia: enviar outra unidade do mesmo tipo troca a do tipo, avisando antes. | `npx vitest run __tests__/components/TelaUnidadesDecorado.test.tsx` verde (cada situação e cada motivo); enviar numa planta real com unidade tipificada e conferir a linha no banco (`origem = PLANTA`, assinatura e estudo). |
| `services/empreendimentoTipologiaDecoradoService.ts` | `gravarCorteDaPlanta({ empreendimentoId, tipologia, png, assinatura, estudoId })`: troca o `CORTE` da tipologia (o arquivo antigo é apagado só depois que a linha nova voltou). | Typecheck; coberto pelo teste da tela. |
| `components/empreendimento/DecoradoPorTipologiaSecao.tsx` | O cartão diz de onde veio o corte ("Enviado" / "Gerado da Planta em …") e, no gerado, "trocar" sobe uma imagem por cima, avisando que o gerado será substituído. | Caso novo no teste da seção. |

Ordem: F8 primeiro (ela cria a tabela, o lugar na ficha e o selo); a F9 sem a F8 não tem onde aparecer.

Pedido de execução, 10/11/2026 (mesma sessão, com a F8 no ar e a conferência dela pendente):

> pode comecar f9. Depois voltamos para concluir f8

O que foi feito (sem migration: `origem`, `planta_assinatura` e `planta_estudo_id` nasceram na F8):

| Arquivo | O que mudou | Como sei que terminou |
|---|---|---|
| `utils/espelhoDecoradoDaPlanta.ts` (novo) | `cenaDoDecorado` (o que esconder, a caixa de corte, o ponto de vista e, sem móvel na unidade, a CÓPIA do modelo mobiliada com o kit de `mobiliarDoAmbiente`), `assinaturaDoDecorado` (`<uid da unidade>|<fnv1a>`), `pontoDeVistaDoCorte` (encaixa os 8 cantos da caixa), `situacaoDoCorte` / `textoDaSituacao`, `HIPOTESES_DO_CORTE_DECORADO`. | `npx vitest run __tests__/espelhoDecoradoDaPlanta.test.ts` verde (12 casos). |
| `components/blueprint/EnviarCorteDaUnidade.tsx` (novo) | Diálogo central com a PRÉVIA no próprio 3D da Planta (o que se vê é o que vai), "Olhar de" (4 cantos), "Paredes" (1,20 m / 2,20 m / inteiras), "Mobiliar com o kit sugerido"; "Enviar ao Espelho 3D" captura 1600 × 1000 e grava; trocar um corte de outra origem pede confirmação. | Passeio do harness `docs/spikes/decorado-da-planta` com exit 0. |
| `components/blueprint/Blueprint3DViewer.tsx` | Prop `semControles`: sem a barra, o painel e o contorno da caixa de corte e a dica — só na prévia; a aba 3D não muda. | `BlueprintEditor.test.tsx` segue verde; print da prévia sem painel. |
| `components/blueprint/TelaUnidades.tsx` + `BlueprintEditor.tsx` | Coluna "Corte no Espelho 3D" (a situação de cada unidade) e o botão de enviar, desligado com o motivo; o editor resolve o Empreendimento (vinculado → zona → obra) e lê as tipologias do cadastro e os cortes só com a tela aberta. | `npx vitest run __tests__/components/TelaUnidadesDecorado.test.tsx` verde (6 casos). |
| `services/empreendimentoTipologiaDecoradoService.ts` | `cortesDoEmpreendimento` (com `planta_*`, só o editor lê) e `gravarCorteDaPlanta`. | Typecheck; coberto pelo harness (o envio é trocado lá). |
| `components/empreendimento/DecoradoPorTipologiaSecao.tsx` | O cartão do corte diz "Gerado da Planta em …" / "Imagem enviada em …"; trocar o corte da Planta por imagem pede confirmação. | 1 caso novo em `DecoradoPorTipologiaSecao.test.tsx`. |
| `docs/spikes/decorado-da-planta/` (novo) | Harness: pavimento com a 101 (sala + suíte, portas e janelas, sem móvel) e a 102 com um sofá; o envio só guarda o PNG. `passeio.mjs`. | Exit 0: prévia no formato 1,6, kit sugerido, trocar lado e altura, PNG 1600 × 1000 com desenho (não fundo só), assinatura, 0 erros de console. |

Mudou em relação ao plano (10/11/2026):
- Não há cena própria nem `RetratoDoDecorado.tsx`: o `Blueprint3DViewer` já recebia `ocultos`, caixa de corte, ponto de
  vista e captura em PNG. A F9 calcula esses quatro e reaproveita o desenho — e a prévia é ao vivo, no diálogo.
- O kit sugerido entra na CÓPIA como peça comum (`sugerido: false`): sugerida, o 3D a desenha verde e translúcida
  (visto no harness). O estudo não muda.
- Duplex fica de fora ("ocupa dois pavimentos": envia a imagem pela F8).
- A assinatura começa pelo uid da unidade: o banco guarda UM corte por tipologia, e a coluna diz "Enviado da unidade
  102" quando o corte da tipologia veio de outra unidade.
- O enquadramento pela esfera em volta da caixa sobrava ~40 % (visto no harness); agora encaixa os 8 cantos.

⚠️ Sem dado real para conferir: em 10/11/2026 nenhum dos 121 ramos de estudo em produção tem unidade composta
(`draft_payload` sem `unidades`). Conferir de verdade pede compor uma unidade com tipologia num estudo ligado a um
Empreendimento que tenha essa tipologia.

## Estado

- [x] F1a — modelo puro da cena (PR #284, `dd1701ee`)
- [x] F1b — contorno materializado na torre: #296 (`05a3d997`) + correção da fonte do estoque (este PR); migration `aplicar_20271110200000_torre_contorno_na_planta.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: 4 colunas + CHECK; privilégios das duas funções iguais aos de antes). Contorno das Torres A e B do Garden Cambuhy enviado em 10/11/2026 pelo botão da Planta ("Planta 26/10/2026") e conferido no banco. Achado ao conferir no Portal do Corretor: o Garden usa a fonte do ESTOQUE (torres pelo bloco do imóvel), que não lia o contorno — a torre do bloco agora leva o da torre de mesmo nome no Empreendimento (`chaveDaTorre`)
- [x] F2 — componente `<Espelho3D>` (PR #287)
- [x] F3 — Portal do Corretor: #290 (`7debce99`) + correção da fonte por cobertura #292 (`c5f65dc7`); migration `aplicar_20271109950000_broker_portal_espelho.sql` aplicada em 09/11/2026; reconferido em produção em 10/11/2026 (Garden Cambuhy: 34 unidades — 23 disponíveis, 7 reservadas, 4 vendidas — igual ao banco). Não conferidos em produção: celular e acesso por link
- [ ] F4 — Portal do Investidor: em `main` (#294, `bda7f3f6`), no ar; migration `aplicar_20271110100000_investor_portal_espelho.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: as duas internas sem EXECUTE para a API; a do link para anon; a do app só authenticated; token inexistente → `valid=false`). FALTA conferir com um investidor ligado a uma obra com torres — hoje não há nenhum vínculo investidor ↔ obra no banco
- [x] F5 — planta baixa por tipologia: #300 (`e48e216c`); migration `aplicar_20271110500000_empreendimento_tipologia_plantas.sql` aplicada em 10/11/2026 com autorização do usuário; as 8 plantas do Garden Cambuhy (Tipo 1 a 8) foram subidas pelo usuário e a ficha foi conferida em produção no Portal do Corretor (unidade de Tipo 3 com a planta carregada)
- [x] F6 — vista da janela: #304 (`9f24410c`) + "Salvar vista" #315 (`90e63e9e`) + vista de uma unidade #320 (`62791e5e`); migrations `aplicar_20271110600000_empreendimento_tower_vistas.sql` e `aplicar_20271110800000_vista_da_janela_por_unidade.sql` APLICADAS em 10/11/2026 com autorização do usuário. Vistas do Garden Cambuhy cadastradas pelo usuário (Torre A, andares 0–3; Torre B, 0–3) e ficha conferida em produção no Portal do Corretor: 101 e 105 abrem a vista; 505 com o botão desligado e o motivo
- [x] F7 — luz do dia: #309 (`8c4af0fb`), sem migration
- [ ] F8 — "Ver decorado" com imagens enviadas por tipologia: código neste PR; migration `aplicar_20271110990000_empreendimento_tipologia_decorado.sql` APLICADA em 10/11/2026 com autorização do usuário (conferido: RLS ligada, anon sem SELECT, a interna sem EXECUTE para a API, a do corretor para anon, e num bloco desfeito o banco recusa ambiente sem nome, ambiente com origem PLANTA e segundo corte). FALTA: subir um decorado de verdade no Garden Cambuhy e conferir a ficha nos portais em produção
- [ ] F9 — corte 3D gerado pela Planta: código neste PR, sem migration; harness verde. FALTA conferir num estudo real (nenhum tem unidade composta hoje) e ver o corte na ficha dos portais com o selo "Gerado do projeto"

## Riscos

- Contorno desatualizado se o Bloco mudar sem reenvio → `contorno_atualizado_em` visível no `TowerEditor`.
- Celular com 400–600 unidades → validar a geometria mesclada; plano B `InstancedMesh` no esquemático.
- Regra de status em três lugares (TS do corretor, TS da Análise, SQL do investidor) → fixture único de casos.
- F6 depende de o usuário ter as imagens de vista; sem elas o botão fica desligado com o motivo.
- F8/F9: decorado e corte são material de venda, não memorial descritivo. Mostrar sem aviso o que não será
  entregue (móvel, acabamento, vista) pode ser publicidade enganosa (CDC, arts. 30 e 37) e vira obrigação do
  incorporador → selo "Imagem ilustrativa" sempre sobre a imagem, sem opção de desligar, e trava no teste da ficha.
- F9: a unidade desenhada na Planta pode divergir da tipologia vendida (estudo antigo, outra versão) → o envio é
  ação explícita por unidade, o cartão mostra a data e o estudo de origem, e "o desenho mudou desde …" aparece na Planta.

## Verificação

- Por fase: `npx vitest run <arquivos da fase>`, `npm run typecheck`, `bash scripts/check-ui-standard.sh <tsx tocados>`,
  `npx vitest run __tests__/orgContextGuard.test.ts __tests__/migrationsPrefixo.test.ts __tests__/segurancaMigrations.test.ts`.
- Migration aplicada e conferida de fora (`npx supabase db query --linked`), `bash scripts/check-rls-postura.sh`.
- Playwright pelo link de token: corretor (Estoque → 3D → unidade → ficha → Proposta; 390 px; WebGL desligado →
  lista) e investidor (aba Espelho; KPIs batendo com a Análise; resposta da rede sem dado de comprador).
- `vite build`: three fora do chunk de entrada dos portais.
- Depois do merge: `bash scripts/conferir-producao.sh` e o check-run `ci` do commit.
