# Central de Clientes — filtro por tipo de cliente e "Todos os clientes"

## Pedido original

Sessão de 2026-09-14 (continuação da sessão do gráfico Previsto × Realizado),
mensagem literal do usuário:

> 1. criar filtro por tipo de cliente
> 2. No seleto de cliente, incluir "todos os clientes"

Contexto imediato: o usuário tinha reportado *"esta zerado! de qual fonte
esrta vindo os valores"* — a tela abria no primeiro cliente em ordem
alfabética, que não tem lançamento; só 7 clientes têm crédito em 2026.

## Decisões

- "Tipo de cliente" = `clients.category` (catálogo de Configurações › Tipos de
  Clientes, `clientCategoryService`, com os 4 padrões virtuais). As opções do
  filtro = catálogo da organização ∪ categorias presentes nos clientes
  carregados (nada fica escondido).
- "Todos os clientes" = agregação sobre a LISTA de ids (já recortada por
  organização e pelo tipo). Não é "sem filtro de cliente": isso traria crédito
  sem cliente (aporte, empréstimo) e o extrato por obra viraria o da
  organização inteira. Por isso as 3 RPCs ganham `p_client_ids uuid[]`.
- Padrão da tela passa a ser "Todos os clientes" (é o que evita abrir zerado).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270921000020_opura_central_clientes_client_ids.sql` | `p_client_ids uuid[]` em `fn_opura_cliente_kpis` (p_client_id opcional; exige um dos dois), `fn_opura_pivot`, `fn_opura_entries`; DROP da assinatura antiga; REVOKE/GRANT | aplicada com `db query -f`; `pg_proc` com UMA sobrecarga de cada; chamada antiga (só `p_client_id`) e nova (`p_client_ids`) respondem 200 com a conta de leitura |
| 2 | `services/opuraAnalyticsService.ts` | `clientIds?: string[]` em `OpuraFilters`; `clienteKpis` aceita `clientId: string \| null` + `clientIds` | `tsc` limpo; `opuraAnalyticsDrill.test.ts` verde |
| 3 | `components/ClientSelect.tsx` | prop `allOption` — linha fixa no topo do drawer e rótulo no gatilho | tela mostra "Todos os clientes" no gatilho e como 1ª linha |
| 4 | `components/CentralCliente.tsx` | select de tipo (`usePersistedState`), "Todos" como padrão, lista de clientes recortada pelo tipo, KPIs/gráfico/por obra/extrato agregando pelos ids | print: Todos → KPIs ≠ 0; tipo "Locação" → só clientes de Locação no seletor e números recortados; cliente único continua igual |
| 5 | verificação | `check-ui-standard.sh`, `tsc`, vitest, Playwright nos 2 estados | zero erro de console/HTTP; soma do gráfico = KPI |

## Andamento

- [x] 1 (aplicada 2026-09-14; chamadas antiga/nova 200, anon 404) · [x] 2 · [x] 3 · [x] 4 · [x] 5 (harness: Todos = R$ 1.044.187 previsto; Locação = 0; Locação e Condominio = R$ 41.850; Reginaldo = R$ 12.000; zero erro console/HTTP)

Achado no harness: resposta da carga anterior (47 ids) chegava DEPOIS da carga do tipo escolhido e sobrescrevia os números — corrigido com guarda de sequência em `load()`.
