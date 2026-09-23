# Condomínio × Portais — fechar as cinco desconexões

## Pedido original

Sessão de 23/09/2026 (frente `condominio-portais-conexao`).

Primeiro pedido, literal:

> verificar a conexão das abas do comercial < condomínio x portais < portal do condomínio (visão app) e portal do cliente (visão cliente)

A auditoria devolveu cinco desconexões (numeradas 1 a 5 na resposta). Pedido
seguinte, literal:

> atacar 1, 2, 3, 4 e 5

## O que a auditoria mediu (base real, 23/09/2026)

| Medida | Valor |
|---|---|
| Condomínios `EM_OPERACAO` com ocupação | 2 (007 - Bella Vista, 010 - Galeria Altavista) |
| Ocupações vigentes | 33, de 15 pessoas |
| Pessoas com link do Portal do Cliente vivo **e** aba Condomínio ligada | 4 |
| Links de condômino (portal legado) ativos | **0** |
| Rateios / cotas calculadas / cotas materializadas em `internal_transactions` | 5 / 51 / **0** |
| Chamados em `client_requests` | **0** |
| Avisos / documentos visíveis no portal | 1 / 1 |

Os itens 1, 2 e 5 estão **latentes**: o caminho está quebrado, mas ninguém
passou por ele ainda. Isso é prazo, não absolvição — conceder acesso virou um
clique (o interruptor da coluna Portal, publicado hoje em `71e0f9ac`).

---

## Item 1 — A cota condominial não chega ao Portal do Cliente

**Defeito.** `condominioCobrancaService` materializa a cota em
`internal_transactions` (CREDIT, `party_id` = cliente) e
`commercialFinanceService.listAllClientInstallments` lê exatamente essa forma —
mas por **consulta direta à tabela**. `internal_transactions` só tem política
para `authenticated` + `is_org_member` (mais a do portal do parceiro, restrita a
`source_system LIKE 'CONTRACT_%'`). Provado com a chave anon: a consulta devolve
`[]`, sem erro. O cliente logado também não é membro (0 de 29). É o mesmo
defeito que `ClientArea.tsx` documenta ter evitado nas abas Condomínio e Unidade
usando RPC.

**Correção.** Uma RPC `SECURITY DEFINER` por caminho, no molde já usado pelo
condomínio (as duas delegam para uma função de payload só, para não nascer
drift entre elas).

- `supabase/migrations/20270923000001_portal_recebiveis.sql` — cria
  `fn_portal_receivables_payload(p_client_id uuid)` (privada, `REVOKE ALL FROM
  PUBLIC`), `fn_portal_get_receivables(p_token text)` e
  `fn_portal_get_receivables_for_client(p_client_id uuid)`. A payload devolve os
  recebíveis do próprio `party_id` **e** os dos contratos em que a pessoa é
  co-compradora (`commercial_deal_buyers` → `contracts` → `reference_id`
  composto), que é o que a consulta direta já fazia. **Pronto quando:** as três
  funções existem, `fn_portal_get_receivables` devolve a cota de um cliente com
  token vivo, e a chamada anon direta à tabela continua devolvendo `[]` (a
  correção não afrouxa o RLS).
- `services/clientPortalService.ts` — `getReceivablesByToken` /
  `getReceivablesForClient`, devolvendo `PaymentInstallment[]` já mapeado.
  **Pronto quando:** o mapeamento reusa o helper exportado do
  `commercialFinanceService`, não uma segunda cópia da regra de "pago".
- `services/commercialFinanceService.ts` — exporta `mapReceivableRow`, a regra
  de `PAID`/`PENDING` que hoje vive embutida no laço. **Pronto quando:** o laço
  existente passa a chamar o helper e a suíte continua verde.
- `components/ClientArea.tsx` — a aba Financeiro passa a somar as parcelas da
  RPC às que já vinham, deduplicando por `id`. **Pronto quando:** com token, a
  cota aparece; sem token, o que o admin já via continua aparecendo.

## Item 2 — O chamado do condômino não aparece em Condomínios › Manutenção

