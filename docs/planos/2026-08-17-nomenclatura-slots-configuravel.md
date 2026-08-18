# Nomenclatura configurável por slots — Configurações do Sistema

## Pedido original

> Configurações do Sistema < nomenclatura:
> 1. Alteração no sistema de nomenclatura: O usuário poderia criar da maneira que
> desejar usando seletor das variáveis disponíveis no sistema (Empreendimento; Obra;
> Unidade; Cliente; Fornecedor; Organização; Centro de custo)
> Como são 7 grupos termos 7 seletores mais o prefixo e Dígitos do Sequencial
> exemplo: {prefixo}-{ }-{ }-{ }-{ }-{ }-{ }-{ }-{seq} = { }-{ }-{prefixo}-{Empreendimento}-{ Fornecedor}-{Centro de custo}-{seq} = PED-003-004-001
> Veja no exemplo que não foi utilizado todos os campos.
> O campo prefixo é de texto livre
> A separação pode ser – ou ., o usuário escolher
>
> 2. Os números dos módulos abaixo devem ser vinculados a Configurações do Sistema < nomenclatura:
> Comercial < vendas de unidades;
> Comercial < Locações;
> Comercial < Condomínios;
> Comercial < Contratos de Serviços;
> Suprimentos < Pedidos de Compra;
> Suprimentos < Cotações de Suprimentos;
> Suprimentos < Contratos
>
> Sessão: c--D-OR-ACLOUD/d03359f9-c86b-46e5-b9e9-3e2835b06d07 · 2026-08-17

## Contexto

Hoje a Nomenclatura é rígida e meia-boca. Cada tipo de documento tem uma máscara com
**tokens fixos** (`{prefixo}-{empreendimento}-{obra}-{seq}`), definidos no código, e só
5 documentos participam. O usuário quer montar o número livremente: 7 variáveis do
sistema (Empreendimento, Obra, Unidade, Cliente, Fornecedor, Organização, Centro de
custo) + prefixo, distribuídos em slots ordenados, com separador à escolha (`-` ou `.`)
e slots que podem ficar vazios. E quer que **11 numerações espalhadas por 7 módulos**
passem a obedecer essa configuração.

Três problemas estruturais aparecem no caminho e precisam ser resolvidos junto, senão a
funcionalidade nasce quebrada:

1. **A máscara mora em `localStorage`** (`opura_app_settings`) — é por navegador, não
   por empresa. Dois usuários da mesma org geram padrões diferentes, e o backfill SQL
   teve que chumbar `'PC'` porque o banco não sabe a máscara.
2. **Metade dos módulos gera número no navegador com MAX+1** (Contratos de Serviços,
   negociações do Comercial) — corrida silenciosa entre dois usuários.
3. **`empreendimentos.code` não tem UNIQUE nem auto-geração.** Com o sequencial
   reiniciando por combinação de variáveis, dois empreendimentos com `RES01` na mesma
   org geram números idênticos.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-08-17 | Onde mora a configuração? | No banco, por organização (não localStorage) |
| 2026-08-17 | O prefixo é fixo no início ou posicionável? | Slot posicionável, como as variáveis |
| 2026-08-17 | Escopo do `{seq}`? | Reinicia pela combinação de todas as variáveis escolhidas |
| 2026-08-17 | Variável escolhida mas sem valor/código? | Bloqueia a criação com mensagem clara |
| 2026-08-18 | **Revisão da linha acima**, após o bloqueio travar contratos reais em produção (Suprimentos › Contratos, obra sem vínculo de empreendimento) — "nada tem que ser exigido!" | **Nunca bloqueia.** O que não resolver simplesmente some do número (slot tratado como vazio); ver `resolvers.ts` e migration `20270912000006` |
| 2026-08-17 | O que numerar em Condomínios? | O rateio (`condominio_rateios`, ganha coluna `number`) |
| 2026-08-17 | Migrar os geradores legados (MAX+1)? | Sim, para contador atômico, sem renumerar o que já existe |
| 2026-08-17 | Vendas/Locações: numerar negociação, contrato, ou os dois? | Os dois, com máscaras separadas |
| 2026-08-17 | Serviços: só a aba Contratos, ou também o CRM (PROP-/CTR-)? | Tudo: contrato, proposta e CTR- |

