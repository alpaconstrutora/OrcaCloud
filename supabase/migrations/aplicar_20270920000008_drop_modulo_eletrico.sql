-- ============================================================================
-- AS 11 TABELAS DO MÓDULO ELÉTRICO SAEM DO BANCO
-- ============================================================================
--
-- O módulo de Projetos Elétricos foi removido do código em 08/09/2026 — 5.812
-- linhas —, depois de o kernel da Planta Inteligente ganhar `Quadro`, `Circuito`
-- e o quadro de cargas derivado (0.19.0). A ordem era o ponto: construir
-- primeiro transformou "apagar e perder" em "apagar e não perder".
--
-- As tabelas ficaram para trás naquele dia, e de propósito: apagar código é
-- reversível por git, `DROP TABLE` não é. Ficou como decisão pendente, e é ela
-- que este arquivo executa — a pedido explícito, em 09/09/2026.
--
-- ─── ⚠️ O QUE FOI MEDIDO ANTES, E NÃO SUPOSTO ───────────────────────────────
--
-- Em 09/09/2026, no banco de produção:
--
-- | o que se procurou | achado |
-- |---|---|
-- | views (comuns ou materializadas) citando as tabelas | **nenhuma** |
-- | funções cujo corpo as cita | **nenhuma** |
-- | FK de tabela FORA do conjunto apontando para dentro | **nenhuma** |
-- | tipos enum ou sequences próprios do módulo | **nenhum** |
-- | referências no código (`.ts`/`.tsx`) | **nenhuma** |
-- | triggers | 3, todos NAS PRÓPRIAS tabelas |
--
-- Os 3 triggers usam funções COMPARTILHADAS (`handle_updated_at`,
-- `set_updated_at`), que continuam servindo o resto do sistema. Eles somem com
-- as tabelas; as funções NÃO são tocadas.
--
-- ⚠️ E as 17 linhas de dado estão gravadas em
-- `docs/planos/2026-09-09-dump-tabelas-eletricas.json`, íntegras, antes deste
-- arquivo rodar. Não é backup — é registro: o conteúdo era rascunho de teclado
-- (dois circuitos, um chamado `dfdfdf`; oito pontos sem potência e sem
-- circuito; disjuntor e seção NULL), e apagá-lo sem deixar o que era apagado
-- tornaria a decisão inauditável depois.
--
-- ─── ⚠️ POR QUE UM SÓ `DROP TABLE`, E POR QUE SEM `CASCADE` ──────────────────
--
-- As onze numa instrução só porque elas se referenciam entre si: o PostgreSQL
-- resolve as FKs internas quando o conjunto inteiro cai junto, e dropar uma a
-- uma exigiria acertar a ordem topológica à mão, sem ganho nenhum.
--
-- E **sem `CASCADE`**, que é a trava desta migration. A medição acima diz que
-- nada de fora depende delas; se a medição estiver errada, `CASCADE` derrubaria
-- em silêncio o objeto que eu não vi — uma view de relatório, uma FK criada
-- fora do versionamento —, e é exatamente esse o erro que não se desfaz.
-- Sem ele, o `DROP` ABORTA inteiro e reclama do dependente pelo nome.
-- Falhar aqui é o comportamento desejado.
-- ============================================================================

SET lock_timeout = '5s';

DROP TABLE IF EXISTS
  public.opura_electrical_takeoffs,
  public.opura_electrical_conduits,
  public.opura_electrical_points,
  public.opura_electrical_elements,
  public.opura_electrical_circuits,
  public.opura_electrical_boards,
  public.opura_electrical_walls,
  public.opura_electrical_rooms,
  public.opura_electrical_plans,
  public.opura_electrical_versions,
  public.opura_electrical_projects;
