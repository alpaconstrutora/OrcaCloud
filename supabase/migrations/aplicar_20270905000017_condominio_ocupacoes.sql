-- ============================================================================
-- ÒPURA Pós-Entrega — F0: Ocupações da unidade
-- Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md (F0)
--
-- PROPRIEDADE ≠ OCUPAÇÃO ≠ RESPONSABILIDADE FINANCEIRA. São três relações
-- diferentes entre uma pessoa e uma unidade, e o sistema hoje não tem NENHUMA
-- delas: grep por `morador|inquilino|resident` só retorna RH, e `occupanc` só
-- retorna taxa de ocupação/vacância. O que existe é o eixo comercial
-- (unidade → commercial_properties → commercial_deals → clients), que responde
-- "quem COMPROU" — nunca "quem MORA" nem "quem PAGA".
--
-- Um proprietário pode não morar. Um morador pode não pagar. Um inquilino paga
-- aluguel ao proprietário mas condomínio ao condomínio. Achatar isso num único
-- campo é o erro que obriga a migrar dado depois, e por isso são LINHAS
-- distintas com papel próprio, não colunas de uma linha só.
--
-- A pessoa é `clients` (decisão do usuário, 13/08/2026): herda a dedup por
-- CPF/CNPJ que já existe (20270716000002_document_duplicate_lookup) e dá âncora
-- de login para o Portal do Condômino (F3). Não se cria um segundo cadastro de
-- pessoa no sistema.
--
-- NÃO há tabela nova de bloco/unidade. A árvore é a que já existe
-- (empreendimentos → empreendimento_towers → empreendimento_units); condomínio
-- é um ESTADO do empreendimento (EM_OPERACAO), não uma entidade irmã. Criar
-- árvore paralela seria a quinta hierarquia concorrente do repositório.
--
-- ⚠️ APLICAR À MÃO, UM BLOCO POR VEZ. O SQL Editor roda o script inteiro como
--    UMA transação: um erro no meio desfaz os blocos anteriores.
-- ============================================================================

-- ═══ BLOCO 1 — o estado EM_OPERACAO ═════════════════════════════════════════
-- O empreendimento entregue não morre: ele passa a ser operado. ENCERRADO é
-- outra coisa (incorporação encerrada), então EM_OPERACAO entra como estado
-- próprio, depois de ENTREGUE.
SET lock_timeout = '5s';

ALTER TABLE public.empreendimentos
  DROP CONSTRAINT IF EXISTS empreendimentos_status_check;

ALTER TABLE public.empreendimentos
  ADD CONSTRAINT empreendimentos_status_check
  CHECK (status IN ('PLANEJAMENTO','LANCAMENTO','EM_OBRAS','ENTREGUE','EM_OPERACAO','ENCERRADO'));

-- ═══ BLOCO 2 — dados do condomínio no próprio empreendimento ════════════════
-- O condomínio tem CNPJ PRÓPRIO, diferente do CNPJ da SPE que incorporou. Os
-- dois convivem na mesma linha porque são o mesmo edifício em fases diferentes
-- da vida — e porque separá-los em tabela nova recriaria a árvore paralela que
-- este plano existe para evitar.
SET lock_timeout = '5s';

ALTER TABLE public.empreendimentos
  ADD COLUMN IF NOT EXISTS condominio_cnpj            TEXT,
  ADD COLUMN IF NOT EXISTS condominio_razao_social    TEXT,
  ADD COLUMN IF NOT EXISTS condominio_instalado_em    DATE,
  ADD COLUMN IF NOT EXISTS sindico_client_id          UUID,
  ADD COLUMN IF NOT EXISTS sindico_mandato_inicio     DATE,
  ADD COLUMN IF NOT EXISTS sindico_mandato_fim        DATE;

COMMENT ON COLUMN public.empreendimentos.condominio_cnpj IS
  'CNPJ do CONDOMÍNIO, que não é o da SPE incorporadora (spe_cnpj). Quando o '
  'financeiro condominial entrar (pós-portão), é por aqui que a segregação de '
  'caixa se ancora — dinheiro de condomínio não pode encostar em razão de '
  'construtora.';

COMMENT ON COLUMN public.empreendimentos.sindico_mandato_fim IS
  'Mandato tem fim, e síndico vencido não representa o condomínio. Data aqui '
  'para o alerta existir; a troca de síndico é evento, não edição silenciosa.';

