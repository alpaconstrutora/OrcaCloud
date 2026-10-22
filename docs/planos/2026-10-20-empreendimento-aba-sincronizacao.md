# Empreendimento › aba Sincronização — correção dos 6 problemas da análise

## Pedido original
> analise aba sincronizacao
>
> Sessão: 936c9c38-35ec-4388-92e4-429c1510329c · 20/10/2026

### Pedido posterior (22/10/2026, mesma sessão)
Depois da análise, que listou 6 problemas e perguntou "Quer que eu corrija todos, ou só de 1 a 3?":
> corrija todos

## Os 6 problemas (da análise, lidos em `origin/main` de 20/10)
1. **Conflito nunca sai da contagem.** O ensaio soma os conflitos em "a atualizar". "Trazer" manda o
   conflito à Curadoria sem gravar, então na próxima abertura ele é contado de novo — e um conflito
   rejeitado na Curadoria fica contado para sempre. A Arquitetura nunca chega a "Alinhado".
2. **Sync sem retorno.** Nenhuma mensagem depois de "Trazer"/"Enviar"; o contador da aba Curadoria e o
   empreendimento do detalhe não recarregam.
3. **"Última sync" no card errado.** O card da Viabilidade mostra `last_synced_at`, que só o sync da
   Planta grava (Garden Cambuhy mostrava 17/07/2026, do sync Imovib→Emp removido em 19/10). O "Enviar ao
   estudo" não entra no Histórico.
4. **Ações repetidas e rótulos que confundem.** "Trazer" no diagrama e de novo no card de baixo; a
   ligação se chama "Viabilidade ↔ Empreendimento" mas só envia; "Abrir a planta" parece envio.
5. **Massa × loteamento sem estudo.** Sem massa nem lotes publicados, o diagrama mostra "Trazer da
   massa" desligado e nenhum botão de loteamento.
6. **Tipografia.** `text-[9px]`/`text-[10px]` com `font-black` fora dos rótulos de diagrama (§8.1),
   botões `rounded-[8px]`.

## Decisões tomadas
| Data | Pergunta | Resposta |
|---|---|---|
| 22/10/2026 | O que conta como divergência a trazer? | Só o que **não** tem proposta na Curadoria, ou cuja proposta foi aplicada/ficou obsoleta. Pendente vira "aguardando a Curadoria" (à parte); rejeitada vira "mantido por decisão da Curadoria" e não conta. A identidade é a mesma do upsert (`proposal_hash` + origem/entidade/campo). |
| 22/10/2026 | Proposta aplicada ou obsoleta com o mesmo valor proposto volta a divergir — o que acontece? | Hoje o upsert `ignoreDuplicates` a ignora: o conflito nunca mais chega à Curadoria (e, com o item 1, ficaria "a trazer" para sempre). Passa a ser **reaberta** como pendente, com o valor atual de agora. Rejeitada continua rejeitada (é a decisão do usuário). O evento da decisão antiga continua no Histórico. |
| 22/10/2026 | De onde vem a data de cada card? | Do Histórico (`empreendimento_audit_logs`), um evento por envio: Arquitetura = último `sync` de `sync_blueprint`/`sync_massa`; Viabilidade = último `publish` de `sync_imovib` (novo, gravado pelo "Enviar ao estudo"). `last_synced_at` deixa de aparecer na aba. Os valores já são aceitos pelos CHECK do banco (conferido em produção): **sem migration**. |
| 22/10/2026 | Onde ficam os botões? | Só no diagrama (como o topo do arquivo já dizia). Os cards de baixo ficam com os números. |
| 22/10/2026 | Ícone das ligações | Mão única: seta no sentido do dado (Arquitetura ↓ Empreendimento; Empreendimento ← para a Viabilidade). "Abrir na planta" vira link (ícone de link externo). |

## Plano
| Arquivo | O que muda | Como sei que terminou |
|---|---|---|
| `services/empreendimentoProposalService.ts` | `classificarConflitos()` (novos/pendentes/rejeitados); `materializeConflicts` reabre aplicada/obsoleta | `__tests__/sincronizacaoCuradoria.test.ts` |
| `services/sync/relatorio.ts` (novo) | relatório único da massa e do loteamento, com `conflitosNaCuradoria`, `conflitosRejeitados`, `conflitosEnviados` | mesmo teste + `syncPlantaInteligenteTravas.test.ts` verde |
| `services/massaEmpreendimentoSync.ts`, `services/blueprintEmpreendimentoSync.ts` | ensaio e envio classificam os conflitos antes de contar | mesmo teste |
| `types/empreendimento.ts` | campos novos em `ArquiteturaSyncReport` | typecheck |
| `services/sync/writeBackImovib.ts` | "Enviar ao estudo" grava evento `publish`/`sync_imovib` no Histórico | `writeBackImovib.test.ts` com caso novo |
| `components/empreendimento/SyncCenterTab.tsx` | itens 1–6 na tela + mensagem de resultado + `onChanged` | `SyncCenterTabArquitetura.test.tsx` com casos novos |
| `components/empreendimento/EmpreendimentoDetail.tsx` | passa `onChanged` (recarrega contador da Curadoria e o empreendimento) | typecheck + teste de tela |