**Consequência da decisão de 2026-08-18 (nunca bloquear):** `resolveVariables` (front)
e `fn_generate_document_number` (SQL, migration `20270912000006`) não lançam mais erro
quando falta um identificador ou um código cadastrado — a variável correspondente
simplesmente não entra no número. `MissingCodeError` continua existindo só para
pré-requisitos estruturais que já eram exigidos antes da Nomenclatura (ex.: um Pedido de
Compra sempre precisou de obra para existir; isso não mudou). O catálogo (`supportedVariables`
por doc_type, item F2) continua restringindo o que a UI oferece por slot — não para evitar
bloqueio (que não existe mais), mas para não oferecer uma variável que aquele tipo de
documento **nunca** consegue resolver (ex.: Fornecedor numa Locação), o que geraria um
slot permanentemente vazio e confundiria quem configura a máscara.

## Os 11 tipos de documento

| `doc_type` | Tabela.coluna | Como é gerado hoje | Variáveis oferecidas |
|---|---|---|---|
| `PURCHASE_ORDER` | `purchase_orders.number` | máscara + `fn_next_purchase_order_seq` | emp, obra, forn, cc, org |
| `QUOTATION` | `quotation_requests.number` | máscara + `fn_next_quotation_seq` | emp, obra, forn, cc, org |
| `SUPPLY_CONTRACT` | `contracts.number` (domain=SUPRIMENTOS) | máscara + `fn_next_contract_seq` | emp, obra, forn, cc, org |
| `SERVICE_CONTRACT` | `contracts.number` (domain=SERVICOS) | **MAX+1 no front** (`ContractModal.tsx:243-274`) | emp, obra, cliente, cc, org |
| `SERVICE_PROPOSAL` | `services_proposals.proposal_number` | **trigger + sequence global** | cliente, cc, org |
| `SERVICE_CRM_CONTRACT` | `services_contracts.contract_number` | **trigger + sequence global** | cliente, obra, cc, org |
| `UNIT_SALE_CONTRACT` | `contracts.number` (CV) | máscara + `fn_next_unit_sale_contract_seq` | emp, unidade, cliente, cc, org |
| `RENTAL_CONTRACT` | `contracts.number` (CL) | máscara + `fn_next_rental_contract_seq` | emp, unidade, cliente, cc, org |
| `SALE_DEAL` | `commercial_deals.code` | **MAX+1 no front** (`commercialService.ts:599-619`) | emp, unidade, cliente, cc, org |
| `RENTAL_DEAL` | `commercial_deals.code` | **não existe** (locação não recebe code) | emp, unidade, cliente, cc, org |
| `CONDO_RATEIO` | `condominio_rateios.number` | **não existe** | emp, cc, org |

Os defaults de cada tipo preservam a máscara atual (`PC`, `QT`, `CT`, `CL`, `CV`,
padding 4), para que nada mude de comportamento até a organização reconfigurar.

## Plano

### F1 — Banco: configuração, contador genérico e travas

Migrations novas em `orçacloud-saas/supabase/migrations/`. **Aplicar manualmente no SQL
Editor, um bloco por vez** — o editor roda o script inteiro como uma transação, então um
erro no bloco 3 desfaz o bloco 1. Nunca `supabase db push` (histórico furado).

**`20270912000001_document_numbering_settings.sql`**
```sql
CREATE TABLE public.document_numbering_settings (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    doc_type    TEXT NOT NULL CHECK (doc_type IN ( ...os 11... )),
    -- Array ORDENADO de slots. Cada item: 'EMPTY' | 'PREFIX' | uma das 7 variáveis.
    -- O {seq} é sempre o último e não entra aqui.
    slots       JSONB    NOT NULL DEFAULT '[]'::jsonb,
    prefix      TEXT     NOT NULL DEFAULT '',
    separator   TEXT     NOT NULL DEFAULT '-'  CHECK (separator IN ('-', '.')),
    seq_padding SMALLINT NOT NULL DEFAULT 4    CHECK (seq_padding BETWEEN 1 AND 9),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, doc_type)
);
```
RLS ligada, policies SELECT/INSERT/UPDATE por `is_org_member(organization_id)` com
dual-check `user_id = auth.uid() OR email = auth.jwt()->>'email'`. `REVOKE ALL FROM
anon` explícito — `GRANT authenticated` sozinho não tira o que `PUBLIC` ganha por
padrão.

