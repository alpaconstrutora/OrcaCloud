---
target: Engenharia › Orçamento Analítico (2ª rodada)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\D\\frentes\\orcamentos-lista-linha-acoes\\components\\BudgetEditor.tsx"
target_fingerprint: "sha256:e08c0aac3da228d2a0996c703c9ef2c94cbfb549d04eb4c266ae40485a7f6402"
target_path: "C:\\D\\frentes\\orcamentos-lista-linha-acoes\\components\\BudgetEditor.tsx"
timestamp: 2026-11-14T19-51-24Z
slug: components-budgeteditor-tsx
---
Method: dual-agent (A: revisão de design isolada · B: detector + navegador isolado)

# Crítica (2ª rodada) — Engenharia › Orçamentos › Orçamento Analítico
Alvo: BudgetEditor.tsx + BudgetRow.tsx em b02b4ec9 (7 passos da 1ª crítica no ar). Garden em produção, 0 gravações em 6 sessões (antes: 1 ao abrir).

## Nielsen — 20/40 (antes 19/40)
1 Visibilidade 2 — auto-save invisível + "Salvar" sem estado; base SINAPI não aparece
2 Linguagem 2 (era 3) — CPU: "Preço unitário" ao lado de subtotais × quantidade; "Qtd" em vez de "Coef."
3 Controle 3 (era 1) — rascunho, Descartar, Esc, foco devolvido; CPU "abaixo do item" grava a cada tecla
4 Consistência 1 (era 2) — 2 modos de CPU com regras opostas; 6 "Salvar"; bordas pretas; caixa alta na CPU
5 Prevenção 2 (era 1) — trava Fechado + confirmação; BDI 0% sem alerta
6 Reconhecer 2 — BDI herdado só em placeholder 1,5:1; Preço total fora a 1280
7 Flexibilidade 2 — sem atalhos/lote; 9 Tabs por item
8 Estética 2 (era 1) — 25 linhas (eram 664), mas 16 faixas pretas iguais, cheias ou vazias
9 Recuperação 2 (era 3) — painel de pendências; resto toast
10 Ajuda 2 — só title; nada explica BDI global × item
Leitura: o que os 7 passos atacaram melhorou (medido); a rodada achou problemas mais fundos; parte é variação entre avaliadores.

## Especificidade
Autoral na função, intercambiável na forma. Falta o autoral principal: a base de preço (SINAPI mês/UF/desoneração).
Detector CLI: BudgetRow limpo (antes 1); BudgetEditor 4 avisos (2 falso-positivo 13px, 1 disabled×fundo, 1 contador 10px inconclusivo).
Navegador: placeholder do BDI do item 1,5:1 (BudgetRow.tsx:264, carrega o BDI herdado); leading 1,25× na descrição; placeholder da busca 3,0:1 (convenção). 390: nada fora da tela; A mediu área da tabela com 15px de altura.

## Pontos fortes
1. Janela da CPU com rascunho. 2. Pendências → ação. 3. Grupo diz o que tem; identificação fixa.

## Problemas prioritários
- [P1] Base de preço fora da tela; BDI 0% calado → chip "SINAPI 09/2026 · MG · Desonerado" (abre rebase); BDI 0% como pendência. /impeccable clarify + harden
- [P1] Dois modos de CPU com regras opostas (janela = rascunho; abaixo do item = grava a cada tecla, BudgetEditor.tsx:1872); bloco de baixo cortado e desalinhado; CPU soma total, não unitário → uma regra; sticky §6.13; Coef. × Preço = Parcial por unidade. /impeccable distill + clarify
- [P1] Grupos vazios dominam; Expandir = 704 linhas (302 vazias); parte fixa 58% a 1280 → grupo vazio atenuado/"14 grupos sem itens · Mostrar"; Expandir só com itens; fixar menos. /impeccable layout + quieter
- [P2] Teclado: botão da CPU sem anel (BudgetRow.tsx:182); Ferramentas/Gerenciar sem aria-expanded; menus sem setas; campos sem nome; selo duplicado no Tab; foco não entra no "descartar?". /impeccable harden
- [P2] Acabamento: border sem cor = preto (BudgetRow.tsx:232/253, pré-existente); caixa alta na CPU; 6 "Salvar"; "Salvar" sem estado. /impeccable polish

## Personas
Alex: sem atalhos/lote; Expandir inutilizável; 9 Tabs/item. Sam: foco invisível na CPU; menus sem setas; campos sem nome; aria-label em span ignorado; estrela 1,43:1. Orçamentista: sem base SINAPI; CPU total × unitário; BDI 0%; título não diz o orçamento; "preciso Salvar?".

## Menores
⋮ do item: mover desligado sem motivo; "Mais Opções" Title Case; "+" com 3 cores; KPIs quebram a 1280 (−74px); crítica ao §5.3: "Novo Grupo" é a ação azul, mas a frequente é adicionar item.

## Perguntas
1. EAP-modelo de 16 grupos com 2 usados: modelo ou orçamento? 2. Orçamento sem base SINAPI na tela é auditável? 3. Qual modo de CPU o orçamentista usa, e por que o outro existe?