**Defeito.** `ManutencaoTab` é o mundo `maintenance_*` (plano NBR 5674 + ordens
de serviço). O chamado aberto no portal — pelos dois caminhos — vai para
`client_requests`, cuja única tela de admin é um modal em Comercial › Clientes,
um cliente por vez. O síndico nunca vê.

**Correção.** Uma seção "Chamados dos condôminos" na própria aba Manutenção,
recortada pelas **unidades** do empreendimento (não pelas pessoas: chamado é da
unidade, e a pessoa pode ter imóvel em outro lugar).

- `services/clientRequestsService.ts` — `listByUnits(unitIds)`. **Pronto
  quando:** devolve os chamados das unidades pedidas, ordenados por abertura,
  com nome de cliente e unidade.
- `components/condominio/ManutencaoTab.tsx` — a seção nova, com a mesma régua de
  tabela do guia (§5.2/§6.6/§7) e vazio rotulado. **Pronto quando:**
  `check-ui-standard.sh` limpo no arquivo e a seção diz explicitamente que
  chamado sem unidade não entra ali.

## Item 3 — Cliente "Venda e Condomínio" perde as abas de venda

**Defeito.** `presetDeAbas` trata o caso combinado `ehLocacao && ehCondominio`
mas não `ehVendas && ehCondominio`, e `ehCondominio` casa antes na cadeia de
`if`s — então o cliente cai no preset `CONDOMINIO` e some com `unidade`,
`jornada`, `obra`, `contratos`, `visual`, `personalizacao`, `diario` e
`suporte`. São **8 dos 15** condôminos, todos com `portal_tabs` nulo.

**Correção.** Trocar a cadeia de `if`s por **base + acréscimo**: a base vem da
natureza do relacionamento (locação, serviços, vendas) e `condominio` é
acrescentado quando a categoria também é de prédio. A cadeia de `if`s é o que
erra de novo no próximo par de categorias.

- `utils/clientCategory.ts` — `presetDeAbas` reescrita nesse molde. **Pronto
  quando:** "Venda e Condomínio" devolve as abas de venda **mais** `condominio`,
  "Locação e Condominio" continua idêntica ao que já devolvia, e "Condomínio"
  puro e "Síndico" continuam no preset só de prédio.
- `__tests__/clientCategory.test.ts` — casos para "Venda e Condomínio" e
  "Serviços e Condomínio". **Pronto quando:** os testes falham com a
  implementação antiga e passam com a nova.

## Item 4 — Portais › Portal do Condômino não pré-visualiza ninguém

**Defeito.** A prévia só abre em linha com `via === 'LINK_CONDOMINO'`, e há 0
links de condômino ativos: nenhuma linha é clicável. Para os 4 que de fato veem
o condomínio (pelo Portal do Cliente) não há prévia nenhuma ali.

**Correção.** A prévia passa a escolher a superfície pelo caminho de acesso da
pessoa: `LINK_CONDOMINO` → `CondominoPortal` (como hoje); `PORTAL_CLIENTE` →
a aba Condomínio do Portal do Cliente, montada com
`clientPortalService.getCondominioForClient`. Reusa o componente
`client/CondominioTab`, não uma cópia — é a mesma doutrina que fez a prévia
atual reusar `CondominoPortal`.

- `components/condominio/PortalCondominoAdmin.tsx` — `PreviaDoPortal` ganha o
  segundo caminho; a linha fica clicável quando `e.ve` (os dois caminhos), e o
  estado `AGUARDA_ABA` continua sem prévia, com a frase que diz o que falta.
  **Pronto quando:** clicar numa das 4 pessoas com Portal do Cliente abre a aba
  Condomínio em leitura, sem `onMarcarLido` (prévia não marca aviso como lido —
  é a razão de o modo somente-leitura existir).

## Item 5 — Escopo do chamado muda entre os portais

**Defeito.** O portal legado lista chamados por **unidade** (decisão escrita:
"quem mora hoje precisa ver o vazamento aberto pelo morador anterior"); o Portal
do Cliente lista por **pessoa** (`WHERE r.client_id = token.client_id`). Migrar
alguém do link antigo para o novo tira o histórico da unidade. Além disso, o
caminho do cliente **logado** (`listRequests`, consulta direta) esbarra no mesmo
RLS do item 1: `client_requests` só tem política de membro da organização.

