# Filtro avançado: valor escolhido da lista, não digitado

## Pedido original

> Existe um problema com o filtro avançado que esta propagado pelo app.
> no exemplo no print. o usuário fez um filtro com status, e no campo valor obrigado ele digitar manualmente e mesmo tendo digitado concluído o filtro nao foi aplicado pois deveria ser Concluído com C maisculo.
> O app sabe quais no exemplo quais são as opções possiveis para o status no campo valor. Então bastava listar os 3 para que o usuário escolhe-se, sem ter que digitar e cometer algum erro.
> implemente essa melhoria e se funcionar bem propagar para o restante do app

Sessão: 014aac40-d43f-4860-a6a2-8ec88ec255fe · 10/10/2026 (print: Minhas Tarefas ›
Filtro avançado com `Status · Não é · concluído`).

## Diagnóstico

A maiúscula **não** era a causa: `applyFilterRules` já comparava com `toLowerCase`. O
campo Status de `TasksList.tsx` era `type: 'text'` e o `getValue` devolvia `t.status`
(`open`/`done`/`snoozed`), enquanto a tabela mostrava o nome do status ("Concluído").
Nada do que se digitasse casava, nem "Concluído".

Levantamento em `origin/main` (10/10): 114 campos de filtro avançado em 18 telas, dos quais
31 de texto têm conjunto de valores conhecido pelo app. 4 comparam algo diferente do que a
célula mostra, e 3 listas `select` estão incompletas.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 10/10 | Listas grandes (fornecedor, obra, CC…): só escolher ou lista com busca? | **Lista com busca** (clicar abre tudo, digitar recorta, Contém continua) |
| 10/10 | Validar em Tarefas antes de propagar? | **Sim**: Fase 2 só depois do OK |
| 10/10 | (Fase 1 publicada em `7f963917`) | **"testei e funcionou perfeitamente. propagar pelo app"** → Fase 2 liberada |

## Plano

