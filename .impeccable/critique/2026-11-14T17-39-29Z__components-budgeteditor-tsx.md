---
target: Engenharia › Orçamento Analítico
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\D\\frentes\\orcamentos-lista-linha-acoes\\components\\BudgetEditor.tsx"
target_fingerprint: "sha256:712ced771c2a5ce21ea8e848b697788d8ea07bf0b1c053f3db72b0247fcc5482"
target_path: "C:\\D\\frentes\\orcamentos-lista-linha-acoes\\components\\BudgetEditor.tsx"
timestamp: 2026-11-14T17-39-29Z
slug: components-budgeteditor-tsx
---
Method: dual-agent (A: revisão de design isolada · B: detector + navegador isolado)

# Crítica — Engenharia › Orçamentos › Orçamento Analítico
Alvo: components/BudgetEditor.tsx + components/BudgetRow.tsx (origin/main deb0ca8e). Orçamento Garden em produção, escrita bloqueada (salvamento automático ao abrir e "Inline" bloqueados; nada gravado).

## Nielsen — 19/40 (Ruim, limite do Aceitável)
1 Visibilidade 2 — grupo vazio = "R$ 0,00"; "Salvar Alterações" da CPU não salva (só toast)
2 Linguagem 3 — "WBS (Work Breakdown Structure)" em inglês
3 Controle 1 — excluir item sem confirmação/desfazer; Esc não fecha menus/CPU/painel
4 Consistência 2 — 5 "Salvar"; "COMPOSIÇÃO" caixa alta; vazio cita "Nova Etapa" × botão "Novo Grupo"
5 Prevenção 1 — lixeira ao lado de "Salvar na Base"; CPU Inline editável bloqueada; BDI grava a cada tecla
6 Reconhecer 2 — ações só ícone; Ferramentas mistura análise/import/contrato
7 Flexibilidade 2 — busca/filtro/ordem bons; sem "ocultar vazias", "próximo item", atalhos
8 Estética 1 — 302 linhas "Nenhum item", 2.083 controles; ~4 linhas de tabela a 1280
9 Recuperação 3 — tarja "EAP perdida" + "Recriar etapas"; histórico de versões
10 Ajuda 2 — title em tudo; "(Esc)" promete o que não faz

## Especificidade
Conteúdo autoral (EAP, SINAPI, CPU, BDI por item, pendências, M.O/Mat/Equip); forma intercambiável (painel admin em árvore). DESIGN.md da raiz é só do Portal do Colaborador — app interno sem âncora de identidade.
Detector CLI: 5 advisory font-size; 13px ×2 falso-positivo (guia exige); reais: text-[9px] COMP/INS (BudgetEditor.tsx:3835) e "R$" (BudgetRow.tsx:374); 10px contador = aviso fraco.
Detector navegador (headless, sem overlay visível): código do item 2,6:1 e não cabe (87×71px); "R$" custo unit. 2,6:1; entrelinha 1,25×; card dentro de card (caixa BDI/Inline/Janela/Composição); placeholder 3,0:1; celular: toolbar transborda e corta à esquerda (BDI x=−52).

## Impressão
Garden tem 2 itens (04.01.01 R$ 91.850 + 05.01.03 R$ 81.800 = R$ 173.650); sem órfãos; grupos 04/05 corretos. A EAP abre toda expandida (BudgetEditor.tsx:714-722): 664 linhas, 302 vazias, 1º item a 7.991px. A tela esconde o orçamento.

## Pontos fortes
1. Recuperação EAP perdida × órfãos (:1934-2026). 2. Pendências como ícone + painel. 3. Recorte que respeita a estrutura (mover desligado com motivo; filtro abre o grupo).

## Problemas prioritários
- [P1] Árvore toda expandida, zeros escondem o orçamento → abrir só grupos com itens; agrupar subetapas vazias; "—" em vez de R$ 0,00; contagem+total no rótulo (§6.12). /impeccable distill + clarify
- [P1] Excluir e salvar enganam: handleDeleteItem sem confirmação (:1780-1783); "Salvar Alterações" da CPU só toast (:3883-3895); CPU Inline ignora isLocked (BudgetRow.tsx:363-379); Esc morto; abrir grava (último vence). /impeccable harden
- [P1] Tabela 1.668px em 1.122px esconde Preço total e ações; rolar perde o item → Item/Descrição fixos (§6.13.1), descrição line-clamp-2, ações raras no ⋮, total no rótulo. /impeccable layout
- [P2] Teclado/contraste: grupo/etapa/subetapa por div sem foco; CPU não prende foco; preço/BDI sem anel; 2,6:1 (código, R$, dica vazia); "BDI" só por cor. /impeccable audit + harden
- [P2] Toolbar ruidosa: 15 controles; rótulos quebram a 1440; Inline/Janela grava no projeto; BDI global junto de alternadores; corta no celular. /impeccable quieter

## Personas
Alex: sem próximo item/atalho; Tab ~2.000 controles; rolagem 2 eixos. Sam: grupos sem teclado; Esc; foco fora da CPU; BDI só cor. Orçamentista: numeração no nome à deriva ("11. FORROS" no grupo 13; "14.03. 13.02."); "R$ 7.332,745" (3 casas, BudgetRow.tsx:384); BDI "0" ambíguo; órfãos ignoram caixa mas árvore/totais não.

## Menores
Subtítulo em inglês; BLOQUEADO piscando; dica "+ Item" para botão só ícone; contador de pendências azul; colunas da CPU Inline desalinhadas.

## Perguntas
1. EAP-modelo de 16 grupos: ferramenta ou formulário a atravessar? 2. Por que o número mora no nome? 3. Por que a tela não se parece com a planilha que vai ao cliente?
