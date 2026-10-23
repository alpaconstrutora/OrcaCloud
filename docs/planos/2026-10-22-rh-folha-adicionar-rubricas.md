# RH › Colaborador › Folha de Pagamento — "Adicionar" rubricas recorrentes por seletor

## Pedido original (22/10/2026, sessão 8b3a48d5)

> recursos humanos > colaborador> Folha de pagamento:
> inves de listar todas as rublicas e marcar com o switch quais serão recorrentes, sugiro um botão chamado adicionar, que ao clicar abre-se um modal com todas as rubicas onde o usuário pode selecionar quais ele quer adicionar, podendo ser mais de uma atraves de um checkbox. Incluit também uma barra de pesquisa

Decisão do usuário (mesma sessão, pergunta sobre a REGRA #4): o seletor é **painel lateral (drawer)**,
não modal central — segue `UI_PATTERNS.md` e os seletores de Suprimentos (`SCAlmoxarifadoPicker` etc.).

## Contexto

A aba **Folha de Pagamento** de `components/LaborEmployeeForm.tsx` listava **todas** as rubricas
automáticas não-CLT num `StandardTable`, com um `TableSwitch` na coluna "Incluir". As incluídas são
`recurringRubrics: string[]` (códigos), gravadas no "Salvar" por
`payrollService.updateEmployeeRecurringRubrics` (RPC `update_employee_rubrics`).

Agora a aba mostra **só as incluídas**, com **Adicionar** (drawer com as que faltam: busca + checkbox,
várias de uma vez) e **Remover** por linha. **Nada muda no banco nem no service.**

## Itens

### 1. `components/LaborEmployeeRubricPicker.tsx` (novo)
- **O que muda:** drawer `Sheet size="4xl"` "Adicionar rubricas recorrentes" — `StandardTable` com
  `selection`, busca transitória (§3.1), rodapé "Cancelar" / "Adicionar N rubricas" (desligado diz
  "Marque ao menos uma rubrica."). Sai por portal em `document.body` com `zIndex 10000` e monta só ao
  abrir (mesmo arranjo do `ClientSelect`), porque na criação o formulário é um overlay `z-50`.
  Exporta `RUBRIC_COLUMNS`, `renderRubricCell`, `rubricSortValue`, `rubricSearchText` — as duas tabelas
  leem igual, sem cópia.
- **Pronto quando:** teste de tela abre, busca, marca duas e adiciona; reabrir vem zerado.
- [x] feito — `__tests__/components/LaborEmployeeFormRubricasAdicionar.test.tsx` (3 testes verdes)

### 2. `components/LaborEmployeeForm.tsx` — aba `folha`
- **O que muda:** linhas = rubricas incluídas; coluna "Incluir"/`TableSwitch` sai; `actions` com
  `ActionIconButton kind="delete"` "Remover da folha deste colaborador" (sem confirmação: nada grava até
  o Salvar, e o Voltar já tem a guarda de alterações); botão **Adicionar** (§17) em `toolbarRight`.
  O catálogo carrega também as **inativas** (`listRubrics(true)`): um código incluído de rubrica
  desativada depois aparece com "(inativa)" e pode sair — antes ficava invisível e era regravado. O
  seletor continua só com as ativas, automáticas e não-CLT. Código sem cadastro aparece como "Não
  encontrada em Rubricas".
- **Pronto quando:** typecheck limpo + teste de tela (só incluídas, inativa visível, remover, Salvar
  manda a lista final) + conferência na tela real.
- [x] código + teste (typecheck rc=0, 0 erros)
- [ ] conferência na tela real (edição e criação) — NÃO feita antes de publicar: em 23/10 o usuário
      mandou "publicar" sem a senha do `agente-leitura`. Conferir em produção.

### 3. Verificação mecânica
- [x] `check-ui-standard.sh` nos 2 `.tsx`: 0 violações
- [ ] `npm run ci` verde

### 4. PR e publicação
- [ ] PR + CI
- [ ] publicação (só com autorização do usuário)
