---
target: Engenharia › Orçamentos (lista)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\D\\frentes\\critica-orcamentos\\components\\ProjectList.tsx"
target_fingerprint: "sha256:772e1542359c83a4d5d1510dc387e4be9dac94acb634b3e4fbf4f004cd75a824"
target_path: "C:\\D\\frentes\\critica-orcamentos\\components\\ProjectList.tsx"
timestamp: 2026-11-14T13-10-34Z
slug: components-projectlist-tsx
---
Method: dual-agent (A: revisão de design isolada · B: detector + navegador isolado)

# Crítica — Engenharia › Orçamentos (lista)
Alvo: `components/ProjectList.tsx` (contexto Orçamentos), lido de `origin/main` (8d90cd4f). Inspecionado em produção, logado, com toda escrita no banco bloqueada (0 escritas).

## Nota de saúde do design (Nielsen)
| # | Heurística | Nota | Problema-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | "Em andamento" (Status) e "Não Iniciado" (Status Obra) na mesma linha, sem explicar a diferença |
| 2 | Linguagem do usuário | 2 | "Ver Detalhes" abre o formulário de edição; "Bloqueio/Livre" = "pode excluir"; busca promete "obra ou cliente" |
| 3 | Controle e liberdade | 2 | Busca sem limpar; vazio sem "Limpar busca/filtros" |
| 4 | Consistência | 2 | Três caminhos para abrir/editar; cores de status diferentes na grade e na tabela |
| 5 | Prevenção de erros | 3 | Excluir desligado com pedido vinculado, com motivo; confirmação danger |
| 6 | Reconhecer > lembrar | 2 | Status, Bloqueio e Ações fora da tela; ao rolar, o nome some |
| 7 | Flexibilidade | 2 | Colunas configuráveis e Agrupar, mas busca não acha pelo código e sem atalho |
| 8 | Estética minimalista | 1 | 4 KPIs genéricos p/ 5 registros, coluna inteira "-", pasta repetida, 2 controles sempre desligados |
| 9 | Recuperação de erros | 2 | Com filtro avançado, o vazio diz "Cadastre seu primeiro orçamento" (falso) |
| 10 | Ajuda | 2 | Só title de hover |
| **Total** | | **20/40** | **Aceitável (limite inferior)** |

## Veredito de especificidade
Intercambiável: molde da casa (título + 4 KPIs + toolbar + tabela), mesmo componente de Obras/Planejamento/Diário. Nada de orçamento (valor, data-base, BDI, versão, aprovação). Coluna mais destacada é uma permissão (Bloqueio).
Detector CLI: 5 advisory `design-system-font-size`; 4 falso-positivos (DESIGN.md da raiz é do Portal do Colaborador; guia exige text-[13px]); 1 real: `text-[9px]` no selo de Tipo de Obra da grade (ProjectList.tsx:1263).
Detector no navegador (injeção por conteúdo; headless, sem overlay visível): subtítulo :927 2,5:1; placeholder da busca 3,0:1; contador do grupo Agrupamento.tsx:123 3,9:1. Achados de sidebar/topo/ContextSelector são da casca, fora do alvo; text-occlusion = etiqueta do próprio detector.

## Pontos fortes
1. Exclusão protegida pelo dado (cascata com obra mestre, motivo no title).
2. Agrupar lê o texto da célula; ordem de fluxo; desligados dizem por quê.
3. Obra Vinculada com "(sugerido)"; cliente exibido = filtrado = ordenado.

## Problemas prioritários
- [P1] Teclado não abre orçamento: <tr> só onClick (:1169); grupo em div (Agrupamento.tsx:113); foco invisível na ordenação; ⋮ sem nome; grade/lista sem aria-pressed. → /impeccable harden
- [P1] Colunas de decisão e ações fora da tela (1777px em 1122px), linhas de 73px. → /impeccable layout
- [P1] Três caminhos p/ mesma ação; "Ver Detalhes" = editar; Analítico só na grade (:1305). → /impeccable clarify + distill
- [P2] KPIs genéricos com conta errada (:772-777) e sem ação (Princípio 5). → /impeccable distill
- [P2] Agrupar custa mais do que rende: 3 de 4 campos dão grupo único; "Crescente"/recolher sempre visíveis e desligados (crítica ao padrão §6.12). → /impeccable distill / quieter

## Red flags por persona
- Alex: busca sem código/obra vinculada; ordenação de Bloqueio ≠ cascata da célula (:742); Status Obra ordena A→Z mas agrupa por fluxo; chaves de busca/filtro/colunas compartilhadas com Obras/Planejamento/Diário.
- Sam: linha sem foco; grupo em div; foco invisível; ⋮ sem nome; contrastes 2,5 / 3,0 / 3,9:1; toast sem aria-live.
- Orçamentista: sem valor/data-base/BDI; "004" → nenhum resultado; "Livre" verde ≠ "tudo certo"; Status Obra do próprio orçamento × cliente da obra vinculada (a confirmar no banco).

## Observações menores
"suas orçamentos" + frase de marketing (:927); "Orcamentos" sem cedilha no topo; painel de filtros em caixa alta; "Novo Orçamento" × "Novo orçamento"; toLocaleDateString sem pt-BR; toolbar do celular um controle por linha.
Colateral: abrir um orçamento dispara auto-save (usePersistenceSync) → "Atualização" e a ordem padrão mudam só por olhar.

## Perguntas
1. Com 5 orçamentos, 12 colunas + Agrupar + 4 KPIs, ou uma lista que diga "qual mexer hoje e quanto vale"?
2. Por que a informação mais destacada é uma permissão, não o valor/data-base?
3. Se a linha abre o orçamento e "Ver Detalhes" abre o formulário, qual é o detalhe?
