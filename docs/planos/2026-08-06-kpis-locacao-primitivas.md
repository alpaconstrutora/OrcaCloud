# KPIs de Locação — as primitivas que faltam (histórico de status + OPEX por imóvel)

## Pedido original

> Sessão: 9c1eaee8-9754-484e-bcdc-231637ee08e7 · 2026-08-06

O pedido começou com a criação da aba Análise:

> comercial > lococoes> Gestão de Locações:
> 1) criar nova aba chamada analise e mover os kpis cards (Ativos sob gestão,Receita mensal, Yield mensal, Taxa de ocupação,Falor patrimonial) para dentro dela

Feito e publicado (commit `fe5f231`). Em seguida, o usuário colou um catálogo de
~610 indicadores de gestão de locação imobiliária, organizado em 25 seções, com a
instrução literal:

> avalie:
>
> KPIs para Gestão de Locações Imobiliárias
>
> Não é adequado colocar todos esses indicadores em um único dashboard. O ideal é manter um painel executivo com 15 a 25 KPIs e distribuir os demais em painéis operacionais, financeiros, comerciais, de manutenção e de riscos.
>
> Abaixo está um catálogo abrangente aplicável a imóveis residenciais, comerciais, salas, lojas, galpões, edifícios e carteiras de terceiros.

O catálogo completo está transcrito no **Anexo A** (índice das 25 seções, painel
executivo sugerido e dimensões obrigatórias, todos literais) e no **Anexo B** (as
seções que este plano destrava, item a item).

Após a avaliação, que ofereceu três caminhos — (a) corrigir os defeitos dos KPIs
atuais, (b) plano para as primitivas, (c) as duas coisas — e perguntou se
administradora de terceiros entrava no escopo, a resposta foi:

> (c) as duas coisas, E antes disso: administradora de terceiros não entra no escopo

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-06 | Administradora que gere carteira de terceiros entra no escopo do produto? | **Não.** As seções 19 (KPIs da administradora) e 20 (relacionamento com proprietários) — 56 indicadores — saem do escopo. Não se cria entidade "proprietário terceiro", taxa de administração, repasse, nem churn/LTV de proprietário. |
| 2026-08-06 | O que fazer com a avaliação? | (c): corrigir os defeitos dos KPIs atuais **e** planejar as primitivas. |
| 2026-08-06 | Despesa do edifício deve ser rateada para as unidades ou fica só no edifício? | **"as duas opções, usuário decide".** O sistema suporta os dois modos e a escolha é do usuário, por lançamento — não é regra fixa do produto. Ver F2.1. |
| 2026-08-06 | Um galpão locado inteiro conta como unidade? | **"sim".** A base da ocupação passa a ser a **folha** da carteira, não `type !== 'BUILDING'`. Edifício sem unidade filha (galpão, loja de rua) é unidade locável; edifício com unidades continua fora, porque quem ocupa são elas. Implementado na Fase 0. |

### O que a decisão de escopo implica

O ORÇACLOUD é a plataforma de quem **é dono** dos ativos (Empreendimento → Torres
→ Unidades → Locação), não de quem administra imóvel alheio. Consequências que
valem para qualquer trabalho futuro em Locações:

- **Fora:** taxa de administração, receita por imóvel administrado, repasse ao
  proprietário e sua acurácia/prazo, prestação de contas, NPS/CSAT/churn de
  proprietário, CAC e LTV de proprietário, unidades por colaborador.
- **Dentro, e é o que substitui:** o "proprietário" é a própria organização/empresa
  (`companies`), então o que interessa é **rentabilidade do ativo** (NOI, cap rate,
  yield líquido) — que é exatamente o que a Fase 2 deste plano destrava.
- Se um dia a decisão mudar, isso é **um módulo novo**, não um punhado de KPIs.

## Diagnóstico que originou o plano

Cruzando as ~610 linhas do catálogo com o schema real, **cerca de um terço é
calculável hoje** — e a distribuição é muito desigual:

| Bloco do catálogo | Situação | Por quê |
|---|---|---|
| 6 Cobrança/inadimplência, 7 Contratos, 8 Reajustes | viável | Financeiro F1–7, `contracts`, módulo de reajuste, Renovações |
| 4 Preços, 9 Garantias, 1 Carteira, 2.1/2.2 Ocupação | viável | `rental_price`, tabela de aluguéis, motor hedônico, Garantias F1, `private_area`/`status`/`parent_id` |
| **2.3 Tempo de vacância** (13 itens) | **bloqueado** | não existe histórico de status da unidade → **Fase 1** |
| **10 OPEX, 11 Resultado, 12 Rentabilidade** (74 itens) | **bloqueado** | não existe despesa por imóvel → **Fase 2** |
| 3.1 Funil comercial (27 itens) | bloqueado | não há lead/visita/proposta em Locações → fora deste plano |
| 13–14 Manutenção/CapEx, 16 Vistoria, 17 Jurídico, 21 ESG | bloqueado | módulos inexistentes para o eixo locação → fora deste plano |
| 19–20 Administradora/Proprietários (56 itens) | **fora de escopo** | decisão de 2026-08-06 |

