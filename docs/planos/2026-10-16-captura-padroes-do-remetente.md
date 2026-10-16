# Captura por e-mail — Beneficiário e padrões do boleto por remetente (16/10/2026)

## Contexto

Pedido do usuário (16/10/2026, literal):
> O cadastro de boleto via captura de e-mail tem alguns bugs. um deles como pode ver pelo print que o Beneficiário é
> cadastrado com o nome do documento. sugestão de mellhoria. Ao cadastrar o e-mail do remetende, criar campo para
> cadastrar também os dados para cadastro do boleto (cards Cobrança, Quem recebe, Classificação e Observações

Respostas do usuário, literais:
- Cobrança: "Dia do vencimento, Multa e juros, Valor fixo" (só quando o PDF não traz; nunca sobrescreve).
- Boletos já em revisão: "Sim, só campos vazios (Recomendado)".
- Descrição: "Texto + mês automático (Recomendado)".
- Beneficiário sem fornecedor confirmado: "Sugerido, em cinza (Recomendado)".
- Visual do cadastro: "Seções com título e linha (Recomendado)".

**O que se descobriu:**
- **Beneficiário.** Nenhum código grava o nome do arquivo em `beneficiario_nome`. O que acontece é exibição: a tela cai em `supplierMap[...] ?? beneficiario_nome ?? documento_nome` em 5 pontos de `BoletoManager.tsx`, na exportação em PDF e na edição em lote. Na aprovação, `aprovarECriarInvoice` também usa `documento_nome` como descrição do título.
- **Padrões por remetente.** Não existe hoje nenhum "padrão de lançamento" por fornecedor ou remetente, e a captura não grava classificação nenhuma.

**Pendência da conversa:** a frente `captura-abas` (Boletos a Pagar em 4 abas) está pronta, mas sem commit. O único teste que caiu foi por "Worker exited unexpectedly", a instabilidade do Node 24.

## Ordem de execução

1. **Fechar a frente `captura-abas`** (`C:\D\frentes\captura-abas`).
   - Testes **um arquivo por vez** (`abasBoletos`, `emailCaptureHistorico`, `emailCaptureRegras`, `emailCaptureService`, `components/EmailCapturaHistorico`, `components/EmailCaptureBuscaSheetRemetentes`, `components/EmailCaptureRegraSheet`, `boleto*`), usando `--pool=forks` se o worker cair.
   - Typecheck parcial (tsconfig temporário com `files` = arquivos tocados; resultado lido por `grep "error TS"`).
   - Marcar no plano do módulo, commit, `git push origin HEAD:main`, conferir o check-run `ci` e rodar `conferir-producao.sh`.
   - Playwright só-leitura nas 4 abas e `fechar-frente.sh`.
2. `bash scripts/nova-frente.sh captura-padroes-remetente` e o plano `docs/planos/2026-10-16-captura-padroes-do-remetente.md`, com o pedido e as respostas literais.
3. Funções puras e testes (passo A).
4. Migration (B): aplicar 2× e provar o 23503 com `ROLLBACK`. **Antes** da Edge Function e da tela, porque as duas leem as colunas novas.
5. Edge Function (C): `deno check`, deploy com `--no-verify-jwt`, prova do 401.
6. Serviços (D), telas (E–G) e Beneficiário (H).
7. Verificação (seção final), push, CI e produção.

## A — Regras puras: `utils/emailCaptureRegras.ts` (sem imports, a Edge Function importa)

- **`PadroesRemetente`:** 12 campos `padrao_*` (descricao, observacoes, project_id, cost_center_id, plano_de_contas_id, category_id, dia_vencimento, valor, multa, multa_percentual, juros_dia, juros_dia_tipo).
- **`dataLocalDoEmail(iso)`:** AAAA-MM-DD em America/Sao_Paulo.
- **`vencimentoPeloDia(dia, referencia)`:** 1ª data com aquele dia na data de referência ou depois. Dia que o mês não tem → último dia do mês. Virada de ano tratada.
- **`descricaoComMes(modelo, vencimento, referencia)`:** `{mês}`/`{mes}` → MM/AAAA do vencimento final; sem vencimento, usa o mês do e-mail.
- **`modeloDaDescricao(descricao, vencimento)`:** o inverso, para o atalho "Monitorar remetente".
- **`aplicarPadroesDoRemetente(boleto, padroes, dataEmail)` → `{ patch, campos }`:** só preenche campos vazios.

  | Campo | Quando o padrão entra |
  |---|---|
  | Vencimento | Só se nulo, calculado pelo dia |
  | Valor | Se nulo ou 0 |
  | Multa e juros | Só se multa, multa % e juros vierem **todos** vazios; tipo `'valor'` quando faltar |
  | Descrição, observações, obra, centro de custo, plano de contas, conta financeira | Só os vazios |

  O patch nunca contém `null` e a entrada não é alterada.
- **`camposDoPadraoIntactos(atual, gravado)`:** usado na releitura com senha, para o PDF poder trocar o que veio do padrão enquanto o usuário não alterou.
- **`encontrarRemetenteCadastrado(from, remetentes)`:** e-mail exato ganha de domínio. `remetenteJaCadastrado` passa a usá-la.
- **`decidirDestino` ganha `doPadrao?: { vencimento?, valor? }`.** Continua recebendo só o vencimento do PDF; com `doPadrao`, o boleto fica em revisão com o motivo `MOTIVO_VENCIMENTO_DO_PADRAO` / `MOTIVO_VALOR_DO_PADRAO`. Sem `doPadrao`, nada muda.
- O fornecedor do remetente continua só como **sugestão**. Na tela, a sugestão já aparece selecionada.

## B — Migration `supabase/migrations/aplicar_20271016210000_email_capture_padroes_remetente.sql`

Conferir que o prefixo continua sendo o maior depois do `git fetch`.

- `ADD COLUMN IF NOT EXISTS` das 12 colunas `padrao_*`.
- FKs `ON DELETE SET NULL` para `projects`, `cost_centers_v2`, `plano_de_contas` e `financial_categories`.
- CHECKs: dia 1–31; valor > 0; multa em R$ **ou** %; tipo do juros; tamanho dos textos. Tudo dentro de `DO $$ ... IF NOT EXISTS pg_constraint`.
- **Gatilho novo `fn_email_capture_sender_padroes_da_org`:** `SECURITY INVOKER`, `search_path` fixo, `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` literal. Recusa com 23503 e mensagem clara:
  - obra que não seja `projects.organization_id = NEW.organization_id` e não seja projeto de sistema (`settings->>'isSystemProject'` ou "Gestão Comercial");
  - centro de custo ou plano de contas de outra org;
  - conta financeira que não seja da org nem global (`NULL`).

  É necessário porque a Edge Function grava como `service_role`. O gatilho atual do fornecedor fica intacto.
- **Só `GRANT INSERT(...)`/`UPDATE(...)` por coluna**, das 12 colunas. **Sem** `REVOKE ... ON TABLE`, que apagaria os grants por coluna existentes.
- `NOTIFY pgrst`. Bloco de verificação com `has_column_privilege` e checagem do gatilho.

## C — Edge Function `supabase/functions/email-capture-sync/index.ts`

- **Select dos remetentes (~253):** acrescentar as 12 colunas.
- **Antes do `decidirDestino` (~610):** `aplicarPadroesDoRemetente(colunas, remetente, dataLocalDoEmail(a.data))`, só com remetente casado.
- **No insert (~634):** `...colunas, ...patch`.
- **Na auditoria:** `padroes_do_remetente: { remetente_id, valores }`.
- **`reprocessarParados`:** ler o que veio do padrão na auditoria (`upload`/`padroes_remetente`). Campo intacto conta como vazio, então o PDF relido ganha. Depois reaplicar os padrões no que continuar vazio, e chamar `decidirDestino` com `doPadrao`.

## D — Serviços

- **`services/emailCaptureService.ts`**
  - `RemetenteCaptura` + `PadroesRemetente`; `COLUNAS_REMETENTE` + 12 colunas.
  - `salvarRemetente` envia as 12 colunas **pelo nome**: texto aparado, vazio vira `null`, `juros_dia_tipo` vira `null` sem juros.
  - Mensagens claras para 23503 (texto do gatilho) e 23514.
  - **`previaDosPadroes(remetente)`:**
    1. Mensagens `criado` da caixa com `boleto_id`, filtradas por `ilike` do endereço e confirmadas com `remetenteCasa` sobre os remetentes da caixa (paginar com `.range`).
    2. Boletos da mesma org, `revisao`/`rascunho`, sem `invoice_id`, em lotes de 200.
    3. Manter só os com patch não vazio.
- **`services/boletoService.ts`**
  - **`preencherComPadroesDoRemetente(itens, remetenteId, userEmail)`:** update por boleto com trava `.eq('updated_at', …)`, status `revisao`/`rascunho` e `invoice_id IS NULL`, mais aviso em `erros_validacao`. Auditoria `acao: 'padroes_remetente'`, `metodo: 'usuario'`. Não usa `associar`: não há título antes de aprovar e não renomeia o documento.
  - **`aprovarECriarInvoice` (~617):** `description = descricao || nome do fornecedor || beneficiario_nome || 'Boleto'` (sem `documento_nome`); `entity_name`/`party_name = beneficiario_nome ?? nome do fornecedor`.
  - **`exportarExcel`/`exportarPDF`:** recebem os nomes dos fornecedores e usam o helper do Beneficiário.
- **`financialRegistryService.listChartOfAccounts`:** + `organization_id` no select (aditivo).

## E — `components/boletos/MultaJurosFields.tsx` (extraído de `BoletoFormModal.tsx` ~1538-1604)

Mesmas props, mais `ajuda?` e classes opcionais. `BoletoFormModal` passa a importar.

## F — `components/boletos/EmailCaptureSenderSheet.tsx`

- `size="xl"` e `SecaoTitulo` em todas as seções (§30: seções com título e linha, um formulário só). Rótulos em sentence case (§21). Seções:

  | Seção | Conteúdo |
  |---|---|
  | **Remetente** | Nome, Monitorar por, Caixa, E-mail/Domínio, Palavras-chave |
  | **Senha dos PDFs** | O que já existe |
  | **Importação** | O que já existe |
  | Frase de abertura | "Padrões dos boletos deste remetente — usados só quando o PDF não traz o dado." |
  | **Cobrança** | Dia do vencimento (`<select>` "—", 1–31, com ajuda); Valor fixo (`MoneyCentsInput`); `MultaJurosFields` |
  | **Quem recebe** | Fornecedor (`SupplierSelect`, sai da seção Remetente); Descrição com placeholder "Ex.: Energia – {mês}" e prévia "Fica: Energia – 11/2026" |
  | **Classificação** | Organização só leitura (a da caixa); Obra (`<select>`, `listProjects({ organizationId, lean: true })`); `CostCenterSelect`; `PlanoContasSelect`; Conta financeira (`HierarchicalSelect` em drawer, como no `BoletoFormModal` ~1429-1439, só da org ou globais) |
  | **Observações** | Textarea |

- **Listas:** carregadas pelo próprio painel quando `open && conta`, com guarda `seq` e `if (!conta) return`. Nunca `if (!organizationId) return` (trava em `orgContextGuard`).
- **Trocar a caixa para outra org** limpa o fornecedor e a classificação, com nota explicando.
- Botão Salvar desligado com o motivo: dia fora de 1–31, valor ≤ 0.
- **Ao salvar:** se houver padrões, chama `previaDosPadroes`. Se N > 0, abre `useConfirm`: "Aplicar aos N boletos em revisão deste remetente?" com "Só os campos vazios são preenchidos." e os botões Aplicar / Agora não. Depois `preencherComPadroesDoRemetente` e `onSalvo(r, { atualizados })`. Falha ao aplicar não desfaz o salvamento.

## G — Telas que usam o painel

- **`EmailCapturaConfig.tsx`:** toast "Remetente salvo. Padrões aplicados a N boletos." e prop `onBoletosAtualizados`. Em `BoletoManager.tsx`, essa prop faz `setBoletos(prev => prev.map(...))` (§22, sem recarregar).
- **`BoletoFormModal.tsx`, atalho "Monitorar remetente":**
  - Se o remetente já está cadastrado na caixa (`encontrarRemetenteCadastrado`), abre **em edição**. O link passa a se chamar "Padrões do remetente". Isso corrige o 23505 de hoje.
  - Senão, abre novo com preenchimento:

    | Campo | Preenchimento |
    |---|---|
    | Fornecedor e classificação | Do boleto, só se o boleto for da org da caixa (corrige o 23503 de hoje) |
    | Descrição padrão | `modeloDaDescricao` |
    | Dia do vencimento | Do vencimento do boleto |
    | Multa e juros | Do boleto |
    | Valor e observações | Não |

  - O boleto aberto, se for atualizado, recebe `setBoleto` e preenche só os campos vazios do formulário.
  - `ROTULO_AUDITORIA.padroes_remetente = 'Preenchido com os padrões do remetente'`.

## H — Beneficiário: `utils/boletoBeneficiario.ts` (novo)

- **`beneficiarioDoBoleto(b, nomes)` → `{ nome, origem: 'fornecedor' | 'boleto' | 'sugerido' | 'nenhum' }`.**
  - Ordem: nome do fornecedor → `beneficiario_nome` limpo (corte de " - CNPJ:", extraído do `BoletoFormModal` ~1140) → fornecedor sugerido.
  - **Nunca usa `documento_nome`.**
- **`nomeDoBeneficiario`:** devolve `nome ?? '—'`.
- **Onde usar:**
  - `BoletoManager.tsx`:
    - célula (sugerido em `text-gray-500` com title "Sugerido — confirme na revisão");
    - card da grade;
    - filtro avançado;
    - ordenação (mesmo nome da célula);
    - agrupar (sem nome → "Sem fornecedor").
  - Exportação Excel/PDF.
  - `BoletoEdicaoEmLoteModal.tsx:164` (prop `nomesFornecedor`).

## Testes (Vitest; componentes em jsdom)

- **`__tests__/emailCapturePadroes.test.ts` (novo):**
  - vencimento por dia: mesmo mês, mês seguinte, virada de ano, dia 31 em abril, fevereiro de 2027 e 2028, 31/01 com dia 30;
  - data do e-mail no fuso de São Paulo;
  - `{mês}` / `{mes}` / `{MÊS}`;
  - modelo inverso;
  - aplicar: só vazios, valor 0, multa/juros como grupo, descrição com o vencimento do padrão, patch sem `null`, entrada intacta;
  - campos intactos na releitura;
  - exato ganha de domínio.
- **`emailCaptureRegras.test.ts`:** `decidirDestino` com e sem `doPadrao`.
- **`emailCaptureService.test.ts`:** chaves exatas do payload (+12 colunas), vazio vira `null`, prévia (outra org, aprovado e com título ficam de fora).
- **`__tests__/boletoPadroesRemetente.test.ts` (novo):** trava de `updated_at`, auditoria, contagem de pulados.
- **`emailCaptureMigrations.test.ts`:**
  - colunas, FKs e CHECKs;
  - gatilho INVOKER com 4 checagens e 23503;
  - REVOKE literal;
  - GRANT por coluna sem `pdf_senha_atualizada_em`;
  - **ausência** de `REVOKE ... ON TABLE`, `CREATE POLICY` e `SECURITY DEFINER`.
- **`__tests__/boletoBeneficiario.test.ts` (novo):** cada origem; trava de texto (regex) contra `beneficiario_nome ?? ... documento_nome` em `BoletoManager`, `BoletoEdicaoEmLoteModal` e `boletoService`.
- **`components/EmailCaptureSenderSheetPadroes.test.tsx` (novo):**
  - as 4 seções e a org só leitura;
  - trocar de org limpa os campos;
  - dia 32 bloqueia com o motivo;
  - salvamento com os padrões;
  - confirmação com N > 0 (Aplicar e Agora não) e sem pergunta com N = 0.
- **`components/BoletoFormModalMonitorarRemetente.test.tsx` (novo):** preenchimento; org diferente; remetente já cadastrado abre em edição.
- **Ajustar:** mocks de `projectService`/`financialRegistryService` em `EmailCaptureSenderSheetSenhaNoCampoErrado.test.tsx`.

## Verificação final

1. Testes acima, **um arquivo por vez**, mais `orgContextGuard`, `segurancaMigrations`, `migrationsPrefixo`, `emailCaptureSyncLogica`, `BoletoFormModalDuplicadoEVencimento` e `boletoGrupos`.
2. `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado, mais `check-system-projects.sh` e `check-project-classification.sh` no painel. CHECKLIST DE APLICAÇÃO do guia item a item.
3. Typecheck parcial (scratchpad) e `deno check` da Edge Function.
4. Migration 2× e prova do 23503 com `ROLLBACK`. Deploy da Edge Function e 401 sem header. **Só então** `git push origin HEAD:main`, check-run `ci` e `conferir-producao.sh`.
5. Playwright em produção, só leitura:
   - Caixas e remetentes › abrir remetente → 4 seções; fechar sem salvar;
   - aba Boletos → um boleto sem fornecedor mostra o sugerido em cinza ou "—", nunca o arquivo.
6. Depois do próximo ciclo do cron, conferir em SQL que os boletos novos de um remetente com padrões têm os campos preenchidos, o motivo em `erros_validacao` e `padroes_do_remetente` na auditoria.

## Riscos

- **Ordem de publicação:** tela ou Edge Function antes da migration quebra a captura. A ordem está fixada acima.
- **FK nova trava a tabela referenciada por um instante:** `lock_timeout` de 3s; a migration é idempotente, então basta rodar de novo.
- **Padrão que fica inválido depois** (obra movida de organização): salvar o remetente dá 23503 com mensagem clara. Boletos já criados não são afetados.
- **Aplicar em lote é sequencial, não atômico:** o resultado informa quantos foram aplicados e quantos pulados.
- **Fora de escopo, só registrado:** o seletor de obra do `BoletoFormModal` lista obras de todas as organizações.

## Estado

- [x] A — regras puras + testes (`emailCapturePadroes` 15, `emailCaptureRegras` 41).
- [x] B — migration aplicada 2× (verificação embutida passou nas duas); prova num bloco desfeito: centro de
  custo de outra org → 23503, da mesma org → aceito; 0 remetentes alterados depois.
- [x] C — Edge Function publicada (401 sem header); `deno check` limpo. Releitura: campo do padrão intacto é
  trocado pelo PDF; do grupo multa/juros que o PDF não trouxer mais, volta a vazio.
- [x] D — serviços: `salvarRemetente` (+12 colunas por nome), `previaDosPadroes`, `preencherComPadroesDoRemetente`
  (trava por `updated_at`), `listChartOfAccounts` com `organization_id`.
- [x] E/F/G — `MultaJurosFields` extraído; cadastro do remetente com Cobrança/Quem recebe/Classificação/
  Observações (`size="xl"`, `SecaoTitulo`); "Aplicar aos N boletos"; atalho do boleto pré-preenche e abre em
  edição quando o remetente existe; histórico do boleto mostra os campos vindos do padrão.
- [x] H — `utils/boletoBeneficiario.ts` em célula, grade, filtro, ordenação, agrupar, lote e exportações;
  aprovação sem `documento_nome` na descrição do título.
- Verificação local: 24 arquivos de teste por arquivo (231 testes) verdes; typecheck parcial em 2 grupos limpo
  (pegou 11 erros de tipo que os testes não pegavam: corrigidos); `check-ui-standard`, `check-system-projects`,
  `check-project-classification` e `check-xss-sinks` limpos.
- [ ] Publicar o front, CI, domínio e conferência em produção.
