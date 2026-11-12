# Empreendimento › aba Documentos (checklist legal + uploads) ligada ao GED

## Pedido original

> incorporacao > empreendimentos:
> 1. criar aba documentos para fazer upload de documentos do empreedimentos.
> 2. criar tabela com as colunas necessarias para os documentos legais como escrituras, habite-se, alvarás, etc.

Pedido seguinte, na mesma sessão:

> fazer conexão com documentos (GED)

Sessão: Claude Code (VS Code) · 12/11/2026, tarde.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 12/11/2026 | Como funciona a tabela de documentos legais? | **Checklist.** Cada documento exigido é uma linha, mesmo sem arquivo, e tem situação (Pendente / Em andamento / Emitido / Dispensado). Há uma lista padrão carregável e itens avulsos. O arquivo vai para o GED. |
| 12/11/2026 | Como os arquivos aparecem no GED? | **Na categoria correspondente + filtro "Empreendimento"**, com o nome do empreendimento visível. |

## Princípio

O arquivo mora **só** no GED (`opura_documents` + bucket privado `opura-docs`). A aba do empreendimento é uma vista dele. Não existe bucket novo nem segunda cópia do arquivo.

O molde é o checklist do CNO: `opura_cno_documents` e `cnoService.uploadAndAttach`. O checklist aponta para o GED por `document_id`, e o upload é delegado a `documentService.uploadNewDocument`.

**Dono da data é o checklist.** Quando o item tem documento no GED, emissão, validade e alerta são copiados para lá. É isso que faz o cron de vencimento do GED (`fn_opura_docs_vencimento_alerts`) avisar.

"Vencido" **não é gravado**. É derivado da validade na leitura, senão ficaria velho no dia seguinte.

## Plano (um item por arquivo)

### 1. `supabase/migrations/aplicar_20271112990000_empreendimento_documentos.sql`

O que muda:
- `opura_documents.empreendimento_id` (FK `ON DELETE SET NULL`) e um índice parcial.
- Tabela `empreendimento_documentos_legais`:
  - colunas: tipo (CHECK), título, número, órgão emissor, protocolo e data do protocolo, emissão, validade, alerta em dias, situação (CHECK), obrigatório, responsável, observações, `document_id` (sem FK, como no CNO), `storage_path` e `sort_order`;
  - índice único parcial `(empreendimento_id, tipo) WHERE tipo <> 'OUTRO'`;
  - RLS `FOR ALL TO authenticated` com `organization_id IN (SELECT minhas_orgs_membro())` nos dois lados, sem perna `OR` e sem `anon`;
  - trigger de `updated_at`.
- Não cria função.

Como sei que terminou: aplicada com `db query --linked -f` e conferida em 12/11:

| col_ged | colunas_tabela | rls | policies | policies_anon | índices |
|---|---|---|---|---|---|
| 1 | 21 | true | 1 | 0 | 4 |

### 2. `types/empreendimentoDocumentos.ts` (novo)

O que muda: tipos, a lista padrão de 18 documentos na ordem do ciclo (terreno → aprovação → obra → entrega → condomínio) com categoria do GED e órgão sugerido, os rótulos de situação e os rótulos das categorias do GED.

Como sei que terminou: o teste confere que cada tipo cai numa categoria do GED e que a lista bate com o CHECK da migration.

### 3. `utils/empreendimentoDocumentos.ts` (novo)

O que muda: funções puras.
- `situacaoExibida`: situação derivada, como "Vencido há N dias" ou "Vence em N dias".
- `diasEntre` e `hojeISO`: data pura, sem fuso.
- `faltantesDaListaPadrao`: idempotente.
- `resumoDoChecklist`: os KPIs, contados pela mesma regra da coluna.

Como sei que terminou: `__tests__/empreendimentoDocumentos.test.ts` verde.

### 4. `services/empreendimentoDocumentosService.ts` (novo)

O que muda:
- `listarLegais` só lê; abrir a aba nunca grava.
- `carregarListaPadrao` relê o banco e insere só o que falta.
- `criarLegal`, `atualizarLegal` (copia as datas para o documento do GED) e `excluirLegal` (não apaga o GED).
- `anexarArquivo`: sem documento, cria a V1 no GED; com documento, sobe uma **nova versão**.
- `vincularDoGed` e `desvincular`.
- `listarDoGed`, `enviarOutro`, `nomesDosEmpreendimentos` e `urlDoArquivo` (URL assinada).

Como sei que terminou: `tsc` limpo e o fluxo no app real (verificação abaixo).

### 5. `services/documentService.ts` e `types/documents.ts`

O que muda: `empreendimento_id` no tipo `OpuraDocument` e no insert de `uploadNewDocument`, que lista as colunas uma a uma; sem isso o campo se perdia.

> Mudança em relação ao rascunho: o plano previa um filtro `empreendimentoId` em `listDocuments`. O recorte do GED ficou **em memória**, como os filtros da aba Normas, e esse filtro deixaria código morto. Por isso não entrou.

