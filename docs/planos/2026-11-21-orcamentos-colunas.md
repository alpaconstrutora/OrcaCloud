# Engenharia › Orçamentos: colunas que faltavam no "Colunas visíveis"

## Pedido (literal)

> na tabela de Orçamentos, Colunas visíveis nao contem todas as faltam colunas. inclui-las

## O que se encontrou

O seletor já listava todas as colunas que a tabela tinha (Código, Orçamento, Tipo de Obra,
Obra Vinculada, Cliente, Data de Criação, Atualização, Status, Status Obra, Pedidos). Faltavam
colunas para dados que o orçamento já tem no cadastro (`projects.settings`) e nos itens
(`projects.budget`). A coluna Organização existia, mas ficava escondida: lia da prop
`organizations`, que nenhum chamador passa.

### A causa que apareceu na tela de verdade

Na conferência, a tabela de Orçamentos mostrava **Avanço, Prazo, Término e Início**, colunas do
Planejamento que o "Colunas visíveis" não lista, e por isso não havia como desligá-las. O
Planejamento mostrava o inverso: Tipo de Obra, Status, Status Obra e Pedidos.

- O AppRouter monta a MESMA instância de `ProjectList` em `eng-orcamentos` e `eng-planejamento`
  (troca só as props).
- `useTableColumns` lia a preferência gravada só na montagem. Ao trocar a chave
  (`projectListColumns:planejamento` → `projectListColumns`), seguia com as colunas da tela
  anterior e o efeito de gravar as escrevia na chave da outra tela.

Correção:

1. `useTableColumns` recarrega a preferência da chave nova no mesmo render em que a chave muda.
2. `ProjectList` só desenha colunas que a tela define. A preferência já contaminada no navegador
   de quem passou pelo Planejamento deixa de aparecer, sem precisar limpar nada.

## Decisão do usuário (21/11/2026)

Incluir as quatro opções oferecidas:

1. Organização + Base de preço (com o mês) + BDI
2. Área, Padrão e Local (cidade/UF)
3. Início e Término (datas previstas do cadastro)
4. Valor total (Preço final, com BDI)

## Como fica

- As colunas novas valem só no contexto Orçamento. Obra, Planejamento e Diário seguem como
  estão (o conjunto `COLUMNS` é compartilhado com Obra e Diário; lá elas ficam fora).
- **Organização** passa a ler do store (`organization_id` nativa, com `settings.organizationId`
  como reserva), a mesma fonte do `nomeDaOrganizacao` que a tela já usa. Ela aparece no
  Orçamento; nos outros contextos segue escondida como antes.
- **Valor total**: a mesma conta do KPI "Preço Final" do Orçamento Analítico, numa função só
  (`utils/totaisDoOrcamento.ts`), usada pelo editor e pela coluna. A lista não traz
  `projects.budget`; a busca leve `id, budget` que o Planejamento já fazia vira um hook comum
  (`hooks/useOrcamentosDaLista.ts`). Ela só roda com a coluna visível. Enquanto carrega, a célula
  mostra "…"; se falhar, mostra "—" e diz o motivo no `title` (sem 0 inventado, §28.5).
- Valor total entra visível, logo depois do nome do orçamento: no fim, só aparecia rolando a
  tabela. Ela é numérica, então célula e cabeçalho ficam à direita. As demais colunas novas
  entram escondidas (`defaultHidden`) e a pessoa liga no "Colunas visíveis". Todas ordenam pelo
  valor que a célula mostra (§6.3).

## Verificação

- Vitest da lista (colunas no seletor por contexto, células, ordenação, valor total = KPI do
  editor), do hook do Planejamento e do editor.
- Tela de verdade (só leitura): os totais da coluna batem com a conta feita no banco em
  21/11/2026 (Garden R$ 173.650,00 · Igreja Divino Espírito Santo R$ 416.086,25 · Casa de
  Formação R$ 254.752,28 · Casa de Furnas R$ 219.160,94 · Coronel Lambert R$ 36.604,26).