**`20270912000002_document_number_counters.sql`** — contador genérico, substituindo as 5
tabelas de escopo hardcoded:
```sql
CREATE TABLE public.document_number_counters (
    organization_id UUID NOT NULL,
    doc_type   TEXT NOT NULL,
    -- Códigos resolvidos das variáveis da máscara, na ordem, separados por '|'.
    -- String vazia quando a máscara só tem prefixo — contador único do tipo.
    scope_key  TEXT NOT NULL,
    last_seq   INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, doc_type, scope_key)
);
ALTER TABLE public.document_number_counters ENABLE ROW LEVEL SECURITY;
-- RLS ligada e SEM policy, de propósito: só a RPC abaixo toca isto.
```
RPC `fn_next_document_seq(p_org_id UUID, p_doc_type TEXT, p_scope_key TEXT) RETURNS
INTEGER`, `SECURITY DEFINER`, `SET search_path = public`. Copiar a estrutura de
`fn_next_purchase_order_seq` (`20270835000000:25-66`): valida pertinência à org via
`organization_members`, incrementa com `INSERT … ON CONFLICT DO UPDATE … RETURNING`, e
`REVOKE PUBLIC/anon` + `GRANT authenticated`.

**`20270912000003_numbering_source_codes.sql`** — fecha as lacunas dos códigos-fonte:
- **Checagem primeiro**: bloco `DO $$ … RAISE EXCEPTION $$` que aborta com mensagem
  legível se já houver `empreendimentos.code` duplicado na mesma org. Falhar no índice
  dá erro obscuro; o usuário precisa saber *quais* empreendimentos corrigir.
- `UNIQUE (organization_id, code) WHERE code IS NOT NULL` em `empreendimentos`.
- `UNIQUE (organization_id, code) WHERE code IS NOT NULL` em `commercial_deals`.
- `ALTER TABLE condominio_rateios ADD COLUMN number TEXT` + `UNIQUE (organization_id, number)`.
- `empreendimento_units` **não ganha coluna de código**: o token `{unidade}` continua
  usando `name` (é o que já faz, e `name` é `NOT NULL` e serve como `101`, `202`).
  Documentar isso no comentário da migration para não virar dúvida depois.

**`20270912000004_services_numbering_triggers.sql`** — os triggers do CRM de Serviços
(`tg_services_assign_proposal_number`, `tg_services_convert_to_project`) passam a só
gerar número **quando o front não mandou um**: `IF NEW.proposal_number IS NULL OR
NEW.proposal_number = '' THEN … END IF`. Assim o motor novo assume e o trigger vira rede
de segurança, sem quebrar nada que já existe.

**Critério de pronto:** as 4 migrations aplicadas no Supabase remoto; `SELECT * FROM
pg_policies WHERE tablename IN ('document_numbering_settings',
'document_number_counters')` confere as policies esperadas; `SELECT
proname FROM pg_proc WHERE proname = 'fn_next_document_seq'` existe.

### F2 — Motor de numeração no front

Novo diretório `orçacloud-saas/services/documentNumbering/`:

- **`types.ts`** — `DocType`, `SlotToken` (`'EMPTY' | 'PREFIX' | 'EMPREENDIMENTO' |
  'OBRA' | 'UNIDADE' | 'CLIENTE' | 'FORNECEDOR' | 'ORGANIZACAO' | 'CENTRO_CUSTO'`),
  `NumberingConfig`, `NumberingContext`.
- **`catalog.ts`** — para cada `DocType`: label da UI, variáveis suportadas (tabela
  acima) e config default (preservando prefixo/padding atuais de
  `APP_SETTINGS_DEFAULTS`).
- **`resolvers.ts`** — um resolver por variável, recebendo `NumberingContext`
  (`{ projectId?, empreendimentoId?, unitId?, clientId?, supplierId?, organizationId?,
  costCenterId? }`) e devolvendo o código, ou lançando `MissingCodeError` que **nomeia a
  entidade e onde cadastrar** — o padrão já existente em `orderNumberingService.ts:84-89`.
  Reusar o que já funciona:
  - `EMPREENDIMENTO` + `OBRA`: a lógica de `resolveOrderCodes`
    (`orderNumberingService.ts:36-92`), incluindo o fallback
    `empreendimentos.project_id` → `empreendimento_towers.project_id`. **Corrigir de
    passagem**: ler `projects.code` com fallback para `settings->>'code'` (hoje lê só o
    JSONB, enquanto a UI lê a coluna).
  - `UNIDADE`: view `vw_unit_property_map` (`purpose` `'RENTAL'`/`'SALE'`), como em
    `rentalContractNumberingService.ts:50-73`.
  - `CLIENTE`/`FORNECEDOR`/`ORGANIZACAO`/`CENTRO_CUSTO`: coluna `code` de `clients`,
    `suppliers`, `organizations`, `cost_centers_v2`.
