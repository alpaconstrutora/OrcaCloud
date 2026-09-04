# Ficha do condomínio — largura total + aba Documentos com upload

## Pedido original

Sessão de 04/09/2026. Mensagem do usuário, transcrita literalmente:

> comercial < Condomínios < Ficha do condomínio:
> 1. ocupe a tela, na mesma largura do toolbar de abas
> 2. criar aba documentos, para que seja possivel fazer upload de documentos como convencao de condomínio por exemplo

---

## Contexto que muda o desenho

**Documentos de condomínio JÁ EXISTEM** — `condominio_documentos`, criada na
`aplicar_20270905000023_portal_condomino.sql`, hoje pendurada como sub-aba
dentro de **Comunicação**. Mas ela só guarda **link** (`url TEXT NOT NULL`):
não há upload em lugar nenhum, e o Sheet "Novo documento" avisa por escrito que
"arquivo em bucket privado não vai abrir".

Logo o item 2 não é tabela nova — é (a) promover documentos de sub-aba para aba
própria, (b) dar a ela o upload que nunca teve. Manter as duas entradas para a
mesma tabela seria o mesmo erro que Ocupações resolveu ao sair de
Empreendimentos ("evitar o mesmo controle em 2 caminhos").

**A trava do upload é o Portal do Condômino.** Ele lê `url` por RPC
`SECURITY DEFINER` e roda **sem sessão** (token no link) — bucket privado não
abre por lá. Foi por isso que a decisão original foi "documento por URL
pública". Só que desde então o repo ganhou **cinco** edge functions de download
de portal (`portal-ged-download`, `partner-portal-download`,
`supplier-portal-download`, `labor-portal-ged-download`, `academy-portal-media`)
que resolvem exatamente isso: valida o token, confere o vínculo, e só então
assina com service_role. A premissa envelheceu; o caminho seguro está pronto.

Bucket **privado** portanto, e não `documents` (que é `public=true`): convenção,
atas e laudos de um condomínio não são conteúdo de URL eterna sem autenticação.

---

## Itens

### 1. `supabase/migrations/aplicar_20270919000005_condominio_documentos_upload.sql`

> ⚠️ Nasceu `aplicar_20270918000027` e foi **renumerada** na hora do push: o
> `main` local do checkout de integração estava 23 commits atrás, e
> `20270918000027` já era de `portal_cliente_dados_da_unidade`, de outra
> frente. Foi aplicada no banco sob o número ANTIGO — ver o cabeçalho do
> arquivo.

- Bucket `condominio-documentos`, `public=false`, 50 MB, allowlist de MIME sem
  `text/html`.
- `condominio_documentos` ganha `storage_path`, `file_name`, `mime_type`,
  `file_size`.
- `url` deixa de ser `NOT NULL`; CHECK garante `url IS NOT NULL OR storage_path
  IS NOT NULL` — um documento sempre aponta para algum lugar.
- 4 policies de `storage.objects` escopadas por org
  (`is_org_member((storage.foldername(name))[1]::uuid)`), papel `authenticated`,
  nenhuma para `anon`.
- **Como sei que terminou:** o bloco de verificação embutido devolve
  `bucket_privado=1`, `colunas=4`, `url_nullable=1`, `policies_org=4`,
  `policies_anon=0`; e `npx vitest run __tests__/segurancaMigrations.test.ts
  __tests__/migrationsPrefixo.test.ts` passa.

### 2. `services/condominioComunicacaoService.ts`

- `uploadDocumento()` — sobe para `{org}/{empreendimento}/{uuid}.{ext}` e grava
  a linha; se o INSERT falhar, apaga o objeto (não deixa órfão no bucket).
- `abrirDocumento()` — URL assinada de 15 min para o que foi enviado, `url`
  crua para o que é link.
- `removeDocumento()` passa a receber o documento e apagar o arquivo junto.
- Constantes de validação (`MIME_PERMITIDOS`, `TAMANHO_MAXIMO_BYTES`) exportadas,
  espelhando o bucket — para o erro aparecer antes do upload, não depois.
- **Como sei que terminou:** `npx tsc --noEmit` limpo e nenhum outro call site
  de `removeDocumento` fora da aba nova.

### 3. `components/condominio/DocumentosTab.tsx` (novo)

