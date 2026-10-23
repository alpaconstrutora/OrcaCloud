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
- [x] `npm run ci` verde — a suíte local caiu no `blueprintCasaAutomatica` (V8/Node 24, `(vizinhos.get ?? []) is not iterable`, arquivo não tocado); o portão foi a CI do PR #112, `ci` 16m54s verde

### 4. PR e publicação
- [x] PR + CI — PR #112, `ci` 16m54s, Vercel e Vercel Preview Comments verdes
- [x] publicação — mesclado por squash em 23/10/2026 (`910467e2`); `conferir-producao.sh "Adicionar rubricas recorrentes" "Remover da folha deste colaborador"` provou o domínio servindo 910467e

---

## Pedido posterior (23/10/2026, mesma sessão)

> o drwaer Adicionar rubricas recorrentes nao esta mostrando todas as rublicas

Decisões do usuário: **"Permitir adicionar qualquer uma, com valor"** e o valor é **"R$ ou % do salário"**.

### Diagnóstico (dado do banco, 23/10)
- 33 rubricas ativas; o drawer mostrava 11. O filtro `active && is_automatic && !is_clt_mandatory` (herdado da
  tela antiga) escondia 20 não-automáticas + 2 Padrão CLT.
- Não era só a tela: o motor só lançava vínculo de rubrica `is_automatic`, e o vínculo não tinha valor. 19 das 20
  escondidas são de cálculo manual (Gratificação, Hora Extra, prêmios…) e nunca entrariam.
- Vínculos existentes (8): ADIANTAMENTO ×3 e CONTRIBUIÇÃO ASSISTENCIAL ×2 (percentual da rubrica, funcionam);
  FGTS ×2 e IRRF ×1 (tributos que o motor calcula — o vínculo não faz nada).

### Regra (`lib/payrollRubricaRecorrente.ts`, usada pela tela e pelo motor)
- Travadas, com motivo: `category = 'tax'` (INSS/IRRF/FGTS) "Calculada pela própria folha"; Padrão CLT ou
  `category = 'base'` "Padrão CLT: já entra para todo CLT"; `category = 'termination'` "Só entra na rescisão".
- Vínculo leva `valor_tipo` (`fixo` = R$/mês, `percentual` = % do salário da competência, em pontos) e `valor`.
  Sem valor = cálculo da própria rubrica (os vínculos existentes não mudam). Manual sem valor: a tela não salva.
- Evento manual do mesmo código no mês continua substituindo o recorrente.

### Itens
1. [x] `supabase/migrations/aplicar_20271023600000_rubrica_recorrente_valor.sql` (nasceu `…23300000` e colidiu com `aplicar_20271023300000_preferencias` do #113 no rebase; renomeada — já estava aplicada com o nome antigo) — colunas + CHECK + RPC
   `salvar_rubricas_recorrentes_colaborador` (REVOKE PUBLIC/anon) + `update_employee_rubrics` antiga preservando o
   valor. Aplicada em 23/10 (`db query --linked -f`): colunas presentes, `anon` sem EXECUTE, 8 vínculos intactos
   com valor NULL. A prova do CHECK (bloco desfeito no fim) achou `fixo` + valor NULL ACEITO (`NULL >= 0` passa
   num CHECK) — corrigido com `valor IS NOT NULL` e reaplicado: os 3 inválidos recusados, o válido aceito.
2. [x] `lib/payrollRubricaRecorrente.ts` + `__tests__/payrollRubricaRecorrente.test.ts` (5 verdes; pegou o
   arredondamento `1621 × 0,075 = 121,57499…`, conta agora em centavos)
3. [x] `services/payrollService.ts` — `EmployeeRecurringRubric`; leitura com valor; gravação pela RPC nova
4. [x] `services/payrollEngine.ts` — `linkedRubricValues`; seleção pela regra da lib; valor do colaborador antes do
   cálculo da rubrica. `__tests__/payrollEngine.rubricaRecorrenteValor.test.ts` 7 verdes; vizinhos do motor verdes
5. [x] `components/LaborEmployeeRubricPicker.tsx` — todas as ativas não incluídas; travadas sem checkbox, com motivo
6. [x] `components/LaborEmployeeForm.tsx` — coluna Valor (R$ / % do salário), placeholder com o cálculo da rubrica,
   manual vazia em vermelho e Salvar bloqueado com os nomes; `LaborRubrics.tsx` texto da rubrica manual
7. [x] `__tests__/components/LaborEmployeeFormRubricasAdicionar.test.tsx` — 4 verdes
8. [ ] portões (tsc rc=0 ✅, check-ui-standard 0 violações ✅, suíte) + PR + CI + publicação
9. [ ] conferência na tela real
