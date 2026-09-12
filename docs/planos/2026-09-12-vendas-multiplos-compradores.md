# Venda de Unidades — mais de um comprador por Negociação

## Pedido original

Sessão de 2026-09-12 (VS Code, frente `vendas-multiplos-compradores`):

> comercial < venda de unidades: permitir incluir mais de um comprador em uma Negociação

Mesma sessão, depois do primeiro relatório (que propunha um "comprador principal"):

> Pode não existir comprador principal, entao terao mesmo peso, devem aparecer no contrato etc

Mesma sessão, depois da publicação de `2e8ff04`:

> implermentar:
> 1. Precisa da sua ação: o modelo .docx do contrato de venda ainda aponta para a origem client (um cadastro). Para a minuta listar todos, mapeie no gerenciador de modelos os marcadores da cláusula das partes para "Compradores (todos)" — posso fazer isso com você.
> 2. Fora do escopo (registrado no plano): Portal do Cliente para o co-comprador (RPC, REGRA #7) e Locação com N locatários (mecanismo pronto, UI ainda select único). Duas falhas pré-existentes em WarrantyModule.test.tsx vêm da frente de Garantia, não daqui.

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
| 11 | `supabase/migrations/aplicar_20270919000036_compradores_portal_e_modelo.sql` (bloco 2) + `docxFieldCatalog.ts` | Modelo .docx ativo (`e6e620da`, o único cadastrado — é o de prestação de serviços, usado por venda e locação): os 8 marcadores `client.*` da cláusula das partes remapeados para `buyers.*`. Campos novos na origem: `types`, `address`, `address_number`, `neighborhood`, `city`, `state`, `zip_code`, `address_full` (valores iguais colapsam: casal no mesmo endereço sai uma vez). Com um comprador a saída é idêntica à anterior | migration aplicada; `SELECT` do token_map mostra 8×`buyers`; teste `docxBuyersFields` (6 casos) |
| 12 | mesma migration (blocos 1a/1b) + `contractService.listContractsByClientId` + `commercialFinanceService.listAllClientInstallments` | Portal do Cliente para o co-comprador: `fn_portal_get_contracts` e `fn_unidade_payload_for_client` reconhecem o cliente via `commercial_deal_buyers` (copiadas dos ARQUIVOS, só o filtro mudou; REVOKE/GRANT na mesma migration). As duas camadas TS espelham a regra (contratos por `deal_id`; parcelas pelo `reference_id` dos contratos das negociações do co-comprador) | provado no banco: Alex (co-comprador temporário da 0002) vê a unidade 12; Francisco (categoria Vendas) vê `CTV-007-003-0001` pelo token; linhas temporárias apagadas |
| 13 | `components/DealModal.tsx` + `components/RentalsModule.tsx` | Locação com N locatários: a lista vale para `RENTAL` ("Locatários", "+ Adicionar locatário…"); célula/card/busca de Contratos de locação mostram todos | typecheck; `check-ui-standard` limpo; Playwright: locação "Dynamis" abre com a seção Locatários e o select, zero erro |

## Fora do escopo (registrado para não parecer esquecido)

- **`contracts.client_id`** segue apontando para um dos compradores: a tabela de
  contratos tem uma coluna só. Listagem de Contratos mostra esse nome.
- **Domínio por categoria do cliente** (regra pré-existente do portal): um
  co-comprador cadastrado com categoria "Locação" não vê contrato `VENDAS` no
  portal — é a mesma regra que já valia para o comprador único.
- **Texto fixo do .docx**: os marcadores da cláusula das partes ficaram
  enumerados campo a campo ("Rua A e Rua B"). Para a redação jurídica ideal,
  trocar no .docx a cláusula por um único marcador mapeado em "Qualificação de
  todos (parágrafo)" — edição do documento, não do sistema.
- Financeiro do portal por LINK (token) não lê parcelas de nenhum cliente hoje
  (não há RPC para isso); a correção do co-comprador vale para a visão do app.

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
- [x] 11 modelo .docx remapeado (migration 000036 aplicada)
- [x] 12 Portal do Cliente para o co-comprador (RPCs + 2 leituras TS; provado no banco)
- [x] 13 Locação com N locatários (provado no app)
- [x] 2ª frente publicada: `e7441d29` em `main`; `conferir-producao.sh "mais de um locatário" "Endereço completo de cada um" "commercial_deal_buyers"` — domínio serve `e7441d2` com os três textos (2026-09-12)
