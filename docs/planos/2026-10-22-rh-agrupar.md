# Recursos Humanos (+ Treinamentos) — "Agrupar" com ordem Crescente/Decrescente

## Pedido original
> implementar filtro agrupar em recursos humanos

> incluir também o botão de ordem de grupos (crescente e decrescente)
>
> Sessão: b860a2e1-10f9-4fc3-ad2d-aacbd42a7030 · 22/10/2026

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 22/10/2026 | Quais tabelas? | "Listas com o que agrupar": só lista de registros com coluna categórica de UM valor por linha. Fora: relatório agregado (BI Histórico/Coortes/Desvio, Custo por Obra, Custos, eSocial Painel), uma linha por pessoa sem outra categoria (Saldo de Férias, Banco de Horas, Encargos INSS, Relação por Empregado) e listas < ~10 linhas/config (Encargos terceiros/patronais, Pró-labore, Distribuição, Contas bancárias, VR Regras) — critério do guia §6.12. |
| 22/10/2026 | Treinamentos (saiu do menu do RH)? | Incluir (Registros, Atribuições, Catálogo, Painéis, Portal). |
| 22/10/2026 | Crescente/Decrescente? | Sim — já é parte do controle padrão desde o PR #85: o `StandardTable` liga sozinho; tabela feita à mão passa `direcao`/`onDirecao`. |
| 22/10/2026 | Rótulo do grupo quando a célula mostra código cru (PENDENTE)? | O MESMO texto da célula (§6.12) — o grupo não "melhora" o que a coluna mostra. |
| 22/10/2026 | Total do grupo | Só onde há dinheiro somável (custo, líquido, salário). Taxa unitária (custo unitário de EPI, valor/dia) não soma → só contagem. |

## Plano
Padrão: `StandardTable` recebe `agrupamento` (memoizado: `opcoes`, `chave` = o texto da célula, `semRotulo`, `ordem` para status/mês, `valor` só com dinheiro, `title`); tabela à mão usa `useAgrupamento` + `AgruparControles` (com `direcao`/`onDirecao`) + `agruparLinhas` + `entradasDaPagina`/`LinhaDeGrupo`, seleção sobre `linhasDaTela`.

| Tela | Arquivo | Campos de agrupar | Total | Como sei que terminou |
|---|---|---|---|---|
| Colaboradores | `LaborEmployeeList.tsx` (à mão) | Função, Organização, Vínculo, Status | Salário base | teste de tela + conferência real |
| Ponto | `LaborTimeTracking.tsx` | Colaborador, Obra, Status | Custo | idem (seleção de PENDENTE continua) |
| Folha › Ciclos | `PayrollRunList.tsx` (à mão) | Organização, Tipo, Centro de Custo, Plano de Contas, Status | Valor | idem |
| Folha › Alocações | `LaborAllocations.tsx` (à mão) | Cargo, Centro de Custo, Plano de Contas | Custo folha | idem |
| VR › Cálculo / Aprovados / Histórico | `LaborValeRefeicao.tsx` (à mão) | Colaborador, Obra, Status (+ Mês no Histórico) | Líquido | idem |
| VR › Feriados | `LaborValeRefeicao.tsx` (à mão) | Escopo, Obra | — | idem |
| Empreiteiros › Medições | `LaborContractors.tsx` | Empreiteiro, Obra, Status | Líquido | idem |
| EPIs › Catálogo / Entregas | `LaborEPIs.tsx` | Categoria, Status / Colaborador, EPI, Status | — | idem |
| Documentos | `LaborDocuments.tsx` | Colaborador, Categoria, Status | — | idem |
| eSocial › Eventos / Lotes | `LaborEsocial.tsx` | Evento, Grupo, Status / Grupo, Período, Status | — | idem (linha expandida continua) |
| SST › Checklists | `LaborSST.tsx` | Checklist, NR, Obra, Status | — | idem |
| BI › Movimentações | `LaborBIAnalytics.tsx` | Colaborador, Tipo (+ Organização em "Todas") | — | idem |
| Avaliação › Avaliações / Resultados / PDI | `LaborEvaluation.tsx` | Avaliado, Avaliador, Tipo, Status / Cargo, Classificação / Colaborador, Competência, Status | — | idem |
| Produtividade | `LaborProductivity.tsx` | Equipe/colaborador, Obra, Fase | — | idem |
| Incentivos › Habitualidade | `LaborIncentivos.tsx` | Colaborador, Incentivo, Status | Reflexo anual | idem |
| Rubricas | `LaborRubrics.tsx` (à mão) | Tipo, Status | — | idem |
| Treinamentos › Registros | `LaborTrainings.tsx` (à mão) | Colaborador, Curso, Origem, Status | — | idem |
| Treinamentos › Atribuições / Catálogo / Painéis | `academy/Academy*Tab.tsx`, `AcademyPanels.tsx` (à mão) | Curso, Tipo de alvo, Status / Categoria, Modalidade, NR / Cargo | — | idem |
| Treinamentos › Portal | `academy/AcademyPortalAccessTab.tsx` | Tipo, Status | — | idem |
| guia | `docs/ui_ux_guia_unificado.md` §6.12 | registrar RH/Treinamentos e as exclusões | — | texto |

Fora do pedido mas no mesmo PR: item 4 de `docs/planos/2026-10-22-casa-automatica-abas.md` (pendência do PR #98).

## Estado
- [x] levantamento das tabelas (agente Explore, 22/10)
- [x] implementação — 3 agentes em paralelo (StandardTable · Pessoas/Folha à mão · VR/Treinamentos à mão), revisão do diff (23 arquivos, proporcional, sem reescrita por fim de linha)
- [x] `StandardTable`: campo guardado fora das opções vale como sem agrupamento (achado na revisão: "Organização" do BI só existe em "Todas") + teste
- [x] testes de tela: `RHAgruparStandardTable` 6, `RHAgruparPessoasFolha` 8, `RHAgruparVrTreinamentos` 8, `StandardTableAgrupar` 6; existentes verdes (`LaborAllocations` 6, `TrainingPortalMobile` 7, `laborService` 4, `payrollUIHelpers` 45, agrupar de Financeiro/Cadastros/Suprimentos, `orgContextGuard`, `cabecalhoSemCinzaGuard`)
- [x] typecheck (rc=0, 0 erros; 1ª tentativa segfault do Node 24) + `check-ui-standard.sh` nos 21 `.tsx`: 0 violações
- [x] conferência na tela real (login de leitura, 11 telas, script `c:/tmp/pwtest/rh-agrupar-telas.js`): seletor desligado sem agrupamento, Decrescente = Crescente invertido, "Sem …" no fim, toolbar sem estouro, 0 escritas, 0 erros. Com dados: Colaboradores (7 grupos), Folha › Ciclos (2), Alocações (8), VR Histórico (26 meses), Documentos (3, modo lista), Rubricas (4), Treinamentos Registros (1). Sem dados para o usuário de leitura (só o controle conferido): Ponto, EPIs › Entregas, eSocial › Eventos, Medições
- [ ] PR + CI
- [ ] publicação

## Verificação
1. `npx vitest run __tests__/components/RHAgrupar.test.tsx` + suítes de agrupar existentes
2. `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado
3. Tela real (login de leitura): cada tela agrupa, Crescente/Decrescente inverte, "Sem …" no fim, toolbar sem estouro, 0 escritas.
