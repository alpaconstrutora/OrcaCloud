# Contas a Receber — emitir recibo ao dar baixa

## Pedido original

> financeiro < Contas a Receber: emitir recibo ao dar baixa

> Sessão: e7e86c63-bc35-44ed-8b51-a87c73ea1b7a · 2026-09-26

### Pedido posterior (2026-09-26, mesma sessão, depois da publicação de `9831ea1`)

> o recibo deve ficar disponivel para download

### Pedido posterior (2026-09-27, mesma sessão)

> corrigir

(Resposta à oferta de corrigir o recibo antigo do portal, que assinava com o nome
do próprio cliente.)

### Pedido posterior (2026-09-27, mesma sessão, com print do recibo nº 000004)

> 1. veja print: logomarca ficou esticada.
> 2. trazer norecibo o numero do contrato
> 3. trazer a data da baixa do título

Perguntado o que o item 3 queria (o recibo já mostrava a data gravada na baixa):
*"desconsidere meu pedido."* Perguntado sobre o nº 4 já emitido: **"Regerar o nº 4"**.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-09-26 | Como o recibo sai na baixa? | Opção "Emitir recibo" no momento da baixa (marcada por padrão) + ícone de reimpressão nos já recebidos |
| 2026-09-26 | A baixa precisa de mais dados? | Painel de baixa com data e forma de pagamento |
| 2026-09-26 | Guardar numerado? | Sim, numerado e salvo |
| 2026-09-26 | Lote? | Um arquivo por título |
| 2026-09-26 | Onde o recibo fica disponível para download? | Os quatro: coluna na tabela · Portal do Cliente · link da notificação · "não achei o ícone" (conferir produção) |

Resumo das decisões:
- **Gatilho:** caixa "Emitir recibo" (marcada por padrão) no momento da baixa + ícone "Recibo" nos títulos já recebidos para reimprimir.
- **Dados:** trocar o confirmar por **painel de baixa** com data do pagamento e forma de pagamento, gravadas no título e impressas no recibo. O valor continua sendo o do título.
- **Guardar:** **sim, numerado e salvo** (numeração sequencial por organização, PDF no Storage, reimprimir devolve o mesmo arquivo).
- **Lote:** **um arquivo por título**.

## Context

