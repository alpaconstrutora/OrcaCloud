# PLANO — Extração da Rentabilidade Comercial (`useCommercialProfitability`)

> Objetivo: tirar `displayInstallments` + `profitabilityByProperty` de dentro do
> `ProjectFinancialManager` e consumir nos dois lugares (Gestão Financeira e
> Comercial), **sem mudar um centavo dos números no caminho**.
>
> Criado em 30/07/2026. Contexto da decisão: as 4 telas financeiras se separam
> por eixo temporal, não são duplicadas — a Rentabilidade é **por IMÓVEL**, com
> filtro Venda × Locação, e por isso pertence ao Comercial.

---

## 0. Por que isso não é um "mover função de render"

`renderRentabilidade` depende de `profitabilityByProperty`, que depende de
`displayInstallments` — e esse é o pipeline mais delicado da tela.
`ProjectFinancialManager.tsx:364-425` funde **cinco fontes**:

| # | Fonte | Observação |
|---|---|---|
| 1 | `financialInfo.installments` | JSON em `projects.settings` do projeto local |
| 2 | `linkedInstallments` | projeto vinculado (`linkedProjectId`) |
| 3 | `satelliteProjects[].settings.financialInfo.installments` | só em modo "Gestão Comercial" |
| 4 | parcelas do vault Comercial que referenciam o imóvel | **casamento por NOME**, `includes()` bidirecional (linha 397) |
| 5 | filtro `effectiveDealTypeFilter` | quando a parcela não tem `dealType`, **adivinha pela descrição** (linhas 415-423) |

Mais deduplicação por `id`, com fallback para `descrição-valor-vencimento`
(linhas 376-382).

São **18 consumidores** de `displayInstallments` no arquivo (KPIs do Resumo,
tabela de Receitas, agrupamentos, `cashFlowData`, contadores). Qualquer desvio
na extração muda silenciosamente números em abas que não têm nada a ver com
Rentabilidade. Daí a ordem das fases abaixo: **primeiro provar neutralidade,
depois corrigir.**

---

## Fase 1 — Extrair para funções PURAS (sem mudar comportamento)

**Não criar o hook ainda.** O primeiro passo tira a lógica para funções sem
React, que recebem tudo por parâmetro e não sabem de onde o dado veio.

**Novo arquivo `utils/commercialInstallments.ts`:**

```ts
export interface MergeSources {
  local: PaymentInstallment[];              // financialInfo.installments
  linked: PaymentInstallment[];             // linkedInstallments
  satellites: SatelliteProject[];           // só usado em modo comercial
  commercialVault: RichInstallment[];       // commercialProject...installments
  mode: 'COMERCIAL' | 'OBRA';
  scope: { projectId?: string; projectName: string };
  dealTypeFilter: 'ALL' | 'SALE' | 'RENTAL';
}

export function mergeInstallments(s: MergeSources): RichInstallment[]
export function computeProfitabilityByProperty(
  installments: RichInstallment[],
  transactions: RichTransaction[],
): PropertyProfitability[]
```

Regra desta fase: **cópia literal** da lógica atual, incluindo as
heurísticas de nome e os fallbacks. Nada de "melhorar de passagem".

**No `ProjectFinancialManager`:** `displayInstallments` e
`profitabilityByProperty` passam a ser `useMemo(() => mergeInstallments({...}))`
— mesmas dependências, mesmo resultado. Carregamento continua onde está.

**Limpeza permitida aqui** (é o código que estou tocando de todo jeito):
- remover o `console.log` que procura `"Waldir #972a9afa"` (linhas 371-373) —
  vaza nome de cliente no DevTools de produção;
- remover o `console.log` de `[FINANCE-DEBUG]` (linha 409).

**Entregável:** nenhuma mudança visível. Commit isolado, revertível.

---

## Fase 2 — Validação lado a lado com dado real (PORTÃO)

Nada avança sem isso. A extração só é neutra se for provada neutra.

**Como:** painel temporário, atrás de flag de dev, que renderiza a tabela de
Rentabilidade **duas vezes** — a versão inline legada e a extraída — e uma
terceira coluna com a diferença por imóvel (receita, custo, receita líquida,
margem).

**Matriz de casos** (todos precisam fechar em zero):

| Caso | Modo | `dealTypeFilter` |
|---|---|---|
| 1 | Gestão Comercial | ALL |
| 2 | Gestão Comercial | SALE |
| 3 | Gestão Comercial | RENTAL |
| 4 | Obra com `linkedProjectId` | ALL |
| 5 | Obra sem vínculo | ALL |
| 6 | Org = "Todas as organizações" | ALL |

**Critério de aceite:** diferença = `0,00` em todas as linhas dos 6 casos, e
`displayInstallments.length` idêntico. Print do painel é o veredito — não
"parece igual".

O caso 6 é obrigatório porque o seletor em "Todas" faz `activeOrganizationId`
chegar `null`, e essa tela tem caminho próprio para `selectedOrgId === 'ALL'`.

