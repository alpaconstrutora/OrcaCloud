# Meus Clientes — vínculo com Empreendimento, Excel, tela in-flow e aba Dashboard

## Pedido original

Sessão de 04/09/2026, mensagem literal do usuário:

> Minha Organização < Meus Clientes:
> 1.	Campo para vincular empreendimento ao cliente
> 2.	Importar exportar excel
> 3.	Invés de abrir drawer, abrir tela
> 4.	Aba clientes e aba dashboard e mover kpis cards para a aba dashboard

### Decisões confirmadas com o usuário (mesma sessão, antes de começar)

| Pergunta | Resposta |
|---|---|
| Cliente → Empreendimento: um ou vários? | **Vários** — tabela de vínculo `client_empreendimentos` (N:N), multi-seleção no cadastro, exibida junto com os vínculos derivados da obra (deduplicados) |
| Import de Excel com CPF/CNPJ já existente | **Atualizar o existente** (upsert por documento); prévia mostra o que vai criar e o que vai atualizar |

---

## Contexto (o que já existia)

- `components/ClientList.tsx` (1072 linhas) — lista, KPIs no topo, toolbar acoplada
  (§5.2), tabela redimensionável, grid/lista.
- A coluna **"Empreendimento Vinculado"** já existia, mas era **derivada**:
  `projects.settings.clientId` (obra) → `empreendimentoService.mapObrasToEmpreendimentos`
  → empreendimento-pai. Não havia campo nenhum para o usuário vincular direto.
- `components/ClientModal.tsx` — formulário em `Sheet` (drawer), usado **só** pelo
  `ClientList` (confirmado por grep), o que torna a conversão para tela contida.
- "Tela" neste app tem significado técnico fixo: **troca de conteúdo in-flow**, nunca
  overlay (nem `fixed inset-0`, nem `Sheet`). Padrão de referência:
  `ContractDetailView.tsx` — seta `ArrowLeft` + `<h1 className="text-2xl font-black">`.

---

## Itens

### 1. Migration — tabela de vínculo `client_empreendimentos`

**Arquivo:** `supabase/migrations/aplicar_20270918000029_client_empreendimentos.sql`

- Tabela `client_empreendimentos (id, client_id → clients ON DELETE CASCADE,
  empreendimento_id, created_at)` + UNIQUE `(client_id, empreendimento_id)` + índices.
- FK para `empreendimentos` **tentada** com `lock_timeout` curto; se o DDL travar
  (o módulo Empreendimentos tem histórico de deadlock de DDL — ver 20270719000000),
  fica sem FK e a UI trata id ausente.
