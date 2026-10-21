# Portal do Síndico — Portais › Portal do Condomínio

## Pedido original

Sessão de 20/10/2026, transcrito literalmente:

```
comercial > condomínio: atualmente os moradores conseguem acessar o portal do condomínio atraves do portal do cliente.
Vamos implementar portal do sindico em [portais > portal do condominio
```

## Decisões tomadas com o usuário (20/10/2026)

| Pergunta | Resposta |
|---|---|
| Quem é o síndico | Um cliente por condomínio (`sindico_client_id` + mandato, já existente) |
| Escopo v1 | Ver o prédio inteiro · publicar avisos · tratar chamados · aprovar/devolver rateio |
| Acesso | E-mail+senha (`/portal-sindico`, convite) **e** link com token |
| Aprovação trava o fechamento? | Configurável por condomínio, **desligado por padrão** |
| Menu | Renomear "Portal do Condômino" → **"Portal do Condomínio"**, com Moradores + Síndico dentro |
| Aprovar/devolver rateio | **Só com login** (sessão); pelo link, não |
| O que o síndico vê além do morador | Custo das OS **e** documentos internos (`visivel_portal=false`) |
| Contatos dos condôminos | Sim, telefone e e-mail |
| Visual | PortalKit (exceção dos portais externos estendida ao `SindicoPortal`) |

## Passo 0 — frente e plano versionado

