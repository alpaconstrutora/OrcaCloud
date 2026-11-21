# ÒPURA CEO — ajustes das 6 perguntas de produto (18/11)

## Pedido original

As 6 perguntas de produto ficaram em aberto no fim de `docs/planos/2026-11-17-opura-ceo.md`, na seção "Para o usuário decidir". Resposta do usuário em 18/11, literal:

> 1. Visibilidade: manter
> 2. Contagem dupla: contar uma vez só
> 3. Quem saiu da organização: mudar. Quem sai não deve continuar lendo decisões da diretoria.
> 4. Superadmin: manter. Segue a regra do app
> 5. Empresa ou obra escolhida no topo:  manter, com um aviso "mostrando a organização inteira"
> 6. Grupo que muda de faixa ou de responsável: grupo continua o mesmo, só muda a faixa ou o responsável

Como as alternativas tinham sido apresentadas:
- **2:** contar uma vez só, em "aprovação parada" (a causa), com a marca "já venceu".
- **6:** o grupo continua o mesmo; muda só a faixa ou o responsável, e o histórico de cobrança segue junto.

Os pontos 1 e 4 ficam como estão, sem mudança.

## Investigação (banco, 18/11)

- **Contagem dupla:** 14 contas a pagar estão "Vencido" e também PENDENTE na fila de aprovação, com `q_entity = 'transaction'` e `q_id = vw_payables.id`. Essas contam hoje em "conta vencida" e em "aprovação parada".
- **Quem saiu:**
  - a RLS de `diretoria_determinacoes` e `diretoria_determinacao_atualizacoes` libera o responsável só por `responsavel_user_id = auth.uid()`, sem conferir se ainda é membro;
  - a tarefa que a determinação ou a cobrança cria (`source_module = 'diretoria'`) é lida por `tasks_select` (`user_id = auth.uid()`), também sem conferir a org;
  - quem lê `tasks` são só a RLS e functions INVOKER (`fn_central_meu_dia`). As do link do celular são DEFINER, mas o link é revogado ao sair da org (`trg_org_members_revoga_link_celular`);
  - gravar exige a permissão da Diretoria em todas as RPCs, então o problema é só de leitura.
- **Chave do grupo:** hoje é `md5(tipo|org|conta id|conta|responsáveis|origem|gravidade)`. Ela serve para:
  - o "cobrado em" (`diretoria_cobrancas.excecao_chave`);
  - o `source_ref.id` da tarefa de cobrança (`uq_tasks_source_open` evita duplicata aberta);
  - o vínculo da determinação (`excecao_chave`);
  - a `key` do React.

  O "É barulho" silencia por **tipo**, não por chave. Em produção há 0 cobranças e 0 determinações gravadas, então mudar a chave não perde histórico.
- **Empresa e obra no topo:**
  - `useOrgContext` herda a org da empresa (`activeEmpresaId`);
  - a obra (`projectId`) não entra no contexto. Ela sobrevive à troca de org e o topo mostra o "sair da obra" quando há uma.

## Decisões de execução (minhas)

- **6, sem mudar a tela:** cada grupo ganha `familia = md5(tipo|org|conta id|conta)`, sem responsáveis e sem gravidade.
  - O que passa a usar a família: cobrança (`p_chave`), "cobrado em", vínculo da determinação e a tarefa de cobrança. Cobrar de novo a mesma família, com a tarefa aberta, devolve "já aberta".
  - A `chave` continua única por grupo (key do React). A Fila segue separada por gravidade.
  - Custo se errado: o "cobrado em" aparece também no grupo da outra faixa da mesma família. É o "histórico segue junto" pedido.
- **2:** a função calcula "aprovação parada" ANTES de "conta vencida" e tira desta os ids que estão naquela (entidade `transaction`).
  - Se o bloco da aprovação cair, a conta volta a contar em "conta vencida": perde-se a deduplicação, não o item.
  - A ordem dos grupos no jsonb continua a mesma.
