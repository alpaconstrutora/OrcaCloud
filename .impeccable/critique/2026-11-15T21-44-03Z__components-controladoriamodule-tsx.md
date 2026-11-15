---
target: Controladoria (6 abas) — 2ª rodada
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\D\\frentes\\critique-controladoria-2\\components\\ControladoriaModule.tsx"
target_fingerprint: "sha256:a696549e7f7b34b613f054ac604ca45ff814b13b381bb615f2f3a6f8468bdf0e"
target_path: "C:\\D\\frentes\\critique-controladoria-2\\components\\ControladoriaModule.tsx"
timestamp: 2026-11-15T21-44-03Z
slug: components-controladoriamodule-tsx
---
⚠️ DEGRADED: single-context para a Avaliação B (sub-agente B parou por limite semanal da API; síntese feita dos artefatos que ele gravou). Avaliação A isolada.

Alvo: Controladoria (6 abas) em origin/main 2d4e0d2c, após o plano de 6 passos (#448 #451 #458 #461 #467 #471). Produção, escrita bloqueada (0).

## Design Health Score
| # | Heurística | Antes | Agora | Ponto-chave |
|---|---|---|---|---|
| 1 | Visibilidade | 1 | 3 | estados ok; falta "quanto está pendente" nos KPIs |
| 2 | Mundo real | 2 | 3 | abreviações na SPE; custo positivo no Resumo |
| 3 | Controle | 2 | 2 | sem atalhos de período; obra fixada sem "limpar" visível |
| 4 | Consistência | 1 | 2 | sinal Resumo × Por Categoria; verde/vermelho por sinal nas tabelas |
| 5 | Prevenção | 1 | 3 | período inválido não consulta; Caixa padrão induz "prejuízo" |
| 6 | Reconhecer | 2 | 3 | motivo de "Não se aplica" só no title |
| 7 | Flexibilidade | 2 | 2 | sem comparativo; select de 15 obras sem busca |
| 8 | Estética | 2 | 3 | ruído de zeros (SPE, Por Obra) |
| 9 | Recuperação | 1 | 3 | Tentar de novo; gaveta explica motivos |
| 10 | Ajuda | 2 | 3 | subtítulo, nota SPE, rodapé, "como resolver" |
| **Total** | | **16/40** | **27/40** | **Bom** |

## Detector
CLI: 6 advisory, todos falsos positivos (text-[13px] = §17; #e2e8f0/#f8fafc = §28.2; régua é o DESIGN.md do Portal do Colaborador). Navegador (6 abas): 0 achados na Controladoria; shell: Ctrl K 10px/3,1:1, contadores 3,6–4,49:1; "Sincronizando Opura…" 3,75:1. 0 controles sem nome; 0 clicáveis sem teclado; foco visível exceto o calendário nativo do input date; 390 px sem rolagem em 5 abas (Diário: página travou na medição).

## O que funciona
1. Escopo único com "Não se aplica". 2. "Sem classificação" como fila com caminho (gaveta acessível). 3. Estados honestos.

## Problemas prioritários
1. [P1] DRE abre em Caixa: −125,5% contra +16,5% em Competência; pendente de R$ 1,37 mi abaixo da dobra, sem ação (DREReport.tsx:400-409, escopo.ts:36) → clarify (decisão de produto)
2. [P1] Duas convenções de sinal na DRE: Resumo +6.000 com rótulo vermelho × Por Categoria −6.000 com valor vermelho (DREReport.tsx:122-125 × :161) → polish
3. [P2] Tabelas pintam por sinal contra o §4.5 (Balancete, SPE, Por Obra, Diário) → quieter
4. [P2] Ação pela metade: linhas da gaveta não abrem a origem; Contas a Pagar sem filtro → harden
5. [P2] Campo desligado: motivo só em title (inacessível), cinza-50 ≈ branco, "De" do WIP mostra data (BarraDeEscopo.tsx:27-78) → clarify

## Personas
Alex: sem atalhos de período; sem comparativo; CSV com vírgula e sem BOM (Excel pt-BR); seta ↓ em margem positiva ≤20% no WIP; "Saldo de contrato R$ 0,00" sem contratos.
Sam: Tab lógico, setas nas abas, Enter nos grupos, gaveta prende foco; falham: motivo do "Não se aplica", carga a cada seta, sem aria-controls no grupo.

## Menores
Aviso cita "previsto" em Competência; Por Categoria fora da ordem contábil; Por Obra ignora o filtro de obra; eixo do Fluxo "2,3,5,6 mil"; Diário: Valor à esquerda sem tabular-nums, "Débitos = créditos" com 0; Balancete: 2× "Adiantamento"; 390: DRE esconde valores atrás de rolagem interna.

## Perguntas
Caixa ou Competência como verdade de abertura? Duas barras (Resultado × Contábil)? Os 65 sem classificação: número ou fila de trabalho?