- **`format.ts`** — `formatDocumentNumber(slots, valores, { prefix, separator,
  seqPadding }, seq)`: percorre os slots na ordem, descarta `EMPTY`, junta com o
  separador e acrescenta o `{seq}` com `padStart`. Função pura, reusada pelo preview das
  Configurações.
- **`settingsService.ts`** — leitura/gravação de `document_numbering_settings` com cache
  em memória por `(orgId, docType)`; devolve o default do catálogo quando não há linha.
- **`index.ts`** — `generateDocumentNumber(docType, orgId, contexto)`: lê a config →
  resolve **só** as variáveis presentes nos slots → monta o `scope_key` → chama
  `fn_next_document_seq` → formata.

Os 5 services atuais (`orderNumberingService`, `contractNumberingService`,
`quotationNumberingService`, `rentalContractNumberingService`,
`unitSaleContractNumberingService`) viram invólucros finos sobre o motor novo,
**mantendo a assinatura pública** (`generateOrderNumber(projectId)` etc.) para que os
consumidores não precisem mudar na mesma leva. `formatOrderNumber` e irmãs passam a
delegar para `formatDocumentNumber`.

**Critério de pronto:** `npx tsc --noEmit` limpo; `documentNumberFormat.test.ts` cobrindo
o exemplo do pedido original passa.

### F3 — UI em Configurações do Sistema › Nomenclatura

`components/Settings.tsx` tem hoje **5 blocos de ~78 linhas praticamente idênticos**
(`:316-402`, `:404-479`, `:481-556`, `:558-635`, `:637-714`). Extrair um único
componente **`components/settings/NumberingSettingsCard.tsx`**, parametrizado por
`docType`, e substituir os 5 blocos por 11 usos dele.

Controles do card:
- **8 seletores de slot** em grade, cada um com "— vazio —", "Prefixo" e as variáveis
  que o `docType` suporta. 8 slots comportam o prefixo + as 7 variáveis.
- **Prefixo** (texto livre), habilitado só quando algum slot for `PREFIX`.
- **Separador**: alternador `-` / `.`.
- **Dígitos do Sequencial**: 1–9.
- **Pré-visualização** em tempo real, com códigos fictícios (o padrão que já existe em
  `Settings.tsx:104-107`).
- **Validação**: `PREFIX` e cada variável no máximo uma vez; slot `PREFIX` sem texto no
  campo Prefixo é erro.
- Botão "Padrões" por card, reusando o `useConfirm()` já importado.

O menu `SETTINGS_NAV` (`Settings.tsx:42-68`) ganha as folhas novas sob "Nomenclatura",
agrupadas por módulo (Suprimentos / Comercial / Serviços / Condomínios).

Contexto de organização: usar `useOrgContext()` — o seletor do topo manda. Em "Todas as
organizações", usar `useOrgWriteTarget` + `forEachTargetOrg` para gravar, como já é o
padrão dos catálogos de Configurações. **Nunca** bloquear o carregamento com `if
(!orgId) return`.

Antes de editar, ler `docs/ui_ux_guia_unificado.md` inteiro; depois rodar `bash
scripts/check-ui-standard.sh` nos arquivos tocados.

**Critério de pronto:** as 11 folhas aparecem no menu, cada uma renderiza o card, salva
e persiste (verificado no navegador); `check-ui-standard.sh` sem apontamento novo.

### F4 — Ligar os 11 módulos

Cada consumidor passa a chamar `generateDocumentNumber(docType, orgId, contexto)`:

| Onde | O que muda |
|---|---|
| `services/orderService.ts:41,586` | já usa wrapper — só passa a resolver mais variáveis |
| `services/quotationService.ts:76` | idem |
| `components/ContractModal.tsx:232` | `useNewNumbering` deixa de exigir `domain==='SUPRIMENTOS' && project_id`; **remover o bloco MAX+1 de `:243-274`** e o retry de colisão de `:455-470` |
| `services/contractService.ts:1329-1331` | `createFromDeal` — CV/CL passam pelo motor |
| `services/commercialService.ts:599-619` | **remover o MAX+1**; `SALE_DEAL` / `RENTAL_DEAL` pelo motor (locação passa a ter code) |
| `services/servicesCommercialService.ts:341` | enviar `proposal_number` gerado em vez de `''` |
| conversão `stage='won'` do CRM | enviar `contract_number` gerado (`SERVICE_CRM_CONTRACT`) |
| `services/condominioRateioService.ts` | ao FECHAR o rateio, gravar `number` (`CONDO_RATEIO`) |

