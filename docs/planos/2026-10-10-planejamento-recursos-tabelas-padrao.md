# Planejamento › Recursos — Funções, Trabalhadores e Alocação em tabela padrão

## Pedido original

Sessão de 10/10/2026 (Claude Code, VS Code), transcrito literalmente:

> 1. Menu Recursos > aba funcoes: transformar em tabela no padrao do app + botão de ajuste automatico de largura de colunas
> 2. Menu Recursos > aba trabalhadores: transformar em tabela no padrao do app + botão de ajuste automatico de largura de colunas
> 3. Menu Recursos > aba Alocação: transformar em tabela no padrao do app + botão de ajuste automatico de largura de colunas

"Menu Recursos" = Engenharia › Planejamento › vista **Recursos**
(`components/ResourceManagement.tsx`, montado por `FinancialSchedule.tsx` quando
`viewMode === 'resources'`).

## Decisões

- **"Tabela no padrão do app" = `StandardTable`** (§6.10 do guia): busca persistida,
  ordenação por cabeçalho, colunas configuráveis, arrastar/redimensionar, e o botão de
  **auto-ajuste de largura** (`MoveHorizontal`, §6.1.2) já embutido — é o item
  "botão de ajuste automático" do pedido, nos três.
- **Clique na linha edita** (§9.1); a coluna Ações fica só com o que não é a ação
  dominante (excluir). Em Alocação a ação da linha é **Confirmar** a sugestão (§9:
  texto azul).
- **Funções deixam de ser agrupadas por nome.** O card agrupava variações SINAPI com o
  mesmo nome e, quando havia mais de uma, **não deixava editar nem excluir nenhuma**
  ("Ver Todos" não fazia nada — comentário "Futuro"). Na tabela cada função é uma linha;
  ordenar por Nome junta as variações, e cada uma tem o seu Código.
- **Alocação**: o agrupamento por cargo + "Expandir/Recolher tudo" vira a coluna
  Função (ordenável). O filtro de período continua, como `FilterPopover` (§5.4) na
  toolbar. O banner azul "Motor de Alocação Inteligente" sai (cabeçalho hero fora do
  §20). O botão "Escolher / Contratar" das lacunas **não tinha `onClick`** — não vira
  coluna; a situação "Equipe incompleta" continua visível.
- `confirm()` nativo dos quatro "Excluir …" do arquivo vira `useConfirm()` (§14) —
  o checador de UI acusa o arquivo inteiro.

## Itens

### 1. Aba Funções em `StandardTable`
- **Muda:** grade de cards → tabela com Nome, Código, Origem, Custo/h, Custo HE/h,
  Custo por uso, Calendário, Trabalhadores; clique edita; Ações = excluir.
- **Pronto quando:** harness no navegador mostra a tabela com o botão de auto-ajuste;
  clicar no botão muda as larguras; clicar na linha abre o formulário com os valores
  da função; teste de componente cobre linha por função (inclusive duas com o mesmo
  nome) e excluir com `useConfirm`.
- **Estado:** ✅ feito (10/10). `components/RecursosTabelas.tsx` › `TabelaFuncoes`.
  Passeio `docs/spikes/recursos-tabelas/passeio.mjs`: 5 linhas (2 PEDREIRO),
  auto-ajuste muda as larguras, clique em ELETRICISTA abre o formulário com o nome,
  à vista (o formulário mora no topo da aba — passou a rolar até ele). Rótulo
  "Custo por uso" virou "Custo/uso" (quebrava em duas linhas).

### 2. Aba Trabalhadores em `StandardTable`
- **Muda:** grade de cards → tabela com Nome, Função, Equipe, Calendário, Alocações,
  Origem; clique edita; Ações = excluir.
- **Pronto quando:** idem item 1 (harness + teste), com Função e Equipe resolvidas pelo
  nome (não id).
- **Estado:** ✅ feito (10/10). `TabelaTrabalhadores`. Contato começa oculto
  (`defaultHidden` — o card não o mostrava); calendário herdado em cinza, com a origem
  ("Herdado da função") no `title`.

### 3. Aba Alocação em `StandardTable`
- **Muda:** cards agrupados por cargo → tabela com Função, Tarefa, Início, Fim,
  Origem, Situação, Trabalhador, Custo × orçado, Conflito; filtro de período em
  `FilterPopover`; Ações = "Confirmar" na sugestão.
- **Pronto quando:** harness mostra as três situações (Alocado, Sugestão, Equipe
  incompleta) e o conflito; "Confirmar" grava a alocação (mesmo `handleConfirmSuggestion`
  de antes); teste cobre as três situações e o filtro de período.
- **Estado:** ✅ feito (10/10). `TabelaAlocacao`. Rótulos curtos para caber sem
  quebrar: Origem "Orçado"/"Manual", Situação "Incompleta" (o texto longo vai no
  `title`), Período "dd/mm – dd/mm" (ano no `title`). A **sobrecarga** foi para a
  coluna Situação (ícone vermelho + `title`): ao lado do nome do trabalhador ela
  sumia quando o nome truncava — o passeio agora confere que ela está VISÍVEL.

### 4. Verificação e publicação
- **Pronto quando:** `check-ui-standard.sh` limpo no arquivo, typecheck, build e suíte
  completa com a conta fechando; publicado só com autorização do usuário.
- **Estado:** verificação ✅ (10/10): `RecursosTabelas.tsx` limpo no checador;
  `ResourceManagement.tsx` só com o §3 da busca do modal "Importar da Empresa" —
  exceção §3.1 documentada no código (seletor em modal, fecha ao confirmar, não
  filtra a lista da tela). De quebra, três pílulas §8 das abas Equipes, Materiais e
  Capacidade viraram texto simples. Typecheck, XSS, build e suíte (8252 + 34
  pulados = 8286, conta fechando) verdes. **Publicado** em 10/10/2026 (`5d3418ca`, autorizado pelo usuário: "publique"); CI verde e `conferir-producao.sh` confirmou o domínio servindo `5d3418c`. Não testado no app logado com dado real (exige a senha do usuário de leitura).
