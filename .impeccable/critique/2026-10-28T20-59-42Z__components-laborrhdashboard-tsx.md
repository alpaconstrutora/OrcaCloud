---
target: recursos humanos > Dashboard RH
total_score: 13
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critica-dashboard-rh\\components\\LaborRHDashboard.tsx"
target_fingerprint: "sha256:8f1642c569f2a9d5fe30c5d1d31074f4aa51cd5f855a7c54bb5579af02270d10"
target_path: "C:\\D\\frentes\\critica-dashboard-rh\\components\\LaborRHDashboard.tsx"
timestamp: 2026-10-28T20-59-42Z
slug: components-laborrhdashboard-tsx
---
# Crítica — Recursos Humanos › Dashboard RH (13/40, Ruim)

Heurísticas: 1=1 zeros mudos em "Todas", refDate fixa · 2=1 "vencendo" conta vencidas, turnover fora da definição · 3=2 sem troca de mês, atalho cai na sub-aba errada · 4=1 KpiCard §4 em vez de §4.5, limiar 5% fixo × turnover_max_pct do BI, 4 painéis de RH · 5=1 rh_kpis(NULL)=0, gráfico 12 × Ativos 10 · 6=2 alertas só com contagem · 7=1 sem drill-down, 3 cartões clicáveis sem sinal · 8=2 legendas redundantes, alertas zerados a 50% · 9=1 erro fala de RPC/migration · 10=1.

Especificidade: painel de RH genérico; obra só nos rótulos de alerta (ASO/NR, EPI). Detector: 0 achados (LaborRHDashboard.tsx + ui/KpiCard.tsx), exit 0; deixou passar classes dinâmicas em AlertItem (l.47-64). Overlay não carregou (https → localhost pendurado, provável permissão "Acesso à rede local").

## Prioritários
- [P0] "Todas" zera tudo com "Estável/Normal": rh_kpis faz org_id = NULL (confirmado no banco); gráfico por função mostra 12. Fix: NULL = orgs do membro + checagem de pertencimento; estado "escolha uma organização". → harden
- [P0] Custo/horas de time_entries (0 linhas) com folha em payroll_runs (22); getCostSummary sem filtro de data (laborService.ts:1040-1058). Fix: custo = folha da competência por org/obra; estado "não medido" §28.5. → harden + clarify
- [P1] Alertas "vencendo" sem limite inferior: férias vencidas em 15/10 (dobro) aparecem azul. Fix: Vencidos × Vencem; nomes+datas; link na sub-aba certa; zerado sai da grade. → clarify
- [P1] Turnover (denominador sem desligados, limiar fixo, seta sem comparação) e absenteísmo (dias corridos × úteis, INSS no numerador, pode passar 100%). → harden
- [P1] Teclado (onClick em div, KpiCard.tsx:165-172), contraste slate-400 ~2,6:1, seções em <p>, Turnover/Desligamentos/Afastados/Absenteísmo sem ação (Princípio 5). Fix: KpiCard destaque+acao, <h2>, gray-500. → layout + polish

## Personas
Alex: sem troca de mês, cliques invisíveis, sem drill-down, corte no 8º item, sem export/comparação. Sam: 3 cartões fora do Tab, ▲/▼ lido como triângulo, sem cabeçalhos, barras sem role=img, opacidade 0,5. Diretoria Alpa: zeros em "Todas", 10 × 12, sem custo de folha nem SPE nem tendência, férias em dobro em azul.

## Menores
organizations não usada (l.112); sort no lugar do cache (l.136); "por Função" pelo texto livre role; "Em Férias" = qualquer dia do mês; "Outubro De 2026"; employee_trainings × academy_* (hipótese); spinner de tela inteira. Segurança: rh_kpis SECURITY DEFINER, EXECUTE para authenticated, sem organization_members.

## Perguntas
1. Um número só: pessoas em obra hoje ou custo de MO do mês por SPE?
2. Quatro painéis de RH — qual é a verdade sobre turnover?
3. Vencido (dobro/NR) no mesmo cartão discreto que "vence em 60 dias"?
