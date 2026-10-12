# Fundir "Minha Organização › Organização" com "Minha Organização › Grupo"

## Pedido original

> analise a convenicia de fundir siderar minha organizacao >  organizacao com siderar minha organizacao > Grupo

Sessão `c7991e19-cd9e-4402-99c4-291530079d08` · 2026-10-12, manhã.

Resposta à análise (mesma sessão, 2026-10-12 ~08:50), transcrita:

> Proposta
> 1. de acordo
> 2. de acordo
> 3. de acordo
> Também vale decidir o que será o padrão daqui para frente: SPE como organização separada (como foi feito com a Garden Cambuhy) ou SPE como empresa dentro da organização (como o modelo prevê). Se a regra for "SPE = organização separada", a aba "Empresas do grupo" quase nunca terá conteúdo, e a fusão fica ainda mais justificada.
> Resposta: SPE pode ser empresa separada mas também pode ser uma empresa ligada a outra

Resposta às perguntas abertas do plano (mesma sessão, 2026-10-12 ~09:40), transcrita:

> 1 Altair Pereira da Rosa é uma organizacao, porem é pessoa fisica e nao juridica.
>  2. Posso começar pela Fase A? Sim

("siderar" = sidebar.) Os itens 1–3 aprovados são os da proposta da análise:

1. Um item só no menu, "Organização": ficha da organização com as abas da
   empresa matriz + aba "Empresas do grupo"; o item "Grupo" sai do menu.
2. Fonte única para os dados repetidos: CNPJ, endereço, contato, tributação e
   contas passam a ser lidos e editados só na empresa matriz; a organização fica
   com nome, logo, slug e configurações. Antes, redirecionar quem lê esses
   campos da organização.
3. Arrumar os dados: corrigir "Incoporadora", apagar a SPE TESTE, decidir a
   matriz da "Altair Pereira da Rosa".

## Diagnóstico (medido em 2026-10-12, banco de produção)

**As duas telas têm o mesmo título.** `OrganizationList.tsx:401` e
`CompaniesModule.tsx:377` dizem "Empresas do Grupo"; o botão "Nova empresa" da
aba Organização cria uma *organização* (tenant), não uma empresa.

**São dois conceitos diferentes — as tabelas NÃO se fundem:**

| | `organizations` | `companies` |
|---|---|---|
| o que é | tenant / fronteira de RLS (`organization_members`, `is_org_member`) | pessoa jurídica (CNPJ, sócios, filiais, regime, incorporação) |
| colunas | 13 | 66 |
| quem aponta | `organization_id` em quase tudo | ~50 FKs; 21 com dado (`plano_de_contas` 343, `company_departments` 66, `opura_documents` 60, `projects.empresa_id` 22, `purchase_orders` 20, `empreendimentos` 13 …) |

**Na prática hoje, 1 organização = 1 empresa espelho:**

| Organização | Matriz | Outras |
|---|---|---|
| Alpa Construtora e **Incoporadora** (09.264.396/0001-59) | Alpa Construtora e **Incorporadora** (mesmo CNPJ) | SPE TESTE MUTUO 30082026 LTDA |
| ALPA Empreendimentos e Construções | mesmo nome, sem CNPJ nos dois | — |
| Construção do Edifício Garden Cambuhy SPE | mesmo nome e CNPJ | — |
| Altair Pereira da Rosa | **nenhuma** | — |