O gargalo **não é a lista de KPIs** — são duas tabelas que não existem. Este plano
cobre só essas duas. O funil de locação (3.1) fica para um plano próprio, porque é
replicação do CRM de Serviços, não primitiva nova.

---

## Fase 0 — Corrigir os KPIs que já estão no ar ✅

Descoberto durante a avaliação: os 5 KPIs da aba Análise tinham dois defeitos, e os
mesmos dois estavam duplicados no painel Resultados. Corrigir antes de somar KPI
novo — indicador errado destrói a confiança no painel inteiro.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `lib/rentalPortfolio.ts` (novo) | Extrai a conta de carteira para módulo puro: `sumPortfolioValue` (patrimônio conta cada imóvel uma vez) e `getDealInstallmentValue` (receita é a parcela contratada). Existe porque a fórmula estava duplicada em dois lugares e as duas cópias tinham os mesmos erros. | `npx vitest run __tests__/rentalPortfolio.test.ts` verde |
| `__tests__/rentalPortfolio.test.ts` (novo) | 18 casos de regressão: edifício+unidades sem contar em dobro, edifício sem unidades ainda soma, `parent_id` casando sem caixa, `installment_value` vencendo `value`, parcela zerada (carência) não caindo no fallback, ausência dos dois campos não virando `NaN` | 18/18 passando |
| `components/RentalsModule.tsx` | `stats`: **Valor patrimonial** parava de somar `properties` inteiro (edifício + unidades = dobro); **Receita mensal** parava de usar `deal.value` (valor SUGERIDO pela Inteligência = preço de tabela) e passa a usar a parcela contratada. Yield deixa de herdar os dois erros. Passa a importar de `lib/rentalPortfolio` | `tsc --noEmit` limpo + `check-ui-standard.sh` sem violação |
| `services/rentalsDashboardService.ts` | Mesmos dois defeitos no painel Resultados (`valorTotalPatrimonio`, `receitaMensal`, `cumulativeReal` da curva). `select` ganha `parent_id` e `installment_value`. Passa a importar de `lib/rentalPortfolio` | idem — e os dois painéis passam a mostrar o mesmo número para o mesmo KPI |
| `docs/ui_ux_guia_unificado.md` | §19.1 dizia que aba inativa é `text-gray-400 hover:text-gray-600`, que reprova WCAG AA (~2.5:1). O código certo (`gray-700`, commit `1b098fd`, a pedido do usuário em 04/08) estava sendo acusado de divergência pelo verificador. Guia atualizado, com a exceção preservada para toggles de ÍCONE | verificador estrutural para de apontar §19.1 no arquivo |

**Terceiro defeito, resolvido pela decisão do usuário:** a **Taxa de ocupação** usava
`type !== 'BUILDING'` como definição de "unidade locável", então o edifício locado
INTEIRO (galpão, loja de rua) — que não tem unidade filha — sumia da conta: ocupação
cega para ele. Com a resposta "um galpão locado inteiro conta como unidade? sim", a
base passou a ser a **folha**, a mesma do patrimônio.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `lib/rentalPortfolio.ts` | Extrai `leafNodes()` (antes só existia dentro do somatório) para servir de base comum a patrimônio **e** ocupação | 3 testes novos: galpão inteiro conta; edifício com unidades não conta (ocupação 1/2, não 1/3); os dois casos misturados |
| `components/RentalsModule.tsx` | `stats`: denominador da ocupação vira `leafNodes(properties)`. Some o fallback morto `allUnits.length \|\| properties.length` | 18/18 testes verdes |
| `services/rentalsDashboardService.ts` | `unidadesTotal`/`unidadesDisponiveis`/`unidadesOcupadas` contavam `rentalProps` inteiro — cada edifício entrava como "unidade" ao lado das próprias unidades e inflava o denominador | idem, e a ocupação passa a bater entre as duas telas |

---

### Fase 0.1 — Regressão em produção: o patrimônio zerou

Depois do deploy de `e5cf777`, o print de produção mostrou **Valor patrimonial
R$ 0** e **Yield 0.00%**, com 4 ativos e R$ 50.900/mês de receita. Regressão
introduzida por mim.

**Causa:** a regra de "somar só as folhas" partiu da premissa de que o valor mora
na unidade. **Em locação ele mora no prédio** — a unidade carrega `rental_price`
(o aluguel) e deixa `price` vazio, porque quem tem valor patrimonial é o edifício.
A própria coluna "Patrimônio" da lista mostra `property.price` **do edifício**
(`RentalsModule.tsx:1364`). Antes o KPI acertava por acidente: somava tudo, e como
as unidades eram zero, sobrava o total dos prédios. Ao excluir os prédios, sobrou
zero.

