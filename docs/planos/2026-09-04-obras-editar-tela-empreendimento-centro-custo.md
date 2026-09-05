# Engenharia › Obras — tela de edição, importar do empreendimento e centro de custo

## Pedido original

Sessão de 04/09/2026, primeira mensagem do usuário, transcrita literalmente:

> Engenharia > Obras:
> 1.	tela Editar Obra esta com bug, nao esta preenchendo 100 % a pagina.
> 2.	Opção de importar do empreendimento
> 3.	Conectar à minha organização > centro de custo. Criar campo para vincular a um centro de custo existente ou para criar novo centro de custo
> Uma obra pode ser vinculada a mais de um centro de custo

### Pedido posterior — 05/09/2026, mesma sessão

Depois de a primeira leva ir ao ar (`271626d`), transcrito literalmente:

> dividir a tela Editar Obra em abas (Dados gerais, Endereço, organização, Financeiro). Mover cada aba os seguintes campos/cards:
> 1.	Dados Gerais: Nome da Obra; Código da Obra; checkbox obra propria; Cliente / Proprietário; Investidor Vinculado; Tipo de Obra; Regime de Contratação; Status da Obra; Datas (Início Previsto, Término Previsto, Início Real, Término Real); Equipe de Campo
> 2.	Aba Organização: Organização; Empresa Executora
> 3.	Aba Endereco: Localização da Obra; Rua / Logradouro; Nº; Bairro; CEP; UF; Cidade
> 4.	Aba Financeiro: Gestão Financeira; Modalidade; Margem Alvo (%); Valor Contratado (R$); Centros de Custo)

Ver o item 7 abaixo.

---

## Diagnóstico do item 1 (por que a tela não preenche a página)

`ProjectModal.tsx`, `mode === 'edit'`, renderiza como
`absolute inset-0 z-50 bg-white flex flex-col` (linha 559-563) e é montado em
`App.tsx` como irmão do `<AppRouter>`, dentro do
`<main className="flex-1 overflow-y-auto p-4 md:p-6 ... relative">` do `Layout`.

Duas consequências, e as duas produzem exatamente o sintoma relatado:

1. `absolute` ancora no **topo do conteúdo rolável**, não na parte visível. Se a
   lista de Obras estava rolada quando o usuário clicou em Editar, o painel
   branco começa acima da dobra e sobra lista aparecendo embaixo.
2. `inset-0` dá ao painel a altura da **caixa visível** do `<main>`, mas o
   `ProjectList` continua montado embaixo, então o `scrollHeight` do `<main>`
   continua sendo o da lista — dá para rolar para além do fim do painel e ver a
   lista de novo.

Não é bug de largura: é overlay dentro de container rolável. A correção
alinhada com o que já foi decidido no projeto (memória
`feedback_nunca_tela_cheia_para_paineis`: "tela" neste app = troca de conteúdo
**in-flow**, nunca overlay — nem `fixed`, nem `Sheet`) e com o precedente de
Suprimentos › Pedidos (`SupplyChainOrderForm`, memória
`project_pedidos_editar_tela_inflow`) é: **modo edição vira conteúdo in-flow**;
**modo criação continua sobreposição**.

---

## Itens

### 1. `App.tsx` — esconder o roteador enquanto a edição está aberta

**O que muda:** `AppRouter` passa a ser embrulhado por um `<div>` com a classe
`hidden` quando `isProjectModalOpen && projectModalMode === 'edit'`. O
`ProjectModal` sai do bloco de "modais globais" e passa a ser renderizado
logo depois desse `<div>`, em fluxo normal. Criação continua sobreposta (o
próprio componente decide pelo `mode`). Passa também `projectId` (necessário
para os itens 2 e 3, que gravam vínculo em tabelas externas).

`hidden` em vez de desmontar: preserva o estado da lista e evita refetch ao
voltar.

**Como sei que terminou:** com a tela de edição aberta, o DOM do `<main>` não
tem mais nenhum elemento com `position: absolute` cobrindo a página, e rolar a
página não revela a lista embaixo.

### 2. `components/ProjectModal.tsx` — geometria in-flow no modo edição

**O que muda:**
- raiz e cartão sem `absolute`/`overflow-hidden` no modo edição;
- `form`/corpo sem `flex-1 overflow-y-auto` (quem rola é o `<main>`);
- cabeçalho sem `px-6 md:px-10` (o gutter de 24px do `<main>` já é o do §20.2);
- rodapé deixa de ser barra fixa e vira o rodapé canônico do §25
  (`SaveStatus` + "Voltar" + "Salvar Alterações" desabilitado sem `dirty`);
- seções que eram `grid-cols-2` e esticavam campo até ~630px numa página cheia
  passam a `grid-cols-4`/`grid-cols-12` (mesmo remédio do commit `3ae35e8`,
  PropertyModal).

**Como sei que terminou:** `bash scripts/check-ui-standard.sh
components/ProjectModal.tsx` sai 0 (ou só com exceção documentada), e a tela
aberta em 1290px não tem faixa branca nem lista por baixo.

### 3. `components/ProjectModal.tsx` — "Importar do empreendimento"

