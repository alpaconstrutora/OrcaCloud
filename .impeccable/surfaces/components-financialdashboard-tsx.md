---
version: 1
slug: "components-financialdashboard-tsx"
primary_target: "components/FinancialDashboard.tsx"
related_targets: []
---

# Dashboard financeiro

Modo: **Operate**. Mundo: o do app interno (`docs/ui_ux_guia_unificado.md`), sem mudança.

Público: financeiro/cobrança (age em Contas a Receber/Pagar) e diretoria (saúde do caixa).
Tarefa: em 10 segundos, saber o que já venceu, o que vence, quanto há nos bancos e o que
espera aprovação; depois, o que entrou e saiu no período. Todo número que preocupa leva à
tela onde se resolve (PRODUCT.md, princípio 5). Detalhe por obra e projeção de 90 dias moram
na Inteligência Financeira — aqui só o link.

Plano: `docs/planos/2026-10-28-dashboard-financeiro-hoje-e-periodo.md`.

## Direction contract

THESIS: duas leituras empilhadas e separadas: "Hoje" (não depende de período) em cima e
"Resultado do período" embaixo. Recusa o painel-padrão de oito cartões coloridos de mesmo
peso, que lê o fluxo do mês e esconde o vencido.

OWN-WORLD: guia unificado: chão cinza-50, cartões brancos `rounded-[10px]`, texto gray-900/600,
azul-600 só em ação e na série principal, cinza #94a3b8 na série de contexto. Cor de estado
(amber-700 atenção, red-700 alerta) só por LIMIAR, sempre com ícone e texto.

STORY: quem abre vê primeiro o vencido a receber e a pagar e o saldo do banco com a sua base;
clica na ação do número e cai na tela que resolve; desce para conferir o período.

FIRST VIEWPORT: h1 + subtítulo; faixa "Hoje" (h2 + data) com 4 KpiCard destaque em linha
(Saldo nos bancos, Vencido a receber, Vencido a pagar, Aguardando aprovação), cada um com a
ação; abaixo, 4 cartões cinza pequenos (7 e 30 dias). Em 1440×900 a faixa do período começa
visível, com o seletor Mês/Trimestre/Ano na linha do seu h2.

FORM: Painel em faixas, 5º da minha lista ordenada (o sorteio o pôs na frente);
seed:32b62aa4461c86f9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
