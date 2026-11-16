---
target: incorporação > empreendimento > Áreas NBR 12721
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critica-areas-nbr12721\\components\\blueprint\\TelaAreasNbr12721.tsx"
target_fingerprint: "sha256:b55a4f238dfd6aee55a5b49ca52662f9b1b9d86791338e388946b6e2f036be07"
target_path: "C:\\D\\frentes\\critica-areas-nbr12721\\components\\blueprint\\TelaAreasNbr12721.tsx"
timestamp: 2026-11-15T23-57-35Z
slug: components-blueprint-telaareasnbr12721-tsx
---
Método: dual-agent (A: revisão de design · B: detector + navegador), em sequência no mesmo perfil logado, sem um ver o resultado do outro.
Alvo: components/blueprint/TelaAreasNbr12721.tsx (origin/main c3096ecca), aberta em produção por Empreendimentos › 011 - Garden Cambuhy › "Áreas NBR 12721".

## Nota de saúde do design

| # | Heurística | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Cálculo bloqueado com cartões mostrando "0,00 m²" ×2 e "Unidades 0" em verde; nada diz que os 12 "a classificar" já entram pela sugestão. |
| 2 | Linguagem do usuário | 2 | Termos da norma certos; vazam MOTOR_007, SUGESTAO, PLANTA e UUID nas pendências. |
| 3 | Controle e saída | 2 | Escape fecha o drawer, lote = um Ctrl+Z, mas o desfazer é invisível; a seta volta ao editor da Planta, não ao Empreendimento. |
| 4 | Consistência | 3 | Componentes padrão; dois jeitos de salvar (gravação automática × "Salvar hipóteses"); cartão clicável feito com div. |
| 5 | Prevenção de erros | 1 | "Aplicar sugestões (12)" sem prévia; com 0 unidades classifica Dormitório/Suíte como comum; Ctrl+Z em campo de texto desfaz a planta. |
| 6 | Reconhecer em vez de lembrar | 2 | Drawer "Classificar 1 ambiente(s)" sem dizer qual; pendência aponta UUID. |
| 7 | Eficiência | 2 | Lote, busca, ordenação, setas nas abas; faltam filtro "só a classificar", agrupar, Shift+clique, exportar prévia. |
| 8 | Estética e economia | 3 | Calmo; ruído de 3 cartões zerados, subtítulo de 2 linhas nas 9 abas, barra de Declarados com 9 controles. |
| 9 | Recuperação de erros | 1 | "Área fora do padrão sem coeficiente · 723e9e65-…" sem ambiente nem conserto; quadros vazios sem botão. |
| 10 | Ajuda | 2 | Subtítulo e Hipóteses bons; nada explica colunas nem publicar → aprovar → memorial. |
| **Total** | | **20/40** | **Aceitável (piso da faixa)** |

## A tela é feita para este produto?
Revisão de design: vocabulário da norma bem usado; estrutura genérica (título + 9 abas + 4 indicadores + tabela + drawer). Quadros da tela não são os da norma: QI com 8 de 17 colunas, sem número nem grupo, total numa célula; utils/nbr12721/documento.ts:96-132 já monta colunas 2-18 numeradas + grupos + total por coluna para o PDF. O percurso classificar → congelar → aprovação técnica → jurídica → memorial vive no painel Versões (SecaoNbr12721DaVersao.tsx) e a tela não o menciona.

Detector: análise do código = 10 achados advisory design-system-font-size (2 na tela :299, :412), exit 0, todos alarme falso (régua = DESIGN.md do Portal do Colaborador). Navegador (8 estados): número das abas 2,6:1 (TabsBar.tsx:48, compartilhado); trilha "Planta Inteligente · Analisar" 2,5:1 e descrição ~169 caracteres por linha (BlueprintEditor.tsx:12085/:12091, cabeçalho comum da Planta); h1 → h3 (skipped-heading); textos de exemplo 3,0-3,4:1 (relevante só "a desenhada" em Hipóteses). Concordância: contraste do número das abas e da trilha, busca de Declarados cortada, UUID na pendência. Só o detector: salto de nível de título. Só a revisão: problemas de fluxo. Alarmes falsos: 10 da análise do código, 9 text-occlusion (etiquetas do overlay), barra lateral e topo.
Overlay: injetado em Chrome sem janela, fechado; nenhum overlay visível ao usuário.

## Impressão geral
Base de cálculo séria e honesta (sugestão × confirmado, não inventa coeficiente); a tela em volta trata um documento de cartório como mais uma tabela: bloqueio escondido entre 9 abas, pendência aponta UUID, ação mais arriscada é um clique sem prévia, percurso sem começo nem fim. Maior oportunidade: parecer o documento que produz e sempre dizer o próximo passo.

## O que funciona
1. Sugestão × confirmado distinguível em toda linha (âmbar 5,0:1); lote = um Ctrl+Z (:733-742).
2. Não inventa número: hipótese vazia vira pendência, nomeia o responsável técnico; drawer só mostra campos que valem.
3. Teclado básico: setas/Home/End nas abas, drawer prende foco e devolve; todo botão desligado diz o motivo.

