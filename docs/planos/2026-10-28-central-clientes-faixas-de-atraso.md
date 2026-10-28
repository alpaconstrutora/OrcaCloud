# Central de Clientes — Em aberto por faixa de atraso (`shape` → implementação)

## Pedido original

> /impeccable critique analise e dados > Central de Clientes

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 28/10/2026. Crítica 2 (23/40). Respostas do usuário:
gráfico **"Trocar por faixas de atraso"**; limiar **"Os dois"** (30% do em aberto OU vencido há mais
de 90 dias); termo **"Em aberto"**; escopo **"Tudo"**; ordem **"um de cada vez"**. Este é o 2º
comando (o 1º, `harden`, é o PR #218).

> siga em frente

28/10/2026 — continuar para o próximo da lista (`shape`).

## Decisões do `shape` (28/10, com o usuário)

Dado medido antes de perguntar (clientes, entradas pendentes): nenhuma parcela sem vencimento.
No recorte de 2026 pela data de LANÇAMENTO as faixas somam o Em aberto do KPI (R$ 946.437,14; R$ 878 mil
em 61–90). Na posição de HOJE há **R$ 2,22 mi vencidos há mais de 90 dias** (76 parcelas), quase todos
lançados antes de 2026 — a tela os escondia.

| Pergunta | Resposta |
|---|---|
| Base das faixas | **"As duas, com escolha na tela"** |
| Os R$ 2,2 mi antigos | **"Dívida real"** |
| Coluna "Atraso máx." nas tabelas | **"Sim"** |
| Brief (alcance do alternador) | **"Confirmo como está"**: alternador "Lançados no período \| Posição de hoje" SÓ no gráfico, abrindo em **Posição de hoje**; KPIs e tabelas na base do período; regra "> 90 dias" do alerta pela **posição de hoje** |

## Brief

Card "Previsto × Realizado por período" → **"Em aberto por faixa de atraso"**: 5 colunas ordenadas
(A vencer · 1–30 · 31–60 · 61–90 · > 90 dias), rampa "Faixas de atraso" do §28.4; valor e nº de
parcelas por faixa em texto abaixo (vista de tabela); alternador substitui Mensal/Anual. Coluna
"Atraso máx." (dias da vencida mais antiga) em Por cliente e Por obra. Inadimplência acende por
"os dois". Fora: vocabulário (`clarify`), ordem do extrato (`layout`).

## Plano

1. **`supabase/migrations/aplicar_20271028100000_opura_aging_clientes.sql`** — RPC `fn_opura_aging`
   (org, cliente/lista, período, `p_base` 'periodo'|'hoje', `p_dimension` null|'client'|'project')
   → faixa, qtd, valor, atraso_max; só entradas pendentes; exige cliente ou lista; REVOKE PUBLIC/anon.
   - Pronto quando: aplicada; 'periodo' 2026 soma R$ 946.437,14 e '> 90' hoje = R$ 2.220.292,00 (JWT
     do desenvolvedor); `segurancaMigrations` verde.
2. **`services/opuraAnalyticsService.ts`** — `aging()` + tipos; teste do contrato de parâmetros.
3. **`components/CentralCliente.tsx`** — gráfico por faixa + alternador; coluna Atraso máx.; tom da
   Inadimplência por "os dois" (fração do período ≥ 30% OU vencido > 90 dias hoje > 0).
   - Pronto quando: no navegador, "Posição de hoje" mostra os R$ 2,2 mi em "> 90"; "Lançados no
     período" soma R$ 946.437,14; colunas ordenáveis por Atraso máx.

## Estado

- [x] 1 · migration — aplicada em 28/10 após "Liberado". `proacl` só authenticated/service_role (sem
  PUBLIC/anon), SECURITY INVOKER. Com o JWT do desenvolvedor: 'hoje' > 90 = R$ 2.220.292,00 (76 parcelas,
  atraso máx 4.139 dias); 'periodo' soma R$ 946.437,14. `p_base='xyz'` → "Base desconhecida".
  Lógica validada ANTES da aplicação com consulta só de leitura (mesmos números).
- [x] 2 · serviço — `aging()`; `opuraAnalyticsDrill.test.ts` cobre os 7 parâmetros e a conversão.
- [x] 3 · tela — navegador: abre em "Posição de hoje" (Mais de 90 dias R$ 2.220.292,00; rodapé "Em
  aberto R$ 3.461.314,94 · vencido R$ 3.121.243,42"); "Lançados no período" → "Em aberto R$ 946.437,14
  · vencido R$ 923.551,42" = KPIs. Atraso máx. em vermelho acima de 90 dias (300, 291, 140 dias), cinza
  até 90 (Paróquia 90 dias). Inadimplência em alerta. Achado no navegador: o rótulo do Recharts quebrava
  na largura da barra ("2,2 / mi") → rótulo próprio. `lib/opuraPrevistoRealizadoSerie.ts` e o teste
  removidos (só serviam ao gráfico antigo).

Achado de dado: a parcela vencida mais antiga tem 4.139 dias (~2015) — o usuário disse "dívida real",
mas vale conferir prescrição.

## Verificação

`tsc`, suíte inteira, `check-ui-standard`, navegador (127.0.0.1:3140, Desenvolvedor), contagens no banco.