**Backfill dos contadores** (`20270912000005_backfill_document_counters.sql`, aplicar
junto com esta fase, não antes): copiar as 5 tabelas antigas
(`purchase_order_number_counters`, `contract_number_counters`,
`quotation_number_counters`, `rental_contract_number_counters`,
`unit_sale_contract_number_counters`) para `document_number_counters`, montando o
`scope_key` com os mesmos códigos que a máscara default usa. **Sem isso a numeração
recomeça do 1 e bate no índice único.** Para os módulos legados (Serviços,
`commercial_deals`), semear `last_seq` com o maior número já usado. Idempotente (`ON
CONFLICT DO NOTHING`), para poder rodar de novo.

Documentos já criados **mantêm o número antigo** — nenhuma renumeração.

**Critério de pronto:** para cada um dos 8 consumidores da tabela, criar um documento
novo no navegador e conferir que o número bate com a configuração de Nomenclatura;
nenhum documento antigo mudou de número.

### F5 — Limpeza

Só depois de F4 verificada no navegador:
- remover de `AppSettings` os 15 campos de numeração (`orderPrefix`…
  `unitSaleContractSeqPadding`) e `TEMPLATE_VARS`, mantendo `supplierNameDisplay` e os
  templates de WhatsApp/e-mail;
- dropar as 5 tabelas de contador antigas e as 5 RPCs `fn_next_*_seq`;
- dissolver os 5 services-invólucro nos chamadores.

**Critério de pronto:** `npx tsc --noEmit` limpo após a remoção; grep por
`opura_app_settings` e pelos nomes das 5 RPCs antigas não retorna nada em `services/` e
`components/`.

## Estado

- [x] F1 — Banco: 6 migrations escritas (`20270912000001`-`000006`) — **as 5 primeiras aplicadas pelo usuário em 2026-08-18** e confirmadas via API (anon recebe "permission denied", não "does not exist"; usuário de leitura confirmou dados). `000006` (reversão do bloqueio) escrita depois, ainda não confirmada como aplicada — conferir antes de considerar F1 fechada.
- [x] F2 — Motor em `services/documentNumbering/` (types/catalog/format/resolvers/settingsService/index) — `tsc --noEmit` limpo, 12 testes unitários (`__tests__/documentNumberFormat.test.ts`) cobrindo o exemplo literal do pedido original
- [x] F3 — `components/settings/NumberingSettingsCard.tsx` substitui os 5 blocos antigos; `Settings.tsx` ganhou 11 folhas (era 5); `check-ui-standard.sh` sem apontamento novo; **verificado em produção** (print do usuário: máscara configurada e salva corretamente para Contratos de Suprimentos)
- [x] F4 — 8 consumidores ligados. **Testado em produção pelo usuário — 3 bugs reais encontrados e corrigidos** (ver "Correções pós-deploy" abaixo). Ainda não reconfirmado após a última rodada de correções.
- [ ] F5 — Limpeza (AppSettings, tabelas/RPCs antigas, wrappers) — aguardando confirmação final antes de remover o mecanismo antigo

### Correções pós-deploy (2026-08-18)

1. **Fornecedor/Cliente/Centro de Custo nunca chegavam ao motor** — os invólucros que preservaram assinatura antiga (`generateOrderNumber(projectId)` etc.) e o `ContractModal.tsx` só passavam `projectId`/`clientId`/`costCenterId` (e nem isso em todos) — qualquer máscara usando `{Fornecedor}` travava. Corrigido: os invólucros ganharam parâmetro `extra` opcional; `ContractModal`/`DealModal` passam `supplier_id`/`cost_center_id`. `QUOTATION` perdeu `FORNECEDOR`/`CENTRO_CUSTO` do catálogo — cotação vai para vários fornecedores (`invited_supplier_ids` é array) e não tem coluna de centro de custo.
2. **Contrato de Suprimentos sem obra caía no legado calado** — `useNewNumbering` em `ContractModal.tsx` exigia `!!formData.project_id`; sem obra, ignorava a máscara configurada e gerava só o sequencial de 3 dígitos, sem erro. Confirmado no banco (contratos "013"/"014" com `project_id: null`). Corrigido: Suprimentos e Serviços sempre usam o motor novo; quem decide se precisa de obra é a máscara, não um gate fixo.
3. **Decisão de bloqueio revertida** — a primeira versão lançava `MissingCodeError` quando uma variável configurada não tinha valor (ex.: obra sem empreendimento vinculado). O usuário pediu reversão explícita ("nada tem que ser exigido!") depois de ver isso travar um contrato real. `resolveVariables` (front) e `fn_generate_document_number` (SQL, migration `000006`) agora NUNCA bloqueiam — o que não resolve simplesmente some do número.