**Origem do espelho:** a matriz foi criada UMA vez, por cópia
(`20260526000002_create_companies_and_empresa_id.sql`, seção 3 "SEED: uma
company por org existente"). Nada cria matriz para organização nova — por isso a
Altair não tem — e nada mantém os dois cadastros alinhados, por isso o nome já
diverge. Não há índice garantindo uma matriz por organização (só
`UNIQUE(org_id, cnpj)` e `UNIQUE(org_id, code)`).

**Dados duplicados entre as duas fichas:** `OrganizationPage.tsx` (Dados Gerais,
Contato, Tributação, Endereço, Contas Bancárias) × `CompanyDetailPage.tsx`
(Identificação, Tributário, Contas …).

**SPE TESTE** (`3d1b5fa8-d688-46d1-b428-5dcd1e3999ef`, criada 30/08/2026): presa
por 2 `debt_contracts` com `ON DELETE RESTRICT` — `MUTUO-30082026` e
`MUTUO-30082026-C`, par espelho Alpa↔SPE, ambos com `purpose = 'Mútuo de teste —
apagar depois'`. Em cascata levam 2 `debt_schedules`, 20 `debt_installments`
(0 pagas) e 1 `debt_disbursements`. Nenhum `internal_transactions` cita o
contrato; `debtService` não gera lançamento financeiro.

**`managementTab` não é persistido** (`store/useStore.ts:193`, sem `persist`) —
tirar `empresas_grupo` do menu não deixa ninguém preso numa aba que sumiu.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-12 | Fundir telas? Fundir tabelas? | Fundir as **telas**; as tabelas continuam separadas (itens 1–3 aprovados). |
| 2026-10-12 | SPE = organização separada ou empresa dentro da organização? | **As duas.** "SPE pode ser empresa separada mas também pode ser uma empresa ligada a outra." → a aba "Empresas do grupo" é necessária de verdade (SPE dentro do grupo, `tipo = 'spe'`, `holding_id`), e SPE como organização própria (caso Garden Cambuhy) continua valendo. |
| 2026-10-12 | Altair Pereira da Rosa ganha matriz? | É organização de **pessoa física**. `companies` não comporta PF (sem coluna de CPF; o CHECK de `tipo` só aceita tipos de PJ). → **Regra B1 passa a ser: organização PJ tem exatamente uma matriz; organização PF não tem matriz** e guarda CPF, contato e endereço na própria org (como hoje). Ver "Ajuste pessoa física" abaixo. |
| 2026-10-12 | Executar a Fase A? | Sim. |

### O que é duplicado de fato (corrige a análise inicial)

O levantamento completo de leitores e escritores mudou o escopo do item 2. Dois
dos cinco blocos que a análise chamou de "repetidos" **não são o mesmo dado**:

| Bloco da ficha da org | Onde grava | Na empresa | Duplicado? |
|---|---|---|---|
| CNPJ, site (Dados Gerais) | `organizations.cnpj/website` | `companies.cnpj/website` | **sim** |
| Contato | `organizations.email/phone` | `companies.email_comercial/telefone` | **sim** |
| Endereço | `organizations.address` (`street/number/neighborhood/city/state/zipCode`) | `companies.endereco_fiscal` (`logradouro/numero/bairro/cidade/uf/cep`) | **sim** |
| Tributação | `organizations.settings.tax_recognition_regime` (CAIXA/COMPETENCIA, move `taxPayableService`) | `companies.regime_tributario` (Simples/Presumido/Real) | **não** — conceitos diferentes; fica na org |
| Contas Bancárias | tabela `payment_accounts` (conciliação, pedidos, contratos, `reconciliation-engine`) | tabela `company_bank_accounts` (1 registro) | **não** — e a seção já repete a aba Minha Organização › Contas |

Divergência medida nos campos duplicados (org × matriz): **só o endereço da
Alpa** — preenchido na org (Rua Ângelo Bernardo Faccio, 90, Centro, Cambuí/MG,
37600-000), vazio na matriz. CNPJ, e-mail, telefone e site batem nas 3 orgs que
têm matriz.

### Quem lê os campos duplicados da organização

~25 pontos, dos quais os que mais pesam:

- **PDF / documento:** `exportService.ts` (recibo de parcela 625, contrato de
  venda 667/683, cabeçalho do orçamento 723-742, dossiê 1142, contrato de
  serviço 1369/1408); `financialReceiptService.ts:63-94` (recibo numerado);
  `docxFieldCatalog.ts:468-495` (campos `organization.*` dos modelos DOCX);
  `docGen/catalogoCampos.ts` (ofícios — já prefere a empresa, cai na org);
  `ReportViewer.tsx:573-590`; `propertyExportService.ts:35-37`.
- **SQL vigente:** `fn_portal_emitente_payload` (emitente no Portal do
  Cliente), `emitir_recibo_pagamento`, `emitir_recibo_recebimento` (congelam
  `issuer_document/issuer_address` no recibo), `portal_help_org_json`,
  `get_public_marketplace`, `create_organization_v2`.
- **Tela:** `OrganizationList.tsx` (colunas/filtros CNPJ e contato),
  `OpuraGovernanceModule.tsx:348`, `PortalHelp.tsx`, `PublicMarketplaceView.tsx`.
- **Edge Functions:** nenhuma lê esses campos (só `name`).

**Escritores:** `OrganizationPage.tsx` (form), `OrganizationCreateSheet.tsx`
(criação → RPC `create_organization_v2`) e `organizationService.updateOrganization`
— que **regrava todas as colunas a cada save**, inclusive quando a aba Usuários
só mexe em membros (`OrganizationList.tsx:642-645`, `OrganizationUsers.tsx:547-553`).

### Estratégia do item 2: matriz é a fonte, organização vira espelho

Reescrever os ~25 leitores (5 funções SQL que emitem recibo e emitente de portal,
inclusas) é caro e arriscado. Em vez disso:

- a **empresa matriz é a única fonte** de CNPJ, e-mail, telefone, site e endereço
  — só ela é editável (ficha da organização › Identificação);
- as colunas homônimas de `organizations` passam a ser **espelho mantido pelo
  banco**: gatilho em `companies` copia da matriz para a org; gatilho em
  `organizations` faz a matriz vencer em qualquer UPDATE (cobre cliente PWA com
  cache antigo e o `updateOrganization` que regrava tudo);
- os ~25 leitores **não mudam** e continuam corretos.

Mapeamento: `cnpj↔cnpj`, `phone↔telefone`, `email↔email_comercial`,
`website↔website`, `address{street,number,neighborhood,city,state,zipCode}↔
endereco_fiscal{logradouro,numero,bairro,cidade,uf,cep}` (`complemento` não tem
par na org; fica só na empresa).

Fica na organização (não espelhado): `name`, `code`, `logo_url`, `slug`,
`settings` (inclui o regime caixa/competência), `resources`.

### Ajuste pessoa física (decisão de 2026-10-12)

- **Como o sistema sabe:** `organizations.settings.tipo_pessoa` = `'PJ'` | `'PF'`
  (ausente = PJ, que é o caso de todas as outras). Altair recebe `'PF'` em B1.
- **B1** cria/backfill matriz só para PJ. **B2/B3** só agem quando a org tem
  matriz — numa org PF nada é espelhado e os campos seguem editáveis na org.
- **C2** (ficha): os campos de CNPJ/contato/endereço saem só da ficha de org PJ;
  na PF ficam, com rótulo **CPF**. **C3** (criação): escolher PF/PJ; PF pede CPF.
- **D3** (ficha unificada): org PF não tem abas de matriz; mantém a aba Empresas
  do grupo (uma pessoa física pode ser sócia/controladora de empresas).
- `organizations.cnpj` guarda o CPF na org PF (coluna já é texto livre). Os PDFs
  que imprimem "CNPJ:" fixo com esse valor ficam registrados em Fora do escopo.

## Plano

Ordem: **A (dados) → B (banco) → C (código de escrita) → D (tela)**. B antes de
D porque a tela nova pressupõe que editar a matriz atualiza a org.

### Fase A — Arrumar os dados (item 3) · escrita em produção combinada em 2026-10-12

- [x] **A1. Nome da Alpa** — feito 2026-10-12 (transação única A1–A3; conferido: `name` = "Alpa Construtora e Incorporadora"). — `UPDATE organizations SET name = 'Alpa Construtora e Incorporadora' WHERE id = '926cf626-ba49-4ee4-9f35-472822fb90e6'`.
  Pronto quando: `SELECT name` devolve "Incorporadora".
- [x] **A2. Apagar a SPE TESTE** — feito 2026-10-12: 0 parcelas pagas na trava; 2 contratos e 1 empresa apagados; conferido 0 contratos/schedules/desembolsos e 0 parcelas órfãs. (O `mirror_debt_contract_id` é `ON DELETE SET NULL`, não precisou zerar antes.) Cópia das linhas apagadas: `fase-a-snapshot.json` no scratchpad da sessão. — numa transação: `DELETE FROM debt_contracts WHERE id IN ('e2022997-8607-4dac-bf9d-5d42058e1e2b','9ed48e03-551b-476e-b30a-d74b205c8228')` (cascata: 2 schedules, 20 parcelas, 1 desembolso; antes, zerar `mirror_debt_contract_id` dos dois, que é FK entre eles), depois `DELETE FROM companies WHERE id = '3d1b5fa8-d688-46d1-b428-5dcd1e3999ef'`. Antes de rodar, reconferir que as 20 parcelas seguem com 0 pagas.
  Pronto quando: 0 linhas em `companies`/`debt_contracts` com esses ids; 0 `debt_schedules` órfãos.
- [x] **A3. Endereço da Alpa para a matriz** — feito 2026-10-12; consulta de divergência org × matriz = 0. — copiar `organizations.address` da Alpa para `companies.endereco_fiscal` da matriz `8f4369f2-b4fc-4111-9b90-602524830bec`, com o mapeamento acima.
  Pronto quando: a consulta de divergência org × matriz (seção Verificação) volta vazia.
- [x] **A4. Matriz da "Altair Pereira da Rosa"** — decidido 2026-10-12: é pessoa física, **não ganha matriz** (ver Ajuste pessoa física). A marcação `tipo_pessoa = 'PF'` é feita em B1.

### Fase B — Banco (item 2) · uma migration nova, aplicada por `db query -f` (nunca `db push`)

- [x] **B1. Toda organização PJ tem exatamente uma matriz.** — aplicado 2026-10-12 (`aplicar_20271012001000_organizacao_matriz_fonte_unica.sql`, seções 1, 3, 6 e 7; inclui `create_organization_v2` com `p_settings`).
  `CREATE UNIQUE INDEX ... ON companies(org_id) WHERE is_headquarters`;
  gatilho `AFTER INSERT ON organizations` que, **se a org for PJ**, cria a matriz a partir da própria
  org (razão social = `name`, CNPJ/contato/endereço mapeados, `tipo
  'construtora'`, `status 'ativa'`); backfill para org PJ sem matriz (hoje nenhuma);
  `settings.tipo_pessoa = 'PF'` na Altair.
  REGRA #7: função nova com `REVOKE EXECUTE ... FROM PUBLIC, anon`.
  Pronto quando: org PJ sem matriz = 0 e org PF com matriz = 0;
  criar org de teste dentro de `BEGIN … ROLLBACK` gera 1 matriz;
  `npx vitest run __tests__/segurancaMigrations.test.ts` verde.
- [x] **B2. Matriz → organização.** — aplicado 2026-10-12 (seção 4). Gatilho `AFTER INSERT OR UPDATE ON companies`
  (só `is_headquarters`) copia os 5 campos para a org, só quando `IS DISTINCT FROM`.
  Pronto quando: em `BEGIN … ROLLBACK`, `UPDATE companies SET telefone = 'X'` na
  matriz faz `organizations.phone = 'X'`.
- [x] **B3. A matriz vence.** — aplicado 2026-10-12 (seção 5). Gatilho `BEFORE UPDATE ON organizations` repõe os 5
  campos a partir da matriz (`NEW.cnpj := matriz.cnpj` …). Sem erro, para não
  derrubar cliente com bundle antigo.
  Pronto quando: em `BEGIN … ROLLBACK`, `UPDATE organizations SET cnpj = 'lixo'`
  termina com o CNPJ da matriz; salvar a aba Usuários na tela não altera os 5 campos.
- [x] **B4. `OpuraGovernanceModule.tsx:116-130`** — feito 2026-10-12: se a org já tem matriz, só seleciona; org PF recebe aviso. (`check-ui-standard.sh` acusa §7 em tabelas pré-existentes da Governança, linhas 635–876 — dívida anterior, não tocada.) cria matriz copiando só o nome —
  com B1 isso viola o índice único. Passa a reutilizar a matriz existente.
  Pronto quando: o fluxo da Governança não cria `companies` com `is_headquarters` em org que já tem matriz.

### Fase C — Código que grava (item 2)

- [x] **C1. `services/organizationService.ts:246-264`** — feito 2026-10-12: `colunasParaSalvar()` (org PF manda os campos; save sem `settings` não arrisca); `createOrganization` passa `p_settings`. Teste `__tests__/organizationColunasParaSalvar.test.ts` (6). — `updateOrganization` para
  de enviar `cnpj/email/phone/website/address`.
  Pronto quando: teste novo em `__tests__/` confere o payload do `.update()` sem esses campos.
- [x] **C2. `components/OrganizationPage.tsx`** — feito 2026-10-12: virou a aba Organização da ficha; malha §30, rótulo §21, salvar não fecha + `SaveStatus` (§25); PJ mostra atalho para a Identificação da matriz; contas viraram atalho para Contas. — sai CNPJ, site, Contato e
  Endereço (passam a ser editados na Identificação da matriz); sai a seção Contas
  Bancárias (repete Minha Organização › Contas — vira link para lá). Ficam logo,
  nome, código e regime caixa/competência.
  Na org **PF** esses campos ficam (rótulo CPF no lugar de CNPJ).
  Pronto quando: a ficha de org PJ não tem mais input desses campos; a de PF tem, com CPF; `check-ui-standard.sh` limpo.
- [x] **C3. `components/OrganizationCreateSheet.tsx`** — feito 2026-10-12: escolha PJ/PF; PF rotula CPF e grava `settings.tipo_pessoa`. — continua pedindo CNPJ,
  contato e endereço na criação (vão para a org e o gatilho B1 leva para a matriz).
  Ganha a escolha PF/PJ (PF pede CPF e grava `settings.tipo_pessoa = 'PF'`).
  Pronto quando: criar org PJ pela tela gera matriz com o CNPJ digitado; criar org PF não gera matriz.
- [x] **C4. `services/docGen/catalogoCampos.ts:162`** — feito 2026-10-12; caso novo no teste (8 verdes). — `empresa.site` passa a ler
  `company.website` antes de `organization.website` (hoje é o único campo do
  grupo que ignora a empresa).
  Pronto quando: `__tests__/docGenCatalogoCampos.test.ts` com caso novo verde.
- [x] **C5. `components/LaborFolhaEmpregado.tsx:48-54`** — feito 2026-10-12 (`select('name, cnpj')`). §7 acusado pelo `check-ui-standard.sh` nas linhas 325+ é anterior (mesmo resultado no arquivo sem a mudança). — bug achado no
  levantamento: `select('name, document')`, coluna `document` não existe em
  `organizations`; o CNPJ do cabeçalho da folha nunca aparece. Trocar por `cnpj`.
  Pronto quando: a requisição sai sem 400 e o cabeçalho mostra o CNPJ.

### Fase D — Tela (item 1)

Antes: ler `docs/ui_ux_guia_unificado.md` inteiro e `UI_PATTERNS.md` (REGRAS #1 e #4).

- [x] **D1. `components/Layout.tsx:898`** — feito 2026-10-12. — remove o item "Grupo".
  Pronto quando: o menu Minha Organização não tem "Grupo".
- [x] **D2. `components/OrganizationList.tsx`** — feito 2026-10-12; coluna/filtro viraram "CNPJ / CPF"; `grep empresas_grupo` só acha o comentário do Layout. — aba Organização com título
  "Organizações" (hoje "Empresas do Grupo"), botão "Nova organização" (hoje "Nova
  empresa"); remove o ramo `empresas_grupo` e o valor do tipo de `activeTab`
  (também em `AppRouter.tsx:1157`).
  Pronto quando: `grep empresas_grupo` sem resultado em `components/`; typecheck verde.
- [x] **D3. Ficha unificada da organização** — código feito 2026-10-12 (`components/OrganizationDetail.tsx`; `CompanyDetailPage` ganhou `embedded`/`tab`; `CompaniesModule` ganhou `embedded`/`ocultarMatriz`). Trilha de 1 salto como a Ficha do condomínio. **Verificação na tela real: pendente.** (aberta por "Detalhes"): cabeçalho
  com logo/nome da org e abas:
  - **Organização** — o que sobrou de `OrganizationPage` (C2);
  - **abas da matriz** — as de `CompanyDetailPage` (Identificação, Sócios, Contas,
    Financeiro, Tributário, Obras, Filiais, Documentos, Metas, Departamentos,
    Responsáveis; Incorporação se `tipo` for SPE), renderizadas para a matriz da org;
  - **Empresas do grupo** — o `CompaniesModule` (lista sem a matriz, "Nova
    empresa", Dashboard do grupo); abrir uma empresa abre a `CompanyDetailPage`
    dela, com voltar para a ficha.
  Org PF: sem abas da matriz; ficam Organização e Empresas do grupo.
  REGRA #5: a ficha é por natureza de uma org (caso 3) — com o topo em "Todas" ela
  usa `managingOrgId`, como hoje; nunca renderiza vazio.
  Pronto quando: na tela real (preview), Alpa abre com as abas da matriz e a aba
  Empresas do grupo; criar SPE dentro do grupo funciona; editar telefone na
  Identificação aparece no cabeçalho do recibo/PDF (espelho B2).
- [x] **D4. `components/BIDashboard.tsx:463`** — feito 2026-10-12 ("Organização → Detalhes → Metas"). — texto "Minha Organização →
  Empresas → Metas" passa a "Minha Organização → Organização → Metas".
  Pronto quando: `grep "Empresas → Metas"` sem resultado.

## Perguntas abertas

1. ~~**Altair Pereira da Rosa** ganha matriz?~~ Respondida 2026-10-12: pessoa física, sem matriz.
2. **SPE como organização própria ligada a outra** (ex.: Garden Cambuhy
   controlada pela Alpa) — hoje não há vínculo entre organizações; a ligação
   existe só *dentro* de uma org (`holding_id`). **Fora deste plano**; registrar se
   for necessário mostrar a Garden no grupo da Alpa.

## Fora do escopo (registrado, não mexer aqui)

- `payment_accounts` (contas da conciliação) × `company_bank_accounts` (aba Contas
  da empresa, 1 registro): continuam dois cadastros. A ficha unificada terá a aba
  "Contas" da matriz e o menu continua com Minha Organização › Contas — vale
  revisar os nomes depois.
- Fundir as tabelas `organizations` e `companies`: descartado (ver Diagnóstico).
- O miolo das abas da matriz (`CompanyDetailPage`: formulários `rounded-3xl`, rótulos
  `font-black uppercase`) continua no estilo antigo — esta frente só o embutiu. Migrar
  para §16/§21/§30 é tarefa à parte.
- PDFs que imprimem "CNPJ:" fixo (`exportService.ts` 625/667/1142/1369) mostrarão o
  CPF com esse rótulo numa org PF. Corrigir o rótulo é tarefa à parte.

## Estado

- [x] Diagnóstico e levantamento de leitores/escritores — 2026-10-12
- [x] Plano revisado pelo usuário; pergunta aberta 1 respondida — 2026-10-12
- Fase A: **4 de 4** · Fase B: **4 de 4** · Fase C: **5 de 5** · Fase D: **4 de 4 no código; tela real pendente**

### Registro da Fase B (2026-10-12)

Simulação antes de aplicar — migration inteira + 8 testes numa transação abortada
de propósito (`RAISE EXCEPTION` no fim; conferido depois: 0 orgs de teste, Altair
com `settings` intacto, 0 gatilhos):

| Teste | Resultado |
|---|---|
| T1 org PJ criada pela RPC nasce com matriz (CNPJ, telefone, e-mail, endereço) | 1 ✅ |
| T2 org PF (`p_settings` PF) nasce sem empresa | 0 ✅ |
| T3 telefone/cidade editados na matriz aparecem na org | ✅ |
| T4 UPDATE na org com CNPJ/e-mail/endereço "lixo" → voltam da matriz; `name` grava | ✅ |
| T5 org PF: CPF editável na própria org | ✅ |
| T6 Alpa: save com objeto velho (5 campos nulos) não muda nada; `settings` grava | ✅ |
| T7 segunda matriz na mesma org | recusada ✅ |
| T8 Altair marcada PF, sem matriz | ✅ |

Aplicada em produção com exit 0 e verificação embutida verde. Conferido de fora:
3 gatilhos, índice `companies_uma_matriz_por_org`, funções de gatilho sem EXECUTE
para `authenticated`/`anon`, `create_organization_v2(…, jsonb)` sem `anon`.

⚠️ **Janela entre B e C:** com B no ar e C ainda não publicado, a ficha antiga da
org (Minha Organização › Organização › Detalhes) ainda mostra CNPJ, site, contato
e endereço editáveis numa org PJ — e o valor salvo ali **volta** ao da matriz
(B3). Editar pela matriz (aba Grupo) funciona e chega à org.

## Verificação

```sql
-- divergência org × matriz (tem de voltar vazio depois de A3 e sempre depois de B)
SELECT o.name FROM organizations o JOIN companies c ON c.org_id = o.id AND c.is_headquarters
WHERE o.cnpj IS DISTINCT FROM c.cnpj OR o.phone IS DISTINCT FROM c.telefone
   OR o.email IS DISTINCT FROM c.email_comercial OR o.website IS DISTINCT FROM c.website
   OR coalesce(o.address->>'street','') IS DISTINCT FROM coalesce(c.endereco_fiscal->>'logradouro','');
-- org PJ tem exatamente uma matriz; org PF nenhuma
SELECT o.name, coalesce(o.settings->>'tipo_pessoa','PJ') tp, count(c.id) FROM organizations o
LEFT JOIN companies c ON c.org_id = o.id AND c.is_headquarters
GROUP BY o.name, tp HAVING count(c.id) <> CASE WHEN coalesce(o.settings->>'tipo_pessoa','PJ') = 'PF' THEN 0 ELSE 1 END;
```

Mais: `npm run ci` na frente; `check-ui-standard.sh` em cada `.tsx` tocado;
`orgContextGuard.test.ts`; tela real — Minha Organização › Organização › Detalhes
da Alpa, emitir um recibo e conferir CNPJ/endereço no PDF; ler o check-run `ci`
depois do push.