- **2, a marca:** na Fila, o item de aprovação parada já vencido mostra "já venceu há N dias". As regras dos dois tipos passam a dizer onde a conta conta.
- **3:**
  - as policies de SELECT das duas tabelas passam a exigir, no ramo do responsável, `organization_id IN (SELECT minhas_orgs_membro())`;
  - em `tasks`, entra uma policy **RESTRICTIVE** de SELECT: tarefa com `source_module = 'diretoria'` só para membro da org dela. As outras tarefas não mudam.
  - Custo: um filtro por conjunto a mais na leitura de tarefas (initPlan, padrão #382).
- **5:** aviso no topo da Diretoria quando houver empresa (`activeEmpresaId`) ou obra (`projectId`) escolhida. O texto diz "Mostrando a organização inteira" e o nome da empresa ou obra.

## Plano

1. **Prova SQL** (RED): em `scripts/teste-diretoria-ceo.sql`:
   - contas vencidas = Contas a pagar − as que estão em aprovação parada;
   - a família não muda ao cadastrar o responsável da área (a chave muda);
   - a família é a mesma nas faixas de um tipo/org;
   - quem saiu da org não lê a determinação, as atualizações nem a tarefa da diretoria, e continua lendo a tarefa comum.
2. **Migration** `aplicar_20271118980000_diretoria_ajustes.sql`: `_diretoria_agrupar` (família), `_diretoria_excecoes` (dedupe), policies. Ensaio GREEN, sabotagens, aplicar e rodar a prova no banco.
3. **App** (RED → GREEN):
   - `familia` no tipo;
   - cobrar, "cobrado em" e determinação pela família;
   - `quandoDoItem`;
   - regras do catálogo;
   - aviso de empresa/obra.
4. **Conferência:** tsc, suíte da Diretoria, `check-ui-standard`, `orgContextGuard`, build. Depois PR, CI, merge, `conferir-producao` e fechar a frente.

## Andamento

- 18/11: frente `opura-ceo-ajustes` criada; investigação e plano gravados.
- 18/11 — **Tarefas 1–2 ✅ (banco).**
  - A prova `scripts/teste-diretoria-ceo.sql`, ainda sem a migration, deu RED: painel 694 × esperado 681 (13 contas da org A estão em aprovação parada).
  - Ensaio com a migration: TUDO OK.
  - **4 sabotagens pegas:**
    1. sem a deduplicação;
    2. família com a gravidade;
    3. policy da determinação sem conferir membro;
    4. regra restritiva de tarefas desligada.
  - **Uma 5ª passou, e está certo:** tirei a conferência de membro só das atualizações, e mesmo assim nada vaza. A policy delas acha a determinação lendo `diretoria_determinacoes`, que já passa pela RLS da tabela. A condição repetida é só uma segunda camada.
  - Migration aplicada. As duas provas da Diretoria deram TUDO OK no banco.
  - A prova do resumo comparava a foto com Contas a pagar cru. Passou a comparar com o próprio painel, que é o que a conferência diz: a foto já usa a mesma função.
  - **Custo da regra nova em `tasks`:** leitura das tarefas abertas do usuário com mais tarefas, 5 × 5 rodadas intercaladas. Deu ~1,1 ms com a regra e ~2,1 ms sem (o 6,5 ms de uma rodada sem a regra foi a primeira leitura, fria): nada mensurável.
- 18/11 — **Tarefa 3 ✅ (app).** `DiretoriaModule.test.tsx` deu RED em 7 testes, todos pelo motivo esperado, e depois GREEN (30/30). A suíte da Diretoria inteira passa (90).
- 18/11 — **Conferência.**
  - tsc com 0 erros e `vite build` OK;
  - `check-ui-standard` com 0 nos 3 `.tsx`;
  - travas que varrem migrations: 24 de 25 passam. A que cai é `espelhoDoInvestidor`, a falha conhecida de CRLF no Windows.
  - Navegador não conferido. O aviso usa o mesmo estilo da linha de permissão logo acima, e a marca "já venceu" é só texto; os dois estão cobertos por teste.
- 18/11 — **No ar (tarefa 4 ✅).** PR #575, com merge `8a240c3`.
  - CI do PR e CI do `main` em `8a240c3`: `completed/success`.
  - `conferir-producao` OK: o domínio serve `8a240c3`, com "Mostrando a organização inteira" e "já venceu" no bundle.
  - A function `diretoria-resumo-semanal` não precisou ser publicada de novo: ela não usa os textos alterados, e as contagens vêm do banco.
  - Frente `opura-ceo-ajustes` fechada.
