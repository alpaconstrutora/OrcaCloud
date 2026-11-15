---
target: Controladoria (6 abas)
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critique-controladoria\\components\\ControladoriaModule.tsx"
target_fingerprint: "sha256:3cfe6a1d902a3d92edc0043c7751f91eeba896d0cc029d64ddc163847a9c6634"
target_path: "C:\\D\\frentes\\critique-controladoria\\components\\ControladoriaModule.tsx"
timestamp: 2026-11-15T00-22-40Z
slug: components-controladoriamodule-tsx
---
Method: dual-agent (A: revisão de design isolada · B: detector + navegador isolado)

Alvo: Controladoria — ControladoriaModule.tsx + DREReport, DRESPEReport, WIPReport, BalanceteReport, CashFlowDashboard, DiarioReport em d2c7307b. Produção, escrita bloqueada (0 escritas), 1440 e 390 px.

## Design Health Score

| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 1 | Resposta antiga sobrescreve a nova: filtro 2010–2010 com R$ 663.388/1.714 lançamentos; "Atualizar" → R$ 0,00 |
| 2 | Mundo real | 2 | Vocabulário de DRE certo; "-50.0%", "Total (1 obras)", WIP "Reconhecida" × "Recebida" |
| 3 | Controle e liberdade | 2 | Trocar de aba zera o período; sem "voltar" após drill de obra |
| 4 | Consistência | 1 | 4 cabeçalhos, 4 KPIs à mão, 3 barras de filtro, abas em caixa alta acima do título |
| 5 | Prevenção de erros | 1 | Corrida de respostas; de > até aceito; margem com denominadores diferentes DRE × SPE |
| 6 | Reconhecer × lembrar | 2 | "Previsto" explicado só em rodapé 2,5:1; "Sem Classificação" só em `title` |
| 7 | Flexibilidade | 2 | Ajuste de coluna; CSV em 2/6 abas; período não compartilhado |
| 8 | Estética | 2 | Limpo, mas título repete aba, "Atualizar" redundante, tabelas pela metade |
| 9 | Recuperação de erros | 1 | Erro = só toast; DRE em branco ou dado antigo |
| 10 | Ajuda | 2 | Rodapé do regime ajuda; vazio do Diário não orienta |
| **Total** | | **16/40** | **Ruim** |

## Especificidade
LLM: conteúdo de construtora (DRE contábil, amortização à parte, Caixa×Competência, SPE, WIP, drill por obra); forma genérica e costurada de seis épocas (cabeçalhos, KPIs, filtros e tabelas diferentes por aba; caixa alta abolida pela #348).
Detector CLI: exit 0, 2 achados `design-system-color` (#9ca3af) em CashFlowDashboard.tsx:188 e :209, verdadeiros (2,54:1 em 11px).
Navegador: injeção rodou nas 6 abas (18/7/13/6/15/11 anti-padrões); dominante `low-contrast` gray/slate-400 2,5–2,6:1 em subtítulos, "até", rótulos de KPI, Previsto, rodapé, vazio do Diário; âmbar 2,1:1 (DRE), setas 1,42:1 (WIP). Falsos positivos: `text-occlusion` (rótulo do próprio overlay) e achados do shell.

## O que funciona
1. DRE contábil bem montada (DREReport.tsx:32-49).
2. "Por Obra" com drill-down (DREReport.tsx:387).
3. Regime explícito com rodapé; tabular-nums; sem rolagem horizontal da página em 390.

## Problemas prioritários
1. [P0] Números de outro período sem aviso — load sem descarte de resposta antiga (DREReport.tsx:264-288 e equivalentes em SPE/Balancete/WIP/Fluxo/Diário). Fix: contador de requisição/AbortController; escolher recarga automática OU "Atualizar". → harden
2. [P1] Abas não fecham entre si — Por Obra ignora regime/obra (DREReport.tsx:269), sem linha "sem obra" (R$ 1.002,90 × R$ 6.000), margem líquida bruta × líquida (financialReportService.ts:102 × :175), SPE zerada × DRE R$ 4.000, "Sem Classificação" -R$ 7.619 > resultado sem ação. → harden + clarify
3. [P1] Diário .limit(200) silencioso com KPIs de total (diarioService.ts:68); data padrão em UTC (WIPReport.tsx:45, DiarioReport.tsx:36). → harden
4. [P1] Abaixo de WCAG AA — contraste 2,5:1 geral, abas sem role=tab/aria-selected, campos sem rótulo, linhas clicáveis fora do teclado, foco = borda 1px em datas/selects de DRE/Fluxo, gráfico sem aria-label. → audit + polish
5. [P2] Seis abas, seis linguagens — período/regime por aba, abas uppercase com overflow (ControladoriaModule.tsx:47-63; 390 esconde 3 abas), tabelas de largura fixa, KPIs sem hierarquia (§4.2). → layout + distill

## Personas
Alex: perde período/regime por aba; CSV só em 2 abas; obra do topo ignorada; sem ir da linha aos lançamentos; Diário para em 200.
Sam: abas sem estado; datas sem nome; linhas do Por Obra/Balancete fora do teclado; "⚠ ▾ ↕" lidos crus; explicação em `title`; 4 Tabs por data.

## Observações menores
"Margem: —" com seta vermelha; Receita Bruta positive fixo (DREReport.tsx:365); Previsto redundante em Competência; 390: KPIs cortados no Fluxo/Diário, "ATÉ" vaza, "-" quebra sozinho; WIP px-6×px-4, tabela 1140 em 1114, setas 1,42:1; Fluxo degradê/grade/monotone (§28), Previsto = pendente acumulado, h1→h3; AppRouter.tsx:1040 `|| ''` (REGRA #5); props mortas.

## Perguntas
- "Sem Classificação" maior que o resultado não deveria abrir a tela?
- Um relatório do mês em seis ângulos, ou seis relatórios?
- WIP mede avanço físico ou só caixa por obra?
