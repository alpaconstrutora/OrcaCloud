---
target: recursos humanos > Dashboard RH
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critica-dashboard-rh\\components\\LaborRHDashboard.tsx"
target_fingerprint: "sha256:6d886eabe8424084c9a977787aa61809a49f2b57c6a30012ae2367beacf6aaf2"
target_path: "C:\\D\\frentes\\critica-dashboard-rh\\components\\LaborRHDashboard.tsx"
timestamp: 2026-10-29T15-36-33Z
slug: components-laborrhdashboard-tsx
---
# Crítica 2 — Recursos Humanos › Dashboard RH (25/40, Aceitável; antes 13/40)

Heurísticas: 1=3 esqueleto/falha por faixa; erro da folha vira "nenhuma folha" · 2=3 fórmula na legenda fala ao analista · 3=2 sem mês nem recorte por org · 4=3 §4.5 à risca; 2 links mesmo destino; set/26 sob "Outubro" · 5=2 absenteísmo 0% sem lançamento desde 15/06; admissão futura conta · 6=3 pendência com nome; EPI sem nome · 7=2 sem período/quebra; Atualizar parcial · 8=3 apoio quase todo 0/— · 9=2 falha da folha e dos cargos muda · 10=2 meta e feriado sem explicação.

Especificidade: Pendências é da construtora (dobra CLT 137, ASO/NR); "O mês"/"Distribuição" genéricos (sem obra×pessoa, sem terceiro×CLT). Detector 0 (layout e --no-config), contraste/texto pequeno só medidos no navegador: menor 4,63:1; Tab 5 em ordem; 390px sem rolagem. Overlay não rodou (https→localhost pendurado).

## Prioritários
- [P1] Absenteísmo 0% "dentro da meta" sem medição (3 ausências no total, última 15/06/26). Fix: ausências lançadas 90d; 0 → "—" + "Lançar ausências". → harden + clarify
- [P1] Folha 100% "Administrativo / sem obra" não vira pendência; erro da folha = "nenhuma folha". Fix: pendência com limiar nomeado; estado de erro. → harden + clarify
- [P1] Headcount: iago Marques ATIVO com admissão 01/11/2026 conta; única admissão = terceirizado → turnover 5,3%; 7/12 sem cargo, 7/12 sem admissão. Fix: hire_date ≤ ref; terceiro à parte (#173); pendência de cadastro. → harden + clarify
- [P2] CA de EPI vencido (Capacete, 10/10/26) fora das pendências; "abaixo do mínimo" com 0≤0 e sem nome. → harden + clarify
- [P2] Diretoria sem período, série nem quebra por organização. → layout + shape

## Personas
Alex: mês fixo; Atualizar parcial; pontos pendentes de lista sem limite (corte >1000). Sam: nome acessível colado "gozarVer saldo de férias1"; ul sem rótulo; links 20px. Diretoria: "Todas" só soma; R$ da dobra e do sem-obra ausentes; 0% falso conforto; "Terceirizado" como função.

## Menores
Barra de 53px em 390px; vencimentos de desligados contam; contexto de obra ignorado; refDate congelado; contagem longe do rótulo; "Afastados" duplicado.

## Perguntas
1. Número em R$ de mês passado e sem obra ajuda a decidir? 2. Pendência que para obra amanhã — por que não por obra? 3. 0% sem lançamento é resultado ou processo quebrado?
