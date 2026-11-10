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
| `supabase/migrations/aplicar_<prefixo>_torre_contorno_na_planta.sql` (novo) | `empreendimento_towers` ganha `contorno_na_planta jsonb` (anel em mm), `contorno_frente jsonb`, `contorno_norte_deg numeric`, `contorno_atualizado_em timestamptz`. | Colunas existem no banco (`information_schema.columns`); `migrationsPrefixo.test` verde. |
| `types/empreendimento.ts`, `services/empreendimentoService.ts` (`TOWER_COLS`) | As quatro colunas no tipo e na lista de `select`. | `getById` devolve o contorno gravado. |
| `components/blueprint/BlueprintEditor.tsx` | Onde `ajusteAoEmpreendimento.papeis` existe: enviar o contorno (`Bloco.pontos`), a frente (`referenciasDosBlocos`) e o norte de cada papel TORRE para a torre (`empreendimentoService.updateTower`), por ação explícita e ao publicar. | Enviar numa planta com 2 torres grava as 2 linhas; reabrir o Empreendimento mostra `contorno_atualizado_em`. |
| `components/empreendimento/TowerEditor.tsx` | Mostra "Contorno da Planta: enviado em …" ou "ainda não enviado". | Visível na tela da torre. |

### F2 — Componente `<Espelho3D>` (`components/espelho3d/`)

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `Espelho3D.tsx` | Casca: legenda com contagens, "Destacar" por rádios, lista alternativa por andar navegável por teclado, altura fixa. Props `cena`, `onSelecionar`, `acoesDaFicha?`, `mostrarPreco`, `cores`. | Teste RTL com a cena mockada: legenda, teclado, ficha. |
| `FichaDaUnidade.tsx` | Dados + foto de capa, com `DetailField`/`StatusPill` do `PortalKit`. | Teste RTL. |
| `Espelho3DCena.tsx` (lazy) | `<Canvas>` + `OrbitControls`; geometria mesclada por status; picking por raycast (`faceIndex` → unidade); `ehClique`; `frameloop="demand"`. | Teste puro do mapa face→unidade; conferido no navegador. |
| `webglDisponivel.ts` | Sem WebGL → só a lista. | Teste RTL do fallback. |

### F3 — Portal do Corretor: seletor "2D | 3D" no Estoque

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| migration `fn_broker_portal_get_espelho(p_token text) → jsonb` | Mesma validação/visibilidade de `fn_broker_portal_get_units`; torres + floors + units (geometria e `property_id`), **sem preço**; deduplicado por `unit_id`. | Chamada com token válido devolve as torres; com token inválido, `valid=false`; `segurancaMigrations.test` verde. |
| `services/brokerPortalService.ts` | `getEspelhoByToken`. | Coberto por teste do hook. |
| `components/broker/useBrokerPortal.ts` | `visaoDoEstoque` persistida + `cenaDoEspelho`; status = o do 2D (`statusEfetivoDaUnidade` + `negocioAtivoDaUnidade`) pelo adaptador `statusDoEspelho`. | Teste de paridade com `saleUnitClassifier` numa matriz de casos. |
| `components/BrokerPortal.tsx`, `components/broker/BrokerPortalMobile.tsx` | Seletor 2D\|3D; ficha com Proposta e cesta; 3D desligado com motivo sem vínculo ou em Locação; faixa "Sem posição na torre (N)". | Playwright pelo link: Estoque → 3D → unidade → ficha → Proposta; 390 px. |

### F4 — Portal do Investidor: aba "Espelho de Vendas"

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| migration `fn_investor_portal_get_espelho(p_token text) → jsonb` (+ gêmea logada) | token → `investor_participations.project_id` → torres por `COALESCE(tw.project_id, e.project_id)`; `status` (regra "com contrato") e `price` por unidade; `resumo { vgv_vendido, vgv_estoque, contagem }`. Lista explícita de colunas. | Teste de texto: nenhum campo de comprador no retorno; resposta da rede conferida. |
| `services/investorPortalTokenService.ts` | `getEspelhoByToken`. | — |
| `components/InvestorDashboard.tsx` | Aba `espelho` em `TABS`, `TAB_TITLES`, `Promise.all`, carregamento logado e barra do celular; nasce desligada. | Aba aparece só para quem o gestor ligou. |
| `components/investor/portal/PortalEspelho.tsx` (novo) | `KpiStrip` de VGV + seletor de obra + `<Espelho3D>` sem ações. | `PortalEspelho.test.tsx`; KPIs batem com Venda de Ativos › Análise. |

### F5 — Planta baixa por tipologia

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| migration | Tabela `empreendimento_tipologia_plantas` (empreendimento + tipologia normalizada, RLS por org); bucket público de imagem `empreendimento-midia`. | Upload e leitura funcionam; RLS conferida. |
| `components/empreendimento/TowerEditor.tsx` | Lista as tipologias distintas das unidades, com e sem planta; upload. | Subir uma planta e vê-la na lista. |
| RPCs de F3/F4 + `FichaDaUnidade.tsx` | `plantas[]` no retorno; a ficha mostra a planta. | Ficha de unidade com tipologia cadastrada mostra a imagem nos dois portais. |

### F6 — Vista da janela

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| migration | Tabela `empreendimento_tower_vistas (tower_id, andar_de, andar_ate, orientacao, imagem_url, legenda)`. | — |
| `utils/espelhoVistaDaUnidade.ts` (novo) | `vistaDaUnidade(vistas, andar, sun_orientation)`: a faixa mais estreita que contém o andar; orientação igual vence a nula. | Teste puro. |
| `TowerEditor.tsx`, `FichaDaUnidade.tsx`, RPCs | Cadastro por torre; botão "Vista da janela", desligado com motivo sem imagem. | Conferido nos dois portais. |

### F7 — Luz do dia

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `utils/espelhoLuzDoDia.ts` (novo) | 4 presets (amanhecer, dia, entardecer, noite): sol, ambiente, céu, janelas. | Teste: a cor de status segue legível em todo preset. |
| `Espelho3D.tsx`, `Espelho3DCena.tsx` | Rádios "Luz"; céu em gradiente CSS; à noite, `emissive` por hash estável do `unitId`. | Conferido no navegador; sem transição com `prefers-reduced-motion`. |

## Estado

- [x] F1a — modelo puro da cena (PR desta frente)
- [ ] F1b — contorno materializado na torre
- [ ] F2 — componente `<Espelho3D>`
- [ ] F3 — Portal do Corretor
- [ ] F4 — Portal do Investidor
- [ ] F5 — planta baixa por tipologia
- [ ] F6 — vista da janela
- [ ] F7 — luz do dia

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