### Desvios do plano original (decisões tomadas durante a implementação)

1. **`services_proposals`/`services_contracts` (CRM) não têm `client_id`/`cost_center_id`** — só `ORGANIZACAO` está disponível como variável para `SERVICE_PROPOSAL`/`SERVICE_CRM_CONTRACT`. Documentado no cabeçalho de `20270912000004` e em `catalog.ts`.
2. **Componente de ANO some** de `PROP-`/`CTR-` ao herdar o formato default da Nomenclatura — "ano" não é uma das 7 variáveis pedidas. Números já emitidos não mudam.
3. **`ContractModal.tsx` domain='VENDAS'** (entrada manual em `SalesModule.tsx`, separada do fluxo `DealModal→CV-`) **ficou FORA do escopo** — continua no formato legado de 3 dígitos. Não estava nos 11 doc_types mapeados; é uma tela adicional que gera `contracts.number` e pode precisar de uma decisão própria depois.
4. **Risco de UNIQUE global** em `quotation_requests.number` e `purchase_orders.number` (sinalizado na seção Riscos) **não foi alterado** — fora do pedido literal, fica como próximo passo se o usuário confirmar.

## Verificação

**Testes** (`__tests__/`):
- `documentNumberFormat.test.ts` — função pura `formatDocumentNumber`: slots vazios
  colapsam sem separador duplicado; separador `.`; padding 1–9; prefixo em posição
  arbitrária; o exemplo do pedido original (`{ }-{ }-{prefixo}-{Empreendimento}-{Fornecedor}-{Centro de custo}-{seq}`) produz o formato esperado.
- `npx vitest run __tests__/orgContextGuard.test.ts` e
  `__tests__/migrationsPrefixo.test.ts` — devem continuar passando (catracas de CI).
- `npx tsc --noEmit` — o build da Vercel roda isso.
- `bash scripts/check-ui-standard.sh components/settings/NumberingSettingsCard.tsx components/Settings.tsx`

**No navegador** (não declarar pronto sem isto — tsc e teste não provam comportamento):
1. Configurações › Nomenclatura › Pedidos de Compra: montar
   `{vazio}-{vazio}-{prefixo}-{Empreendimento}-{Fornecedor}-{Centro de custo}-{seq}` com
   separador `.`, salvar, recarregar a página e confirmar que **persistiu** (prova que
   saiu do localStorage).
2. Trocar a organização no seletor do topo e confirmar que a máscara é outra.
3. Criar um Pedido de Compra e conferir o número contra o preview.
4. Criar um segundo pedido na **mesma** combinação (mesmo empreendimento/fornecedor/CC)
   → `…0002`; e um com fornecedor diferente → volta a `…0001` (prova o escopo do
   contador).
5. Criar um pedido com o Centro de custo em branco → deve **bloquear** com mensagem
   nomeando o que cadastrar.
6. Repetir 3–5 num módulo de cada família: Contrato de Serviços, Negociação de Venda,
   Contrato de Locação, Rateio de Condomínio.
7. Conferir no banco que os contadores antigos foram herdados: o primeiro pedido criado
   após o deploy **não** pode sair `…0001` numa obra que já tinha pedidos.

## Riscos

- **`empreendimentos.code` duplicado em produção** trava a migration F1. Por isso a
  checagem com `RAISE EXCEPTION` legível antes do índice — rodar essa consulta *antes*
  de agendar a aplicação.
- **`quotation_requests.number` e `purchase_orders.number` têm UNIQUE global**, sem
  `organization_id`. Com máscaras livres por org, duas organizações podem gerar o mesmo
  número e uma delas leva 23505. Recomendo trocar por UNIQUE `(organization_id, number)`
  na F1 — está fora do pedido literal, então fica sinalizado aqui para decisão.
- `aplicar_20270905000027_rental_sale_numbering_por_unidade.sql` é migration de
  aplicação manual; confirmar no banco que `fn_next_rental_contract_seq(UUID)` de 1
  argumento existe antes de escrever o backfill em cima dela.
