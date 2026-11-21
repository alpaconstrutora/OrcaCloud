# CI: testes pesados da planta só quando o PR mexe neles

## Pedido original

> entra sessão disse isso ao responder minha pergunta, pergunta: é normal a CI levar 45 minutos?
>
> Sim, para este repositório é normal. Os últimos PRs levaram entre 25 e 47 minutos, e a maioria ficou entre 30 e 45. Até um PR só de documentação, que não mexe em código, levou 45 minutos (#598).
> A causa mais provável é o tamanho da suíte de testes: hoje são cerca de 1.200 testes em mais de 130 arquivos, e o CI roda tudo a cada push. Não medi em qual etapa o tempo se concentra. Se quiser reduzir, dá para investigar o workflow do GitHub Actions e ver se algum passo pode rodar só nos arquivos afetados.
>
> Investigue o workflow do GitHub Actions

Pedidos seguintes, na mesma sessão (20/11/2026):

> pelo o que eu entendi esse o problema vem do predio automatico, mas qualquer sessao de outro assunto acaba envolvendo o predio automatico?

> pelo o que eu entendi, se eu pedir para alterar uma palavra de um outro módulo qualquer que levaria alguns minutos, aciona o planta inteligente que devido ao tamanho do modulo acaba demorando 45 alens de gastar tokens se nenhuma necessidade. E isso? se for como isso foi implementado desta maneira hiper inapropriada?

> sim, implemente

Depois de a resposta apontar que PR da planta continuava lento e que o RL já usava 12 dos 20 min de limite ("Resolver esses dois exige dividir o teste do marco, um arquivo por prédio"):

> podde fazer

Sessão: a3f0dd77-d1d3-4a91-9602-d2e35e3b7cf5 · 20/11/2026.

## O que foi medido (run 44824090636, PR #599, 44 min)

| Etapa | Tempo |
|---|---|
| `npm ci` | 13 s |
| `tsc` | 3 min |
| Sinks de XSS | 5 s |
| `vitest run` | **39 min** |
| `vite build` | 1,5 min |

- A suíte tem **1.543 arquivos / 15.301 testes** (não "130 arquivos / 1.200 testes", como a resposta anterior disse sem medir).
- 12 arquivos, os que geram a casa e o prédio inteiros, somam **~80 dos ~91 min de CPU** de teste. O pior é `predioAutomaticoMarco.test.ts`: 4 testes, **24,6 min** (só o RL, 12 min). Ele começou aos 14 min e terminou 5 s antes do fim, então era o caminho crítico.
- O PR #598 (um `.md`) rodou os mesmos pesados: 25,1 + 21,7 + 14,8 min. Todo PR pagava esse tempo, de qualquer assunto.
- Média diária da CI em `main`: 25 a 27 min até 10/11, 36 a 39 min em 18 e 19/11. O aumento acompanha as fases do prédio automático (PA0 em 12/11).
- Hipótese descartada por medição: as 5 chamadas de `conflitosDoModelo` do marco levam < 0,1 s cada. O tempo é da geração do prédio (`planejarPredioDoPedido`).

## Decisões

| Data | Pergunta | Resposta |
|---|---|---|
| 20/11 | Implementar a separação (leves sempre; pesados no PR só se afetados; sempre no push em `main`)? | "sim, implemente" |
| 20/11 | Dividir o marco dos prédios, um arquivo por prédio? | "podde fazer" |

## Plano

1. **`vite.config.ts`**: `TESTES_PESADOS` (12 arquivos) e `test.projects` `leves`/`pesados`. `forceRerunTriggers` passa a incluir `package-lock.json` e `__tests__/fixtures/**`, que os marcos leem por `readFileSync`, fora do grafo de imports.
   *Pronto quando:* `vitest list --project leves` + `--project pesados` = os mesmos 1.543 arquivos de antes, sem repetição. ✅ 1.531 + 12, diff vazio.
2. **`.github/workflows/ci.yml`**: três jobs em paralelo: `tsc, travas e build`; `testes (leves)` (inteiro, com teto de tempo); `testes (pesados)` (PR: `--changed <base>`; push em `main`: todos).
   *Pronto quando:* no PR desta mudança os três jobs rodam, e o de pesados roda os 12, porque o PR toca `vite.config.ts`.
   ❌ **20/11, 1ª CI do #603 (run 44837973877): verde, mas os pesados NÃO rodaram** ("No test files found", 0,5 min). O padrão do próprio Vitest para o config, `**/{vitest,vite}.config.*/**`, não casa com `vite.config.ts` (picomatch: o `/**` no fim exige pasta). Conferido padrão a padrão: `**/package.json/**` casava por sorte, `**/package-lock.json/**` e o das fixtures também; só o do config falhava. Corrigido: padrões de arquivo sem `/**`, e `.github/workflows/**` incluído (PR que muda a CI roda tudo). Com isso, a seleção contra a base do PR escolhe os 15.
3. **`scripts/check-tempo-dos-testes.mjs`**: reprova arquivo de `leves` acima de 60 s, com a instrução de movê-lo para `TESTES_PESADOS`. É o dono do tempo da CI que faltava.
   *Pronto quando:* exit 0 abaixo do teto, exit 1 com a mensagem acima dele. ✅ provado local com teto artificial.
4. **Marco dos prédios dividido** (pedido "podde fazer"): `predioAutomaticoMarco.test.ts` vira `predioAutomaticoMarcoComum.ts` (casos, conta e conferências, sem mudar uma linha do corpo do teste) + `predioAutomaticoMarcoR4/R8/R12/RL.test.ts`. A fixture vira `fixtures/predioAutomaticoMarco/<prédio>.json`, porque os 4 arquivos regravam em paralelo com `GRAVAR_MARCO_PREDIO=1` e, num JSON único, um sobrescreveria o outro.
   *Pronto quando:* fixtures novas = a antiga, chave a chave; corpo do teste idêntico; os 4 passam; regravar não muda a fixture. ✅ tudo local (os 4 juntos em 2 min 45 s nesta máquina).
5. **Pesados em matriz** (`ci.yml`): o job `pesados-quais` escolhe os arquivos (`vitest list --changed`, ou todos no push em `main`) e o job `pesado (<arquivo>)` roda cada um num runner próprio. Num runner só, os pesados disputavam 4 vCPUs. Sem nenhum escolhido, a matriz não roda.
   *Pronto quando:* na CI deste PR aparecem os 15 jobs `pesado (...)` verdes, com o tempo do mais lento registrado aqui.
   ❌ **20/11, 2ª CI do #603 (run 44855045228): `pesados-quais` escolheu "0 arquivo(s)", matriz pulada, verde.** Duas armadilhas somadas: (a) `fetch-depth: ${{ pull_request && 0 || 1 }}` dá **1**, porque 0 é falso nas expressões do Actions (log: `--depth=1`), e assim a base do PR não existe no clone; (b) o Vitest roda o `git diff base...HEAD` sem olhar o código de saída (`resolveFilesWithGitCommand`), então o diff que falha vira "nada mudou". Corrigido: `fetch-depth: 0` fixo, e o passo roda o mesmo `git diff` antes, explícito, que com `-eo pipefail` derruba o job (provado local: base inexistente, exit 128).

## Estado

- [x] 1 — seleção conferida local: nada mudou → 0 pesados; `utils/imovibMotor.ts` → 0; `utils/predioAutomatico/esgoto.ts` → os 8 que o importam; uma fixture → os 12; um teste pesado → só ele.
- [x] 3 — trava conferida local (os dois caminhos).
- [x] 2 — CI do PR com os três jobs verdes, com o tempo de cada um registrado aqui. 1ª CI: leves 10,5 min, tsc/travas/build 4,8 min, pesados 0,5 min **sem rodar nada** (defeito do item 2, corrigido).
- [x] 4 — marco dividido, conferido local.
- [x] 5 — matriz verde na CI do PR. 2ª CI: leves 9,1 min, tsc/travas/build 4,8 min, matriz **pulada por engano** (0 escolhidos, ver item 5).
- **3ª CI do #603 (run 44856085242, commit 42862a084), a que valeu: 15,5 min no total, contra 44 antes.** `pesados-quais` escolheu os 15 (o PR toca `vite.config.ts` e `ci.yml`), e a matriz rodou 15 jobs com testes de verdade (casa automática 137 testes, cada marco 1). Tempos: casa automática 15 min (o caminho crítico agora), leves 10,2 min (teto: nenhum arquivo acima de 60 s), `predioAutomatico` 7,3, marco RL 6,9 (era 12 dividindo CPU; limite de 20), R12 5,5, BlueprintEditor 4,5, tsc/travas/build 3,2; os demais de 0,7 a 2,3 min. Mesclado como 981f5ac07.
- [ ] Prova real: o primeiro PR fora da planta depois do merge, com o job de pesados escolhendo 0 arquivos e o tempo total registrado aqui. É o PR desta anotação (só `docs/`).

## O que NÃO muda (limites)

- ~~PR que mexe na planta continua lento~~ → itens 4 e 5 (20/11). Quanto cai, só a CI diz. O mais lento passa a ser `blueprintCasaAutomatica.test.ts` (137 testes num arquivo; 20 min dividindo CPU com os outros). Dividi-lo é outro item, não pedido.
- **Limite de 20 min por prédio (`1_200_000`):** o RL levava 12 min disputando CPU; sozinho num runner, 6,9 min (job inteiro, com `npm ci`). O limite continua o mesmo.
- `npx vitest run` local continua rodando tudo, e `publicar-producao.sh` também.

## Verificação

- `npx vitest list --filesOnly --project pesados --changed HEAD` depois de alterar um arquivo mostra quais pesados aquele arquivo aciona.
- Na CI: num PR fora da planta, `pesados-quais` lista "0 arquivo(s)" e os jobs `pesado (...)` aparecem como pulados.
- ⚠️ "Verde" no job de pesados não prova que rodou: a 1ª CI deste PR foi verde sem rodar nada. Confira a lista do `pesados-quais`.