- RLS habilitada. Policy única, **sem perna de OR que libere sozinha** (REGRA #7):
  `EXISTS (SELECT 1 FROM empreendimentos e WHERE e.id = … AND e.organization_id IN
  (SELECT empr_user_org_ids()))` — mesmo molde de `org_access_empr_towers`.
- `REVOKE ALL … FROM anon` explícito; `GRANT` só para `authenticated`.
- **Pronto quando:** `db query -f` aplica sem erro e
  `select count(*) from pg_policies where tablename='client_empreendimentos'` = 1,
  com `rowsecurity = true` em `pg_tables`.

### 2. `services/clientEmpreendimentoService.ts` (novo)

- `listByClients(clientIds)` → `Record<clientId, {id,name}[]>` (1 consulta para a
  lista inteira, não N).
- `listByClient(clientId)` → ids.
- `setForClient(clientId, ids)` → diff (insere os novos, apaga os removidos), sem
  apagar-e-recriar tudo.
- **Pronto quando:** `npm run typecheck` passa e a lista exibe o vínculo direto.

### 3. `components/ClientForm.tsx` (novo, substitui `ClientModal.tsx`)

- Mesmo formulário, renderizado **in-flow** (sem `Sheet`, sem backdrop): cabeçalho
  com `ArrowLeft` + `<h1 text-2xl font-black>` (§20/ContractDetailView), corpo em card
  `rounded-[10px] border border-gray-100`, rodapé com `SaveStatus` + Voltar + Salvar.
- **Campo novo "Empreendimentos vinculados"** — multi-seleção (checkbox list com busca)
  alimentada por `empreendimentoService.list(orgId do formulário)`.
- §25: **editar não fecha ao salvar**; criar fecha. Dirty-tracking via
  `useUnsavedChanges` + `confirmDiscard()` no botão Voltar.
- §21: rótulos `text-xs font-semibold text-slate-500` (o `ClientModal` estava no
  padrão antigo `text-sm font-medium text-gray-700`).
- `ClientModal.tsx` é **removido** (importador único migrado) — não deixar duas fontes.
- **Pronto quando:** abrir "Novo cliente"/"Editar" troca o conteúdo da tela, com
  sidebar e abas visíveis, sem nenhum overlay; `check-ui-standard.sh` limpo no arquivo.

### 4. `components/ClientImportModal.tsx` (novo)

- Molde de `CostCenterV2ImportModal.tsx` (xlsx → prévia → importar), 3 passos.
- Colunas aceitas: Código, Nome, Tipo (PF/PJ), Tipo de Cliente, CPF/CNPJ, E-mail,
  Telefone, Logradouro, Número, Bairro, Cidade, UF, CEP, Status, Portal.
- Casamento por **documento** (só dígitos) contra a lista já carregada: existente →
  `atualizar`; sem documento ou documento novo → `criar`. A prévia mostra a ação por
  linha, e linha sem nome é erro.
- Destino de organização: `resolveWriteOrg('single')` — cliente é registro operacional
  de UMA organização; replicar em todas colidiria com a checagem de CPF/CNPJ único
  (`assertDocumentNotDuplicated`). Registro do porquê no próprio arquivo (REGRA #5, item 4).
- **Pronto quando:** importar uma planilha com 1 linha nova + 1 linha de cliente
  existente cria uma e atualiza a outra, e o resultado bate com a prévia.

### 5. Exportação para Excel — `utils/clientExcel.ts` (novo)

- `exportClientsToExcel(rows)` — exporta o que está **filtrado na tela** (não a base
  inteira), com as mesmas colunas do import + "Empreendimentos vinculados" e "Organização".
- `downloadClientImportTemplate()` — planilha modelo com o cabeçalho esperado,
  para o import não depender de adivinhar nome de coluna.
- **Pronto quando:** o arquivo abre no Excel com uma linha por cliente visível.

### 6. `components/ClientList.tsx` — abas, KPIs, tela, Excel

- **Abas §19.1** "Clientes" e "Dashboard" em card branco, entre título e conteúdo;
  `VIEW_HEADERS: Record<Aba, {titulo, subtitulo}>` para o `<h1>` acompanhar a aba
  (§19.1/§20). Aba persistida (`usePersistedState`).
- **KPIs saem do topo** e passam a viver **só** na aba Dashboard, junto de dois painéis
  de distribuição montados com os dados já carregados (por organização e por
  empreendimento vinculado) — sem consulta nova.
- Aba Clientes: toolbar acoplada + tabela, sem KPIs.
- Botões **Exportar** e **Importar** na régua da toolbar, ao lado do "Novo cliente".
- Coluna "Empreendimento Vinculado" passa a somar **vínculo direto + derivado da obra**,
  deduplicados por id.
- Substituição do `ClientModal` pela tela in-flow, com `scrollTop` preservado (§22).
- Criar/editar atualiza o array local em vez de recarregar tudo (§22).
- **Pronto quando:** `bash scripts/check-ui-standard.sh components/ClientList.tsx`
  sai limpo, `npx vitest run __tests__/orgContextGuard.test.ts` passa e
  `npm run typecheck` passa.

---

## Estado

- [x] 1. Migration aplicada
- [x] 2. `clientEmpreendimentoService.ts`
- [x] 3. `ClientForm.tsx` in-flow (+ remoção do `ClientModal.tsx`)
- [x] 4. `ClientImportModal.tsx`
- [x] 5. `utils/clientExcel.ts`
- [x] 6. `ClientList.tsx` (abas, Dashboard, Excel, coluna somada)
- [x] 7. Verificações mecânicas: `npx tsc --noEmit` limpo · `npm run build` OK ·
      `check-ui-standard.sh` limpo nos 3 arquivos · `check-system-projects.sh` e
      `check-project-classification.sh` limpos · suíte completa 2291 passed /
      24 skipped · `orgContextGuard` e `migrationsPrefixo` passando
- [ ] 8. **Verificação visual no navegador — PENDENTE.** O harness de Playwright
      (`c:/tmp/pwtest`) faz login com `agente-leitura@alpaconstrutora.com.br`, cuja
      senha não fica guardada em lugar nenhum (decisão de 2026-08-05, ver
      `reference_agente_leitura_supabase`). Sem ela não dá para abrir a tela logada.
      Falta conferir com print: as duas abas, a tela in-flow de cadastro (sem overlay),
      o campo de empreendimentos e o ciclo exportar → editar planilha → importar.


---

## Colisao encontrada na hora do deploy (04/09/2026)

O trabalho acima foi construido sobre um `main` local **14 commits atrasado**.
Ao empurrar, apareceram duas colisoes -- as duas resolvidas a favor de quem
chegou primeiro:

1. **O item 4 ja estava em producao.** O commit `cbb2e07` (03/09, outra frente)
   ja tinha dado a `ClientList` a barra de abas §19.1 com `VIEW_HEADERS`, um
   Dashboard com `BarraDeComposicao` (composicao por tipo clicavel, situacao do
   link do portal, distribuicao por organizacao, "Cadastro a completar") e a
   remocao do KPI-card-por-categoria -- que com 22 categorias virava uma faixa
   de 24 colunas de ~55px. **A minha versao do item 4 foi descartada**:
   publica-la teria revertido tudo isso. O que sobrou do pedido ("mover kpis
   cards para a aba dashboard") era a faixa de 4 cards que ainda vivia na aba
   Clientes -- ela foi movida para o Dashboard, junto dos 4 de acesso ao portal,
   e a aba Clientes passou a ir direto das abas para a toolbar da tabela.
   Os itens 1, 2 e 3 foram reaplicados por cima da versao deles.

2. **Prefixo de migration duplicado.** `20270918000027` ja era de
   `aplicar_20270918000027_portal_cliente_dados_da_unidade.sql`. A minha virou
   `...000029`, com aviso no cabecalho de que **ja foi aplicada no banco** sob o
   nome antigo.

Licao registrada: partir de `origin/main`, nunca do estado local -- e o que a
REGRA OBRIGATORIA #8 (`scripts/nova-frente.sh`) passou a exigir, e ela entrou no
`CLAUDE.md` justamente num dos 14 commits que eu nao tinha.
