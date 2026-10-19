# Contrato › Itens do Contrato: sub-abas para as matrizes

## Pedido original
> Na aba itens do contrato: veja que Matriz de fornecimento e Matriz de interfaces ficaram abaixo dos itens do contrato,  e se tivermos miuitos itens as matrizes ficarao muito abaixo e com UX prejudicada.
> Sugestão de criar abas para as matrizes. avalie

Sessão c7448b3f · 19/10/2026 (com print da aba Itens do Contrato)

> Siga com as sub-abas em frente separada, corrigindo junto:
> 1Matriz de fornecimento: falta a coluna Ações (hoje só se edita clicando na linha) e a busca acoplada.
> Matriz de interfaces: hoje é uma lista de botões cinza, e não uma tabela. Viraria tabela com Evento, Responsável principal e Ações, como a outra.
> Os estados vazios passariam a ser o padrão do app (ícone, título e frase), no lugar do texto cinza miúdo.

(mesma sessão, 19/10/2026)

## Decisões tomadas com o usuário
| Data | Pergunta | Resposta |
|---|---|---|
| 19/10/2026 | Abas novas no topo ou sub-abas em Itens do Contrato? | Sub-abas (recomendação aceita): o trilho do topo já tem 10 abas; matrizes são anexos do escopo |
| 19/10/2026 | Corrigir as matrizes junto? | Sim — Ações + busca acoplada, interfaces vira tabela, estado vazio padrão |

## Andamento
- [x] 1. Sub-abas — `TabsBar bare` na barra da aba (Itens · Matriz de fornecimento · Matriz de interfaces, com contagem); "Importar do orçamento" só em Itens; "Adicionar item"/"Adicionar interface" na barra, por sub-aba. Conferido na tela.
- [x] 2. Matriz de fornecimento em `StandardTable` — busca acoplada escopada pelo contrato, colunas Item/Fornece/Transporta/Guarda/Instala/Perda admissível, Ações (Editar/Excluir com `useConfirm`), estado vazio padrão. Na tela: busca "cimento" → 1 linha.
- [x] 3. Matriz de interfaces em `StandardTable` — Evento/Responsável principal/Apoio/Prazo-gatilho/Evidência + Ações; Editar abre o painel existente. Conferido na tela.
- [x] 4. Salvar no modal relê só as matrizes (`recarregarMatrizes`); excluir pela linha tira do array local.
- [ ] 5. Verificação — 3 de 4:
  - [x] `check-ui-standard.sh` exit 0; tipos do arquivo + importações exit 0 (3ª tentativa; as 2 primeiras caíram com segfault da máquina).
  - [x] Suíte inteira: 10.398 = 10.364 passaram + 34 pulados, 1.025 arquivos, 0 falhas. Exit 1 por crash interno do V8 ("Fatal error… unreachable code") — instabilidade conhecida da máquina; a conta fecha.
  - [x] Tela, só leitura (contrato 010, Alpa; escritas abortadas no navegador): três sub-abas, botões por sub-aba, estado vazio padrão; com 2 linhas INJETADAS na resposta: Ações, busca e Editar. 0 erros de JS/console/HTTP.
  - [ ] CI em Linux (PR) e publicação.

## Plano

### 1. Sub-abas "Itens · Matriz de fornecimento · Matriz de interfaces"
- **Arquivo:** `components/ContractDetailView.tsx`.
- **O que muda:** `TabsBar bare` na barra de ações da aba (§5.3/§19.1), igual às sub-abas do Financeiro, com contagem por sub-aba. A escolha fica em `usePersistedState('contractItems:subTab')`; um valor fora do vocabulário cai em "Itens".
  - "Importar do orçamento" só aparece em Itens.
  - "Adicionar item" / "Adicionar interface" vão para a barra, cada um na sua sub-aba (eram links soltos "+ Adicionar").
  - KPIs, itens do orçamento e itens avulsos só em Itens.
- **Pronto quando:** cada sub-aba mostra só o seu bloco, conferido na tela.

### 2. Matriz de fornecimento → `StandardTable` (§6.10)
- **O que muda:** colunas Item · Fornece · Transporta · Guarda · Instala · Perda admissível. Busca acoplada escopada pelo contrato (`searchScope`). Coluna Ações com Editar e Excluir (`useConfirm`). Estado vazio padrão com ícone, título e frase.
- **Pronto quando:** `check-ui-standard.sh` exit 0; Ações e busca visíveis na tela.

### 3. Matriz de interfaces → `StandardTable`
- **O que muda:** a lista de botões cinza vira tabela com Evento · Responsável principal · Apoio · Prazo/gatilho · Evidência, mais Ações (Editar/Excluir) e o mesmo estado vazio.
- **Pronto quando:** idem.

### 4. Salvar/excluir atualiza só as matrizes
- **O que muda:** o `onSuccess` dos dois modais chamava `loadContractData` (o contrato inteiro). Passa a reler só as duas matrizes; excluir pela linha tira o item do array local (§22).
- **Pronto quando:** salvar no modal não recarrega o resto da tela.

### 5. Verificação
- `check-ui-standard.sh` e o checador de tipos nos arquivos tocados; suíte inteira; tela no navegador (as três sub-abas, busca, Ações, estado vazio).