**Correção.** Na mesma migration do item 1:

- `fn_portal_get_requests(p_token)` passa a devolver os chamados da pessoa
  **união** os das unidades que ela ocupa hoje. **Pronto quando:** um chamado
  com `unit_id` de uma unidade ocupada pela pessoa aparece mesmo tendo
  `client_id` de outra.
- `fn_portal_get_requests_for_client(p_client_id)` nasce com a mesma regra e a
  mesma dupla autorização de `client_portal_get_condominio_for_client` (membro
  da organização **ou** o próprio cliente pelo e-mail). **Pronto quando:** o
  cliente logado que não é membro passa a ver os próprios chamados, que hoje
  vêm vazios em silêncio.
- `services/clientRequestsService.ts` + `components/ClientArea.tsx` — o caminho
  sem token usa a RPC nova. **Pronto quando:** as duas pontas da aba Manutenção
  do portal são RPC, como já são as das abas Condomínio e Unidade.

---

## Ordem de execução

3 → 1 → 5 → 2 → 4. O item 3 é isolado e o mais provável de disparar; 1 e 5
compartilham a migration; 2 e 4 são de tela e dependem do que 1/5 expõem.

## Estado — 5 de 5, com prova

- [x] **Item 3** — preset de abas. Prova nas DUAS direções (memória
  `harness-servidor-novo`): com a implementação antiga os dois testes novos
  falham (`'Venda e Condomínio'` devolvia 5 abas, sem `unidade`); com a nova,
  16 de 16 passam.
- [x] **Item 1** — recebíveis por RPC. Prova de fora, com a chave anon:
  `fn_portal_get_receivables` devolve as 60 parcelas da Defensoria, a consulta
  direta à tabela continua devolvendo `[]` (o RLS não foi afrouxado) e
  `fn_portal_receivables_payload` responde 42501 a `anon`. Na tela, o portal por
  link mostra "Total Pago R$ 180.000,00 · 60 cobranças" onde antes não havia
  nada.
- [x] **Item 5** — chamados por unidade + RPC no caminho logado.
  `fn_portal_get_requests` via anon responde `{valid:true, data:[]}` (a base tem
  0 chamados); a aba Manutenção do portal mostra o vazio correto. A união por
  unidade está no SQL e coberta pela leitura da função; **não** foi exercitada
  com dado real — ver "O que não foi provado".
- [x] **Item 2** — aba "Chamados dos condôminos" em Condomínios › Manutenção,
  com KPI próprio e o vazio que explica o recorte por unidade. Provado na tela.
- [x] **Item 4** — prévia do Portal do Cliente. Em Galeria Altavista, 7 linhas
  passaram a ser clicáveis (eram 0); a prévia abre "Como Dynamis … vê o portal"
  com unidade, fração 8,3333%, papéis, co-ocupantes, avisos e documentos, e o
  aviso continua "Não lido" (a prévia não grava leitura).

Portões: `check-ui-standard.sh` limpo nos 3 `.tsx` tocados, `check-xss-sinks.sh`
limpo, `tsc --noEmit` sem erro, suíte cheia 441 arquivos / 5099 testes verde.
Contagens de `condominio_aviso_leituras`, `client_requests`,
`client_portal_tokens` e `internal_transactions` idênticas antes e depois da
prova — nada foi gravado.

## O que NÃO foi provado

- **A união por unidade do item 5 com dado real.** A base tem 0 chamados, então
  não existe linha que apareça por unidade e não por pessoa. A regra está no
  SQL e o caminho responde; o comportamento em si só se prova no primeiro
  chamado aberto.
- **A cota condominial concreta.** 0 cotas materializadas — o que ficou provado
  é que o caminho até o portal existe e entrega (60 parcelas de contrato saíram
  pela mesma função). A cota usa a mesma forma (`CREDIT` + `party_id`).
- **Item 3 na tela.** Nenhum dos 8 clientes "Venda e Condomínio" tem link vivo,
  então não há portal para abrir e conferir. A prova é o teste unitário nas duas
  direções.
