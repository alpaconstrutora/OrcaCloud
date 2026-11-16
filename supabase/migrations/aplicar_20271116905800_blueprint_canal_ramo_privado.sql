-- ============================================================================
-- Planta Inteligente — o canal Realtime do RAMO passa a ser PRIVADO (15/11/2026)
--
-- Achado de segurança F58. O canal `blueprint:ramo:<branchId>` era PÚBLICO: o
-- Realtime não conferia quem entrava nem quem difundia. Qualquer um com o id do
-- ramo (um LEITOR do estudo, ou só a chave anon) mandava um `comando` que o
-- editor de quem estava com o ramo aberto aplicava e gravava no rascunho com a
-- RLS DELE — passando por cima do "leitor não grava" e das travas. A presença do
-- mesmo canal entregava user id, e-mail e nome dos participantes a quem quisesse.
--
-- O cliente (`hooks/useBlueprintColaboracao.ts`) agora abre DOIS canais
-- privados por ramo, e estas policies em `realtime.messages` são a autorização:
--
--   blueprint:ramo:<branchId>            presença + aviso de travas
--       entrar/ouvir:  membro da organização do ramo
--       escrever:      membro da organização do ramo (o LEITOR também: ele
--                      pode criar/soltar trava explícita e avisa o ramo)
--   blueprint:ramo:<branchId>:comandos   os comandos do kernel
--       entrar/ouvir:  membro da organização do ramo (o leitor vê ao vivo)
--       escrever:      membro da organização do ramo que NÃO é LEITOR do
--                      estudo — a mesma regra (`fn_blueprint_e_leitor`) da
--                      policy RESTRICTIVE que recusa a gravação do rascunho
--
-- Dois canais porque o Realtime autoriza a escrita POR CANAL (na entrada), não
-- por evento: num canal só, tirar a escrita do leitor tiraria também o aviso de
-- travas dele. "Membro" é a mesma pergunta da RLS de `blueprint_branches`
-- (`organization_id IN minhas_orgs_membro()`): quem abre o ramo no editor é
-- exatamente quem entra no canal.
--
-- Policies só valem para canal privado; os outros canais do app (chat,
-- notificações, portal do parceiro) são públicos e não são tocados. Os tópicos
-- aceitos são SÓ os dois acima, com UUID — qualquer outro tópico não casa.
--
-- REGRA #7
--   Pergunta 1 (perna do OR): as duas pernas do OR da escrita estão DENTRO do
--   EXISTS que exige o ramo da organização de quem chama; nenhuma libera sozinha.
--   A leitura não tem OR.
--   Pergunta 2 (quem executa): função nova `fn_blueprint_ramo_do_topico` não é
--   SECURITY DEFINER (só lê o texto do tópico); mesmo assim REVOKE de PUBLIC e
--   anon, GRANT só a authenticated (as policies são `TO authenticated`).
--   `minhas_orgs_membro` e `fn_blueprint_e_leitor` já existem com REVOKE.
--
-- ORDEM: aplicar ESTE arquivo ANTES de publicar o cliente. Cliente novo sem as
-- policies = canal privado recusado (a colaboração ao vivo cala; o desenho
-- continua salvando). Cliente antigo com as policies = segue no canal público
-- de antes até recarregar.
--
-- Conferência depois de aplicar:
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname LIKE 'blueprint_ramo_%';
--   Prova de fora: um cliente que entra em `blueprint:ramo:<id>:comandos` SEM
--   `private: true` (ou com a chave anon) e difunde um `comando` não pode mudar
--   o desenho de quem está no ramo.
--
-- ⚠️ Aplicar à mão: `npx supabase db query --linked -f <este arquivo>`.
--    NUNCA `supabase db push` (histórico de migrations furado — ver CLAUDE.md).
-- ============================================================================

SET lock_timeout = '5s';

-- Sem RLS em realtime.messages, canal privado não teria autorização nenhuma.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'realtime' AND c.relname = 'messages' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'realtime.messages sem RLS habilitada: o canal privado da Planta ficaria aberto. Conferir antes de aplicar.';
    END IF;
END
$$;

-- O ramo do tópico: `blueprint:ramo:<uuid>` ou `blueprint:ramo:<uuid>:comandos`.
-- Qualquer outro texto → NULL (não casa com ramo nenhum; sem erro de cast).
CREATE OR REPLACE FUNCTION public.fn_blueprint_ramo_do_topico(p_topico TEXT)
RETURNS UUID
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN p_topico ~* '^blueprint:ramo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:comandos)?$'
        THEN substr(p_topico, 16, 36)::uuid
    END
$$;
REVOKE ALL ON FUNCTION public.fn_blueprint_ramo_do_topico(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_blueprint_ramo_do_topico(TEXT) TO authenticated;

-- Entrar e ouvir (broadcast e presença), nos dois canais: membro da org do ramo.
DROP POLICY IF EXISTS "blueprint_ramo_canal_ler" ON realtime.messages;
CREATE POLICY "blueprint_ramo_canal_ler"
    ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        realtime.messages.extension IN ('broadcast', 'presence')
        AND EXISTS (
            SELECT 1
              FROM public.blueprint_branches b
             WHERE b.id = public.fn_blueprint_ramo_do_topico((SELECT realtime.topic()))
               AND COALESCE(b.organization_id IN (SELECT public.minhas_orgs_membro()), false)
        )
    );

-- Escrever: no canal do ramo, presença e aviso de travas para todo membro; no
-- canal de comandos, só broadcast e só de quem não é LEITOR do estudo.
DROP POLICY IF EXISTS "blueprint_ramo_canal_escrever" ON realtime.messages;
CREATE POLICY "blueprint_ramo_canal_escrever"
    ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
              FROM public.blueprint_branches b
             WHERE b.id = public.fn_blueprint_ramo_do_topico((SELECT realtime.topic()))
               AND COALESCE(b.organization_id IN (SELECT public.minhas_orgs_membro()), false)
               AND (
                    ((SELECT realtime.topic()) NOT LIKE '%:comandos'
                        AND realtime.messages.extension IN ('broadcast', 'presence'))
                 OR ((SELECT realtime.topic()) LIKE '%:comandos'
                        AND realtime.messages.extension = 'broadcast'
                        AND NOT public.fn_blueprint_e_leitor(b.study_id))
               )
        )
    );
