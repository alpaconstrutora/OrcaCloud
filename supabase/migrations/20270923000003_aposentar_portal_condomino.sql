-- 20270923000003 — Aposentar o Portal do Condômino (legado)
-- Plano: docs/planos/2026-09-23-despesas-legiveis-e-portal-legado.md
--
-- ⚠️ ORDEM: esta migration roda DEPOIS que o código que usava estes objetos
-- estiver publicado. Fechar a porta no banco antes de o frontend parar de bater
-- nela é o caminho curto para erro em produção.
--
-- O QUE ESTÁ SENDO APOSENTADO
--
-- O "Portal do Condômino" era o caminho anterior a 01/09/2026: link por
-- OCUPAÇÃO (`condomino_portal_access`), rota pública `/portal-condomino?token=`.
-- Desde 01/09 o condômino entra pela aba Condomínio do PORTAL DO CLIENTE, e não
-- se emite mais link de condômino.
--
-- Medido em 23/09/2026:
--   • `condomino_portal_access`                              2 linhas, 0 ATIVAS
--   • `condominio_aviso_leituras` com `access_id` não nulo   0 linhas
--   • chamados vindos do portal legado                       0
--
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA NÃO FAZ
--
-- FAZ: remove as três RPCs do portal — que eram executáveis por `anon`, com a
-- chave que vai no bundle. Sem elas não existe mais porta de entrada, que é o
-- que "aposentar um portal" significa.
--
-- NÃO FAZ: não apaga `condomino_portal_access` nem a coluna
-- `condominio_aviso_leituras.access_id`. As duas viram dado histórico inerte —
-- sem código que leia, sem RPC que alcance, sem rota que chegue. Apagar os 2
-- tokens vencidos não devolve nada ao sistema e é irreversível; deixar é barato
-- e mantém a trilha de que o portal existiu. Se o usuário decidir limpar, é uma
-- migration própria, com a decisão dele escrita nela.

BEGIN;

-- Trava: se aparecer acesso ativo, alguém ainda depende do portal e aposentar
-- agora tiraria essa pessoa do ar.
DO $$
DECLARE v_ativos int;
BEGIN
    SELECT COUNT(*) INTO v_ativos
      FROM public.condomino_portal_access
     WHERE is_active AND expires_at > NOW();
    IF v_ativos > 0 THEN
        RAISE EXCEPTION
            'Existem % acesso(s) de condômino AINDA ATIVOS. Migre essas pessoas para o Portal do Cliente antes de aposentar.',
            v_ativos;
    END IF;
END $$;

-- As três RPCs do portal legado. `anon` podia executar as três.
DROP FUNCTION IF EXISTS public.condomino_portal_get_data(text);
DROP FUNCTION IF EXISTS public.condomino_portal_marcar_lido(text, uuid);
DROP FUNCTION IF EXISTS public.condomino_portal_abrir_chamado(text, text, text, text, text);

COMMENT ON TABLE public.condomino_portal_access IS
    'APOSENTADA em 23/09/2026 — Portal do Condômino (link por ocupação, rota /portal-condomino). Nenhum código lê esta tabela e as RPCs foram removidas; o condômino entra pela aba Condomínio do Portal do Cliente. Mantida como registro histórico. Ver docs/planos/2026-09-23-despesas-legiveis-e-portal-legado.md.';

COMMENT ON COLUMN public.condominio_aviso_leituras.access_id IS
    'APOSENTADA em 23/09/2026 com o Portal do Condômino. Era a PROCEDÊNCIA da leitura (por qual link veio), nunca a chave — a chave é (aviso_id, client_id). Nenhuma linha usa: 0 não nulos na aposentadoria.';

COMMIT;
