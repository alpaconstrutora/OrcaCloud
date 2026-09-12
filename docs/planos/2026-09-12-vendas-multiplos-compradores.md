# Venda de Unidades — mais de um comprador por Negociação

## Pedido original

Sessão de 2026-09-12 (VS Code, frente `vendas-multiplos-compradores`):

> comercial < venda de unidades: permitir incluir mais de um comprador em uma Negociação

Mesma sessão, depois do primeiro relatório (que propunha um "comprador principal"):

> Pode não existir comprador principal, entao terao mesmo peso, devem aparecer no contrato etc

## Diagnóstico

- `commercial_deals.client_id` é **uma** coluna: a negociação tem exatamente um
  comprador. O `DealModal` (aba "Dados do Cliente") é um `<select>` único.
- O mesmo eixo já foi resolvido para **unidades**: `commercial_deal_units`
  (migration `20270825000020`) guarda N unidades por negociação, com `is_primary`
  espelhando `commercial_deals.property_id` — e todo o código legado que lê a
  coluna direta continua funcionando. `dealUnitsOf()` normaliza a leitura para
  SEMPRE devolver uma lista, mesmo em contrato anterior à tabela.
- Quem consome `deal.client_id` fora do modal (contrato, tributos, workflow,
  listagens, portal do cliente, assinatura) espera UM cliente. Trocar a coluna por
  lista quebraria tudo isso de uma vez.

## Decisão

Mesmo desenho das unidades: **tabela filha `commercial_deal_buyers`**. A lista
completa vive em `PropertyDeal.buyers`, derivada na leitura e persistida por
`commercialService.saveDeal`.

**Não existe comprador principal** (segundo pedido). Todos têm o mesmo peso e
todos aparecem nas saídas. `commercial_deals.client_id` continua existindo só
como **ponteiro interno de compatibilidade** (recebe o primeiro da lista) para o
código legado que lê a coluna — nunca é exibido nem escolhido pelo usuário. A
coluna `is_primary` da tabela tem o mesmo papel (marca qual linha está espelhada
em `client_id`); a UI não a mostra.

Escopo: a lista com N compradores aparece na negociação de **Venda** (`type =
'SALE'`), que é o que o pedido nomeia. Locação continua com o `<select>` único
(o dado é o mesmo — um locatário vira `buyers = [principal]` —, mas a tela de
Locações não muda sem pedido).

## Itens

| # | Arquivo | O que muda | Como sei que terminou |
|---|---|---|---|
| 1 | `supabase/migrations/aplicar_20270919000035_commercial_deal_buyers.sql` | Tabela `commercial_deal_buyers` (deal_id, client_id, organization_id, is_primary), UNIQUE(deal_id, client_id), FKs com lock_timeout, RLS só `authenticated` (REGRA #7: cada perna do OR checa org), backfill 1 linha primária por deal com client_id | `npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts` verde; aplicada no banco com `db query -f`; `SELECT count(*)` bate com deals que têm client_id |
| 2 | `types/imovib.ts` | `DealBuyer` + `PropertyDeal.buyers?`; doc de `client_id` = principal | `npm run typecheck` |
| 3 | `services/commercialService.ts` | `dealBuyersOf`/`primaryBuyerOf`, flag de tabela ausente, join em `listDeals`, `syncDealBuyers`, `saveDeal` extrai `buyers`, grava `client_id` = principal e sincroniza | teste unitário de `dealBuyersOf` (legado → 1 principal; lista → exatamente 1 principal; dedup) |
| 4 | `components/DealModal.tsx` | Venda: lista de compradores (nome + documento, remover) + select "+ Adicionar comprador", **sem** botão de principal; card de conferência mostra o comprador clicado; **checklist de documentos por comprador** (chave `<client_id>::<doc>` com mais de um; chave legada com um só); proposta PDF e assinatura recebem todos | typecheck; `check-ui-standard.sh` no arquivo; abrir no app: adicionar 2 compradores, salvar, reabrir e ver os 2 |
| 5 | `components/SalesModule.tsx` | Card e tabela mostram **todos** os nomes ("Ana, Bruno", truncado com `title`); busca e ordenação pela lista inteira | typecheck; `check-ui-standard.sh`; ver na tela |
| 6 | `__tests__/dealBuyers.test.ts` | Cobertura da normalização | `npx vitest run __tests__/dealBuyers.test.ts` verde |
| 7 | `services/docxFieldCatalog.ts` + `services/rentalDocumentContextService.ts` | Origem nova **`buyers` — "Compradores (todos)"** na minuta: nomes ("A, B e C"), CPFs, e-mails, quantidade (+ extenso), qualificação de todos num parágrafo, nome+CPF de cada um. Contexto carrega `commercial_deal_buyers` (fallback `[client]`) | `__tests__/docxBuyersFields.test.ts` verde; grupo aparece no seletor de campos do modelo |
| 8 | `services/propertyExportService.ts` | Proposta PDF: "DADOS DOS COMPRADORES", um bloco por comprador | typecheck; gerar proposta de negociação com 2 compradores |
| 9 | `components/DealSignaturePanel.tsx` | Um signatário por comprador (e-mail/WhatsApp editáveis por linha); todos assinam | typecheck; painel mostra N linhas |
| 10 | `services/taxPayableService.ts` | Descrição do tributo com todos os compradores | typecheck |

## Fora do escopo (registrado para não parecer esquecido)

- **Modelos .docx existentes** continuam usando a origem `client` (um cadastro).
  Para a minuta listar todos, o modelo precisa mapear os marcadores para a origem
  "Compradores (todos)" no gerenciador de modelos — é assim que o mecanismo
  funciona (token → origem/campo), não dá para trocar o modelo por ele.
- **`contracts.client_id`** segue apontando para um dos compradores: a tabela de
  contratos tem uma coluna só. Listagem de Contratos mostra esse nome.
- **Portal do Cliente**: só o comprador apontado por `client_id` vê a negociação
  no portal dele — as RPCs `fn_portal_*` filtram por `commercial_deals.client_id`.
  Mudar RPC é REGRA #7 e merece pedido explícito.
- **Locações** com N locatários: mesmo mecanismo, só falta ligar a UI.

## Andamento

- [x] 1 migration — aplicada em 2026-09-12 (`db query -f`): 20 linhas = 20 negociações com cliente, 2 FKs, RLS ligada, `anon` sem grant
- [x] 2 tipos
- [x] 3 service
- [x] 4 DealModal (typecheck + check-ui-standard verdes; provado no app — abaixo)
- [x] 5 SalesModule (idem)
- [x] 6 teste (8 casos)
- [x] 7 minuta (5 casos)
- [x] 8 proposta PDF
- [x] 9 assinatura
- [x] 10 tributos
- [x] Prova na interface (Playwright, `c:/tmp/pwtest/compradores.cjs`, servidor da frente em :3114, org Alpa):
  negociação 0002 (IN_NEGOTIATION) → "Compradores" sem nenhum "Principal" → adicionar Alex Dutra Chaves →
  2 checklists de documentos → Salvar → reload: tabela mostra "Napoleão Da Costa Azevedo, Alex Dutra Chaves" →
  reabrir: os dois na lista → remover Alex → Salvar → banco: só Napoleão, 20 linhas (como antes).
  Zero PAGEERROR / console.error / HTTP 4xx-5xx do PostgREST.
- [x] Publicado: commit `2e8ff04d` em `main` (2026-09-12)
- [x] `conferir-producao.sh "Adicionar comprador" "Compradores (todos)"` — domínio serve `2e8ff04`, os dois textos no bundle (2026-09-12)
