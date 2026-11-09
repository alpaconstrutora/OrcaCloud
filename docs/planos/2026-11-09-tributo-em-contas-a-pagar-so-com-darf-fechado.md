# Tributo só chega a Contas a Pagar depois do DARF fechado (enviado para aprovação)

## Pedido original

Sessão `5150111c-d9d4-4552-a471-30ff035eb4ec` · 09/11/2026.

> financeiro > Tributos: verifique se os lançamentos no contas a pagar se dá somente apos darf fechado

Resposta da verificação (mesma sessão): **não** — `vw_payables` não filtra `party_type`
nem `darf_id`; todo tributo aparecia em Contas a Pagar ao nascer (798 em aberto fora de
DARF, R$ 50.452,88; 1 DARF com 8 tributos). O DARF não tinha estado "fechado".

> Uma questão de termo: o DARF não tem estado "fechado". [...] Resposta: o darf vai para
> aprovação ? entao o status deve ficar bloqueado aguardando aprovação.
>
> FGTS: [...] Precisaria seguir a mesma regra ou continuar avulso? Resposta : continua avulso
>
> Tributo sozinho: o DARF exige pelo menos 2 tributos, ou 1 com multa e juros. [...]
> Resposta: nao tem número mínimo.
>
> O que esconder: a mudança deve valer só para a lista de Contas a Pagar (baixa, PIX,
> lote, cards "A pagar"). DRE, fluxo de caixa e projeções devem continuar contando o
> tributo como obrigação [...] Quer que eu implemente? [...] sim

## Decisões

- **DARF fechado = enviado para aprovação** (`aprovacao` ≠ `RASCUNHO`). Montar o DARF é
  rascunho: fica só em Tributos a Pagar › DARFs. "Enviar para aprovação" fecha.
- **Aguardando aprovação = travado**: sem desagrupar e sem mudar vencimento/multa/juros
  (código de barras, nº, observação e PDF continuam editáveis — anexar a guia é o caso
  comum). Destrava quando rejeitado. Aprovado segue a regra já existente (mudar o total
  volta para "Aguardando aprovação").
- **DARF nasce rascunho**: os tributos agrupados perdem a aprovação individual que
  tinham (desde 26/10 todo título nasce PENDENTE) — quem aprova é o DARF.
- **FGTS continua avulso**: aparece em Contas a Pagar e na fila de Aprovações sozinho,
  como hoje. (Ainda pode ir para uma guia só de FGTS; aí segue a regra do DARF.)
- **Sem mínimo**: DARF com 1 tributo, com ou sem multa/juros.
- **O que some de Contas a Pagar** (lista de Parcelas, cards, baixa, PIX, lote):
  tributo em aberto (não FGTS) fora de DARF e membros de DARF em rascunho. Tributo já
  pago continua (histórico/estorno). Tributo **retido** (nunca é pago pela empresa)
  também sai — é gerido em Tributos a Pagar.
- **O que não muda**: `vw_payables` (DRE, fluxo de caixa, projeções, Torre de Controle e
  o Fechamento por CC de Contas a Pagar continuam contando o tributo). O corte é na
  tela, não na view — a view também serve a composição do DARF em rascunho.
- **Fila de Aprovações**: tributo solto (não FGTS) sai; só o DARF enviado entra.

## Plano

### Banco — `supabase/migrations/aplicar_20271109300000_tributo_so_com_darf_fechado.sql`

Funções reescritas a partir da definição VIVA (lida como UTF-8 em 09/11; corpo igual ao
dos arquivos `aplicar_20271021300000`, `aplicar_20271026400000`, `aplicar_20271026600000`).

- [x] **M1. `fn_titulo_nasce_na_alcada`** — membro de DARF (`darf_id` preenchido) não
  entra na alçada sozinho. **Pronto quando:** em transação desfeita, agrupar um tributo
  PENDENTE deixa o membro em RASCUNHO (o gatilho de UPDATE não o devolve a PENDENTE).
- [x] **M2. `fn_darf_criar`** — sem mínimo de tributos; membros nascem RASCUNHO, cadeia
  vazia. **Pronto quando:** criar com 1 tributo sem multa passa e `vw_darfs.aprovacao` = RASCUNHO.
