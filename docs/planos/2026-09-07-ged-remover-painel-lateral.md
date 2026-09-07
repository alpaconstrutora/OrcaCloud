# GED — remover o painel lateral de Pastas e disciplinas

## Pedido original

Sessão de 2026-09-07, mensagem do usuário, transcrita literalmente:

> remover painel lateral esquerdo com pastas e disciplinas . nao ha necessidade.

Pedidos anteriores da mesma sessão, que contextualizam:

> meus documentos: criar filtro Disciplina na toolbar acoplada a tabela

> ao selecionar todas as disciplinas, nao esta sendo mostrado todos os documentos

> existia uma coluna na tabela chamado disciplina, foi removida? vamos retornar

Perguntado como remover sem perder o que só existe no painel (compartilhar pasta
com o Portal do Parceiro, editar pasta/disciplinas, excluir pasta, escolher a
pasta — que é o que liga as colunas da máscara), o usuário escolheu:
**"Remover e realocar na toolbar"** — select "Pasta" ao lado do de Disciplina,
com as ações da pasta escolhida ao lado.

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `components/OpuraDocsModule.tsx` | Sai o bloco do painel (`PAINEL LATERAL ESQUERDO`) e o grid `lg:grid-cols-5`; a tabela ocupa a largura toda | Nenhuma ocorrência de "Pastas e disciplinas" no arquivo; tela sem coluna à esquerda |
| 2 | idem | Sai `renderFolderTreeItem`, `toggleNode`, `getDisciplineColor`, `expandedNodes`, `leftSearchQuery` e o efeito de auto-expandir — código que só servia à árvore | `grep` não acha nenhum dos identificadores; `tsc` sem "declared but never read" novo |
| 3 | idem | Entra o select **Pasta** na toolbar (hierárquico, "Todas as pastas" como vazio), ao lado do de Disciplina | Escolher uma pasta filtra a tabela e liga as colunas da máscara (Obra/Número/Revisão) |
| 4 | idem | Entram, ao lado do select, as ações da pasta escolhida via `ActionIconButton`: compartilhar pasta, editar pasta/disciplinas, excluir pasta; e compartilhar disciplina quando há disciplina escolhida | Cada botão abre o mesmo fluxo que abria na árvore; somem quando não há pasta/disciplina escolhida |
| 5 | idem | `fetchDocs` volta a `folderId: currentFolderId ?? undefined` — pasta e disciplina são dois filtros explícitos e valem juntos (o "disciplina manda mais que pasta" existia porque clicar na disciplina da árvore setava a pasta junto; agora não seta) | Pasta + disciplina recortam em conjunto; sem pasta, o acervo inteiro |
| 6 | verificação | typecheck, suíte, `check-ui-standard.sh`, e conferência na tela com Playwright | Suíte verde, script limpo, tela sem erro de console e com os fluxos acima funcionando |

## O que muda para quem usa

- **Remover disciplina da pasta** deixa de ter atalho próprio: continua no modal de
  editar a pasta (que é onde as disciplinas da pasta são escolhidas).
- A busca lateral ("Pesquisar pasta ou disciplina") deixa de existir — os dois
  selects da toolbar cumprem o papel.