- `bash scripts/nova-frente.sh portal-sindico` (REGRA #8; nunca no checkout de integração).
- Gravar este plano em `docs/planos/2026-10-20-portal-do-sindico.md` com `## Pedido original`
  literal + tabela de decisões (REGRA #6). Atualizar o mesmo arquivo a cada fase.

## Desenho central (vale para as três fases)

**Regra única de mandato** — `fn_sindico_predios(p_client_id) RETURNS SETOF uuid` (privada):
`sindico_client_id = p_client_id AND status='EM_OPERACAO' AND (inicio IS NULL OR inicio <= hoje)
AND (fim IS NULL OR fim >= hoje)`, com `hoje = (now() AT TIME ZONE 'America/Sao_Paulo')::date`.
Trocar o síndico ou vencer o mandato derruba o acesso antigo sem ação manual (recalculado a cada
chamada). Espelho TS em `utils/mandatoSindico.ts` (e `CondominioDetail.mandatoVencido` passa a usá-lo).

**Porta única de autorização** — `fn_sindico_resolver(p_token, p_client_id, p_modo)` (privada) devolve
o `client_id` ou recusa:
- `'ler'`: token ativo **ou** e-mail do JWT = `clients.email` **ou** `is_org_member` (prévia do admin);
- `'escrever'`: token ativo **ou** e-mail do JWT — **nunca membro** (equipe não age em nome do síndico);
- `'sessao'` (aprovar rateio): **só** e-mail do JWT — token recusado;
- sempre: `fn_sindico_predios` não vazio, senão `{ok:false, motivo:'mandato não vigente'}`.
Toda RPC pública recebe `(p_token DEFAULT NULL, p_client_id DEFAULT NULL, …)` e começa pelo resolver.

**Token** — tabela nova `sindico_portal_tokens(id, org_id, client_id UNIQUE → clients ON DELETE CASCADE,
token UNIQUE, expires_at now()+90d, is_active, last_used_at, convidado_em, created_at)`; RLS só
`SELECT TO authenticated USING (is_org_manager(org_id))`; escrita só por RPC/Edge.

**REGRA #7** em toda migration: cada função com `REVOKE … FROM PUBLIC, anon[, authenticated]` literal
no mesmo arquivo, delimitador `$$`/`$function$` (o teste não reconhece `$fn$`); nada de `USING (true)`.
Aplicar com `npx supabase db query --linked -f` (nunca `db push`). Prefixos propostos
`aplicar_20271020400000/400100/400200_*` — reconferir com `git ls-tree` + grep dos dígitos (com e sem
`aplicar_`) na hora do commit; `migrationsPrefixo.test.ts` e `segurancaMigrations.test.ts` verdes.

**Ordem de publicação por fase:** migration → Edge Functions (`supabase functions deploy`) → push do
frontend. Provar o deploy de fora (`scripts/conferir-producao.sh "Portal do Síndico"`).

---

## F1 — Acesso e leitura do prédio inteiro

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `supabase/migrations/aplicar_20271020400000_portal_sindico_acesso_leitura.sql` | `sindico_portal_tokens`; `fn_sindico_predios`, `fn_sindico_resolver`, `fn_sindico_payload` (privadas); `sindico_portal_dados`, `sindico_portal_gerar_token(p_empreendimento_id)` (`is_org_manager` + síndico vigente, upsert por client), `sindico_portal_revogar_token`, `sindico_portal_token_para_mim()` (molde da `aplicar_20271016000100`; situações `ok/nao_cadastrado/sem_mandato/revogado`; entre vários `clients` com o e-mail, prefere o que tem mandato vigente). Payload: `condominios[]` (+mandato, `exigeAprovacao`), **todas** as unidades no formato `PortalUnidadeCondominio` com ocupantes **com telefone/e-mail**, avisos com histórico e `leituras`, documentos **incluindo internos** (com flag `visivelPortal`), manutenção, ordens **com custo**, ativos, rateios não cancelados com cotas + situação (status/vencimento/pagamento da `internal_transactions` via `_itens.transaction_id`). Seções comuns copiadas do ARQUIVO `aplicar_20271012000020` só depois de conferir o md5 de `pg_get_functiondef` no banco. | Testes de migration verdes; anon com token aleatório → `ok:false`; anon em `gerar_token` → permission denied; `scripts/check-rls-postura.sh` limpo; `UPDATE sindico_mandato_fim = ontem` → o mesmo token passa a `ok:false` |
| `types/users.ts` | `ProfileGroup.SINDICO`, `UserProfile.SINDICO` | tsc aponta todo `Record<ProfileGroup>` e todos são resolvidos |
| `utils/acessoAoMarket.ts` + teste | SINDICO fora do Market | teste verde |
| `lib/entradasDoPortal.ts` + `__tests__/entradasDoPortal.test.ts` | Entrada `/portal-sindico`, "Portal do Síndico", `permitePrimeiroAcesso:false` (só convite), cor ainda não usada | teste verde |
| `components/LoginGateway.tsx` | Cartão "Portal do Síndico" | aparece no seletor (Playwright) |
| `services/profileService.ts` + `__tests__/validateAccessPortais.test.ts` | `'sindico'` em `PortalComToken`, RPC por portal, mensagem de `sem_mandato` | teste verde |
| `hooks/useAuthSync.ts` | Papel do SINDICO | login entra sem "Erro de Acesso" |
| `App.tsx` | `/portal-sindico?token=`, guard público, `SindicoPortalTokenGate`, ramo de login por e-mail com `onLogout` | link e login abrem a mesma casca; "Sair" volta a `/portal-sindico` |
| `services/sindicoPortalService.ts` (novo) | Tipo `PortalSindico`; `getDados({token}|{clientId})`, `gerarLink`, `revogar`, resolvedores de documento/comprovante com `portal:'sindico'` | consumido pelo portal e pelo admin |
| `components/client/CondominioTab.tsx` | Só **exportar** os seis painéis (sem mudar comportamento) | testes existentes do CondominioTab verdes |
| `components/portal/PortalKit.tsx` | Incluir `SindicoPortal` na lista de arquivos autorizados do cabeçalho | comentário atualizado |
| `components/sindico/SindicoPortal.tsx`, `useSindicoPortal.ts`, `PainelUnidadesDoPredio.tsx`, `utils/sindicoPortalTabs.ts` (novos) | Casca no molde de `components/training/TrainingPortal.tsx` (estado em hook, abas em utils); abas Visão · Unidades · Avisos · Chamados · Financeiro · Documentos · Manutenção · Equipamentos; Unidades = unidade × ocupantes × contato × situação da cota (inadimplência); prop `somenteLeitura` | teste de componente com dado mockado; nenhum botão de ação em `somenteLeitura` |
| `utils/mandatoSindico.ts`, `utils/situacaoDaCota.ts`, `utils/acessoDoSindico.ts` + testes | Regras puras (mandato com nulos/borda/fuso; PAGA/EM_ABERTO/VENCIDA/NAO_COBRADA/CANCELADA; estado do acesso) | testes verdes |
| `supabase/functions/client-portal-condominio-download`, `client-portal-rateio-comprovantes` | Corpo aceita `portal:'sindico'` → autoriza chamando `sindico_portal_dados` com o Authorization do chamador; só assina o que veio no payload | sem header → 401/403; síndico abre documento interno e PDF do rateio com anexos |
| `supabase/functions/portal-invite-user`, `services/portalInviteService.ts`, `components/portal/ConvitePortalBloco.tsx` | `sindico` em `PORTAIS` (`clients`, `sindico_portal_tokens`, rota `/portal-sindico`); `exigirGestor`; confere `fn_sindico_predios` antes de emitir; grava `convidado_em` no token | e-mail chega e "criar senha" cai em `/portal-sindico`; `curl` sem header → 401 |
| `components/condominio/PortalCondominoAdmin.tsx` | Títulos "Portal do Condomínio"; no detalhe, **card Síndico** acima de "Moradores": nome, e-mail, mandato, estado do acesso, Copiar/Gerar link, Convidar por e-mail, Revogar (`useConfirm`), **Ver como o síndico** (prévia `somenteLeitura`); sem síndico/mandato vencido → aviso com "Definir na Ficha" (deep-link no molde de `irParaOcupacoes`); comentário de cabeçalho atualizado | `bash scripts/check-ui-standard.sh` limpo |
| `components/Layout.tsx`, `components/AppRouter.tsx` | Rótulo "Portal do Condomínio" (id `condomino-portal` mantido); comentários | menu mostra o nome novo e destaca o grupo |

## F2 — Avisos e chamados

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `aplicar_20271020400100_portal_sindico_avisos_chamados.sql` | `condominio_avisos.publicado_por_sindico_client_id` (FK SET NULL) e `publicado_por = 'Síndico — <nome>'`; tabela `client_request_eventos` (autor EQUIPE/SINDICO/MORADOR/SISTEMA, mensagem, status anterior/novo; RLS `is_org_member`); RPCs `sindico_portal_publicar_aviso`, `sindico_portal_encerrar_aviso` (só os dele, `valido_ate = ontem`, não apaga), `sindico_portal_responder_chamado` (unidade do prédio dele; status validado contra o CHECK; `resolved_at`; evento; mensagem em `client_portal_messages` para o morador; **não** toca `admin_notes`) — modo `'escrever'`; payload ganha `chamados[]` com eventos | testes de migration verdes; aviso publicado aparece no Portal do Cliente de um morador do prédio; responder chamado de outro prédio → recusa |
| `components/sindico/PainelAvisosDoSindico.tsx`, `PainelChamadosDoSindico.tsx` | Publicar em painel lateral (UI_PATTERNS); chamados com responder e mudar status | Playwright: publicar, responder, Resolvido |
| `components/condominio/ManutencaoTab.tsx`, `ComunicacaoTab.tsx`, `ClientRequestsAdminModal.tsx` | Admin vê "por Síndico" e o histórico do chamado; a equipe passa a gravar evento EQUIPE | admin vê a resposta do síndico; `check-ui-standard.sh` limpo |

## F3 — Aprovação de rateio

| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `aplicar_20271020400200_portal_sindico_aprovacao_rateio.sql` | Em `condominio_rateios`: `aprovacao_status` (APROVADO/DEVOLVIDO, NULL = aguardando), `aprovacao_em`, `aprovacao_por_client_id`, `aprovacao_por_nome`, `aprovacao_observacao`, `aprovacao_assinatura`; log imutável `condominio_rateio_decisoes`; `fn_rateio_assinatura` (md5 de valores por unidade + despesas por transaction_id, **sem descrição**, porque `congelarDescricoes()` mexe nelas ao fechar); `empreendimentos.rateio_exige_aprovacao_sindico DEFAULT false`; gatilho BEFORE UPDATE OF status → FECHADO recusa sem aprovação vigente ou com assinatura divergente; `sindico_portal_decidir_rateio` em modo **`'sessao'`** (link recusado), só RASCUNHO, devolver exige observação | exigência ligada: fechar sem aprovação falha com a mensagem; aprovado e assinatura batendo, fecha; `congelarDescricoes` não invalida; chamada com token → recusa |
| `utils/aprovacaoRateio.ts` + teste | `podeFecharRateio(rateio, exige, sindicoVigente) → {ok, motivo}` (mesma regra do gatilho) | teste verde |
| `services/condominioRateioService.ts` | `RATEIO_COLS` e tipo `Rateio` com aprovação | tsc verde |
| `components/condominio/FinanceiroTab.tsx` | Coluna/selo "Síndico" (Aguardando · Aprovado em dd/mm por X · Devolvido + observação · Aprovação desatualizada); Fechar desabilitado **com o motivo** no title | `check-ui-standard.sh` limpo; Playwright |
| `components/condominio/CondominioDetail.tsx` | Interruptor "Exigir aprovação do síndico para fechar o rateio" na Ficha; linha de estado do acesso do síndico com link para Portais | salva e relê |
| `components/sindico/PainelFinanceiroDoSindico.tsx` | Aprovar/Devolver sobre o `PainelFinanceiro`; pelo link, botão desabilitado dizendo "entre com e-mail e senha para aprovar" | Playwright: síndico aprova, admin vê "Aprovado" |

## Riscos registrados

- Mesmo e-mail síndico em `clients` de organizações diferentes: v1 abre um só (ordem da RPC). Registrar como limitação.
- Payload (todas as unidades × rateios × cotas) pode pesar — medir em F1; se preciso, limitar a 24 meses.
- Exigência ligada sem síndico vigente trava o fechamento — de propósito, com mensagem explícita.
- Contatos dos condôminos expostos ao síndico (decisão do usuário) — só no payload do síndico, nunca no do morador.

## Verificação ponta a ponta (skill `rodar-app`, Playwright em `c:\tmp\pwtest`)

1. `npm run ci` (typecheck + suíte + build) na frente, lendo a saída da suíte antes de qualquer push.
2. Admin: Portais › Portal do Condomínio › condomínio piloto › Síndico › Gerar link (cadastro de teste combinado com o usuário antes de gravar em produção).
3. Abrir o link em contexto anônimo e varrer as abas: zero erro de JS e zero 4xx/5xx do PostgREST.
4. Convite por e-mail → criar senha → entrar por `/portal-sindico`.
5. F2: publicar aviso e conferir no Portal do Cliente de um morador; responder um chamado.
6. F3: ligar exigência, tentar fechar (recusa com motivo), aprovar logado, fechar; tentar aprovar pelo link (recusa).
7. Trocar o síndico na Ficha e recarregar o link antigo → "mandato não vigente".
8. Sondas `curl` sem header nas três Edges → 401/403.

## Estado

Atualizado em 21/10/2026. "Código" = escrito e testado na frente; "no ar" = só
depois do push em `main` (ainda não feito quando esta linha foi escrita).

### Banco e Edge Functions — APLICADOS em produção (20–21/10/2026)
- [x] `aplicar_20271020400000` (F1) — conferido: tabela + RLS, 8 funções, anon não
  executa `gerar_token` nem o payload, executa `sindico_portal_dados`; payload real do
  010 = 1 condomínio, 12 unidades, 17 ocupantes, 14 KB; token falso → "Link inválido".
- [x] `aplicar_20271020400100` (F2) — conferido: coluna de autoria, `client_request_eventos`
  com RLS, 3 RPCs; token falso recusado.
- [x] `aplicar_20271020400200` (F3) — conferido: 6 colunas, gatilho, 0 condomínios com
  exigência ligada. **Prova do gatilho em produção, num bloco desfeito no fim** (nada
  gravado, conferido depois): sem exigência fecha; exigência sem aprovação recusa;
  aprovado + descrição congelada fecha; valor mudado depois recusa.
- [x] Edge `client-portal-condominio-download`, `client-portal-rateio-comprovantes`,
  `portal-invite-user` publicadas (verify_jwt mantido). Sondas: sem header 401 nas três;
  anon + token falso → 403 "Link inválido" (prova de que o bundle novo está no ar).

### F1 — acesso e leitura: 17 de 17 itens com código
- [x] tipos/grupo SINDICO, Market, entradas + teste, LoginGateway, validateAccess + teste,
  useAuthSync, App.tsx (link e login), serviço, painéis exportados, PortalKit, casca
  `components/sindico/*`, utils (mandato, situação da cota, acesso) + testes, Edges,
  convite, card Síndico no admin, menu renomeado.

### F2 — avisos e chamados: 3 de 3 itens com código
- [x] migration; `PainelAvisosDoSindico`/`PainelChamadosDoSindico`; admin vê autor do aviso
  (Comunicação), coluna "Última resposta" (Manutenção › Chamados) e a equipe grava evento
  EQUIPE ao salvar o chamado.

### F3 — aprovação de rateio: 6 de 6 itens com código
- [x] migration; `utils/aprovacaoRateio` + teste; serviço de rateio; FinanceiroTab (coluna
  Síndico, Fechar desligado com motivo); Ficha (interruptor da exigência + regra única de
  mandato); `PainelAprovacaoDoSindico` (aprovar só com login).

### Verificação
- [x] Tipos: checador por arquivo, rodada completa com 0 erros (o `tsc` inteiro cai nesta
  máquina — crash do Node, ver memória).
- [x] Playwright (`c:\tmp\pwtest\portal_sindico_prova.cjs`), servidor da frente, payload REAL
  do 010 servido por interceptação, escritas abortadas na rede: 17 de 17 verificações,
  0 erro de JS/console/HTTP. Os prints acharam 2 defeitos, corrigidos: "Sua cota R$ 0,00"
  na prestação de contas do síndico (virou "Total rateado") e a mesma pessoa repetida por
  papel na aba Unidades.
- [x] Tela de admin no navegador (21/10, usuário de leitura — membro no 010, admin no 016;
  escritas abortadas na rede, 0 gravadas): `c:\tmp\pwtest\admin_sindico_prova.cjs`, 16 de 16,
  0 erro de JS/HTTP. Card Síndico do 010 com o síndico; "Copiar link" desligado para membro
  com o motivo; "Ver como o síndico" abre a prévia com a RPC real; 016 sem síndico →
  "Definir na Ficha" leva à Ficha; interruptor da exigência na Ficha, desligado.
  **Defeito achado no print e corrigido:** a coluna "Síndico" (190px) empurrava "Ações"
  para fora da tela no Financeiro. Agora ela só aparece quando o condomínio exige a
  aprovação ou algum rateio já tem decisão (`mostrarSindico`), com rótulo curto
  (Aguardando/Aprovado/Devolvido/Desatualizada, completo no `title`) e um jogo de larguras
  próprio. Medido nos dois cenários (`medir_financeiro_sindico.cjs`, decisão simulada na
  resposta da leitura): "Ações" cabe, 1282 de 1282. Perda aceita só com a coluna visível: o
  ícone de ordenação de "Diferença" não cabe (a ordenação pelo clique continua).
- [ ] Caminho feliz com credencial real (o USUÁRIO vai testar, combinado em 21/10): gerar link e convite do síndico do 010, entrar
  por e-mail, publicar aviso, responder chamado, aprovar. Grava em produção — combinar
  com o usuário antes.
- [x] Suíte inteira (21/10): 10.596 testes = 10.562 passaram + 0 falharam + 34 pendentes, exit 0.
- [x] Push em `main`: commit `c30c1b5`, provado de fora com `conferir-producao.sh` (bundle carimbado c30c1b5, texto "Portal do Síndico" servido) em 21/10/2026.

Fato medido em 20/10/2026, antes de começar: `fn_condominio_payload_for_client`
no banco é idêntica ao arquivo `aplicar_20271012000020` (diff vazio do
`pg_get_functiondef`); só o `010` tem síndico cadastrado, sem datas de mandato
(caso "início e fim vazios = vigente").

## Continuação (21/10/2026)

O pedido seguinte — o síndico como OPERADOR do sistema (organização própria por
condomínio) — está em `docs/planos/2026-10-21-sindico-operador-org-condominio.md`.
