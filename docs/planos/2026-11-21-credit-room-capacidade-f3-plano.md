# Credit Room · Capacidade de Pagamento — F3 (documentos do grupo, Sugerir documentos, book em PDF) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Pedido original

Sessão 2961426b (21/11/2026):

> Portal de Crédito: A ideia é criar uma nova funcionalidade que seria a de demonstrar a capacidade de pagamento para preitear um emprestimo. neste sentido e ideia e conectar com os módulos comercial (vendas de unidades e locacao), listar os empreendimentos, os contratos de venda ou locacao, consolidar a renda mensal e um dashboard completo. mostrar as fotos dos imoveis. sugira mais funcionalidades

Respostas da mesma sessão: 1ª versão com "book em PDF com fotos" e *"Incluir também outros documentos, contratos etc"*; documentos de outras empresas do grupo: **"Sim, das empresas marcadas (Recomendado)"**.

22/11/2026, após a F2 no ar (PR #648): **"inicia a parte 3"**.

**Goal:** No escopo Grupo, o Data Room aceita documentos das empresas marcadas; o time interno acha e compartilha em lote os documentos da carteira congelada ("Sugerir documentos"); a carteira mostra quantos documentos cada contrato tem no Data Room; e empresa e banco baixam o **book de crédito em PDF** gerado da versão congelada, com fotos.

**Architecture:** A regra "documento de qual org entra no room" vive no banco (`fn_credit_room_documents` + trigger na gravação do compartilhamento) e é repetida na Edge `credit-room-download`. Sugestão = leitura do GED pelo `contract_id`/`empreendimento_id`/`project_id`/`client_id` da versão ativa, agrupada por util puro. Book = util puro `montarBook(...)` → `jsPDF` (padrão de `utils/imovibRelatorioPdf.ts`), imagens já convertidas pelo chamador; gráfico desenhado com primitivas do jsPDF (não html2canvas: a aba do gráfico pode nem estar aberta).

**Tech Stack:** React 19 + TS, Supabase (Postgres/RLS, Edge Deno), jsPDF + jspdf-autotable, Vitest.

**Spec:** `docs/planos/2026-11-21-credit-room-capacidade.md` §7 e §8 · planos F1/F2 ao lado.

## Global Constraints
- Ler e obedecer `CLAUDE.md` (REGRAS OBRIGATÓRIAS). Tela editada → ler `docs/ui_ux_guia_unificado.md` inteiro antes e `bash scripts/check-ui-standard.sh <arquivo>` depois; painel novo = `Sheet`. `<label>` de campo = `text-xs font-semibold text-slate-500` literal (trava `rotuloPadraoGuard`).
- Migration nova: prefixo **`20271122300000`** (conferido em todos os nomes); aplicar SÓ com `npx supabase db query --linked -f`, **nunca** `db push`; rollback em `scripts/rollback-credit-room-documentos-grupo.sql` (nunca em `migrations/` — `migrationsPrefixo`). Função/trigger nova: `REVOKE ALL … FROM PUBLIC, anon` + REGRA #7 (duas perguntas + sonda com a chave publicável).
- Documento de org fora do escopo do room **nunca** aparece nem baixa — nas DUAS camadas (função e Edge). Escopo Empresa = só a org dona (como hoje).
- Nome de cliente nunca vai para o book nem para o credor; o book só usa a versão congelada (rótulos mascarados).
- "Dado ausente ≠ zero": no book, bloco `null` → frase, nunca 0; versão schema 1 gera book sem as seções de capacidade, dizendo por quê.
- Datas: sem `new Date('AAAA-MM-DD')` cru; data de hoje local com `hojeLocalISO` (`utils/periodoControladoria`).

## Review Focus
1. **Doc de org FORA do grupo** compartilhado no room (por quem enxerga o doc) → a gravação é recusada; e mesmo que exista linha antiga, função e Edge não o devolvem. Task 1 (SQL de prova) e Task 2.
2. **Room que volta de Grupo para Empresa** depois de compartilhar docs de outra org → esses docs somem do Data Room e do download (a regra é lida na hora, não na gravação). Task 1.
3. **Documento do cliente (dado pessoal)** na sugestão → vem num grupo próprio, DESMARCADO, com aviso de LGPD. Task 3.
4. **Book de versão schema 1, com capacidade `null` ou sem fotos** → gera sem erro, com frase no lugar do bloco. Task 5.
5. **Foto que não carrega (CORS/404)** → o book sai sem ela, nunca falha inteiro. Task 5.

---

### Task 1: Banco — documentos do grupo no Data Room

**Files:**
- Create: `supabase/migrations/aplicar_20271122300000_credit_room_documentos_grupo.sql`
- Create: `scripts/rollback-credit-room-documentos-grupo.sql`

- [ ] **Step 1:** `fn_credit_room_documents(p_room uuid)`: trocar `doc.organization_id = r.organization_id` por `(doc.organization_id = r.organization_id OR (r.escopo = 'GRUPO' AND doc.organization_id = ANY(r.grupo_organization_ids)))`, e ACRESCENTAR ao `RETURNS TABLE` as colunas `organization_id uuid, contract_id uuid, empreendimento_id uuid` (no fim). Mudar o tipo de retorno exige `DROP FUNCTION … ; CREATE FUNCTION …` na mesma transação, repondo `REVOKE ALL … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`. Corpo atual (produção, 22/11) é o da `aplicar_20270920000002_ged_shares_credor.sql` — conferir com `pg_get_functiondef` antes.
- [ ] **Step 2:** Trigger `trg_portal_share_credor_escopo` BEFORE INSERT OR UPDATE em `opura_document_portal_shares`, função `fn_portal_share_credor_escopo()` (SECURITY INVOKER, `search_path` fixo), só quando `NEW.audience = 'credor'`: (a) o documento é da org dona do room ou, com `escopo='GRUPO'`, de uma org de `grupo_organization_ids` — senão `RAISE … USING ERRCODE = 'check_violation'` com mensagem em português; (b) quem grava é interno do room (`fn_credit_room_is_internal(NEW.credit_room_id)`) — senão `insufficient_privilege`. Ler room/doc com SECURITY DEFINER? Não: a função é INVOKER e lê `credit_rooms`/`opura_documents` pela RLS de quem grava — se não enxerga, recusa (é o desejado).
- [ ] **Step 3:** Rollback: recria a função com o corpo/retorno antigos e derruba trigger + função nova.
- [ ] **Step 4 (prova, sem gravar):** SQL em `BEGIN … ROLLBACK` como `postgres` simulando: room GRUPO com doc da org do grupo → aparece; doc de org fora → não; trocar o room para EMPRESA → o doc do grupo some. Sonda anon (REGRA #7): `fn_credit_room_documents` e a função do trigger sem EXECUTE para anon.
- [ ] **Step 5:** Commit `feat(credit-room): Data Room aceita documentos das empresas do grupo (função + trava na gravação)`. **A aplicação em produção é feita pelo controlador na Task 6** (pode precisar do usuário).

### Task 2: Edge `credit-room-download` — mesma regra

**Files:** Modify `supabase/functions/credit-room-download/index.ts` (~l.134-186)

- [ ] **Step 1:** Ler `escopo, grupo_organization_ids` do room; o documento vale se `organization_id === room.organization_id` ou (`escopo === 'GRUPO'` e está em `grupo_organization_ids`). Extrair numa função pura no próprio arquivo (`documentoDoEscopo(docOrg, room)`), comentada. O resto (marca d'água, log, travessia) não muda.
- [ ] **Step 2:** `deno check` se houver Deno local; senão revisão do diff. Commit `fix(credit-room-download): aceita documento das empresas do grupo`. **Deploy na Task 6** (`supabase functions deploy credit-room-download` da pasta da frente já igual ao `origin/main` — historicamente barrado: o usuário roda no PowerShell).

### Task 3: Sugerir documentos — leitura e agrupamento

**Files:**
- Create: `utils/creditRoomSugestoes.ts` + `__tests__/creditRoomSugestoes.test.ts`
- Modify: `services/creditRoomService.ts` (`sugerirDocumentos`, `mapDocument`), `types/creditRoom.ts` (`CreditRoomDocument` ganha `organizationId?`, `contractId?`, `empreendimentoId?`)

**Interfaces (Produces):**
```ts
export type OrigemSugestao = 'CONTRATO' | 'EMPREENDIMENTO' | 'OBRA' | 'CLIENTE';
export interface DocumentoSugerido {
  documentId: string; nome: string; categoria: string; tipoDocumento: string;
  organizationId: string; dataValidade: string | null;
  origem: OrigemSugestao; /** rótulo do contrato (mascarado) ou nome do empreendimento/obra */ referencia: string;
  vencido: boolean; jaCompartilhado: boolean;
}
export interface GrupoDeSugestoes { origem: OrigemSugestao; titulo: string; aviso?: string; marcadoPorPadrao: boolean; itens: DocumentoSugerido[] }
export function agruparSugestoes(docs: DocumentoSugerido[]): GrupoDeSugestoes[];
// service:
sugerirDocumentos(room: CreditRoom, versao: CreditRoomVersion): Promise<GrupoDeSugestoes[]>;
```
- [ ] **Step 1 (testes que falham):** `agruparSugestoes`: ordem CONTRATO, EMPREENDIMENTO, OBRA, CLIENTE; CLIENTE com `marcadoPorPadrao: false` e `aviso` citando dados pessoais/LGPD; os demais `true`; doc em mais de uma origem aparece UMA vez, na primeira origem da ordem; `jaCompartilhado` não é marcado por padrão (a tela mostra "já no Data Room"); vencido continua listado com `vencido: true`.
- [ ] **Step 2:** `sugerirDocumentos`: orgs do escopo (`orgsDoEscopo(room)`); da versão ativa pega `contratos[].contract_id`, `empreendimentos[].id` (+ `room.empreendimentoId`), `room.projectId`; lê `opura_documents` (status ≠ `arquivado`, com versão ativa) em `organization_id IN orgs` e (`contract_id IN …` OR `empreendimento_id IN …` OR `project_id = …`); clientes: `contracts.client_id` dos `contract_id` da versão → docs com `client_id IN …` (só internos veem isto). `referencia` de CONTRATO = `rotulo` da versão (nunca o nome do cliente). `jaCompartilhado` pelo `listDocuments(room.id)`. Paginar (`todasAsPaginas`).
- [ ] **Step 3:** `mapDocument` lê `organization_id`, `contract_id`, `empreendimento_id` novos da função (ausentes = `undefined`, a tela não quebra antes da migration).
- [ ] **Step 4:** `npx vitest run __tests__/creditRoomSugestoes.test.ts` + tsc. Commit `feat(credit-room): sugestão de documentos da carteira congelada`.

### Task 4: Telas — "Sugerir documentos" e coluna Documentos na carteira

**Files:** Modify `components/credit/CreditRoomDetail.tsx` (aba Data Room); Create `components/credit/CreditRoomSugerirDocumentos.tsx` (Sheet); Modify `components/credit/CreditRoomEmpreendimentos.tsx` + `components/credit/portal/LenderPortal.tsx`

- [ ] **Step 1:** Botão "Sugerir documentos" na barra da aba Data Room (interno), desabilitado sem versão ativa (com `title` do motivo). Sheet: grupos de `agruparSugestoes` com caixa por grupo e por item, contagem, "já no Data Room" desabilitado, vencido em vermelho (§8 texto), aviso LGPD no grupo Clientes; rodapé "Compartilhar N documentos" → `creditRoomService.shareDocuments(room, ids)`; recarrega a lista. Escopo Grupo: cada item mostra a empresa (nome de `snapshot.escopo.organizacoes`).
- [ ] **Step 2:** Coluna "Documentos" na carteira (`CreditRoomEmpreendimentos`): nova prop opcional `documentos?: CreditRoomDocument[]`; contagem por `contract_id`; sem prop → coluna não aparece. Interno e portal passam a lista que já carregam.
- [ ] **Step 3:** Data Room (interno e portal) mostra a coluna "Empresa" quando o room é Grupo.
- [ ] **Step 4:** Testes de tela: Sheet (grupos, CLIENTE desmarcado, compartilhar chama o service com os ids marcados); carteira com/sem prop. `check-ui-standard` nos `.tsx`; travas `*Guard*`; tsc. Commit `feat(credit-room): sugerir documentos e documentos por contrato na carteira`.

### Task 5: Book de crédito em PDF

**Files:**
- Create: `utils/creditRoomBook.ts` + `__tests__/creditRoomBook.test.ts`
- Create: `services/creditRoomBookService.ts` (busca as imagens e baixa o arquivo)
- Modify: `components/credit/CreditRoomDetail.tsx`, `components/credit/portal/LenderPortal.tsx`

**Interfaces (Produces):**
```ts
export interface ExtrasDoBook {
  room: { code: string; name: string; institutionName: string | null };
  imagens: Record<string, string>;          // url da foto → dataURL (JPEG); ausente = sem foto
  documentos: { nome: string; categoria: string; empresa: string | null }[];
  marcaDagua?: string;                      // "email · dd/mm/aaaa hh:mm" quando o credor baixa
}
export function montarBook(versao: CreditRoomVersion, extras: ExtrasDoBook): jsPDF;
```
- [ ] **Step 1 (testes):** PDF tem páginas; o texto (jsPDF sem compressão) contém: código/nome do room, "V{n}", data-base, "Valor máximo do empréstimo (sobre a dívida atual)" e o valor congelado, os 3 cenários de estresse (`estresseDaVersao`, Base = congelado), rótulos mascarados da carteira, nomes do índice do Data Room; NÃO contém nome de cliente de fixture; schema 1 → contém a frase "versão congelada antes da capacidade de pagamento" e não quebra; `marcaDagua` aparece em todas as páginas; imagem com dataURL inválido não derruba a geração.
- [ ] **Step 2:** Seções: capa (foto principal = capa do empreendimento do room ou a 1ª capa disponível; código, nome, instituição, versão, data-base); resumo da operação e indicadores (os da Visão); capacidade (4 KPIs com os rótulos da F2 + frase "sobre a dívida atual / pós-operação" + gráfico mês a mês DESENHADO com `rect`/`line` do jsPDF nas cores da paleta do app + tabela mês a mês via autotable); estresse nos 3 cenários; qualidade da renda; empreendimentos (nome, números, até 4 fotos cada); carteira mascarada (autotable); índice do Data Room. Rodapé em toda página: "{code} · V{n} · data-base dd/mm/aaaa · página x/y". Marca d'água diagonal clara em toda página quando houver.
- [ ] **Step 3:** `creditRoomBookService.baixar(room, versao, { marcaDagua?, documentos })`: coleta URLs (capas + fotos), baixa cada uma com `fetch` → `createImageBitmap` → canvas JPEG ≤ 1600px (falhou = ignora), chama `montarBook`, salva `book-{code}-V{n}.pdf`.
- [ ] **Step 4:** Botão "Baixar book (PDF)" — interno na barra de status (versão ativa; sem versão → desabilitado com motivo); portal no cartão do cabeçalho, só com `permissions.download`, com `marcaDagua` = e-mail + data/hora e `creditRoomService.log(room, 'DOWNLOAD', 'book', versionId, {}, 'CREDOR')`.
- [ ] **Step 5:** testes + tsc + `check-ui-standard` + travas. Commit `feat(credit-room): book de crédito em PDF a partir da versão congelada`.

### Task 6: Banco, Edge, prova e PR (controlador)
- [ ] Aplicar a migration (`db query --linked -f`); se o modo automático barrar, pedir ao usuário. Rodar a prova SQL da Task 1 e a sonda anon.
- [ ] Deploy da Edge (usuário no PowerShell, da pasta da frente igual ao `origin/main` após o merge — ou antes, porque a mudança só amplia dentro do grupo).
- [ ] Prova na tela com room de TESTE (OK do usuário, como na F2): Grupo SPE+Alpa, compartilhar 1 doc da Alpa pelo "Sugerir documentos", ver na lista, baixar pela Edge (log DOWNLOAD); baixar o book e conferir as páginas; voltar o room para Empresa → doc da Alpa some. Excluir o room de teste ao fim (OK do usuário).
- [ ] PR (skill `pr`), CI (conferir pesados-quais), merge, `conferir-producao.sh`, CI da main.

## Decisões tomadas por mim (conferir)
- **Trava também na GRAVAÇÃO do compartilhamento** (trigger), não só na leitura: hoje qualquer um que enxerga um documento pode gravar um share para qualquer room. Custo se errado: quem compartilha de fora do room recebe erro.
- **Documentos de cliente** entram na sugestão num grupo próprio, desmarcado, com aviso de LGPD (são dados pessoais do comprador). Custo se errado: um clique a mais para incluí-los.
- **Gráfico do book desenhado no PDF**, não capturado da tela (a aba pode estar fechada; texto fica pesquisável). Custo se errado: visual um pouco diferente do da tela.
- **Book do credor com marca d'água** (e-mail + data/hora) e linha `DOWNLOAD/book` na auditoria; o do time interno sem marca.
- **Escopo volta para Empresa** → documentos das outras empresas somem do Data Room na hora (a regra é lida, não gravada). Os compartilhamentos continuam no GED e voltam se o room voltar a Grupo.

## Estado (22/11/2026)
Tasks 1–5 implementadas e revisadas (uma revisão por task + revisão final da branch inteira + rodada única de correções). Task 6: banco aplicado e provado, Edge publicada pelo usuário, prova na tela feita; PR pendente.

- **Banco:** `aplicar_20271122300000_credit_room_documentos_grupo` APLICADA em produção (22/11); prova `scripts/prova-credit-room-documentos-grupo.sql` em BEGIN…ROLLBACK → 22/22 (`TUDO = true`); room real intacto; anon sem EXECUTE.
- **Edge:** `credit-room-download` publicada pelo usuário (v7, 22/11 16:58 UTC).
- **Prova na tela** (room de TESTE em Grupo SPE + Alpa, excluído depois com OK do usuário): "Sugerir documentos" listou 3 docs de empreendimento + 65 da obra; doc da Alpa compartilhado → aparece com Empresa "Alpa", baixado pela Edge com marca d'água e linha `DOWNLOAD` na auditoria; book baixado (12 páginas, foto real do Garden na capa); room de volta a Empresa → doc da Alpa some, download recusado pela Edge e recompartilhar recusado pelo gatilho ("só entram documentos da empresa dona").
- **Não visto:** o portal logado como credor (MFA) — o caminho do credor (marca d'água + log `DOWNLOAD/book`, botão só com permissão de baixar) está coberto por teste de tela, não por login real.

## Decisões tomadas na execução (conferir)
- **Gatilho também na gravação** (não só na leitura): documento fora do escopo e quem não é interno do room são recusados ao compartilhar.
- **Quem é da org do documento pode retirar o compartilhamento** dele do room de outra org do grupo (RLS existente, por documento). Custo se errado: uma empresa do grupo tira o próprio documento sem a dona do room.
- **Documento com contrato e cliente** (contrato assinado) vem marcado em "Contratos", com a nota "contém dados do cliente"; com cliente achado por empreendimento/obra vem DESMARCADO.
- **Vencido vem desmarcado** e o "marcar todos" do grupo não o marca (só um a um).
- **Book interno não sai se a leitura do Data Room falhar** (índice vazio diria "sem documentos", o que seria falso).
- **"n/d" no PDF** no lugar de "—" (a fonte padrão do PDF não desenha o travessão), com legenda na capa.
- **Estacionados:** teste unitário de `sugerirDocumentos` (depende do banco); nome da empresa no Data Room só a partir da versão ativa; contagem de documentos por contrato visível ao credor (pode ligar rótulo a nome de documento — a empresa escolheu compartilhar).