### Fase 1: infraestrutura + Tarefas

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1.1 | `components/ui/FilterUtils.tsx` | `text` + `options` vira lista com busca (`FilterValueCombobox`, portal); `select` marca valor salvo com caixa/acento diferente; operador salvo fora do tipo continua visível; comparação de texto sem caixa nem acento (`normalizarTexto`); `distinctOptions` exportado | `__tests__/filterUtils.test.ts` e `__tests__/components/AdvancedFilterPanel.test.tsx` verdes |
| 1.2 | `components/TasksList.tsx` | campos num `useMemo`; Status = `select` por nome (`uniqueStatusesByName`), `getValue` = nome do status; novos Responsável e Obra (lista com busca); Origem derivada de `MODULE_LABEL` (ganha "Ofícios") | "Status Não é Concluído" esconde as concluídas; a regra antiga "concluído" continua filtrando |
| 1.3 | `docs/ui_ux_guia_unificado.md` | §5.5 nova + item no checklist de auditoria | seção publicada |
| 1.4 | este arquivo | plano versionado (REGRA #6) | commit |

### Fase 2: propagar (após o OK do usuário)

Padrão por tela (guia §5.5): campo com conjunto conhecido → `select` (enum) ou `text` +
`options` (lookup), e `getValue` igual à célula.

- **Comparação ≠ tela:** Contas a Pagar status ("Atrasado"), Boleto beneficiário
  (`supplierMap` antes), Obras cliente ("Obra Própria" / cliente do vinculado).
- **Listas incompletas:** Obras status ("Paralisada"), Pedidos status ("Em Negociação"),
  Fornecedores tipo (vazio = Pessoa Física).
- **31 campos viram lista:**

| Tela | Nº | Campos |
|---|---|---|
| Extrato | 6 | cliente, credor, categoria, obra, CC, plano |
| Contas a Receber | 5 | |
| Pedidos | 5 | |
| Tributos | 4 | |
| Fornecedores | 2 | |
| Cotações | 2 | |
| Boleto, Clientes, Contas a Pagar, Operacional, Planejamento, Obras | 1 cada | |

- **Opções hardcoded** passam a derivar do mapa local: Labor status, FRM natureza, Contas a
  Pagar status.
- **Ficam texto de propósito:** descrições, nomes, documentos, e-mails; Investidor
  "Obra Vinculada" (várias obras por linha); Função do colaborador.

## Estado

- [x] 1.1 FilterUtils
- [x] 1.2 Tarefas
- [x] 1.3 Guia §5.5
- [x] 1.4 Plano versionado
- [x] Fase 1 publicada (`7f963917`) e validada pelo usuário (10/10)
- [x] Fase 2: 13 de 13 telas (10/10)
  - Extrato (`reconciliation/tabelasDaConciliacao.tsx` → `buildStatementFilterFields`): Cliente, Credor e Categoria = cadastro + valores das linhas (o nome cru do banco também é escolhível); Obra, CC e Plano vêm dos cadastros.
  - Contas a Receber: Parte, Empreendimento e Obra vêm das linhas; CC e Plano vêm dos catálogos.
  - Contas a Pagar: Fornecedor vira lista. **Corrigido:** status compara o efetivo ("Atrasado" virou opção; "É Pendente" não traz mais as vencidas).
  - Tributos: Tributo, Origem, Cliente e Empreendimento.
  - Boletos: Beneficiário vira lista. **Corrigido:** ordem da célula, com o cadastro antes.
  - Pedidos: 5 campos de lookup. Status é derivado da união pelo compilador (`satisfies`) e ganha "Em Negociação".
  - Cotações: Obra e Empreendimento.
  - Fornecedores: Categoria e Organização. **Corrigido:** Tipo vazio = Pessoa física, como a célula.
  - Clientes: Organização (valores das linhas, porque inclui "Todas as Organizações").
  - Plano Financeiro (Natureza) e Colaboradores (Status): opções derivadas do mapa local.
  - Obras: **Corrigido:** Cliente usa a mesma função da célula (`getClientCellValue`). Status Obra vem de `OBRA_STATUSES` (`types/project.ts`, também usada no ProjectModal) e ganha "Paralisada".
  - Planejamento: Cliente.
  - Operacional: Etapa.
- [x] Regra #1 nos arquivos tocados: PlanningList teve pílulas de status (§8) e "Abrir Gantt" (§9) corrigidos. ProjectModal segue com a acusação §3 de `searchTerm`, que é exceção §3.1: a busca fica na aba "selecionar obra" dentro do modal e não filtra a lista da tela.

### Observações fora do escopo (não feitas)
- Pedidos: o `statusOrder` da ordenação não tem "Em Negociação" (o status vai para o fim).
- Obras no contexto Diário: a coluna `status-obra` mostra "Total Registros", e o filtro "Status Obra" continua comparando `obraStatus`.
- Obras na visão em blocos: mostra `settings.client`, não o cliente da obra vinculada (divergência antiga entre as visões).
- Extrato, "— outra organização —": o filtro vê `''`, e "Não está configurado" pega esses casos.

## Verificação

- `npx vitest run __tests__/filterUtils.test.ts __tests__/components/AdvancedFilterPanel.test.tsx __tests__/taskStatusByName.test.ts __tests__/orgContextGuard.test.ts`
- `check-ui-standard.sh` em cada `.tsx` tocado; tsc com contagem de `error TS` = 0;
  `check-xss-sinks.sh`; `vite build`.
- Tela real: Minhas Tarefas › Filtro avançado › Status · Não é · Concluído some com as
  concluídas; Responsável/Obra abrem a lista com busca. A verificação com navegador logado
  depende da senha da conta de leitura, que não fica guardada. A interface foi provada pelo
  teste de componente (jsdom, painel real); quem valida a tela logada é o usuário (decisão
  "Validar Tarefas antes").
