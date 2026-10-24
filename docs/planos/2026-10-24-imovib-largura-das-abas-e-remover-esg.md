# Viabilidade: abas na largura do estudo, "&" vira "e", e a aba ESG e Parecer sai do app

## Pedido original

Sessão `4d99919b-99fd-431d-8392-2c229dc3a12a`, 2026-10-24 (com print do Garden Cambuhy › Receitas & Capital, onde a tabela "Vendas de Ativos" aparece cortada à direita):

> a tabela nao esta ocupando a tela (padding fora de padrao). Corrigir abas receita & capital, sensibilidade & risco, ESG & Parecer. Aproveite para trocar o & por e

Depois da entrega (PR #127):

> faltou a aba resumo executivo

E, no meio do trabalho no Resumo:

> remover a aba ESG e parecer do app

## O que existe (levantado em 2026-10-24)

- **Largura (PR #127, feita):** Receitas e Capital, Sensibilidade e Risco e ESG e Parecer tinham `max-w-5xl`, `max-w-7xl` e `max-w-6xl` com `mx-auto`: 1.024, 1.280 e 1.152 px numa área útil de 1.604 px. A tabela "Vendas de Ativos" precisa de ~1.162 px e rolava de lado.
- **Resumo Executivo:** o mesmo bloco (`printRef`) tinha `max-w-5xl mx-auto` e ainda `bg-slate-50 p-6`, que deixava os KPIs recuados 24 px em relação ao card do topo e ao banner. Esse bloco é o que o PDF captura: o PDF encaixa a captura em 190 mm, então o texto dele depende da largura em que o bloco foi montado.
- **ESG nos dados:** nenhum estudo usa. Os 3 têm notas 3/3/3 (padrão), decisão "rascunho", 0 iniciativas ativas, sem certificações nem texto.
- **O que a aba alimentava:**
  - motor (`useImovibMath`): custo ESG, prêmio no VGV e desconto no funding;
  - CAPEX: card "Custo provisionado: medidas ESG";
  - Estática: texto "inclui prêmio ESG";
  - Resumo: card de impacto financeiro, seção "Parecer Institucional e ESG" do PDF e o "Status" do comitê no cabeçalho do PDF;
  - Portal do Investidor (`OpportunityDetail`): bloco "Iniciativas ESG e Sustentabilidade", que aparecia em TODO estudo porque a nota padrão (3) conta como "tem ESG".

## Itens

### 1. Resumo Executivo na largura do estudo

- [x] `ImovibExecutiveSummary.tsx`: na tela o bloco é só `space-y-6` (sem fundo, padding nem teto). Fundo, `p-6`, `rounded` e `max-w-5xl` valem **só durante a exportação**, a largura em que o PDF sempre foi montado.
  *Pronto quando:* o card do topo e a faixa de KPIs têm as mesmas bordas na tela, e o PDF sai com a mesma largura de antes. → Tela: conferida na produção com a correção simulada no DOM (284 a 1.888 px nos dois). **PDF: não gerado** (a exportação roda no navegador; a lógica de captura não mudou, só o momento em que a classe de largura é aplicada).

### 2. Remover a aba ESG e Parecer

- [x] `ImovibDetailView.tsx`: sai a aba, o tipo `esg_report` e o import.
- [x] Apagados: `components/ImovibEsgReportForm.tsx`, `__tests__/components/ImovibEsgNota.test.tsx`, `__tests__/imovibRatingOpura.test.ts` (o Rating Opura só existia nessa aba).
- [x] Resumo: saem o card de impacto ESG, a seção do PDF e o status do comitê do cabeçalho do PDF; as observações do Excel que falavam de ESG.
- [x] CAPEX e Estática: saem o card e o texto de ESG.
- [x] Motor: `computeImovibMath` deixa de ler `esg_initiatives`; os 3 campos `esg*` saem do resultado. Estudo com iniciativa ativa voltaria a calcular sem prêmio, custo e desconto — **nenhum estudo tem**.
- [x] Portal do Investidor: sai o bloco "Iniciativas ESG e Sustentabilidade".
- [x] Tipos e consulta da listagem: saem os campos `esg_*` e `committee_*` e `esg_initiatives` do select.
  *Pronto quando:* `git grep -E "\besg\b|esg_|ImovibEsg"` só acha a sigla de esgoto da Planta.

## Decisões

- **Colunas do banco: apagadas depois, a pedido.** Na entrega do PR #130 elas ficaram (apagar é irreversível e só se pedira a aba); o usuário respondeu "apagar". Migration `aplicar_20271024500000_imovib_remover_colunas_esg.sql`: DROP de `esg_environmental_score`, `esg_social_score`, `esg_governance_score`, `esg_certifications`, `esg_initiatives`, `esg_notes`, `committee_decision` e `committee_notes`, **sem cópia** (eram os padrões: 3/3/3, "rascunho", sem texto, e a lista padrão de 5 iniciativas inativas no Bruninho).
- **Premissas, CAPEX e Estática** mantêm o `pb-10` interno; fora do pedido.

## Andamento

- 2026-10-24: PR #127 publicado (largura das 3 abas e "&" → "e"). Item 1 e 2 implementados na frente `imovib-resumo-largura`.
- 2026-10-24 (tarde): PR #130 publicado (`ee73430c`) e conferido na produção: 7 abas, sem ESG, Resumo e Receitas e Capital em largura total.
- 2026-10-24: colunas `esg_*` e `committee_*` apagadas de `imovib_studies`. Antes: nenhuma view, função, gatilho, CHECK, policy ou índice dependia delas; `main` não as lia. Ensaio com ROLLBACK (0 restantes e as 8 voltaram), aplicação, 0 colunas. Na API publicada: listagem e `select *` do detalhe respondem 200; pedir `esg_initiatives` dá 42703 (contraprova).
  - Quem estiver com a página aberta desde antes do deploy do #130 (código antigo) verá erro na listagem até recarregar.