Hoje a baixa em Contas a Receber ([ContasReceberManager.tsx:874-897](components/ContasReceberManager.tsx#L874-L897), `handleBaixa`) é um `useConfirm` sem campos. Ela chama `receivableService.updateStatus(id,'RECEBIDO')`, e `payment_date` vira `CURRENT_DATE` pela trigger `trg_payment_date_na_baixa` (migration `20270909000002`, que **só preenche quando o valor chega vazio**). A tela não tem nenhuma ação de recibo.

O único gerador de recibo é `exportService.generateReceiptPDF` (`services/exportService.ts:566-624`). Ele tem três limitações: recebe `PaymentInstallment`, chama `doc.save()` direto (sem Blob), e o "número" é só o começo do UUID. Nada persiste recibo no banco hoje. O cron `fn_notif_recibo_disponivel` (`20270919000002`) já avisa "recibo disponível" e aponta para `/contas-a-receber?tx=<id>`.

Resultado esperado: a baixa passa a registrar data e forma de pagamento. Cada recibo recebe um número sequencial por organização que nunca se repete, e seu conteúdo é congelado num registro próprio. O PDF fica guardado num bucket privado e pode ser reimpresso idêntico.

## Pré-requisitos (REGRA #8 e #1)

- `bash scripts/nova-frente.sh recibo-na-baixa`. Todo o trabalho acontece na frente, nunca no checkout de integração, que está 23 commits atrás.
- Ler `docs/ui_ux_guia_unificado.md` inteiro antes de tocar em qualquer `.tsx`, com atenção a §30 (malha de formulário) e a `UI_PATTERNS.md` §4, que diz que a baixa é painel lateral (`Sheet`).

## Itens

### 1. Migration `supabase/migrations/aplicar_20270926000060_recibos_recebimento.sql`

**O que muda:**

**Tabelas**
- **`financial_receipt_counters`** — `(organization_id uuid PK, last_number int NOT NULL DEFAULT 0)`, com RLS habilitada e **nenhum grant** a `authenticated`. Só a RPC acessa.
- **`financial_receipts`** — uma linha por emissão, com o snapshot congelado.
  - Colunas:
    - `id`, `organization_id NOT NULL`, `transaction_id NOT NULL` (FK para `internal_transactions` com `ON DELETE RESTRICT`), `receipt_number int NOT NULL`
    - `amount`, `payment_date`, `payment_type`, `description`
    - `payer_name`, `payer_document`, `issuer_name`, `issuer_document`, `issuer_address`
    - `file_path`, `issued_by`, `issued_at`, `cancelled_at`, `cancel_reason`
  - Índices: `UNIQUE (organization_id, receipt_number)` e um índice único parcial `(transaction_id) WHERE cancelled_at IS NULL`, que garante no máximo um recibo ativo por título.
  - RLS e grants: `SELECT` para membros via `is_org_member(organization_id)`. `REVOKE ALL ... FROM PUBLIC, anon, authenticated` e depois `GRANT SELECT TO authenticated`. **Não há INSERT, UPDATE nem DELETE direto.** Pergunta 1 da REGRA #7: a policy tem uma perna só, sem `OR`.

**RPCs**, ambas `SECURITY DEFINER` e `SET search_path = public`, com `REVOKE EXECUTE ... FROM PUBLIC, anon` e `GRANT ... TO authenticated` (REGRA #7, pergunta 2):
- **`emitir_recibo_recebimento(p_transaction_id uuid)`**, retorna `financial_receipts`:
  1. Lê o título com `FOR UPDATE`.
  2. **Autoriza por dentro** com `is_org_member(org)`.
  3. Exige `direction='CREDIT'` e título baixado (`status='CONCILIATED' OR business_status='RECEBIDO'`).
  4. Se já existe recibo ativo, **devolve o existente** (idempotente: duplo clique ou reimpressão não gastam número).
  5. Se não existe, incrementa o contador com `INSERT ... ON CONFLICT (organization_id) DO UPDATE SET last_number = last_number+1 RETURNING`, que serializa por org.
  6. Grava o snapshot:
     - valor, `payment_date`, `payment_type` e descrição vêm do título;
     - pagador vem de `clients` via `party_id` (nome e `document`), com fallback para `party_name`;
     - emitente vem de `organizations` (nome, CNPJ e endereço montado).
- **`registrar_arquivo_recibo(p_receipt_id uuid, p_file_path text)`**: autoriza por membro da org do recibo, exige que o path comece com `<organization_id>/`, e só grava se `file_path IS NULL`.

**Trigger de cancelamento** `trg_cancelar_recibo_no_estorno` (`AFTER UPDATE` em `internal_transactions`):
- Quando o título **deixa de estar baixado** (OLD baixado e NEW não), marca `cancelled_at = now()` e `cancel_reason = 'estorno'` no recibo ativo.
- Fica na trigger, e não no `estornar()`, pelo mesmo motivo da `20270909000002`: todos os caminhos de estorno passam por ela.
- Uma nova baixa depois do estorno gera um número novo, e o cancelado continua no histórico.

**Bucket `financial-receipts`**: privado, 5 MB, só `application/pdf`. Policies de `SELECT` e `INSERT` para membros, com a primeira pasta = `organization_id` (mesmo padrão de `20261110000001_document_templates.sql:52-95`). Sem `UPDATE` e sem `DELETE`: o arquivo emitido é imutável.

Cabeçalho no padrão "⚠️ APLICAR À MÃO (`npx supabase db query --linked -f`). NUNCA `db push`".

**Como sei que terminou:**
- `npx vitest run __tests__/segurancaMigrations.test.ts` verde.
- Migration aplicada com `db query --linked -f`.
- Consulta de conferência mostra as 2 tabelas, as 2 RPCs com ACL sem `=X/` e sem `anon`, a trigger e o bucket `public=false`.
- `bash scripts/check-rls-postura.sh` sem achado novo.

### 2. `types/financial.ts` — tipo `FinancialReceipt`

**O que muda:** interface espelhando a tabela, mais `ReceivablePaymentType = NonNullable<PaymentInstallment['paymentType']>`, que reaproveita a união `'PIX'|'TED'|'DOC'|'DINHEIRO'|'CHEQUE'|'PERMUTA'` de `types/financial.ts:55`.

**Como sei que terminou:** `npm run typecheck` verde.

### 3. `services/receivableService.ts` — `darBaixa`

**O que muda:** nova função `darBaixa(id, { paymentDate, paymentType })`.
- Faz o mesmo update de `updateStatus('RECEBIDO')` (`business_status='RECEBIDO'`, `status='CONCILIATED'`) **mais** `payment_date` e `payment_type` explícitos. Como a data é enviada, a trigger não a sobrescreve.
- `updateStatus` continua existindo para os demais status.

**Como sei que terminou:** novo caso em `__tests__/receivableService.test.ts` verifica o payload do update (as 4 colunas).

### 4. `utils/reciboRecebimento.ts` (novo, puro)

**O que muda:** `montarReciboPdf(receipt: FinancialReceipt, logoDataUrl?: string): jsPDF`, com o mesmo visual de `generateReceiptPDF`: faixa verde, título, número, valor, linha de assinatura e rodapé.

O texto do recibo diz:
- "Recebemos de {pagador} ({CPF/CNPJ}) a importância de {valor} ({valor por extenso}), referente a {descrição}";
- a data e a forma de pagamento;
- o emitente com CNPJ e endereço;
- "Nº 000123", e a marca "CANCELADO" se `cancelled_at` estiver preenchido.

Reaproveita `valorPorExtenso` de `services/docxFieldCatalog.ts:203`. Se o import puxar peso indevido para o bundle, a função muda para `utils/` com re-export no catálogo, sem alterar o comportamento. Também exporta `nomeArquivoRecibo(receipt)`, no formato `Recibo_000123_<pagador>.pdf`.

O `generateReceiptPDF` existente **não é alterado**: ClientArea e ProjectFinancialManager ficam fora desta frente.

**Como sei que terminou:** `__tests__/reciboRecebimento.test.ts` confere três coisas:
- o texto gerado contém número, valor por extenso, documento e forma de pagamento;
- o recibo cancelado sai com a marca;
- o pagador sem documento não imprime "()".

### 5. `services/financialReceiptService.ts` (novo)

**O que muda:**
- `emitir(transactionId)` chama a RPC.
- `listarAtivos(transactionIds)`, um select por lote, permite à tela saber quais linhas já têm recibo.
- `baixarPdf(transactionId)` é o fluxo único, usado tanto na baixa quanto na reimpressão:
  1. chama `emitir`, que devolve o recibo existente ou cria um novo;
  2. se já tem `file_path`, faz `storage.download` e `saveAs`;
  3. se não tem, monta o PDF pelo snapshot (logo da org via `urlToBase64`, `exportService.ts:1093`), faz upload em `<org>/<receipt_id>.pdf`, chama `registrar_arquivo_recibo` e depois `saveAs`.
  - Se o upload falhar, o recibo continua numerado e o PDF é baixado mesmo assim; a próxima reimpressão tenta subir de novo.

**Como sei que terminou:** typecheck verde, e o fluxo foi exercitado no item 8.

### 6. `components/financeiro/BaixaRecebivelSheet.tsx` (novo)

**O que muda:** `Sheet` + `SheetPanel` com `p-6` (a primitiva não tem padding próprio), servindo para um título ou para um lote.
- **Resumo:** pagador, descrição e valor de cada título, mais o total quando há mais de um.
- **Data do pagamento:** obrigatória, padrão hoje, sem data futura.
- **Forma de pagamento:** select com as 6 opções mais "Não informada", o mesmo vocabulário de `DealModal.tsx:4687-4700`.
- **Emitir recibo:** checkbox, marcada por padrão.
- **Botão "Confirmar recebimento":** quando desabilitado, diz o motivo (ex.: "Informe a data do pagamento").
- **Malha:** §30 do guia.

**Como sei que terminou:** `bash scripts/check-ui-standard.sh components/financeiro/BaixaRecebivelSheet.tsx` com exit 0, e o painel foi visto no app real (item 8).

### 7. `components/ContasReceberManager.tsx`

**O que muda:**
- **Baixa individual:** `handleBaixa` abre o painel em vez do `useConfirm`. Ao confirmar, chama `darBaixa`, depois `aplicarStatusNaLista`, e, se a caixa estiver marcada, `financialReceiptService.baixarPdf(id)`.
  - Se a baixa der certo e o recibo falhar, o toast diz "Baixado; recibo não gerado: …". A baixa não é desfeita.
- **Baixa em lote:** `handleBulkBaixa` abre o mesmo painel com N títulos, aplica a mesma data e forma a todos, e gera **um arquivo por título**, em sequência. O toast mostra a contagem de baixas e de recibos, com as falhas nomeadas.
  - Risco conhecido: o Chrome pergunta uma vez se permite downloads múltiplos. Isso fica dito no texto do checkbox quando há mais de um título.
- **Linha já recebida:** nova `ActionIconButton` "Recibo" (ícone `Receipt`), ao lado de "Estornar baixa", que chama `baixarPdf`.
  - Serve também para títulos baixados antes desta feature: a RPC emite na hora, com a data já gravada no título.
  - Tooltip: "Reimprimir recibo Nº X" se já existe, ou "Emitir recibo" se ainda não.
- **Carregamento dos recibos ativos:** a informação vem de `listarAtivos` sobre os ids da página carregada. `effectiveOrgId` não é usado para decidir o emitente: ele sai do `organization_id` do título, dentro da RPC. Isso funciona com o topo em "Todas" sem perguntar nada (REGRA #5).

**Como sei que terminou:** estas verificações passam:
- `check-ui-standard.sh components/ContasReceberManager.tsx` com exit 0;
- `npx vitest run __tests__/orgContextGuard.test.ts` verde;
- `bash scripts/check-system-projects.sh components/ContasReceberManager.tsx` e `check-project-classification.sh` sem achado.

### 8. Verificação ponta a ponta (app real, skill `rodar-app`)

⚠️ Este passo grava no banco de produção. **Antes de executar, pedir ao usuário um título de teste** (ou autorização para criar um e depois estornar), e registrar no plano quais ids foram usados.

**Como sei que terminou:** cada item abaixo foi conferido no app **e** no banco (`db query --linked`):
1. Baixa de um título com data de ontem e forma PIX:
   - o PDF foi baixado;
   - `internal_transactions.payment_date` é ontem e `payment_type` é PIX;
   - existe uma linha em `financial_receipts` com número N;
   - o objeto existe no bucket.
2. Clicar em "Recibo" na mesma linha baixa o mesmo arquivo, com o mesmo número, e o contador não andou.
3. Estornar a baixa preenche `cancelled_at`. Baixar de novo gera o número N+1.
4. Baixa em lote de 2 títulos gera 2 arquivos e 2 números.
5. Com o topo em "Todas as organizações", o recibo sai com o emitente certo, que é a org do título.
6. `npm run ci` verde (typecheck, test, build).

### 9. Publicação

`git push origin HEAD:main`, depois `bash scripts/conferir-producao.sh "Emitir recibo"` e `bash scripts/fechar-frente.sh recibo-na-baixa`.

**Como sei que terminou:** o script prova o SHA no domínio.

## Estado

- [x] 1. Migration `aplicar_20270926000110_recibos_recebimento.sql` — aplicada em 26/09/2026. ACL conferida: RPCs só `authenticated`/`service_role` (sem `=X/`, sem `anon`), tabela só `SELECT`, bucket `public=false`. Lógica testada antes numa transação desfeita por exceção (numeração, idempotência, caminho fora da pasta recusado, estorno cancela, rebaixa gera novo número).
- [x] 2. Tipo `FinancialReceipt` / `ReceivablePaymentType`
- [x] 3. `receivableService.darBaixa` — 2 casos novos em `receivableService.test.ts`
- [x] 4. `utils/reciboRecebimento.ts` — 10 casos em `reciboRecebimento.test.ts`. Regras puras do painel (data, motivo do botão desligado, toast) em `utils/baixaRecebivel.ts`, 9 casos em `baixaRecebivel.test.ts`
- [x] 5. `services/financialReceiptService.ts`
- [x] 6. `components/financeiro/BaixaRecebivelSheet.tsx` — `check-ui-standard.sh` exit 0
- [x] 7. `ContasReceberManager.tsx` — `check-ui-standard.sh` exit 0, `orgContextGuard` verde, `check-system-projects`/`check-project-classification` sem achado, `check-xss-sinks` limpo
- [x] 8. Verificação ponta a ponta — ver registro abaixo
- [x] 9. Publicação — commit `9831ea1` em main; `conferir-producao.sh "Confirmar recebimento"` provou o SHA carimbado no bundle servido (26/09/2026)

### Registro do teste real (item 8, 26/09/2026)

Autorizado pelo usuário ("Criar título de teste"). Dois títulos manuais criados na
Alpa Construtora (`926cf626…`): `bf0b313f-2878-44a5-bc9e-97d2ca9182bf` (A, R$ 1,00) e
`86b6768c-80ba-4d4a-9744-00742d786d4b` (B, R$ 2,50). Playwright com o agente de
leitura, no app real (dev server da frente), rede escutada — **zero** erro de
console/HTTP:

1. Baixa de A com 25/09 + PIX: PDF `Recibo_000001` baixado; banco com
   `payment_date=2026-09-25`, `payment_type=PIX`, recibo nº 1 com arquivo no bucket.
   Data futura desliga o botão com "A data do pagamento não pode ser futura.".
2. "Recibo" na linha (tooltip "Reimprimir recibo Nº 000001"): mesmo arquivo, **hash
   idêntico**, contador não andou.
3. Estorno: recibo nº 1 `cancel_reason=estorno`, conteúdo congelado (25/09, PIX).
4. Lote A+B com Dinheiro: 2 arquivos, nº 2 e nº 3.
5. Topo em "Todas as organizações" (`orca_activeEmpresaId=null`): reimpressão de B
   devolveu o nº 3, mesmo hash, emitente = org do título.
6. `npm run ci` verde; suíte inteira 5746 passed.

Limpeza: os dois títulos foram excluídos; a trigger de exclusão marcou os nº 2 e 3
como `titulo_excluido`. Os 3 recibos ficam no histórico (cancelados) e **o
contador da Alpa está em 3 — o primeiro recibo real dela será o nº 000004.**

## Fase 2 — recibo disponível para download

Achado ao conferir produção (Playwright, 1600×1000): o ícone existe (129 linhas
recebidas; recibo real nº 000004 já emitido), mas a tabela é mais larga que a
tela e **a coluna Ações fica fora da área visível**, só com rolagem lateral.

- [x] 10. `components/ui/TableUtils.tsx` — coluna nova entra ao lado da vizinha
  da ordem padrão, não no fim (senão a coluna Recibo nasce fora da tela para
  quem já tem colunas salvas). **Pronto quando:** teste de
  `mesclarOrdemDeColunas` verde.
- [x] 11. `ContasReceberManager.tsx` — coluna **Recibo** logo após Valor (antes de Status — depois de Status terminava em 1655px numa tela de 1600, medido):
  "Nº 000004" (link, baixa o PDF guardado), "Emitir" no recebido sem recibo, "—"
  no aberto; ordenável pelo número. **Pronto quando:** visível sem rolagem em
  1600px no app real; `check-ui-standard.sh` exit 0.
- [x] 12. Link da notificação — `App.tsx handleNavigate` passa o `?tx=` por
  `navigateToFocus` (`CONTA_RECEBER`/`CONTA_PAGAR`); `ContasReceberManager`
  consome: limpa filtros se preciso, rola até o título e destaca. **Pronto
  quando:** clicar no aviso abre a tela com a linha destacada (app real).
- [x] 13. Portal do Cliente — `fn_portal_receivables_payload` ganha `recibo_numero`
  (migration `aplicar_20270926000120`, aplicada; definição conferida no banco antes
  de reescrever) + Edge Function `client-portal-recibo-download` (autoriza pela MESMA
  RPC do portal com a credencial do chamador; service_role só assina). Botões de
  recibo do `ClientArea`: equipe emite/reimprime o numerado; cliente baixa o
  guardado; JSON legado segue o PDF montado na hora.
- [x] 14. Publicação — commit `4cde2e3` em main; `conferir-producao.sh` achou os textos da coluna no bundle servido e o SHA carimbado (26/09/2026). Edge Function `client-portal-recibo-download` publicada e sondada.

### Registro da verificação da Fase 2 (26/09/2026)

Playwright no dev server da frente, agente de leitura, rede escutada (único erro:
500 em `sinapi_items`, alheio — aparece em qualquer tela):

- **Coluna** (preferência de colunas ANTIGA semeada no localStorage, sem `recibo`):
  ordem `… Valor | Recibo | Status …`; cabeçalho de 1375 a 1505px em 1600 —
  inteiro na tela. "Nº 000004" baixou o PDF guardado.
- **Aviso**: clique em "Abrir" num aviso REAL de atraso
  (`/contas-a-receber?tx=2615398c…`, Fernanda Prado Zanotti) na Central de
  Notificações → hash `#/contas-a-receber`, linha com `bg-amber-50`, centralizada.
- **Portal do Cliente** pelo link público de José Roberto Gomes (token ativo
  existente, só leitura): botão "Baixar recibo Nº 000004" → `Recibo_000004.pdf`,
  **mesmo hash** do arquivo baixado pela equipe.
- **Edge Function** (REGRA #7 P3): sem header → 401; chave pública + token falso →
  403; chave pública + clientId sem sessão → 403; token válido pedindo título de
  OUTRO cliente → 403; token válido + título dele → 200 com URL assinada.
- `npm run ci` verde (5754 passed).

## Fase 3 — recibo antigo do portal (27/09/2026)

O recibo montado na hora (`exportService.generateReceiptPDF`) — parcelas do JSON
legado e parcelas pagas ainda sem recibo numerado — tinha quatro erros medidos no
PDF real (Filtrelec, link público): emitente = **nome do cliente** e sem CNPJ;
"Recebemos de **Cliente**"; "do imóvel **undefined**"; data do pagamento = **hoje**.
E na visão de Locação/Serviços do portal o cliente **não tinha botão de recibo
nenhum** (coluna Ações só para a equipe, e escondida até passar o mouse).

- [x] 15. Migration `aplicar_20270927000110_portal_emitente_do_recibo.sql` —
  `client_portal_get_emitente(p_token)` (anon) e `_for_client(p_client_id)`
  (membro OU o próprio cliente por e-mail), mesma autorização das RPCs de
  recebíveis; payload interno fechado. Sem `logo_url` (há logo gravada como data
  URL de ~79 KB). + `fn_portal_receivables_payload` ganha `payment_date`.
  Aplicada; sondas com a chave pública: token falso → `ok:false`; anon nas
  funções fechadas → 42501.
- [x] 16. `ClientArea.tsx` — emitente vem da RPC (sem emitente, não emite);
  pagador = cliente do portal; coluna Ações de Locação/Serviços para todos, com o
  recibo para o cliente e editar/remover só para a equipe, sempre visível (§9) e
  com `ActionIconButton` (§9.2). `exportService.generateReceiptPDF`: sem "imóvel
  undefined" e data por string (sem o recuo de fuso de `new Date('AAAA-MM-DD')`).
- [x] 17. Verificação — PDF real da Filtrelec pelo link público: "Recebemos de
  Filtrelec Comercio e Importação … parcela 1/36 (10/08/2021).", "Data do
  Pagamento: 09/09/2026" (a gravada no título), assinado "Alpa Construtora e
  Incoporadora / 09.264.396/0001-59". José Roberto segue com "Baixar recibo
  Nº 000004". tsc ok, 5770 testes, build ok.
- [x] 18. Publicação — commit `78c2e56` em main; `conferir-producao.sh` provou o SHA e o texto novo no bundle servido (27/09/2026).

## Fase 4 — logo proporcional e nº do contrato (27/09/2026)

- [x] 19. Migration `aplicar_20270927000120_recibo_numero_do_contrato.sql` —
  coluna `financial_receipts.contract_number` (snapshot) + `emitir_recibo_recebimento`
  reescrita a partir da vigente (conferida: idêntica ao arquivo) resolvendo
  `contracts.number` pelo `reference_id` (`:p` e `-p`) + backfill. Aplicada: nº 4 →
  `CTV-007-007-0001`. Teste desfeito por exceção num título `-p`: `CTL-010-014-0001`.
- [x] 20. `utils/reciboRecebimento.ts` — linha "Contrato: …" e logo em
  `caberNaCaixa` (proporção mantida, centralizada na caixa 30×15). Testes: 14.
- [x] 21. Publicação — commit `08954df` em main; `conferir-producao.sh "Contrato: "` provou SHA e texto no bundle servido.
- [x] 22. Regerar o nº 4 — feito 27/09/2026: backup do PDF antigo (57.772 bytes, sha `0cb2af71…`, pasta temporária da sessão), objeto apagado via `supabase storage rm`, `file_path = NULL`, baixado em produção (orcacloud.vercel.app, `08954df`) → refeito e guardado (sha `e630eca9…`), com "Contrato: CTV-007-007-0001" e logo proporcional. Era: — depois do deploy: backup do PDF antigo, apagar o objeto,
  `file_path = NULL`, baixar em produção (refaz pelo snapshot). **Pronto quando:** o
  PDF baixado de produção traz "Contrato: CTV-007-007-0001" e a logo proporcional.

## Fora do escopo (anotado, não feito)

- Deep link `?tx=` da notificação `pagamento_recibo`: a tela não trata o parâmetro. Pode virar item seguinte.
- Bug do ClientArea, que passa `clientProfile.name` como emitente em `generateReceiptPDF`.
- Juros, multa, desconto e valor recebido diferente do título (baixa parcial real).