**O que muda:** bloco novo no formulário de OBRA, com seletor de
empreendimento (`empreendimentoService.list`) e botão "Importar dados". Ao
importar, preenche organização e endereço completo com a mesma precedência já
usada em `CriarObraDoEmpreendimento.tsx` (`endereco_*` com fallback
`terreno_*`), e o nome quando estiver vazio. Se já houver endereço preenchido,
confirma antes de sobrescrever (`useConfirm`). Se o empreendimento ainda não
tem obra principal e estamos em modo edição, oferece vincular esta obra como
obra principal (`empreendimentoLinksService.setObraPrincipal`).

**Como sei que terminou:** escolher um empreendimento e clicar em Importar
preenche rua/número/bairro/cidade/UF/CEP e a organização; nenhum campo é
sobrescrito sem confirmação.

### 4. `services/costCenterService.ts` — operações por obra

**O que muda:** métodos novos, sem migration (a coluna
`cost_centers_v2.project_id` já existe desde
`20270907000000_cost_centers_v2_project_link.sql`, sem índice único — ou seja,
**N centros de custo por obra já é suportado pelo schema**):

- `listByProject(projectId)` — os vinculados, com o nome do grupo pai;
- `listLinkableForProject(organizationId)` — filhos (`parent_id` não nulo) sem
  obra vinculada; org ausente não bloqueia (REGRA #5);
- `linkToProject(id, projectId)` / `unlinkFromProject(id)`;
- `ensureGrupoObras(organizationId)` — grupo "Obras" sob demanda, espelho de
  `garantirGrupoEmpreendimentos`;
- `createForProject({...})` — cria já vinculado, num único insert.

**Como sei que terminou:** `npm run typecheck` passa e as funções aparecem
usadas pela seção do item 5.

### 5. `components/ProjectModal.tsx` — seção "Centros de Custo" da obra

**O que muda:** seção nova no formulário de OBRA, **modo edição** (precisa do
`projectId`): lista dos vinculados com botão de desvincular, seletor de
existente + "Vincular", e criação inline (nome + grupo) que já nasce vinculada.
Em modo criação, mostra o aviso de que o vínculo é feito depois de salvar.

**Como sei que terminou:** vincular dois centros de custo diferentes à mesma
obra funciona e os dois aparecem na lista (é o requisito explícito do pedido);
desvincular não apaga o centro de custo.

### 7. `components/ProjectModal.tsx` — quatro abas no formulário de OBRA

**O que muda:** `OBRA_TABS` + `OBRA_TAB_SUBTITLES` + estado `obraTab`, e barra
de abas na anatomia canônica do §19.1. Um `<form>` só — a aba decide o que
**aparece**, não o que é gravado, então salvar de qualquer aba grava a obra
inteira. O `<h1>` continua "Editar Obra"; quem acompanha a aba é o subtítulo.

Distribuição, na ordem numerada do pedido:

| Aba | Conteúdo |
|---|---|
| Dados gerais | Nome, Código, obra própria, Cliente, Investidor, Tipo/Regime/Status, Dados Técnicos por tipo, Datas, Equipe de Campo, Registro Documental, Observações |
| Organização | Organização, Empresa Executora |
| Endereço | Localização da Obra inteira (Rua, Nº, Bairro, CEP/UF/Cidade) |
| Financeiro | Gestão Financeira (Modalidade, Margem, Valor Estimado, Valor Contratado) e Centros de Custo |

Decisões sobre o que o pedido não citou, todas reportadas ao usuário:

- **"Importar do empreendimento" fica FORA das abas**, logo acima da barra:
  preenche campos de três abas diferentes, então não pertence a nenhuma — e
  dentro de "Dados gerais" o usuário importaria sem ver nada mudar.
- **Registro Documental, Dados Técnicos por tipo e Observações** → Dados gerais.
- **Valor Estimado (R$)** → Financeiro, junto com o resto de Gestão Financeira
  (o pedido lista o card e três dos quatro campos dele).
- Aba Organização vazia (usuário de uma organização só e sem empresas do grupo)
  mostra estado vazio explicando, não uma aba em branco.
- Submeter sem nome traz o usuário de volta para "Dados gerais"; só a criação
  reseta a aba ao salvar — em edição §25 manda ficar onde estava.

**Como sei que terminou:** as quatro abas trocam o conteúdo, o subtítulo muda
com a aba, e salvar de qualquer uma grava a obra inteira.

### 6. Verificação

- `bash scripts/check-ui-standard.sh components/ProjectModal.tsx`
- `bash scripts/check-project-classification.sh` e `check-system-projects.sh`
- `npx vitest run __tests__/orgContextGuard.test.ts`
- `npm run typecheck` e `npm run test`

---

## Estado

- [x] Item 1 — `App.tsx`
- [x] Item 2 — geometria in-flow
- [x] Item 3 — importar do empreendimento
- [x] Item 4 — `costCenterService`
- [x] Item 5 — seção de centros de custo
- [x] Item 7 — quatro abas no formulário de OBRA (pedido de 05/09)
- [x] Item 6 — verificação mecânica (typecheck + suíte + scripts)
- [ ] Verificação na tela real (Playwright) — **pendente**: exige a senha do
      usuário de leitura, que não fica gravada em lugar nenhum.
