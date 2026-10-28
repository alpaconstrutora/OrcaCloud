# Central de Clientes — aplicar a crítica (`/impeccable critique`)

## Pedido original

> /impeccable critique: aplique quando puder

Sessão `1880c008-dd77-4f94-9d0d-2c1d01ed5ec4` · 27/10/2026. Alvo implícito: Análises e Dados ›
Central de Clientes (mesma tela do `audit` e do `harden`, PR #211). A crítica deu **21/40**
(1 P0 · 3 P1 · 1 P2); registro em `.impeccable/critique/2026-10-28T00-57-17Z__components-centralcliente-tsx.md`.

## Decisões tomadas com o usuário (27/10, perguntas do critique)

| Pergunta | Resposta |
|---|---|
| Até onde vai a aplicação? | **"Tudo, com 'Por cliente'"** — inclui a tabela nova por cliente |
| Trocar o vocabulário "Previsto"? | **"Manter 'Previsto', só marcar o vencido"** — texto atual fica; o vencido ganha marca própria no extrato e no KPI; o gráfico continua Previsto × Realizado |
| Corrigir a gaveta (`Sheet`) no componente? | **"Corrigir no Sheet"** — melhora todas as gavetas do app; conferir 2–3 telas que usam |
| Card do funil Contratado × Faturado × Recebido | **"Remover"** — a relação vai para a legenda dos KPIs |

Decisão minha, a confirmar no relatório: as linhas clicáveis do `StandardTable` ganham
teclado (Enter/Espaço + foco visível) no componente — mesmo defeito do `Sheet`, mesma
lógica de corrigir na peça compartilhada.

Dados medidos (27/10): lançamentos com cliente = 362, todos `CREDIT` (152 conciliados,
210 pendentes). Por isso o pivô por cliente/obra e o extrato rodam com `direction: 'CREDIT'`:
hoje não muda nada, e garante que linha, gaveta e KPI Inadimplência usem a mesma regra.

## Plano

1. **`components/ui/sheet.tsx`** — `role="dialog"`/`aria-modal` só aberto; fechado = `inert` + `aria-hidden` (fora do Tab); `aria-labelledby` → `SheetTitle`; ao abrir (modal) o foco entra no painel e, ao fechar, volta para quem abriu; Tab fica dentro do painel enquanto o foco estiver nele; X com `aria-label="Fechar"`.
   - Pronto quando: na Central, abrir a gaveta pelo teclado leva o foco para ela, Esc devolve o foco à linha, e nenhuma gaveta fechada recebe Tab; conferido em mais 2 telas com `Sheet`.
2. **`components/ui/StandardTable.tsx`** — com `onRowClick`, a linha recebe `tabIndex=0`, Enter/Espaço (só quando o foco está na própria linha) e anel de foco; `rowLabel` opcional dá nome acessível.
   - Pronto quando: Tab chega à linha e Enter faz o mesmo que o clique.
3. **`components/CentralCliente.tsx` — KPIs** — `KpiCard destaque` (§4.5) no lugar do KPI feito à mão: Contratado · Faturado (`x% do contratado`) · Recebido (`x% do faturado`) · Inadimplência (`x% do saldo devedor de R$ …`, `tom` por `LIMIAR`, ação "Cobrar em Contas a Receber"). Card do funil removido.
   - Pronto quando: os 5 números de antes continuam na tela; nenhum valor estoura o card em 1280 px nem em 390 px.
4. **`components/CentralCliente.tsx` — Por cliente (novo)** — `StandardTable` com Cliente · Faturado · Recebido · Em aberto · Vencido · % recebido · Lançamentos, em "Todos os clientes"; clicar recorta a tela para o cliente.
   - Pronto quando: a soma da coluna Vencido = KPI Inadimplência; clique/Enter troca o seletor para o cliente.
5. **`components/CentralCliente.tsx` — Por obra** — `StandardTable` com as mesmas colunas (era só o realizado: a obra com R$ 466 mil em aberto aparecia "R$ 0,00 · 0%").
   - Pronto quando: a Igreja Divino Espírito Santo mostra o em aberto e o vencido dela.
6. **`components/CentralCliente.tsx` — extrato** — `<thead>` (§6.9); pendente vencido com "vencido há N dias" em vermelho (texto, não só cor); pendente a vencer sem o verde de receita; cliente na linha em "Todos os clientes"; legendas em `gray-500`.
   - Pronto quando: a parcela de 30/07 da Igreja aparece como vencida, com os dias.
7. **`components/CentralCliente.tsx` — cromo e acessibilidade** — `h1` sem ícone (§20); controles do topo em `h-9 rounded-[6px]` (§16); "Atualizar" secundário; títulos de seção `h2`; alternador Mensal/Anual com `aria-pressed`; gráfico fora do Tab (`accessibilityLayer={false}`) com `role="img"` e resumo; eixo Y sem quebrar "600 mil"; tooltip com o ano; `aria-label` no select de tipo; grade de KPI e controles que cabem em 390 px.
   - Pronto quando: `check-ui-standard` limpo; detector do Impeccable sem contraste baixo na área da tela (exceto o subtítulo do §20, padrão do guia); em 390 px sem rolagem horizontal.
8. **`components/AppRouter.tsx`** — `onNavigate={setActiveView}` para a ação do KPI.

## Estado

- [x] 1 · Sheet — no navegador (127.0.0.1:3140, Desenvolvedor): Enter na linha da Igreja → foco no painel, nome = título da gaveta, X "Fechar painel"; Tab preso no painel; Esc → foco de volta na linha com `:focus-visible`; gavetas fechadas `inert`. Testes: 3 arquivos quebraram e foram tratados — (a) 8 testes do BlueprintEditor achavam DOIS "Fechar" (o X ganhou nome) → o X virou "Fechar painel"; (b) a trava de Tab filtrava por `getClientRects()`, sempre vazio no jsdom → engolia o Tab e o campo não gravava ao sair → filtro por atributo; (c) o teste de Rubricas agia na gaveta ainda FECHADA (o seletor abre um quadro depois) → passou a esperar `findByRole('dialog', { name })`. Referência: com o Sheet/StandardTable do `main` os 3 arquivos davam 295/295.
- [x] 2 · StandardTable — Enter na linha de "Por cliente" recorta a tela para o cliente; `rowLabel` dá o nome acessível.
- [x] 3 · KPIs — `KpiCard destaque` 2×2 até 1536 px e 4 acima; Inadimplência `alerta` (97,6% do saldo devedor ≥ `LIMIAR` 30%) com "Cobrar em Contas a Receber"; funil removido. Medido em iframe: 1280 px → cards de 476 px e 390 px → 350 px, nenhum valor cortado, sem rolagem horizontal.
- [x] 4 · Por cliente — soma das colunas = KPIs no centavo: Vencido 923.551,42 = Inadimplência; Em aberto 946.437,14 = saldo devedor; Faturado 950.437,14; Recebido 4.000,00.
- [x] 5 · Por obra — Igreja Divino Espírito Santo: R$ 466.622,84 em aberto e vencido (antes "R$ 0,00 · 0%").
- [x] 6 · extrato — parcela de 30/07 da Igreja: "previsto · vencido há 89 dias (venc. 30/07/2026)" em vermelho com ícone; pendente sem verde; cliente na linha; `<thead>`. Detector: 0 achados de contraste na gaveta (antes 54).
- [x] 7 · cromo e acessibilidade — detector na página: 8 achados (antes 25); na área da tela só o subtítulo do §20 (`gray-400`, padrão do guia) e o placeholder da busca do `StandardTable` (compartilhado, fora do escopo). Gráfico fora do Tab, eixo "600 mil" numa linha, tooltip com mês e ano. Cabeçalho: controles abaixo do título até 1536 px (em 1280 o título quebrava).
- [x] 8 · AppRouter — `onNavigate={setActiveView}`.

Achado de dado (não é da tela): Reginaldo Benedito Nunes tem Faturado R$ 12.000 e Contratado R$ 1.000 (1.200%) — o contrato parece cadastrado com valor baixo.

## Verificação

`tsc`, `check-ui-standard`, testes de componentes do `Sheet`/`StandardTable` se existirem,
`orgContextGuard`; navegador (127.0.0.1:3140, Área do Desenvolvedor): 1280 px e iframe de
390 px, Tab/Enter/Esc, soma Vencido = Inadimplência, detector do Impeccable de novo.