## Problemas prioritários
[P1] A aba Pendências não leva a lugar nenhum. UUID + MOTOR_007, sem ambiente nem conserto; quadros vazios sem botão; cartão "Cálculo bloqueado" = div com clique, sem papel de botão, fora do Tab (KpiCard.tsx:291). Correção: nome/pavimento/unidade + frase do conserto; "Resolver" abre drawer com os itens ou Hipóteses com o campo em foco; código interno só no title; cartão usa `acao`; faixa de bloqueio no topo. → /impeccable clarify

[P1] O momento de maior risco não tem trava. 0 unidades sem aviso ("Unidades 0" verde); sugestão faz Dormitório/Suíte comuns; "Aplicar sugestões (12)" sem confirmação (:868-878); drawer em lote herda a 1ª linha (:188-199); "Voltar a 'a classificar'" sem confirmação; Ctrl+Z não ignora campos de texto (BlueprintEditor.tsx:3346-3373; o Ctrl+D ignora) e desfaz o rascunho real. Correção: checagem de 0 unidades com link para Unidades; confirmação com resumo por classe e mudança na área equivalente; aviso "12 classificados · Desfazer"; drawer em lote lista nomes e marca "valores diferentes"; confirmação em "Voltar"; Ctrl+Z ignora INPUT/TEXTAREA/SELECT. → /impeccable harden

[P1] O percurso não tem começo nem fim. Entra por "Garden Cambuhy", chega em "Garden · Planta Inteligente · Analisar"; seta volta ao editor; `tela=` sai do endereço de propósito (BlueprintModule.tsx:168-181), F5 perde a tela e o link não serve ao jurídico; publicar/aprovar/baixar/levar ao Empreendimento em outro painel. Correção: trilha "Garden Cambuhy › Áreas NBR 12721" com volta ao Empreendimento; faixa de etapas Rascunho → Versão congelada → Técnica → Jurídica → No Empreendimento com a próxima ação; "Baixar prévia". → /impeccable shape

[P2] Quadros da tela não são os da norma; botão da linha fora da tela. QI 8/17, QII 9/19, rótulos abreviados, total numa célula; Classificação com tabela de 1260 px em área de 1122 px (janela de 1440), "Classificar" fora da vista e nome some ao focar. Correção: colunas do documento.ts (dois níveis, "(n)", total por coluna); coluna Ambiente fixa e linha abre o drawer. → /impeccable layout

[P2] Nove abas no mesmo nível. Mistura o que se preenche com o que sai calculado; Hipóteses por último; Pendências como aba; barra de abas quebra em 2 linhas a 1280. Correção: grupos Entrada (Ambientes, Acessórios, Hipóteses) e Quadros (I, II, IV-B, Frações como seletor); Pendências como faixa sempre visível. → /impeccable distill

## Pontos de falha por persona
Alex: sem filtro "só a classificar"/agrupar; sem Shift+clique; 24 paradas de Tab para 12 linhas; Hipóteses perdidas ao trocar de aba; F5 perde a tela; Ctrl+Z na busca desfaz a planta.
Sam: cartão bloqueado fora do teclado; caixas de seleção sem nome; 12 "Classificar" idênticos; foco começa no body; número das abas 2,5-2,6:1 e trilha 2,5:1; h1 → h3.
Renata (responsável técnica): 0 unidades num "Edifício Residencial" sem aviso; suíte sugerida como comum; UUID sem caminho para Hipóteses; não liga ambiente a unidade aqui; quadros sem colunas numeradas; nada diz publicar + aprovação técnica e jurídica antes do memorial.

## Observações menores
- "Classificar" na linha apaga a seleção em lote já feita (:856-858); cancelar deixa a barra "1 selecionado(s)" flutuando.
- Número de Pendências cinza mesmo com item que bloqueia.
- Plurais "(s)".
- Legendas dos cartões cortadas ≤1280.
- Cartão de sucesso com ✓ âmbar + "Avisos".
- Aviso de só leitura solto, fácil de perder.
- Acessórios: "— sem dona" text-gray-400 (≈2,6:1); dormitórios como candidatos.
- Declarados: busca espremida; "Modelo" ambíguo.
- Painel Versões: h3 em caixa alta, 10-11px slate-400 (contra #348 e o contraste).
- Empreendimento: botões do cabeçalho quebram em 2 linhas a 1440/1280; rótulos da Visão Geral 2,6:1.

## Perguntas para pensar
1. Se o produto final vai ao cartório, por que a tela não se parece com ele, se o PDF já se parece?
2. Quadro com sugestões não confirmadas deveria "sair", e poder ser congelado e aprovado?
3. Por que o que bloqueia é uma aba entre nove, e não a primeira frase da tela?
4. E se isto fosse uma aba do Empreendimento, com a Planta como "abrir desenho"?
5. O que dizer quando um "Edifício Residencial" tem 0 unidades e ambientes chamados Dormitório e Suíte?

## Como foi feito
Garden real só olhando; nenhuma tentativa de gravação nas execuções registradas; hash das linhas do estudo e do rascunho idêntico antes, entre e depois. Só pelo código: quadros com cálculo concluído, só leitura, erro do editor, painel Versões, Ctrl+Z. Larguras 1440/1280/1024/768/390.