---

## Fase 3 — Corrigir os defeitos encontrados (explicitamente, depois do portão)

A leitura do código para escrever este plano achou **três defeitos reais** em
`profitabilityByProperty` (linhas 960-991). Eles **não** devem ser corrigidos
nas Fases 1-2 — refactor e correção no mesmo commit tornam impossível saber
qual dos dois mudou o número.

**3.1 — Chaves de fallback divergentes.** A receita agrupa por
`propertyId || propertyName || 'Indefinido'` (linha 964); a despesa, por
`propertyId || propertyName || 'Geral'` (linha 972). Parcela sem imóvel e
despesa sem imóvel caem em **duas linhas diferentes** — uma com receita e custo
zero, outra com custo e receita zero. As duas exibem margem errada.

**3.2 — Contaminação cruzada no `netRevenue`.** O recálculo filtra por
`i.propertyId === p.id || i.propertyName === p.name` (linha 979). Quando
`p.id === ''` (imóvel sem id), `i.propertyId === ''` casa **todas** as parcelas
sem `propertyId`, de qualquer imóvel. A receita líquida de uma linha absorve
comissões de outra.

**3.3 — Dois números chamados "Rentabilidade", com bases diferentes.** A margem
por imóvel usa **receita líquida** como denominador (linha 988); o KPI
"Rentabilidade" do Resumo usa **receita bruta**
(`(totalRevenue - totalExpenses) / totalRevenue`, linha ~1070). Duas telas, dois
valores, mesmo rótulo.

**3.4 — Substituir o casamento por NOME pela hierarquia real.** É o maior dos
quatro, e o único que exige migration.

O casamento de parcela↔obra por `includes()` de nome
(`utils/commercialInstallments.ts`, `mergeInstallments`) foi escrito em
fev/2024, quando não existiam Empreendimento nem Torre. O módulo de
Empreendimentos (dez/2026) trouxe o modelo correto, com FK, e o código nunca
foi atualizado. A hierarquia de domínio já está no banco:

```
empreendimentos                                    ← raiz
  └── empreendimento_towers                        ← "Torres / Blocos (= obra)"
        ├── empreendimento_id → empreendimentos
        ├── project_id        → projects           ← A OBRA
        └── empreendimento_units
              ├── commercial_property_id → commercial_properties   (venda)
              └── rental_property_id     → commercial_properties   (locação)
```

E `parcela.propertyId = deal.property_id` → `commercial_properties.id`
(`commercialFinanceService.ts:122`), fechando o caminho determinístico:

```
parcela.propertyId → empreendimento_units → tower → project_id (obra) / empreendimento_id
```

**Ação:** view `vw_unit_property_map` (`commercial_property_id`,
`rental_property_id`, `unit_id`, `tower_id`, `project_id`, `empreendimento_id`,
`organization_id`) + resolvedor que substitui o `isNameMatch`. Migration só
cria a view — DDL em tabela quente do módulo deadlocka (ver histórico do
Empreendimento).

**Consequência esperada, e desejada:** o caminho determinístico vai casar
MENOS parcelas do que o nome casa hoje — porque o nome casa coisas que não
deveria. Não resolverão: unidade não publicada no Comercial (ambos os
`*_property_id` nulos), deal anterior ao módulo de Empreendimentos, e vínculo
órfão (as FKs são `ON DELETE SET NULL`; já existe botão manual de limpeza de
órfãos no espelho por causa disso).

**Regra:** quando não resolver, **não** cair de volta no nome. Exibir a parcela
como "sem vínculo de unidade", em linha própria, para alguém corrigir o
cadastro. O casamento por nome é justamente o que hoje esconde esses casos —
soma no lugar aproximadamente certo e ninguém descobre que o vínculo quebrou.

**Efeito colateral bom:** com a hierarquia disponível, o agrupamento de
`computeProfitabilityByProperty` pode passar a ser por `unit_id` /
`empreendimento_id` em vez de string de `propertyName`, o que dissolve também
os defeitos 3.1 e 3.2 (as chaves de fallback e a contaminação por `id === ''`).

---

Cada correção vai em commit próprio, com o painel da Fase 2 mostrando o antes e
o depois — aqui a diferença **deixa** de ser zero, e é isso que se quer ver.
O 3.3 precisa de decisão sua: padronizar em líquida ou em bruta. O 3.4 precisa
de uma medição antes (quantas parcelas hoje casam só por nome).

---

## Fase 4 — O hook e o consumo nos dois lugares

Só agora o hook faz sentido, porque as fontes já estão isoladas.

**`hooks/useCommercialProfitability.ts`** — carrega as fontes (o que hoje está
espalhado nos `useEffect` do PFM) e devolve o resultado das funções puras:

```ts
export function useCommercialProfitability(params: {
  organizationId: string | null;
  projectId?: string;
  dealTypeFilter?: 'ALL' | 'SALE' | 'RENTAL';
}): { rows: PropertyProfitability[]; installments: RichInstallment[]; loading: boolean; error: string | null }
```