### Decisão tomada durante a implementação (22/10/2026)
"A atualizar" passou a contar **só o que o envio grava** (`fills`). Conflito nunca é gravado (vira
proposta), então ganhou contagem própria em campos: `conflitosNovos` (este envio manda à Curadoria),
`conflitosNaCuradoria`, `conflitosRejeitados`. O botão "Trazer" liga com qualquer trabalho a fazer
(criar, atualizar ou conflito novo) e o confirmar diz quantos campos vão para a Curadoria.

## Estado
- [x] serviços (itens 1 e 3) + testes — `classificarConflitos`, reabertura em `materializeConflicts`,
      `sync/relatorio.ts` único, evento `publish`/`sync_imovib` no envio ao estudo
- [x] tela (itens 1–6) + testes — `SyncCenterTab.tsx` reescrito na mesma estrutura; `EmpreendimentoDetail`
      passa `onChanged` (sem bumpar `refreshKey`, que remontaria a aba e apagaria a mensagem)
- [x] `check-ui-standard.sh` (SyncCenterTab, EmpreendimentoDetail: 0) + `check-org-selector-guard.sh` (0)
- [x] `tsc --noEmit` — rc=0, 0 erros (1ª tentativa)
- [x] testes da área: 4 arquivos, 26/26 (`sincronizacaoCuradoria` 5 novos, `writeBackImovib` 8 com 2 novos,
      `syncPlantaInteligenteTravas` 3, `SyncCenterTabArquitetura` 10 com 6 novos)
- [x] conferência na tela real (22/10/2026) — servidor da frente (porta 3101), login `agente-leitura`, org Garden
      Cambuhy SPE, 011 - Garden Cambuhy › Sincronização; escritas em `/rest/v1/` bloqueadas pelo script.
      Script `c:/tmp/pwtest/sincronizacao-aba-conferir.cjs`; prints `c:/tmp/pwtest/sincronizacao-0*.png`.
      **14/14 portões**, 0 escritas tentadas, 0 erros de JS/console/HTTP.

### Merge com o PR #90 (22/10/2026) — "Trazer o terreno"
Enquanto este PR esperava, o #90 (outra sessão) trouxe à aba um terceiro envio, o **terreno** da Planta
(`services/terrenoEmpreendimentoSync.ts`, campos do próprio empreendimento), com card e botão próprios. Ele
repetia os itens 1, 2 e 4: conflito contado mesmo já na Curadoria, nenhum retorno, botão fora do diagrama.
Resolvido no merge, com as mesmas regras dos outros dois:
| Decisão | Por quê |
|---|---|
| `terrenoEmpreendimentoSync.previewSync` classifica os conflitos (`conflicts` = só os novos; `naCuradoria`, `rejeitados` à parte) | item 1 |
| "Trazer o terreno" no diagrama, ao lado de massa e loteamento; o card fica com os números e a lista de campos | item 4 |
| Sem versão publicada, o botão **aparece desligado com o motivo** (o teste do #90 dizia "não oferece trazer") | item 5 — mesma regra de massa/loteamento; o teste foi ajustado e diz por quê |
| Mensagem do resultado + `onChanged` | item 2 |
Testes: 11 arquivos tocados pelos dois PRs, **93/93** (reporter JSON, conta fecha); `tsc` rc=0; UI 0. Tela real:
**17/17 portões** (+3 do terreno: no diagrama desligado com o motivo, um botão só, card presente).
Não há teste de serviço para a classificação no terreno — é a mesma chamada de `classificarConflitos` da massa e do
loteamento, coberta em `sincronizacaoCuradoria.test.ts`; o teste de tela cobre a exibição.

### Achado na conferência real (22/10/2026) — corrigido no mesmo PR
O Garden Cambuhy ganhou em 21/10 um estudo da Planta ("Garden") com **0 versões publicadas**. A Arquitetura
dizia **"Alinhado"** — não há com o que estar alinhado. Os adaptadores passam a marcar `semVersaoPublicada`
(sinal estruturado; não se procura a frase do aviso), o relatório o repassa, e a tela diz "Nada publicado no
estudo", com os dois "Trazer" desligados pelo motivo "O estudo ainda não tem versão publicada". Testes: +1 na tela
(5b), +1 no relatório — área 28/28; `tsc` rc=0 (2ª tentativa; 1ª segfault do Node 24); `check-ui-standard.sh` 0.
- [x] PR rascunho + CI verde — PR #89; `ci` (typecheck + suíte + build, 23m33s), Vercel e Vercel Preview Comments verdes
- [x] publicação — PR #89 mesclado por squash (3a214876) em 22/10/2026; conferir-producao.sh provou o domínio servindo cad7359 (contém 3a214876) com os 3 textos; frente fechada