-- ═══ BLOCO 3 — a tabela ═════════════════════════════════════════════════════
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.unit_occupancies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id         UUID NOT NULL,
    client_id       UUID NOT NULL,

    -- Denormalizado porque `empreendimento_units` NÃO tem organization_id: a org
    -- só existe na raiz (empreendimentos), a dois hops daqui. Sem esta coluna,
    -- toda leitura filtrada por organização vira join duplo. O trigger do BLOCO 6
    -- é o que impede a denormalização de mentir.
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    role            TEXT NOT NULL CHECK (role IN (
                        'PROPRIETARIO',           -- é dono; pode não morar
                        'INQUILINO',              -- ocupa por locação
                        'MORADOR',                -- mora sem ser dono nem locatário
                        'RESPONSAVEL_FINANCEIRO'  -- recebe a cobrança do condomínio
                    )),

    started_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    -- NULO = vigente. É esta coluna que faz a ocupação ser HISTÓRICO e não
    -- cadastro: quando o inquilino sai, encerra-se a linha, não se apaga. Sem
    -- isso não há como responder "quem morava aqui em março".
    ended_at        DATE,

    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unit_occupancies_periodo_valido
        CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- ═══ BLOCO 4 — as chaves estrangeiras, sozinhas ═════════════════════════════
-- Separadas da criação da tabela: FK exige ShareRowExclusiveLock na tabela
-- REFERENCIADA, e tanto `empreendimento_units` quanto `clients` ficam quentes
-- com o app aberto. Mesma família do deadlock de aplicar_20270905000013.
-- Se der 40P01, o lock_timeout aborta sem estragar nada — repetir com o app fechado.
SET lock_timeout = '5s';

ALTER TABLE public.unit_occupancies
  DROP CONSTRAINT IF EXISTS unit_occupancies_unit_fk;
ALTER TABLE public.unit_occupancies
  ADD CONSTRAINT unit_occupancies_unit_fk
  FOREIGN KEY (unit_id) REFERENCES public.empreendimento_units(id) ON DELETE CASCADE;

ALTER TABLE public.unit_occupancies
  DROP CONSTRAINT IF EXISTS unit_occupancies_client_fk;
ALTER TABLE public.unit_occupancies
  ADD CONSTRAINT unit_occupancies_client_fk
  FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;