Como sei que terminou: `git diff` do `documentService.ts` é a linha do insert.

### 6. `components/empreendimento/DocumentosEmpreendimentoTab.tsx` (novo)

O que muda:
- **KPIs:** Obrigatórios emitidos (X de Y), Pendentes, Vencendo e Vencidos.
- **"Documentos legais"** (`StandardTable`):
  - colunas Documento, Número, Órgão emissor, Protocolo (oculta), Emissão, Validade, Situação, Arquivo e Responsável (oculta);
  - situação em texto colorido (§8);
  - na toolbar, "Carregar lista padrão" (desligado com o motivo quando completa) e "+ Documento";
  - clique na linha abre a edição;
  - ações: Enviar arquivo ou nova versão, e um menu com Vincular do GED, Abrir no GED, Desvincular e Tirar do checklist.
- **Sheet de edição** em três seções (Identificação · Andamento e validade · Arquivo), com dirty e "Voltar"/"Salvar alterações".
- **"Outros documentos"** (`StandardTable`):
  - lê do GED o que tem `empreendimento_id` e não está no checklist;
  - "Enviar documento" abre um Sheet com nome, categoria do GED, tipo e validade.

Como sei que terminou:
- `check-ui-standard.sh` passa.
- As travas de UI passam: cabeçalho, altura de campo, rótulo, valor sem cinza e guarda de saída.
- O fluxo foi testado no app real.

### 7. `components/empreendimento/EmpreendimentoDetail.tsx`

O que muda: a aba "Documentos" entra depois de "Espelho de Locações" e antes das transversais (Vinculações/Histórico). A organização vem de `e.organization_id` (REGRA #5).

Como sei que terminou: a aba aparece e abre.

### 8. `components/OpuraDocsModule.tsx` (GED)

O que muda:
- `FilterPopover` "Empreendimento" (§5.4) na toolbar. Aparece só quando a aba tem documento com empreendimento ou há um recorte guardado.
- O recorte é em memória. Documento integrado sai do recorte.
- "Empreendimento: Nome" aparece sob o nome do documento (`renderNameDetail`).
- Os nomes são resolvidos numa consulta só, pelos ids que estão na tela.

Como sei que terminou: o documento enviado pela aba aparece no GED, na categoria certa, com o nome do empreendimento, e o filtro reduz a lista a ele.

## Fora do escopo

- Mostrar documentos do empreendimento no Portal do Cliente/Corretor.
- Migrar `matricula`/`numero_processo` do cadastro para o checklist.
- Pastas do GED por empreendimento.
- Escolher o empreendimento no upload feito pelo próprio GED.

## Estado

- [x] 1. Migration: aplicada e conferida (12/11)
- [x] 2. Tipos
- [x] 3. Regras puras e teste
- [x] 4. Serviço
- [x] 5. `documentService` e tipos do GED
- [x] 6. Aba
- [x] 7. Encaixe no detalhe
- [x] 8. Filtro no GED
- [x] Verificação no app real (Playwright, 12/11). Teste feito com a conta de leitura, em "016 - Casa Condomínio", com o topo em "Todas as organizações". Resultado:
  - abrir a aba: 0 escritas no checklist;
  - "Carregar lista padrão": 18 itens Pendentes, e o botão fica desligado depois;
  - Alvará de construção com validade +10 dias e PDF: "Vence em 10 dias" e KPI Vencendo = 1;
  - o arquivo foi para o GED em Licenças & Alvarás, e o filtro "Empreendimento" deixa só ele, com "Empreendimento: 016 - …" sob o nome;
  - validade trocada para +40 dias: a situação volta a "Emitido" e `opura_documents.data_validade` = 2026-12-22, igual ao checklist;
  - erros de console/HTTP: só os `57014` da Central de Controle (ruído conhecido, fora deste módulo).
  - Achado e corrigido na tela: "Não vence" quebrava em duas linhas (coluna Validade 110 → 130 px + `whitespace-nowrap`).
  - Dados de teste apagados depois (checklist, documento, versão, auditoria e o arquivo no bucket), conferido por consulta: tudo 0.
- [ ] Publicação (push em `main`) e prova de produção

## Verificação

1. `npx vitest run __tests__/empreendimentoDocumentos.test.ts __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts`
2. `tsc --noEmit` limpo.
3. `bash scripts/check-ui-standard.sh` nos três `.tsx`.
4. No app:
   - Empreendimento › Documentos: abrir a aba não grava nada.
   - Carregar a lista padrão: entram 18 itens Pendentes; a segunda vez fica desligada.
   - No Alvará de construção, validade daqui a 10 dias e um PDF: a situação fica "Vence em 10 dias" (âmbar) e o KPI Vencendo vai a 1.
   - Abrir o arquivo.
   - GED › Licenças & Alvarás › filtro Empreendimento: o documento aparece com o nome.
5. `opura_documents.data_validade` do documento vinculado acompanha a edição da validade no checklist (conferido por `db query`).
