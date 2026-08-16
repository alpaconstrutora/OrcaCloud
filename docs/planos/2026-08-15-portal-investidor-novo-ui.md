# Portal do Investidor — novo UI/UX (exceção ao guia unificado)

**Sessão:** 2026-08-15 · **Estado:** 8 de 8 itens implementados e verificados no
navegador (harness Playwright). **Não commitado / não publicado** até aqui.

---

## Pedido original

> alterar o portal do investidor (visão do investidor) no mesmo padrao do portal
> do clinte (visão de cliente via token )

(entregue e publicado no commit `2bd2424` — casca standalone: faixa de link
público, header com menu de conta, sidebar, barra inferior mobile)

Em seguida, com um print de referência anexado (dashboard "marketing-intelligence",
estilo Shakuro — faixa de KPIs com divisores, card de tendências com legenda e
tooltip, tabela com abas e linha expansível, pílulas de status, acento coral):

> Implemente o UI do print, no portal do investidor (visão do investidor)

Perguntado sobre fidelidade (o print quebra 4 regras do guia obrigatório) e
escopo, o usuário respondeu:

- **Fidelidade:** "Fiel ao print, inclusive pílulas e laranja"
- **Escopo:** "Portal inteiro (4 abas)"
- E, por mensagem própria: > vamos abrir excessao nesta caso. vamos testar esse novo UI UX

---

## Decisão de padrão (exceção deliberada)

O print diverge do `docs/ui_ux_guia_unificado.md` em quatro pontos. A exceção foi
**autorizada explicitamente** e vale **só para o Portal do Investidor** (as 4 abas
que o investidor vê). Nenhuma tela interna do app entra nela.

| Divergência | Seção do guia | Decisão |
|---|---|---|
| Pílula de status com fundo + uppercase | §8 | permitida no portal |
| `<thead>` em caixa alta | §6.2 | permitido no portal |
| Acento coral `#E1553C` em vez do azul | §17 | permitido no portal |
| Faixa de KPIs com divisores e tendência, sem `KpiCard` | §4 / §4.4 | permitido no portal |