Tabela no padrão do guia: KPIs → toolbar acoplada (§5.2) → `<table>` com
`SortableHeader`/`ColumnConfigButton`, `px-6`/`border-r`/`py-2.5`, ações via
`ActionIconButton` + `InlineDisclosureMenu`, exclusão por `useConfirm()`.
Sheet de criação com dois modos — **Enviar arquivo** (o pedido) e **Link
externo** (o que já existia, preservado).

- **Como sei que terminou:** `bash scripts/check-ui-standard.sh
  components/condominio/DocumentosTab.tsx` sai 0.

### 4. `components/condominio/CondominioDetail.tsx`

- Item 1 do pedido: cai o `max-w-3xl` do card da Ficha; o formulário passa a
  `md:grid-cols-2 xl:grid-cols-3` para não virar campo de 1200px de largura.
- Aba `documentos` entre Frações e Ativos (é papel do condomínio, não ativo
  físico), com título/subtítulo próprios em `TITULOS`.
- **Como sei que terminou:** a Ficha termina na mesma borda direita do card de
  abas, verificado no navegador.

### 5. `components/condominio/ComunicacaoTab.tsx`

Sai a sub-aba Documentos (some a barra de sub-abas, sobra só Avisos), some o KPI
"DOCUMENTOS NO PORTAL" — quem manda nisso agora é a aba nova.

- **Como sei que terminou:** nenhuma referência a `documentos` sobra no arquivo
  e `check-ui-standard.sh` sai 0.

### 6. `supabase/functions/condomino-portal-download/index.ts` (novo)

Token de `condomino_portal_access` (ativo, não expirado) → documento tem de ser
do MESMO empreendimento do acesso **e** `visivel_portal` → só então assina.
Cópia do molde de `portal-ged-download`.