**Correção — `sumOverLeaves` vira `sumPortfolioValue` (rollup):** um nó vale a
soma dos filhos **quando os filhos têm valor**; senão vale o próprio preço. Cobre
os dois sentidos sem escolher um lado:

| Situação | Resultado |
|---|---|
| edifício com unidades precificadas | soma das unidades (não conta em dobro) |
| **edifício com unidades sem preço** | **preço do próprio edifício** ← era o zero |
| edifício sem unidades cadastradas | próprio preço |
| consulta que traz só as filhas (serviço com edifício selecionado) | soma das filhas — pai fora da lista conta como raiz |

`leafNodes` continua servindo à **ocupação**, que não depende de preço.

6 testes novos (18 no total), incluindo o caso real do print e `parent_id`
circular. Verificado no navegador com o formato do print (4 prédios + 24 unidades
sem preço, 5 alugadas): patrimônio R$ 8.300.000, yield 0,61%, e ocupação **20,8%
— idêntica ao print**, o que confirma que o formato inferido dos dados estava
certo.

**Lição para as próximas fases:** a hierarquia da carteira tem valor em níveis
diferentes conforme o cadastro. Qualquer agregação nova (OPEX na Fase 2, inclusive)
tem de decidir explicitamente se soma folha, soma nó ou faz rollup — e o rollup é
o único que não quebra quando o cadastro está pela metade.

---

## Fase 1 — Histórico de status da unidade

**Destrava:** seção 2.3 inteira (13 KPIs), mais turnover (16) e permanência (15).
É a primitiva mais barata do plano e a de maior retorno.

**Problema:** `commercial_properties.status` é um campo que **sobrescreve**. O
passado não existe, então "há quantos dias esta unidade está vaga" é hoje uma
pergunta sem resposta possível — não por falta de tela, por falta de dado.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/<ts>_property_status_events_parte1_tabela.sql` | Cria `commercial_property_status_events`: `id`, `organization_id`, `property_id`, `from_status`, `to_status`, `changed_at`, `changed_by`, `deal_id`, `source` (`MANUAL`/`DEAL`/`BACKFILL`/`IMPORT`), `notes`. Índice `(property_id, changed_at DESC)` | Tabela existe no **remoto** (conferir por query, não pelo arquivo — o histórico de migrations do projeto está furado) |
| `..._parte2_rls.sql` | RLS por `is_org_member(organization_id)`; `REVOKE ALL ON ... FROM PUBLIC, anon` antes de qualquer `GRANT` | `pg_policies` do remoto mostra a policy; `anon` não lê |
| `..._parte3_trigger.sql` | `AFTER UPDATE OF status ON commercial_properties` grava o evento. **`SET lock_timeout = '5s'` e idempotente** | Mudar o status de uma unidade cria exatamente 1 linha, com `from_status` correto |
| `..._parte4_backfill.sql` | Um evento `source='BACKFILL'` por unidade existente, com `changed_at` = `updated_at`/`created_at`. Sem isso, toda unidade nasce "sem histórico" e os KPIs vêm vazios no primeiro dia | `SELECT count(*)` de unidades sem nenhum evento = 0 |
| `services/rentalVacancyService.ts` (novo) | Lê os eventos e devolve: dias de vacância (média e **mediana**), faixas >30/60/90/180d, estoque envelhecido, absorção líquida | Teste com fixtures cobrindo unidade nunca alugada, unidade em 2º ciclo e unidade alugada hoje |
| `components/RentalsModule.tsx` (aba Análise) | KPIs de vacância entram na aba criada nesta sessão | Números batem com uma conferência manual sobre 3 unidades reais |

⚠️ **`commercial_properties` é tabela quente.** DDL com FK/trigger nela já
deadlockou neste projeto (a migration de Garantias F1, `20270836000000`, teve de ser
quebrada em 5 partes por causa disso). Daí as partes numeradas, o `lock_timeout` e a
idempotência: cada parte roda sozinha e pode ser reexecutada. **Nunca `supabase db
push`** — o histórico de `schema_migrations` está furado.

---

## Fase 2 — Despesa por imóvel (OPEX)

**Destrava:** seções 10 (26 KPIs), 11 (19) e 12 (29) — inclusive **NOI, margem NOI,
cap rate e yield líquido**, que são os indicadores que respondem *"quanto rende"* em
vez de *"quanto fatura"*. Sem esta fase, a seção 12 inteira é teatro: dá para mostrar
rental yield **bruto** e nada mais.

**Problema:** a despesa hoje é apropriada por obra e centro de custo.
`internal_transactions` tem `project_id`, `cost_center_id`, `plano_de_contas_id`,
`contract_id`, `supplier_id`, `category_id` — e **não tem `property_id`**. Um IPTU de
apartamento não tem onde pousar. (`commercial_properties.iptu_registration` é só o
número da inscrição, não o valor.)

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/<ts>_internal_tx_property_id_parte1.sql` | `ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES commercial_properties(id) ON DELETE SET NULL` + índice parcial `WHERE property_id IS NOT NULL`. **`SET lock_timeout='5s'`** | Coluna existe no remoto; nenhuma view/trigger existente quebrou |
| `..._parte2_views.sql` | `vw_payables` e demais views que projetam colunas de `internal_transactions` passam a expor `property_id` | `vw_payables` retorna a coluna; Contas a Pagar segue funcionando |
| `services/financialService.ts` (e quem grava despesa) | Grava `property_id` quando a despesa nasce de um imóvel. Segue valendo a REGRA #2: `project_id` de projeto de sistema continua `NULL` | Lançar um IPTU numa unidade e ver a dimensão gravada |
| `components/…` (lançamento de despesa) | Seletor de imóvel no formulário, opcional, hierárquico (edifício → unidade) | Despesa de condomínio do edifício e IPTU da unidade convivem |
| `services/rentalNoiService.ts` (novo) | NOI por imóvel = receita efetiva − despesa apropriada; margem NOI; cap rate; yield líquido. **Rollup unidade → edifício**. Lê sempre de `property_expense_allocations`, nunca de `internal_transactions.property_id` direto — um caminho só | NOI de um edifício = soma do NOI das unidades + despesas não rateadas do próprio edifício, conferido à mão |

