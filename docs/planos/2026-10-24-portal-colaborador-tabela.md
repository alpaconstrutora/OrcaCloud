# Portais › Portal do Colaborador: lista vira tabela no padrão do guia

## Pedido original

Sessão `6863b925-c5a1-45aa-a7fc-d3bd12b7048a` · 24/10/2026, logo depois de o item sair de Recursos Humanos para Portais (PR #122):

> Portais > Portal do Colaborador: Transformar em tabela e aplicar o padrão ui_ux_guia_unificado.md no toolbar de abas + botão de ajuste de colunas + filtro de agrupamento + classificador de agrupamento

## Leitura do pedido

| Termo do pedido | O que é no app |
|---|---|
| tabela | `StandardTable` (guia §6.10) — hoje a Gestão de Acessos é uma lista de `div`s com `rounded-2xl` |
| toolbar de abas | `TabsBar` (§19.1) — já existia; falta o título acompanhar a aba (`VIEW_HEADERS`) e o conteúdo da 2ª aba entrar na escala compacta (§16) |
| botão de ajuste de colunas | `ColumnConfigButton` + autofit (§6.1.2), embutidos no `StandardTable` |
| filtro de agrupamento | seletor "Agrupar" + recolher/expandir todos (§6.12) |
| classificador de agrupamento | seletor Crescente/Decrescente da ordem dos grupos (§6.12, 21/10/2026) |

## Decisões

| Data | Pergunta | Decisão |
|---|---|---|
| 24/10/2026 | O que vira linha? | Um colaborador ativo por linha (como era), com o link dele quando existe. Colunas: Colaborador, Cargo, Situação (Ativo / Expirado / Sem acesso), Expira em, Último acesso. |
| 24/10/2026 | Agrupar por quê? | Situação (na ordem do fluxo) e Cargo. Sem total do grupo — não há dinheiro (§6.12). |
| 24/10/2026 | Faixa azul explicativa | Saiu: o texto ("expira em 30 dias, sem conta") foi para o subtítulo, como pede o §18/§20 — o que a faixa dizia já estava no `<h1>`/`<p>`. |
| 24/10/2026 | `alert()` | Os dois `alert()` viraram toast §13; "Gerar acesso" em "Todas" fica desligado com o motivo no `title` (antes: clicar e aparecer um alerta). Não mudei a regra de qual organização grava — segue a do topo. |
| 24/10/2026 | KPIs | Não pedidos; não incluí. |

## Plano

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/LaborPortal.tsx` | `PortalManagement` vira `StandardTable` com colunas, busca, ajuste de colunas, Agrupar + ordem dos grupos; ações como texto azul + `ActionIconButton`; toast §13 | navegador: tabela, colunas, agrupar por Situação/Cargo e inverter a ordem |
| 2 | `components/LaborPortal.tsx` | `VIEW_HEADERS`: título/subtítulo mudam com a aba; seletor da "Prévia" em escala compacta | navegador: trocar de aba troca o título |

## Estado

- [x] 1 · 2 — `tsc --noEmit` 0 erros; `check-ui-standard` sem violação
- [x] Verificação no navegador (24/10/2026, `c:/tmp/pwtest/portal-colab-tabela*.cjs`, servidor da frente, conta agente-leitura; zero escritas em `portal_tokens`/`portal_generate_token`, sem erro de console nem 4xx/5xx): na Garden, tabela com 5 colunas + Ações, busca, engrenagem de colunas e autofit; "Crescente" desligado até escolher um campo em Agrupar; agrupado por Situação e por Cargo, Crescente → Decrescente inverte os grupos, recolher todos esconde as linhas; busca sem resultado mostra o vazio; trocar de aba troca o título; em "Todas" o "Gerar acesso" fica desligado com o motivo. Na Alpa (3 links expirados): linhas "Expirado" com "Renovar" e grupos "Expirado 3 / Sem acesso 9". Largura de Situação/Último acesso ajustada depois do 1º print (quebravam em duas linhas).
- ⚠️ **Não visto na tela:** as linhas "Ativo" (prévia, copiar link, regenerar, revogar) — nenhuma organização tem link ativo e gerar um seria escrita em produção. Só passaram por typecheck.
- [ ] Publicação
