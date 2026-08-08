-- ============================================================================
-- Planta Inteligente — estudo com snapshot publicado não podia ser apagado
-- Plano: docs/planos/2026-08-08-e0-fundacao-blueprint.md
-- Corrige: aplicar_20270905000000_blueprint_kernel_foundation.sql
--
-- ACHADO NA TELA. O editor abriu um estudo chamado "[VERIFICACAO E0 — pode
-- apagar]" que o teste de integração deveria ter removido no afterAll. Ele não
-- foi removido, e o delete falhou em silêncio.
--
-- CAUSA. O trigger de imutabilidade estava em `BEFORE UPDATE OR DELETE`.
-- Apagar um estudo dispara CASCADE até blueprint_snapshots, o trigger levanta
-- exceção e a transação inteira volta atrás. Resultado: qualquer estudo que
-- tenha publicado ao menos uma versão fica IMPOSSÍVEL de excluir, para sempre.
--
-- O erro de raciocínio foi tratar "imutável" e "indelével" como a mesma coisa.
-- O PRD §9.1 pede que uma versão publicada não seja ALTERADA — para que "mesmo
-- hash = mesmo desenho" continue valendo. Não pede que o estudo seja eterno:
-- apagar o estudo inteiro é operação legítima de ciclo de vida, e leva junto o
-- que era dele.
--
-- A proteção contra o cliente apagar um snapshot solto continua de pé, e vem de
-- onde deveria vir: blueprint_snapshots concede apenas SELECT e INSERT a
-- `authenticated`, e não tem policy de DELETE. Já o CASCADE roda como o dono da
-- tabela e não passa por RLS — que é exatamente o comportamento desejado aqui.
--
-- A trilha de auditoria continua bloqueando UPDATE **e** DELETE: ela não tem FK
-- para o estudo justamente para sobreviver a ele. Trilha que some com o objeto
-- observado não é trilha.
--
-- ⚠️ APLICAR À MÃO pelo SQL Editor. Só troca um trigger.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_blueprint_snapshots_immutable ON public.blueprint_snapshots;
CREATE TRIGGER trg_blueprint_snapshots_immutable
    BEFORE UPDATE ON public.blueprint_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.fn_blueprint_block_mutation();

COMMENT ON TABLE public.blueprint_snapshots IS
  'Versão publicada, imutável e endereçável por hash. UPDATE é bloqueado por '
  'trigger; DELETE direto é bloqueado por ausência de policy (só SELECT/INSERT '
  'para authenticated). O CASCADE da exclusão do estudo passa de propósito.';

-- Limpeza do resíduo que o bug deixou: os estudos criados pelo teste de
-- integração e que não puderam ser apagados. Só remove o que tem o marcador,
-- nunca planta de usuário.
DELETE FROM public.blueprint_studies
 WHERE name LIKE '[VERIFICACAO E0%';

-- Conferência: deve devolver 0.
SELECT count(*) AS estudos_de_teste_restantes
  FROM public.blueprint_studies
 WHERE name LIKE '[VERIFICACAO E0%';