- [x] **M3. `fn_darf_editar`** — sem mínimo; com o DARF PENDENTE recusa vencimento,
  multa e juros. **Pronto quando:** editar o vencimento de um DARF pendente é recusado
  com a frase da trava; editar a observação passa.
- [x] **M4. `fn_darf_desagrupar`** — recusa DARF PENDENTE. **Pronto quando:** recusado
  com a frase da trava.
- [x] **M5. `fn_darf_dar_baixa`** — recusa DARF em RASCUNHO. **Pronto quando:** baixa de
  DARF rascunho recusada.
- [x] **M6. `fn_approval_action_queue`** — tributo solto que não é FGTS fica fora.
  **Pronto quando:** a fila não traz `origem='TRIBUTO'` sem FGTS; contagem dos outros
  ramos igual à de antes.

### Utilitário puro — `utils/darf.ts`

- [x] **U1.** `validarSelecaoParaDarf` sem mínimo (1 tributo basta).
- [x] **U2.** `motivoForaDeContasAPagar(titulo, aprovacaoDoDarf)` e
  `soOsDeContasAPagar(payables, darfs)`; `motivoNaoEnviaDarfParaAprovacao` recusa
  aprovado; `motivoNaoDesagrupa` e `motivoTravaDoDarf` para o pendente.
  **Pronto quando:** `__tests__/darf.test.ts` cobre FGTS solto visível, tributo solto
  oculto, pago visível, DARF rascunho oculto, DARF pendente/aprovado/rejeitado visível.

### Telas

- [x] **T1. `components/ContasPagarManager.tsx`** — linhas de Parcelas = `soOsDeContasAPagar`
  antes de `colapsarDarfs`; Fechamento continua cru. **Pronto quando:** no navegador,
  tributo solto não aparece e o DARF enviado aparece.
- [x] **T2. `components/financeiro/DarfsTab.tsx`** — "Enviar para aprovação" confirma
  (o DARF passa a Contas a Pagar e trava); "Ver em Contas a Pagar" desligado com motivo
  no rascunho; desagrupar desligado com motivo no pendente; status mostra "Rascunho —
  não enviado". **Pronto quando:** `check-ui-standard.sh` limpo e os motivos aparecem.
- [x] **T3. `components/financeiro/DarfSheet.tsx`** — vencimento/multa/juros só leitura
  com motivo quando pendente. **Pronto quando:** idem.
- [x] **T4. `components/TributosAPagarManager.tsx`** — "Ver em Contas a Pagar" desligado
  com motivo para quem não aparece lá; botão "Agrupar em DARF" com 1 tributo.
  **Pronto quando:** idem.

## Estado

- [x] Plano escrito (09/11)
- [x] M1–M6 — provados em transação desfeita (09/11): criar com 1 tributo → RASCUNHO;
  baixa do rascunho recusada; enviar → PENDENTE e 1 item na fila; editar vencimento
  recusado e observação aceita; desagrupar recusado; rejeitado → desagrupa. Fila: só os
  273 tributos soltos saíram (BOLETO 14, PROLABORE 1, COMMERCIAL 115, PURCHASE_ORDER 2,
  CONTRACT_* 4+4 iguais). 1ª versão de M6 derrubava boleto/comercial (`NOT (party_type =
  'TAX' …)` com party_type NULL) — corrigido para `IS DISTINCT FROM` antes de aplicar.
- [x] U1–U2 e testes (`darf.test.ts`, `darfAprovacao.test.ts`); T1–T4 com
  `check-ui-standard.sh` limpo nos 4 arquivos e `tsc` limpo
- [x] Aplicar a migration no banco — o usuário rodou (09/11; o auto mode barrou a minha); conferido: as 6 funções
  vivas trazem o texto de 09/11 e a ACL sem PUBLIC/anon
- [x] PR #269 mesclado (`44d8cc8`); domínio servindo `44d8cc8` com "Tributo fora de DARF" no bundle
- [ ] Conferência no navegador (Contas a Pagar, Tributos, DARFs) — precisa da senha do
  usuário de leitura