- **Como sei que terminou:** deploy feito e `curl` sem Authorization
  respondendo 401 (REGRA #7, pergunta 3).

### 7. `components/condominio/CondominoPortal.tsx`

O `<a href={d.url}>` vira botão que chama a function — uniforme para link e
para arquivo enviado.

- **Como sei que terminou:** documento enviado abre no portal por link assinado.

---

## Estado — 04/09/2026

**7 de 7 itens entregues.** Verificações, uma a uma:

| O que | Como foi provado |
|---|---|
| Item 1 — largura | Playwright no harness com 1290px úteis (a largura real do app, já descontada a sidebar): card de abas e card da Ficha em `left 24 / right 1266 / width 1242` — **o mesmo pixel nos dois**. Print `c:/tmp/pwtest/condominio/01-ficha.png`. |
| Item 3/4 — aba nova | 3 linhas renderizadas, 7 cabeçalhos (`Documento, Categoria, Arquivo, Tamanho, Portal, Atualizado em, Ações`), Sheet abrindo com `input[type=file]` presente e o modo "Link externo" alternando. Prints `02`, `03`, `04`. Console **sem nenhum erro**. |
| Migration | Aplicada nos blocos 1–4 via `db query -f` (sob o número antigo, `…18000027`; renumerada para `…19000005` no push). Conferência: `bucket_privado=1, colunas=4, url_nullable=1, tem_check=1, policies_org=4, policies_anon=0`. Antes de aplicar, rodou inteira dentro de `BEGIN…ROLLBACK` (verificado depois: nenhum bucket criado). |
| Edge function | Publicada. Sonda sem `Authorization` → **401**; com a chave pública e token inexistente → **403 "Link inválido ou expirado"**; corpo vazio → **400**. |
| Padrão de UI | `check-ui-standard.sh` limpo nos 4 `.tsx`; `tsc --noEmit` limpo; `npm run build` ok; `migrationsPrefixo`, `segurancaMigrations` e `orgContextGuard` passando. |

### Dois defeitos que só o navegador mostrou

1. **`page.route` do Playwright casa a rota registrada por ÚLTIMO primeiro.** A
   rota genérica `**/rest/v1/**` estava registrada depois da específica e engolia
   `condominio_documentos` — a tabela vinha vazia e parecia bug da tela. Vale para
   qualquer roteiro futuro deste app.
2. **Os dois modos do Sheet reaproveitavam o mesmo `<input>`.** Sem `key` distinta,
   o React trocava só o `type` de `file` para `text`, e um campo não-controlado
   virava controlado (aviso no console). Corrigido com `key="modo-arquivo"` /
   `key="modo-link"`.

### O que NÃO foi possível exercitar

`condominio_documentos` está **vazia em produção** e os 2 únicos acessos do Portal
do Condômino estão `is_active=false` (resíduo de teste, já registrado). Então o
ramo "documento de OUTRO empreendimento é recusado" da edge function está escrito
e revisado, mas **não foi exercitado contra dado real** — exercitá-lo exigiria
gravar documento e reativar acesso em produção, que não foi pedido.

### Não deployado

O front-end **não foi commitado nem empurrado** (o usuário não pediu deploy), e a
árvore tem mudanças de OUTRA frente (`SalesModule`, `SalesDashboard`,
`FiscalAnalytics`, `FiscalDocuments`, `commercialService`, `salesDashboardService`)
que não são desta tarefa e não devem ser empacotadas junto.

Aplicar a migration antes do front-end é seguro e foi checado: ela só ACRESCENTA
(bucket, 4 colunas, 4 policies) e RELAXA (`url` deixa de ser obrigatória). O
front-end em produção pede colunas nomeadas e exige `url` no formulário — nada
nele quebra com o schema novo.

---

## Correção 1 — o Portal do CLIENTE também lê estes documentos (04/09/2026)

### Pedido

> o documento aparece para o cliente porem quando ele clica para abrir o documento nada acontece

### O que eu errei

Auditei os consumidores de `condominio_documentos` e encontrei **dois** — a aba
admin e o Portal do Condômino. São **três**: a aba **Condomínio do Portal do
Cliente** (`components/client/CondominioTab.tsx`, da
`aplicar_20270901000001`) lê a mesma tabela por
`fn_condominio_payload_for_client`, e eu não a vi.

### Por que "nada acontece", e não um erro

O documento que o usuário enviou tem `url = NULL` (é arquivo, não link). A RPC
devolve `'url', d.url` → `null`, e a aba renderizava `<a href={d.url}>`. **O
React OMITE o atributo quando o valor é nulo** — a âncora fica sem `href`, deixa
de ser link, e clicar não dispara nada nem escreve no console. Falha silenciosa
perfeita: o elemento continua lá, com o cursor certo.

### A correção

- **`supabase/functions/client-portal-condominio-download/index.ts`** (novo).
  Irmã da `condomino-portal-download`, separada porque o Portal do Cliente tem
  DUAS identidades (token público × cliente logado/admin) contra a UMA do
  Condômino. **Não reescreve a regra de escopo:** chama a MESMA RPC que a aba
  chama, com a credencial do chamador (`Authorization` repassado, nunca
  service_role para autorizar), e só assina se o documento estiver na lista que
  voltou. Assim `minhas` + `visivel_portal` continuam com um dono só.
- **`services/clientPortalService.ts`** — `url` passa a `string | null` (com o
  aviso do porquê) e ganha `abrirDocumentoCondominio()`.
- **`components/client/CondominioTab.tsx`** — a âncora vira botão; link externo
  abre direto, arquivo enviado passa pela function; erro aparece na tela.
- **`components/ClientArea.tsx`** — injeta a identidade, na mesma precedência do
  resto da tela (`portalToken ?? clientProfile.id`).

### Varredura, agora fechada

`grep` por `condominio_documentos` em `services/`, `components/`,
`supabase/functions/` e `supabase/migrations/`: **3 consumidores de tela e 2
RPCs**, todos tratados — aba admin (URL assinada pelo service), Portal do
Condômino (`condomino-portal-download`) e Portal do Cliente
(`client-portal-condominio-download`).

### Provado com o documento REAL

Contra `a083daf4…` (`clientes-2026-09-04.xlsx`, 47.646 bytes) e o token ativo da
Defensoria Pública de MG:

| Sonda | Resultado |
|---|---|
| sem `Authorization` | **401** |
| token real + documento real | **200**, URL assinada |
| o link assinado baixa mesmo | **200 · 47.646 bytes · mime de xlsx**, e `file` diz "Microsoft Excel 2007+" — o tamanho bate com o `file_size` gravado |
| token inexistente | **403** "Link inválido ou expirado." |
| documento fora do escopo do cliente | **403** "Documento não disponível para este acesso" |

⚠️ A sonda com token real fez a RPC gravar `last_used_at` no token da
Defensoria — telemetria, no token que ela já usa. Nenhuma outra escrita.
