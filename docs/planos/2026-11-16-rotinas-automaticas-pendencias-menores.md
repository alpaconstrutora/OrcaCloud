# Rotinas automáticas — pendências menores da revisão (#513)

## Pedido original

> resolva as Pendências menores

Referência: a lista "Pendências menores" do fechamento do PR #513
(`docs/planos/2026-11-16-rotinas-automaticas-ligar-desligar.md`), oito itens:

1. title de "Falhas em 7 dias" só mostra o erro se a ÚLTIMA execução falhou; com a última
   `running`/`starting` diz "terminou sem erro" (falso);
2. janela de 150 mil runids ≈ 36 dias: mais jobs por minuto ou retenção menor deixam a rotina
   mensal sem "Última execução";
3. a "última execução" pode ser uma linha `starting` com `start_time` NULL → "—" transitório;
4. job sem nome (`jobname` NULL) não liga/desliga;
5. status do pg_cron em inglês no title de "Última execução";
6. `execucoes7d` não usado na tela;
7. falta teste do "Gravando…"; a prova SQL não cobre `p_ativo` NULL; `jobid` aleatório na fixture;
8. aviso (toast) sem animação de entrada.

## Decisões (minhas, pelo pedido; o usuário pode corrigir)

- **1 + 6:** a RPC passa a devolver o **último erro** da janela (`ultimo_erro_em`,
  `ultimo_erro_mensagem`), independente de como terminou a última execução. Coluna "Falhas":
  - 0 execuções na semana → "Sem execução";
  - 0 falhas → "Nenhuma", title "N execuções nos últimos 7 dias, nenhuma falhou";
  - com falhas → "3 falhas", title "3 de N execuções nos últimos 7 dias falharam." + "Último erro
    (dd/mm hh:mm): …".
- **2:** a janela passa a ser **por tempo (40 dias)**, sem varrer pela data, que não tem índice.
  - Uma busca binária sobre `runid` (chave primária, ~20 consultas pontuais) acha o primeiro
    `runid` com `start_time` ≥ agora − 40 dias.
  - 40 dias cobrem a rotina mensal com folga, qualquer que seja o volume.
- **3:** `ultima` ignora linhas sem `start_time`. `running`/`starting` aparecem como "rodando".
- **4:** `fn_rotina_automatica_definir(p_jobname, p_ativo, p_jobid DEFAULT NULL)`.
  - Rotina com nome segue endereçada pelo nome, que sobrevive a reagendamento; sem nome, pelo `jobid`.
  - O registro grava `#<jobid>` no lugar do nome.
  - A tela mostra "Rotina sem nome (#N)".
  - Mudar o tipo de retorno exige DROP + CREATE das duas funções; o front publicado hoje
    continua funcionando (colunas a mais são ignoradas; `p_jobid` tem default).
- **5:** `statusDaExecucao()` no catálogo: concluída · falhou · rodando · iniciando · conectando.
- **7:** teste do "Gravando…", prova SQL de `p_ativo` NULL → 22004, `jobid` fixo na fixture.
- **8:** toast com `animate-in slide-in-from-bottom-4 duration-300` (guia §35 — o #517 ligou o
  `tw-animate-css`).

## Plano

- [ ] **1 Banco** — `aplicar_20271116913700_rotinas_automaticas_pendencias.sql`.
  - Prova primeiro em `scripts/teste-rotinas-automaticas.sql`:
    - `p_ativo` NULL → 22004;
    - `ultimo_erro_*` de "Tarefas de pagamento" com `create_task`;
    - nenhuma linha com status e sem início;
    - job sem nome criado na transação, desligado por `p_jobid`, com registro `#id`.
  - Rodar a prova: FALHA. Fazer o ensaio com `montar-ensaio.sh`: TUDO OK.
  - Aplicar com `db query -f` e rodar a prova de novo: TUDO OK. Medir o tempo da listagem.
- [ ] **2 Catálogo** — `statusDaExecucao`; `rotinaMeta(null, jobid)` → "Rotina sem nome (#N)". RED→GREEN.
- [ ] **3 Service** — `ultimoErro`; `jobname: string | null`; `definir(jobname, ativa, jobid?)`
  envia `p_jobid` só sem nome. RED→GREEN.
- [ ] **4 Tela** — itens 1, 3, 4, 5, 6, 7 e 8 na tela, cada um com teste RED→GREEN;
  `check-ui-standard.sh` exit 0.
- [ ] **5 Publicação** — revisão independente, CI verde, merge, `conferir-producao.sh`, fechar frente.

## Estado

- [x] **1 Banco** — migration APLICADA em 16/11.
  - RED antes: `42703 column "ultimo_erro_em" does not exist`.
  - Ensaio e banco aplicado: TUDO OK. Só existe a assinatura `(text, boolean, bigint)`.
  - Listar ~497 ms (era ~420), janela de 40 dias = 161 mil execuções desde 07/10.
  - A prova passou a contar só o registro desta transação: a linha real da conferência do #513 a
    quebrava ("achou 2").
- [x] **2 Catálogo** 19/19 · **3 Service** 6/6 · **4 Tela** 19/19.
  - Cada teste novo RED→GREEN, exceto "Gravando…", que fixa um comportamento que já existia.
  - `tsc` 0 erros (PowerShell, heap 12 GB); `check-ui-standard` exit 0; `animacoesDeEntrada` verde.
- [ ] **5 Publicação**