-- ═══ BLOCO 5 — índices, invariantes e comentários ═══════════════════════════
SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS idx_unit_occupancies_unit
    ON public.unit_occupancies(unit_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_unit_occupancies_client
    ON public.unit_occupancies(client_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_unit_occupancies_org
    ON public.unit_occupancies(organization_id);

-- A mesma pessoa não ocupa a mesma unidade duas vezes no mesmo papel ao mesmo
-- tempo. Histórico encerrado (ended_at preenchido) fica de fora: alguém pode
-- ter sido inquilino, saído e voltado.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_unit_occupancies_vigente
    ON public.unit_occupancies(unit_id, client_id, role)
    WHERE ended_at IS NULL;

-- UM responsável financeiro por unidade, e só um. É o invariante que o
-- financeiro condominial (pós-portão) vai exigir para saber a quem cobrar; sem
-- ele, a cobrança nasce ambígua e o erro só aparece no boleto.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_unit_occupancies_um_responsavel
    ON public.unit_occupancies(unit_id)
    WHERE ended_at IS NULL AND role = 'RESPONSAVEL_FINANCEIRO';

COMMENT ON TABLE public.unit_occupancies IS
  'Relação PESSOA × UNIDADE, uma linha por papel. Propriedade, ocupação e '
  'responsabilidade financeira são coisas diferentes e nunca se achatam num '
  'campo só. Linha encerrada (ended_at) é histórico — não se apaga ocupação.';

COMMENT ON COLUMN public.unit_occupancies.role IS
  'PROPRIETARIO é dono e pode não morar. INQUILINO ocupa por locação. MORADOR '
  'mora sem ser nem um nem outro (filho, dependente). RESPONSAVEL_FINANCEIRO é '
  'quem recebe a cobrança do condomínio, e é único por unidade vigente.';

COMMENT ON COLUMN public.unit_occupancies.organization_id IS
  'Herdado do empreendimento (unit → tower → empreendimento), forçado pelo '
  'trigger trg_unit_occupancies_org. Nunca vem do seletor global do app — filho '
  'herda a org do pai, ver 20270821000001/2/3.';

DROP TRIGGER IF EXISTS set_updated_at_unit_occupancies ON public.unit_occupancies;
CREATE TRIGGER set_updated_at_unit_occupancies BEFORE UPDATE ON public.unit_occupancies
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ BLOCO 6 — cascata de organização (herda do pai, bloqueia divergência) ══
-- Molde: 20270819000004 / 20270821000001-3. A org NÃO vem do seletor global:
-- vem do empreendimento dono da unidade. Se quem escreveu mandou outra, é erro
-- — e erro calado aqui vira ocupação invisível para a org certa.
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_unit_occupancies_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_org_pai UUID;
BEGIN
    SELECT e.organization_id
      INTO v_org_pai
      FROM public.empreendimento_towers t
      JOIN public.empreendimentos e ON e.id = t.empreendimento_id
      JOIN public.empreendimento_units u ON u.tower_id = t.id
     WHERE u.id = NEW.unit_id;

    IF v_org_pai IS NULL THEN
        RAISE EXCEPTION 'Unidade % não tem empreendimento com organização definida.', NEW.unit_id;
    END IF;

    -- Nulo = deixa herdar em silêncio. Divergente = grita. A diferença importa:
    -- omitir é não saber, mandar errado é achar que sabe.
    IF NEW.organization_id IS NOT NULL AND NEW.organization_id <> v_org_pai THEN
        RAISE EXCEPTION
            'Ocupação na organização % mas a unidade % pertence à organização %. Filho herda a org do pai.',
            NEW.organization_id, NEW.unit_id, v_org_pai;
    END IF;

    NEW.organization_id := v_org_pai;
    RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_unit_occupancies_org() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_unit_occupancies_org ON public.unit_occupancies;
CREATE TRIGGER trg_unit_occupancies_org
    BEFORE INSERT OR UPDATE OF unit_id, organization_id ON public.unit_occupancies
    FOR EACH ROW EXECUTE FUNCTION public.fn_unit_occupancies_org();

-- ═══ BLOCO 7 — RLS ══════════════════════════════════════════════════════════
-- Sem policy para `anon`. As tabelas de empreendimento carregam "Allow anon all"
-- de 2026 (ver 20261228000000 §6), que é justamente o que o rollout drop-anon
-- está removendo — esta tabela nasce do lado certo.
SET lock_timeout = '5s';

ALTER TABLE public.unit_occupancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unit_occupancies_org_read" ON public.unit_occupancies;
CREATE POLICY "unit_occupancies_org_read" ON public.unit_occupancies
    FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "unit_occupancies_org_insert" ON public.unit_occupancies;
CREATE POLICY "unit_occupancies_org_insert" ON public.unit_occupancies
    FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "unit_occupancies_org_update" ON public.unit_occupancies;
CREATE POLICY "unit_occupancies_org_update" ON public.unit_occupancies
    FOR UPDATE TO authenticated
    USING (public.is_org_member(organization_id))
    WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "unit_occupancies_org_delete" ON public.unit_occupancies;
CREATE POLICY "unit_occupancies_org_delete" ON public.unit_occupancies
    FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

REVOKE ALL ON public.unit_occupancies FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_occupancies TO authenticated;

-- ═══ BLOCO 8 — conferência ══════════════════════════════════════════════════
-- Rodar sozinho, por último.
-- Esperado: tabela=1, com_rls=1, policies=4, anon_policies=0, fks=2,
--           uidx_responsavel=1, trigger_org=1, status_em_operacao=1

SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='unit_occupancies')                    AS tabela,
  (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename='unit_occupancies' AND rowsecurity)    AS com_rls,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='unit_occupancies')                    AS policies,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='unit_occupancies'
      AND 'anon' = ANY(roles))                                                     AS anon_policies,
  (SELECT count(*) FROM pg_constraint
    WHERE conname IN ('unit_occupancies_unit_fk','unit_occupancies_client_fk'))    AS fks,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='uidx_unit_occupancies_um_responsavel')                        AS uidx_responsavel,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname='trg_unit_occupancies_org')                                       AS trigger_org,
  (SELECT count(*) FROM pg_constraint
    WHERE conname='empreendimentos_status_check'
      AND pg_get_constraintdef(oid) LIKE '%EM_OPERACAO%')                          AS status_em_operacao;

-- ═══ BLOCO 9 — teste do invariante (opcional, desfaz sozinho) ═══════════════
-- Prova que o trigger e o índice de responsável único mordem. Rodar inteiro:
-- o ROLLBACK no fim garante que nada fica.
--
-- BEGIN;
--   -- troque pelo id de uma unidade real:
--   \set unidade '00000000-0000-0000-0000-000000000000'
--   -- 1) org errada de propósito → tem de dar RAISE 'Filho herda a org do pai'
--   -- 2) dois RESPONSAVEL_FINANCEIRO vigentes na mesma unidade → tem de dar
--   --    'duplicate key value violates unique constraint uidx_..._um_responsavel'
-- ROLLBACK;