Atenção à **REGRA #5** (`CLAUDE.md`): `organizationId: null` ("Todas as
organizações") **não pode** virar `if (!orgId) return` — a leitura acontece e a
RLS filtra.

**Novo componente `components/commercial/CommercialProfitability.tsx`**:
consome o hook e renderiza a tabela + o gráfico. Aplicar
`docs/ui_ux_guia_unificado.md` do zero — o markup atual tem violações
conhecidas (pílula `rounded-full`+`uppercase` na linha 1478, `font-normal` em
`<td>`), então é reescrita de estilo, não `copy/paste`.

**Nova aba no Comercial:**
- `constants/salesTabs.ts`: `SalesTab` += `'rentabilidade'`, e
  `VIEW_TO_SALES_TAB['sales-profitability'] = 'rentabilidade'`;
- `SalesManagementModule.tsx`: monta o componente quando
  `activeTab === 'rentabilidade'`;
- `Layout.tsx`: item "Rentabilidade" no dropdown Comercial, e incluir
  `sales-profitability` no `hasActiveChild`.

**Remover do PFM:** aba `rentabilidade` dos `tabs`, `renderRentabilidade`, e
`RETIRED_TABS.push('rentabilidade')` para quem tiver a aba salva no
`localStorage`. A Gestão Financeira cai de 8 para 7 abas.

---

## Fase 5 — Fechar a Fase 0.3 do plano de Vendas (nav)

Levantei o estado real: a unificação **já existe no nível de componente** —
`SalesManagementModule` é uma casca com abas (`espelho`, `alugueis`,
`corretores`, `crm`, `contratos`, `viabilidade`) e 16 rotas caem nela via
`VIEW_TO_SALES_TAB`. O que está pela metade é a **navegação**, com o mesmo
sintoma que o Financeiro tinha:

1. Quatro itens de sidebar ("Vendas de Ativos", "Locações", "Contratos de
   Serviço", "CRM Serviços") abrem **o mesmo componente** em abas diferentes,
   sem que o menu diga isso.
2. A rota `gestao-vendas` existe (`AppRouter.tsx:1028`), está no
   `hasActiveChild` do dropdown Comercial (`Layout.tsx:1112`) e é destino de
   navegação do `BankReconciliation.tsx:618` — mas **não tem item de menu**.
3. Todas as 12 rotas `broker-*` estão no `hasActiveChild` e nenhuma tem item de
   menu (chega-se nelas pelo Portal do Corretor).
4. **"Estudos de Viabilidade" tem duas casas:** item do dropdown
   *Incorporação* (`Layout.tsx:1136`) e aba `viabilidade` de Gestão de Vendas.

Ação: aplicar o padrão do Financeiro — nomear o item de menu pelo que a tela é,
e usar rota explícita + `defaultTab` para deep-link. O `defaultTab` já é
sincronizado por `useEffect` no `SalesManagementModule` (linhas 58-66), então a
infraestrutura existe. O item 4 é decisão de produto: escolher uma casa.

---

## Fora de escopo (registrado de propósito)

- **ZapSign / Edge Function `sign-contract`** — mantido para o futuro, conforme
  definido. Nenhuma ação neste plano. A função continua não publicada e a
  assinatura eletrônica segue inativa em produção.
- **Fase 0.2 (`commercial_installments`)** — não é pré-requisito. Ao contrário:
  o hook da Fase 4 é justamente a camada que **absorve** essa migração depois —
  quando as parcelas saírem do JSON para tabela, muda só a implementação das
  fontes, e nenhum consumidor. Fazer a extração antes **reduz** o custo da 0.2.

---

## Riscos conhecidos

| Risco | Onde | Mitigação |
|---|---|---|
| `listProjects()` sem `.range()` — corte silencioso de 1000 linhas do PostgREST, contando obras+orçamentos+planejamentos+diários, cada linha com o `settings` inteiro | `services/projectService.ts:174-176` | paginar em bloco, como o `boletoService` já faz (`PAGE_SIZE`) |
| Casamento de parcela por **nome** de imóvel (`includes()` nos dois sentidos) pode unir imóveis de nomes parecidos ("Torre A" × "Torre A2") | `ProjectFinancialManager.tsx:394-399` | preservar na Fase 1; avaliar na Fase 3 se vira defeito 3.4 |
| Inferência de `dealType` por palavra na descrição ("venda", "aluguel", "parcela") | idem, linhas 415-423 | idem |

---

## Ordem de execução

```
Fase 1 (puras + limpeza de log)  →  commit
Fase 2 (painel de validação)     →  PORTÃO: print com diferença zero
Fase 3.1, 3.2, 3.3               →  um commit cada
Fase 4 (hook + aba no Comercial) →  commit
Fase 5 (nav 0.3)                 →  commit
```

Fases 1 e 2 são as que valem o esforço mesmo que o resto pare: elas transformam
o pipeline de parcelas comerciais em algo testável.