Registrada como **§24** no próprio guia (o guia manda documentar a exceção, não
inventar estilo ad-hoc — `CLAUDE.md` REGRA #1, item 4). `check-ui-standard.sh`
continua acusando essas linhas; a saída correta é apontar para a §24.

---

## Itens

### 1. `docs/ui_ux_guia_unificado.md`
**Muda:** nova seção §24 "Portal do Investidor — vocabulário próprio (exceção)",
com os 4 desvios, o critério de escopo e a lista de arquivos cobertos. Entrada no
`CHECKLIST DE AUDITORIA COMPLETA`.
**Pronto quando:** a seção existe, cita os arquivos e diz o que continua valendo
(tamanho de texto, `py-2.5`, ações sempre visíveis, `useConfirm`).

### 2. `components/investor/portal/PortalKit.tsx` (novo)
**Muda:** primitivas do vocabulário — tokens de cor, `PortalCard`, `KpiStrip`,
`StatusPill`, `PortalTabs`, `PrimaryButton`/`SoftButton`, `Th`/`Td`, `EmptyState`.
**Pronto quando:** cada primitiva é usada por pelo menos uma das 4 abas e nenhuma
aba escreve `bg-[#E1553C]` à mão.

### 3. `components/investor/portal/PortalOverview.tsx` (novo) — aba Resumo
**Muda:** faixa de KPIs (Patrimônio, Rendimento, Obras, Aportado, Dividendos) com
divisores e delta; card "Evolução" com 3 séries alternáveis pela legenda, tooltip
em caixa e pílula de data no eixo; tabela com sub-abas (Participações, Aportes,
Dividendos) e linha expansível com detalhe + ações.
**Pronto quando:** as 3 sub-abas renderizam com dados reais, a legenda liga/desliga
série, e a linha expande mostrando ação primária coral.

### 4. `components/investor/portal/PortalHoldings.tsx` (novo) — aba Carteira
**Muda:** tabela no novo vocabulário com filtro de status em pílulas e linha
expansível (aportado, patrimônio, ROI, progresso) + "Ver empreendimento".
**Pronto quando:** abre o `AssetDetailModal` existente pela ação da linha.

### 5. `components/investor/portal/PortalOpportunities.tsx` (novo) — aba Oportunidades
**Muda:** versão do investidor (somente leitura) em cards do novo vocabulário.
O `OpportunitiesTab.tsx` do admin **não é tocado**.
**Pronto quando:** o investidor vê as oportunidades publicadas e o admin continua
com a tela de CRUD antiga.

### 6. `components/investor/portal/PortalDocuments.tsx` (novo) — aba Documentos
**Muda:** tabela de documentos (data, nome, categoria, ação de download) +
comunicados com confirmação de leitura. `ReportsTab.tsx` do admin não é tocado.
**Pronto quando:** download abre o arquivo e "Confirmar" marca o comunicado.

### 7. `components/InvestorDashboard.tsx`
**Muda:** quando `isPublicExperience`, renderiza os 4 componentes novos; acentos
da casca (badge do header, item ativo da sidebar, barra inferior) passam de
indigo/azul para coral.
**Pronto quando:** o portal por token mostra o novo UI nas 4 abas e o app interno
(admin, abas Financeiro/Fiscal/SPE/Relatórios) segue inalterado.

### 9. Correções pós-entrega (2026-08-16)

Reportado pelo usuário: *"selecionar as abas visiveis no portal do investidor (app)
nao reflete na visão do investidor (token)"* e, depois, *"desliguei tudo e continua
aparecendo para o investidor. carteira so existe para o investidor. no app nao existe."*

**Causas encontradas (três, independentes):**

1. **Lista vazia lida como "não configurado"** — `deriveTabIds` fazia
   `saved.length > 0 ? saved : TODAS`. Desligar todas gravava `[]` e o portal
   voltava com **todas** as abas. Agora só `undefined`/`null` significa "nunca
   configurado" (`Array.isArray(saved)`).
2. **Segundo fallback** — `navTabs` fazia `visibleTabs.length > 0 ? ... : dashboard`,
   reacendendo Resumo mesmo com tudo desligado. Removido; sem aba habilitada o
   portal mostra o aviso "Portal em configuração" em vez de reabrir aba sozinho.
3. **6 interruptores mortos** — o modal oferecia as 10 abas do app, mas o portal
   só renderiza 4 (`PUBLIC_RENDERABLE_TAB_IDS`). Simulador, Financeiro, Fiscal,
   Comunicados, SPE e Relatórios não faziam nada. O modal agora lista só as 4 e
   explica as demais num bloco "Exclusivas do gestor".
4. **Dois nomes para a mesma aba** — app dizia "Evolução"/"Cotas", investidor lia
   "Resumo"/"Carteira". `PUBLIC_TAB_LABELS` foi eliminado: `TABS` passa a ter um
   nome só, o que o investidor lê.

**Conformidade do arquivo tocado** (verificação estrutural acusou 3 divergências
pré-existentes na visão do GESTOR, fora do escopo da §24 — corrigidas):
§20 (`h1` `text-4xl` + etiqueta em caixa alta → `text-3xl` + subtítulo `mt-1.5`,
raiz `space-y-6`), §19.1 (abas em azul sólido com `overflow-x-auto` → card +
trilho, ativa branca, `h-7`, `flex-wrap`), §14 (modal de confirmação local →
`useConfirm()`).

**Verificado no navegador:** 3 configurações (nunca configurado → 4 abas; só duas
→ 2 abas; tudo desligado → 0 abas + aviso) e a visão do gestor após as correções.

### 10. Todas as abas no portal (2026-08-16)

Pedido: *"o portal do investidor (visao do investidor) deve oferecer todas as abas
que o portal do investido visao do app tem, nao apenas 4"*.

`PUBLIC_RENDERABLE_TAB_IDS` deixa de ser uma lista curta e passa a ser
`TABS.map(...)`: **as 10 abas existem no portal**. O que muda entre gestor e
investidor é o CONTEÚDO (leitura × administração), não a lista de abas — quem
decide o que o investidor vê é `investorPortalTabs`.

| Aba | Visão do investidor | Backend novo |
|---|---|---|
| Simulador | `InvestmentSimulator` (não faz consulta) dentro do cartão do portal | não |
| Financeiro | `PortalFinance` — KPIs, próximo compromisso e extrato de movimentações | não |
| Fiscal | `PortalFiscal` — informativo de rendimentos por empreendimento | não |
| Comunicados | `PortalAnnouncements` — aba própria, com confirmação de leitura | não |
| Relatórios | `PortalDocuments onlyCategory="relatorio"` — leitura, sem o gatilho de emissão | não |
| SPE | `PortalSpes` — só a participação do próprio investidor | **sim** |

⚠️ **SPE exige migration.** `SpeManager` (gestor) lista todas as SPEs da org **e
todos os sócios**, com nome e e-mail — não podia ser reaproveitado. Foi criada
`fn_investor_portal_get_spes` (`20270816000001`), que devolve só as SPEs em que o
investidor do token é sócio, só a participação dele, e a contagem de sócios sem
identificar ninguém. **Ainda NÃO aplicada no banco** — enquanto não for,
`getSpesByToken` detecta a função ausente (PGRST202), devolve `[]` e a aba mostra
estado vazio em vez de derrubar o portal.

Defeito achado no harness e corrigido: comunicado com `published_at` em data pura
aparecia um dia antes (`new Date('YYYY-MM-DD')` é UTC) — passou a usar `parseDate`.

**Verificado no navegador:** Financeiro, Fiscal, SPE, Relatórios e Comunicados por
print, sem scroll horizontal e com 0 erro de página.

### 8. Verificação
**Pronto quando:** `npx tsc --noEmit` limpo; harness Playwright em 1440px e 390px
com print das 4 abas; `check-ui-standard.sh` rodado e cada acusação apontada para
a §24.

✅ **Feito.** `tsc` limpo; harness em 1440×980 e 390×844, 0 erro de página, sem
scroll horizontal em nenhum dos dois; as 4 abas, a linha expansível, o tooltip do
gráfico, a pílula de data no eixo e o liga/desliga de série conferidos por print.
`check-ui-standard.sh` passou nos 6 arquivos — **mas isso não prova conformidade
com o §8**: o checador procura `rounded-full`+`uppercase`, e a pílula do portal usa
`rounded-[6px]`, então ela passa pela heurística sem passar pela regra. A exceção
real está registrada no §24 do guia.

**Defeitos achados pelo próprio harness e corrigidos** (nenhum apareceu no `tsc`):
1. `"3 participaçãoões"` — pluralização concatenando sufixo errado (`PortalHoldings`);
2. datas em "02 de ago. de 26" (pt-BR longo) — helper `compact()` no kit;
3. rótulo do eixo "jan. de 26" → `fmtMonthShort` ("jan/26");
4. pílula de data do eixo invisível (texto branco sem fundo) — passou a ser
   desenhada em SVG, e o tick cinza sob ela é escondido para não sobrepor;
5. delta "0%" cinza poluindo o KPI em mês sem movimento — omitido;
6. patrimônio truncado no mobile ("R$ 1.372.000,...") — reformatado sem centavos.