### F2.1 — Rateio: os dois modos, escolha do usuário

Decisão de 2026-08-06: *"as duas opções, usuário decide"*. Não é regra fixa do
produto — condomínio de área comum pode fazer sentido rateado (para achar o NOI real
da unidade) e seguro predial pode fazer sentido parado no edifício. Quem sabe é quem
lança.

Para que o NOI não tenha dois caminhos de leitura, **o rateio é materializado**: toda
despesa de imóvel gera linha(s) em `property_expense_allocations`, e o modo só muda
quantas linhas são geradas.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/<ts>_property_expense_allocations.sql` | Tabela `property_expense_allocations`: `id`, `organization_id`, `transaction_id` → `internal_transactions`, `property_id`, `amount`, `basis` (`DIRECT`/`PRIVATE_AREA`/`MANUAL`), `basis_value`. RLS + `REVOKE PUBLIC` | Tabela e policy existem no remoto |
| idem, coluna de modo | `internal_transactions.property_allocation_mode` (`DIRECT` \| `PRORATED`), default `DIRECT` — guarda a **intenção** do usuário; as linhas de allocation são a consequência | Lançamento antigo continua válido como `DIRECT` |
| serviço de rateio | `DIRECT` → 1 linha com o valor cheio no imóvel escolhido. `PRORATED` → N linhas, uma por unidade filha, proporcionais à `private_area` (fallback `area`; se nenhuma unidade tiver área, rateio igualitário e **aviso ao usuário**, nunca divisão silenciosa) | Soma das allocations = valor do lançamento, **sempre**, inclusive com dízima (o resto vai para a maior unidade) |
| UI de lançamento | Ao escolher um imóvel do tipo edifício, oferece "manter no edifício" ou "ratear entre as unidades", com prévia de quanto cai em cada uma antes de salvar | Usuário lança condomínio rateado e vê a prévia bater com o extrato |
| Reprocessamento | Mudar o modo de um lançamento já salvo regrava as allocations em transação | Trocar `PRORATED`→`DIRECT` não deixa linha órfã |

⚠️ **Rateio não pode mudar o total.** O invariante a testar é `SUM(allocations.amount)
= internal_transactions.amount` para todo lançamento — é o que impede o rateio de
inventar ou sumir com despesa no NOI consolidado.

⚠️ **`internal_transactions` é a tabela mais quente do financeiro** (84 usos diretos
nos services, além de `vw_payables`, `vw_receivables`, partida dobrada e a trigger
`trg_strip_system_project_from_internal_tx`). Mesmo cuidado da Fase 1: parte única
por vez, `lock_timeout`, idempotente.

**Não há mais pergunta aberta nesta fase** — a decisão de 2026-08-06 ("as duas
opções, usuário decide") está desenhada em F2.1 acima.

---

### F2.2 — A UI de apropriação ✅ (caminho B)

⚠️ **Duas premissas deste plano estavam ERRADAS.** Ficam registradas porque as
duas custaram trabalho e as duas eram invisíveis lendo só o plano:

1. **"Seletor de imóvel no formulário de lançamento de despesa"** — esse
   formulário **não existe**. `payableService.create` é código morto (ninguém
   chama) e Contas a Pagar não tem botão de criar nem tela de detalhe. As contas
   nascem em **sete caminhos**: conciliação bancária, boleto, NF-e, fluxo P2P,
   folha, remuneração societária e tributos.
2. **"Ação em lote, que a tela já suporta"** — a barra de seleção múltipla que
   existe está na visão **Notas Fiscais**, que lê a tabela `invoices`. A visão
   **Parcelas**, a única com ids de `internal_transactions`, **não tem seleção**.
   Pendurar a ação lá passaria id de nota fiscal para a RPC e falharia só no uso
   real, com "lançamento não encontrado".

**Já pronto e correto:** `components/financeiro/ApropriarImovelSheet.tsx` —
painel lateral com seletor hierárquico de imóvel, alternância DIRECT × PRORATED,
prévia de quanto cai em cada unidade e aviso quando o rateio cai para divisão
igual por falta de área cadastrada. **Aceita uma LISTA de lançamentos**, então
serve tanto para ação por linha quanto em lote, sem alteração.

`payableService.create` foi estendido com `property_id` e o modo (grava a
apropriação após o insert). Continua sendo código morto — fica correto se alguém
criar o formulário um dia.

**Decisão de 2026-08-06 — (B), com (A) junto** (o usuário escolheu B; como B é
superconjunto de A e a Sheet já aceita lista, os dois saíram no mesmo trabalho):

| | O que é | Custo | Limite |
|---|---|---|---|
| **(A)** | Botão de ícone por linha, na visão Parcelas | baixo — nada de infra nova | IPTU de 12 meses = 12 cliques |
| **(B)** | Seleção múltipla na visão Parcelas + ação em lote | checkbox, seleção por range, barra de lote | é o **teto desta tela** |

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `components/ContasPagarParcelas.tsx` | Coluna de checkbox (40px fixo, fora do redimensionamento), selecionar-todos no thead, Shift+clique para intervalo (§10.1), barra de lote azul no rodapé (§10) e `ActionIconButton` de apropriação por linha. Abre `ApropriarImovelSheet` com 1 ou N lançamentos | `tsc --noEmit` limpo; `check-ui-standard.sh` sem violação; verificado no navegador (ver abaixo) |
| idem, guarda de organização | A org do lote é derivada dos **próprios lançamentos** (`row.organization_id`), não da prop — que vem `undefined` em "Todas as organizações" (REGRA #5). Seleção que mistura organizações desabilita o botão com o motivo no `title`, em vez de abrir a Sheet com o seletor de imóveis da org errada | Selecionar duas orgs desabilita; voltar para uma reabilita |

**Verificado no navegador** (harness isolado + Playwright, porque a tela real
exige sessão): 6 parcelas falsas, uma delas CANCELADA e uma de outra
organização.

- linha CANCELADA não tem checkbox nem botão de apropriar (nada a apropriar —
  o `expenseByProperty` já ignora `status = CANCELLED`);
- linha **PAGA tem** os dois — despesa paga é justamente a que precisa cair no OPEX;
- 2 IPTUs da mesma org → barra mostra "2 selecionadas · R$ 2.400,00", botão
  habilitado, Sheet abre com "2 lançamentos · R$ 2.400,00";
- acrescentando a parcela da outra org → botão desabilita com
  *"A seleção mistura organizações. Filtre por uma organização para apropriar."*;
- selecionar-todos → "5 selecionadas · R$ 11.750,00" (os 6 títulos menos a
  cancelada de R$ 999 — soma conferida à mão);
- console sem erro.

### F2.2.1 — Coluna "Imóvel" ✅ (depois da migration aplicada em 2026-08-06)

Com as 4 partes no remoto, a tela passou a mostrar o que já está apropriado —
sem isso o único retorno era o toast, e o esquecimento era invisível.

⚠️ **Terceira premissa errada, evitada a tempo.** O caminho óbvio seria ler
`vw_payables.property_id`, que a parte 4 expõe. Ele nunca é preenchido:
`fn_set_property_allocations` faz `UPDATE internal_transactions SET
property_allocation_mode = p_mode` e **só isso** (`parte3_rpc_rateio.sql:85-87`).
A coluna existe na view por simetria; a verdade da apropriação está em
`property_expense_allocations`. É o "um caminho só" que a Fase 2 já exigia para
o NOI — e vale igual para a UI.

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `services/propertyExpenseService.ts` | `allocationSummary(transactionIds[])` — resumo em lote das apropriações, com os nomes resolvidos num segundo passo. Devolve `null` (não medido) quando a tabela não existe ou a RLS barra | Verificado nos dois estados no navegador |
| `components/ContasPagarParcelas.tsx` | Coluna "Imóvel": 1 alocação = nome; N = "Rateado · N imóveis"; nenhuma = "—" com tooltip *"não entra em NOI nenhum"*; serviço indisponível = "n/d", que **não** é a mesma coisa. Entra na busca e na ordenação. Após apropriar, recarrega só o resumo (§22), não a lista | `tsc` limpo, `check-ui-standard.sh` sem violação |
| idem — `payableService` **não** foi tocado | A coluna não vem da view, então o `select` explícito de `payableService.ts:30` segue como estava | menos superfície de risco |

**Bug pré-existente que esta coluna revelou:** o `useMemo` de `filtered` lia
`rowsWithNames` mas declarava `rows` como dependência. Nomes resolvidos por
consulta assíncrona chegavam **depois** das linhas, o memo não recalculava e a
coluna ficava vazia para sempre. Valia igual para **Centro de Custo** e **Plano
de Contas** — latente porque aqueles cadastros normalmente chegam antes. A
coluna "Imóvel" resolve sempre depois, então tornou o defeito determinístico.
Corrigido trocando a dependência para `rowsWithNames`.

**O que NENHUM dos dois resolve** (e a próxima sessão não deve confundir com
"fase concluída"): nos dois caminhos, toda despesa exige um passo **manual
depois** de criada. Como as contas nascem por sete rotas automáticas, o que
alguém esquecer de apropriar some do NOI **em silêncio** — que é a classe de
defeito mais cara desta fase inteira. O completo de verdade seria a **origem já
carregar o imóvel** (regra por fornecedor/categoria, ou o pedido de compra
herdando do imóvel do contrato), com a UI manual servindo só para correção.
Isso é F2.3, ainda não planejado.

Falta também **reapropriar**: mudar o imóvel ou o modo de um lançamento já
apropriado. A RPC já substitui atomicamente e a Sheet já chama, então
reapropriar **funciona** — mas às cegas: ela abre sempre em branco, porque não
lê `propertyExpenseService.getAllocations` para pré-selecionar o imóvel e o modo
atuais. O usuário não vê o que está trocando.

---

## Fase 3 — O painel, depois das primitivas

O catálogo sugere um "dashboard executivo" com 20 KPIs. **20 não é dashboard, é
relatório.** Com as Fases 1 e 2 no lugar, 8 indicadores respondem praticamente tudo:

1. Taxa de ocupação física · 2. Taxa de ocupação financeira · 3. Dias médios de
vacância · 4. Receita contratada × recebida · 5. Inadimplência acima de 90 dias ·
6. NOI e margem NOI · 7. WALE da carteira · 8. Taxa de renovação

O resto do catálogo vira painel de aprofundamento, filtrável pelas dimensões da
seção "Dimensões obrigatórias" (Anexo A) — **exceto** as que a decisão de escopo
eliminou (proprietário).

## Estado

- [x] **Fase 0** — 3 defeitos corrigidos (patrimônio em dobro, receita a preço de
      tabela, ocupação cega para edifício locado inteiro). 18 testes verdes, `tsc`
      limpo. Ainda **não commitada**; falta a conferência com dados reais — ver
      "Verificação".
- [x] **Fase 1 — CONCLUÍDA e validada em produção (2026-08-06).** As 4 partes
      foram aplicadas à mão no SQL Editor. Validação de ponta a ponta:
      - trigger instalada (`trg_log_property_status_change` em `pg_trigger`);
      - dispara em mudança real, com `from_status` e `changed_by` corretos;
      - **não** dispara em salvamento sem mudança de status — nenhuma linha com
        `from_status = to_status`, que é o que valida o `WHEN (OLD.status IS
        DISTINCT FROM NEW.status)`;
      - cards renderizaram na aba Análise, o que também prova a RLS (a consulta
        pelo SQL Editor roda como service role e passa por cima dela);
      - **Absorção líquida (30d) = +2**, batendo com as 2 locações feitas no
        teste — o primeiro indicador do sistema que só existe por causa do log.
      19 testes da matemática de vacância verdes.
- [x] **Fase 2 — CONCLUÍDA (2026-08-10).** Motor, UI e migrations aplicados e
      conferidos no remoto. **Os dois modos exercitados contra o banco real** —
      `DIRECT` (2 apropriações do usuário) e `PRORATED` (12 unidades, dízima
      fechando exato) — mais as travas do servidor. Nada ficou provado só por
      teste unitário.
      - Banco: 4 partes em `supabase/migrations/aplicar_20270902000000/`
        **aplicadas**, e conferidas **por query no remoto**, não pelo arquivo:
        `internal_transactions` devolveu `property_allocation_mode: "DIRECT"`
        em linha real (parte 1); `property_expense_allocations` e `vw_payables`
        responderam `42501 permission denied` a `anon` — existem e estão
        fechadas (partes 2 e 4); `fn_set_property_allocations` respondeu
        `42501 permission denied for function` (parte 3 — existe, `anon` não
        executa); `information_schema` confirmou `property_id`,
        `property_allocation_mode` e `property_name` em `vw_payables`.
      - ⚠️ Sonda inconclusiva a evitar: chamar a RPC com `{}` devolve
        `PGRST202`, que **parece** "não existe" mas é só o PostgREST procurando
        uma assinatura sem parâmetros. Sondar sempre com os nomes reais.
      - `lib/rentalAllocation.ts` — rateio com o invariante da soma (12 testes,
        inclusive dízima fechando exato e proteção contra erro de float).
      - `lib/rentalNoi.ts` — NOI com rollup unidade→edifício, margem e cap rate
        (12 testes).
      - `services/propertyExpenseService.ts`, `services/rentalNoiService.ts` —
        degradam para `null` sem as tabelas; verificado no navegador.
      - Aba Análise ganha Receita/Despesa/NOI/Margem.
      - UI de apropriação **feita** (caminho B — ver F2.2): seleção múltipla e
        ação em lote na visão Parcelas, mais o botão por linha, mais a coluna
        "Imóvel" (F2.2.1).
      - ✅ **GRAVAÇÃO REAL VERIFICADA (2026-08-10).** Duas despesas apropriadas
        pela tela, e o invariante conferido pela API: `252,88 = 252,88` e
        `550,00 = 550,00`. A consulta de `expenseByProperty` (join `DEBIT` +
        `status ≠ CANCELLED`) devolve as duas — o motor de NOI enxerga o que a
        UI grava. O caminho fecha de ponta a ponta.
      - ✅ **RATEIO (`PRORATED`) EXERCITADO CONTRA O BANCO (2026-08-10).**
        R$ 1.000,00 rateados entre as **12 unidades** de "013 - Galeria
        Altavista" (áreas irregulares: 28,39 / 20,04 / 17,58 / 15,31 m²…,
        somando 256,51 m²) — caso escolhido justamente para forçar dízima.
        Feito pela UI real (Sheet → serviço → RPC), com sessão autenticada, não
        por `curl`:
        - prévia na tela somou **R$ 1.000,00** exato;
        - banco: **12 linhas**, `basis = PRIVATE_AREA`, modo `PRORATED`,
          `SUM = 1000.00` — **invariante fecha**.

        **As travas do servidor também foram testadas**, e é o que garante que
        um cliente com bug não corrompa o NOI:

        | Entrada | Resposta |
        |---|---|
        | rateio somando 999,99 para lançamento de 1.000,00 | recusa `23514`, com a diferença de R$ 0,01 na mensagem |
        | estado após a recusa | **12 linhas intactas** — atômico, sem estado parcial |
        | `p_mode = 'BANANA'` | recusa `22023` |

        O lançamento de teste foi **revertido** ao estado original (lista vazia
        + `DIRECT`); as 2 apropriações reais do usuário seguem intactas.
      - **PENDENTE: reapropriar** — trocar imóvel ou modo de um lançamento já
        apropriado. A RPC substitui atomicamente, mas a Sheet sempre abre em
        branco: não lê `getAllocations` para pré-selecionar o que já está lá.
- [ ] Fase 3 — não iniciada

## Verificação

**Fase 0 (feita):**
```bash
npx vitest run __tests__/rentalPortfolio.test.ts   # 18/18
npx tsc --noEmit -p .                              # exit 0
bash scripts/check-ui-standard.sh components/RentalsModule.tsx
```
Falta a conferência na tela real com dados de produção. Abrir Comercial › Locações ›
Gestão de Locações › Análise e confirmar os três:

1. **Valor patrimonial caiu** — deixou de contar edifício + unidades em dobro.
2. **Receita mensal** bate com a soma das parcelas contratadas, não com o preço de
   tabela da Inteligência.
3. **Taxa de ocupação** mudou **apenas** se a carteira tiver edifício locado inteiro
   ou edifício sem unidades cadastradas; numa carteira só de prédios com unidades, o
   número é idêntico ao de antes (é o resultado esperado, não um sinal de que não
   pegou).

Enquanto isso não for visto numa carteira real, a Fase 0 não pode ser declarada
concluída — `tsc` e teste unitário não provam o número na tela.

**Fases 1 e 2:** cada migration é conferida **por query no remoto**, nunca pelo
arquivo no repositório — o histórico de `schema_migrations` deste projeto está
furado (`20270208*` foi aplicada via SQL direto).

---

## Anexo A — catálogo recebido (transcrição literal da estrutura)

Índice das 25 seções, como enviadas:

1. KPIs de carteira imobiliária
2. Ocupação e vacância (2.1 Ocupação física · 2.2 Ocupação financeira · 2.3 Tempo de vacância)
3. KPIs comerciais e de locação (3.1 Funil comercial · 3.2 Corretores e parceiros)
4. KPIs de preços e rentabilidade dos contratos
5. Receita imobiliária
6. Cobrança e inadimplência (6.1 Recebimento · 6.2 Inadimplência)
7. Contratos de locação
8. Reajustes, revisões e índices
9. Garantias locatícias e risco de crédito
10. Despesas operacionais
11. Resultado operacional do imóvel
12. Rentabilidade do ativo e do investidor (+ Indicadores de dívida, quando houver financiamento)
13. Manutenção e facilities
14. CapEx, reformas e melhorias
15. Locatários e experiência do cliente
16. Desocupação, vistoria e giro de unidades
17. Jurídico e contencioso
18. Compliance, documentação e seguros
19. KPIs da administradora imobiliária — **fora de escopo (2026-08-06)**
20. KPIs de relacionamento com proprietários — **fora de escopo (2026-08-06)**
21. KPIs de sustentabilidade e eficiência
22. KPIs adicionais para imóveis comerciais
23. KPIs adicionais para imóveis residenciais
24. KPIs adicionais para galpões e imóveis industriais
25. KPIs preditivos e de inteligência

**Dashboard executivo recomendado (literal, 20 itens):** Taxa de ocupação física;
Taxa de ocupação financeira; Vacância financeira; Dias médios de vacância; Receita
potencial bruta; Receita contratada mensal; Receita efetivamente recebida; Receita
perdida por vacância; Taxa de arrecadação; Taxa de inadimplência; Inadimplência acima
de 90 dias; Aluguel médio por m²; Spread de novas locações e renovações; Contratos
vencendo nos próximos 12 meses; Taxa de renovação; WALE da carteira; OPEX por m²; NOI
e margem NOI; Chamados de manutenção fora do SLA; Resultado líquido e valor a repassar
aos proprietários *(este último cai com a decisão de escopo)*.

**Segunda linha executiva (literal):** Cap rate; rental yield líquido; custo mensal da
vacância; concentração nos cinco maiores locatários; contratos sem garantia adequada;
reajustes pendentes; tempo médio para preparar uma unidade; churn de locatários;
satisfação de locatários; precisão do forecast financeiro.

**Dimensões obrigatórias para análise (literal):** empresa e carteira; proprietário;
empreendimento; bloco, torre ou pavimento; unidade; cidade, bairro e região; tipo de
imóvel; tipologia da unidade; locatário; segmento econômico; contrato; corretor ou
canal de captação; tipo de garantia; situação da unidade; faixa de preço; faixa de
área; período; centro de custo; fornecedor; responsável interno.

## Anexo B — os KPIs que este plano destrava (literal)

### Fase 1 destrava — seção "2.3 Tempo de vacância"

Dias médios de vacância; Mediana dos dias de vacância; Unidades vagas há mais de 30
dias; Unidades vagas há mais de 60 dias; Unidades vagas há mais de 90 dias; Unidades
vagas há mais de 180 dias; Estoque envelhecido; Tempo até disponibilização; Tempo de
preparação da unidade; Tempo efetivo de comercialização; Velocidade de absorção;
Absorção líquida; Taxa de pré-locação.

### Fase 2 destrava — seção "10. Despesas operacionais"

Despesa operacional total; OPEX por unidade; OPEX por m²; OPEX sobre receita; Custo
fixo mensal do imóvel; Custo variável mensal; Crescimento do OPEX; Desvio orçamentário
de despesas; Despesas controláveis; Despesas não controláveis; Condomínio por unidade;
Condomínio por m²; IPTU por unidade; Seguro por unidade; Custo de limpeza por m²;
Custo de segurança por m²; Custo de energia das áreas comuns; Custo de água das áreas
comuns; Custos não recuperáveis; Custos recuperáveis; Taxa de recuperação de despesas;
Vazamento de recuperação; Economia em compras; Economia em renegociações; Custo por
fornecedor; Concentração de fornecedores.

### Fase 2 destrava — seção "11. Resultado operacional do imóvel"

Receita Operacional Líquida — NOI; Margem NOI; NOI por unidade; NOI por m²; Crescimento
do NOI; NOI same-store; Resultado de caixa do imóvel; Fluxo de caixa operacional;
Margem operacional; Custo operacional sobre receita; Ponto de equilíbrio financeiro;
Ocupação de equilíbrio; Cobertura das despesas; Resultado por unidade; Resultado por
proprietário *(fora de escopo)*; Resultado por empreendimento; Desvio do resultado
orçado; Previsibilidade da receita; Precisão do forecast.

### Fase 2 destrava — seção "12. Rentabilidade do ativo e do investidor"

Rental yield bruto *(já viável hoje)*; Rental yield líquido; Cap rate; Yield on cost;
ROI; ROA; ROE; Cash-on-cash return; Retorno total; Valorização do imóvel; TIR; VPL;
Payback simples; Payback descontado; Retorno realizado versus projetado; Distribuição
ao proprietário *(fora de escopo)*; Yield de distribuição *(fora de escopo)*; Ganho de
capital não realizado; Custo total de propriedade; Retorno por imóvel; Retorno por m²;
Retorno por tipologia. Mais o bloco de dívida (LTV, DSCR, Debt yield, Cobertura de
juros, Custo médio da dívida, Amortização mensal, Fluxo de caixa após dívida, Ocupação
necessária para pagar a dívida), que só se aplica quando houver financiamento.
