-- ============================================================
-- Migration: aplicar_20270918000020_invoices_duplicadas_e_trava.sql
-- DADO + TRAVA — duplicatas de `invoices` por clique duplo na aprovação
--
-- COMO ISSO APARECEU
-- A correção do C1-02 (aplicar_...002) deu coluna de organização a `invoices` e
-- deixou 1 linha sem dono, que virou invisível. Ao investigar de quem ela era, o
-- `file_path` apontou para a pasta da Alpa e as `notes` traziam um id de boleto
-- — que já estava ligado a OUTRA linha, com o mesmo arquivo e o mesmo valor,
-- criada 2 SEGUNDOS depois.
--
-- Não era nota perdida: era duplicata. A varredura por `file_path` repetido
-- achou mais três pares, todos no mesmo formato — duas linhas apontando para o
-- MESMO objeto no Storage, e sempre exatamente uma delas com boleto:
--
--   arquivo                          fica (tem boleto)  sobra       intervalo
--   161107-...-095-TIT-001.pdf       dae7bc66 (paid)    8a707d4b    1,2 s
--   171222-...-045-TIT-002.pdf       6b478bc1 (paid)    dd6b3944    2,0 s
--   180110-...-107-TIT-004.PDF       bf966c5c           22e4cd87    1,7 s
--   documento_2492313_...pdf         011b911e           ade09c24    2 dias
--
-- Os três primeiros são clique duplo na aprovação. O quarto tem 2 dias de
-- intervalo, mas divide o mesmo `file_path` — e o caminho carrega um
-- `Date.now()`: reenvio do documento geraria caminho novo. Logo, também é linha
-- duplicada, provavelmente rerrodada de importação.
--
-- Três das quatro órfãs TÊM organização e aparecem hoje em Contas a Pagar como
-- duplicata (R$ 77,96, R$ 98,00 e R$ 52,10). É problema anterior à auditoria.
--
-- SEGURANÇA DA EXCLUSÃO (verificado antes)
--   • FK: só `boletos.invoice_id` referencia `invoices`, e nenhuma das 4 tem
--     boleto apontando para si.
--   • Referência por texto (`internal_transactions.reference_id`, observações
--     de boleto): 0 ocorrências para as 4.
--   • O arquivo no Storage é COMPARTILHADO com a linha que fica — esta migration
--     não toca em `storage.objects`.
--
-- A TRAVA
-- Índice único parcial em `file_path`. Sem ele, o próximo clique duplo recria o
-- problema — apagar linha a linha trata o sintoma. Autorizado pelo dono em
-- 2026-09-02, junto da exclusão.
-- ============================================================

-- ── 1. Apagar apenas as 4, e só se continuarem sem boleto ───────────────────
-- A condição `NOT EXISTS` não é decorativa: se alguém tiver ligado um boleto a
-- uma delas entre a análise e a aplicação, a linha NÃO é apagada.
DO $$
DECLARE
    v_alvos uuid[] := ARRAY[
        '8a707d4b-d0b2-4dba-b853-836b9ebced80',   -- 161107-...-095-TIT-001.pdf
        'dd6b3944-4311-4d01-937c-22549a02f034',   -- 171222-...-045-TIT-002.pdf
        '22e4cd87-ff14-4276-ab7f-c4720751fe7f',   -- 180110-...-107-TIT-004.PDF
        'ade09c24-f3ac-4e22-a586-40a75eb93c18'    -- documento_2492313_...pdf
    ]::uuid[];
    v_apagadas int;
    v_recusadas int;
BEGIN
    SELECT count(*) INTO v_recusadas
      FROM public.invoices i
     WHERE i.id = ANY(v_alvos)
       AND EXISTS (SELECT 1 FROM public.boletos b WHERE b.invoice_id = i.id);

    IF v_recusadas > 0 THEN
        RAISE EXCEPTION 'ABORTADO: % das linhas alvo ganharam boleto desde a analise — reveja antes de apagar', v_recusadas;
    END IF;

    -- Cada alvo tem de ter um "gêmeo" com o mesmo arquivo que sobrevive.
    -- Sem isso, a exclusão apagaria a única linha daquele documento.
    SELECT count(*) INTO v_recusadas
      FROM public.invoices i
     WHERE i.id = ANY(v_alvos)
       AND NOT EXISTS (
           SELECT 1 FROM public.invoices g
            WHERE g.file_path = i.file_path AND g.id <> i.id
       );

    IF v_recusadas > 0 THEN
        RAISE EXCEPTION 'ABORTADO: % linha(s) alvo nao tem duplicata — apagar perderia o documento', v_recusadas;
    END IF;

    DELETE FROM public.invoices WHERE id = ANY(v_alvos);
    GET DIAGNOSTICS v_apagadas = ROW_COUNT;

    RAISE NOTICE 'invoices: % duplicata(s) apagada(s)', v_apagadas;
END $$;

-- ── 2. Trava: um arquivo, uma nota ──────────────────────────────────────────
-- Parcial porque `file_path` pode ser NULL (nota registrada sem arquivo).
-- Se ainda houvesse duplicata, o CREATE INDEX falharia — e é essa falha que
-- prova que o passo 1 funcionou.
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_file_path
    ON public.invoices (file_path)
    WHERE file_path IS NOT NULL;

-- ── 3. Verificação embutida ─────────────────────────────────────────────────
DO $$
DECLARE
    v_dups int;
    v_orfas int;
    v_total int;
BEGIN
    SELECT count(*) INTO v_dups FROM (
        SELECT file_path FROM public.invoices
         WHERE file_path IS NOT NULL
         GROUP BY file_path HAVING count(*) > 1
    ) d;

    SELECT count(*) INTO v_orfas FROM public.invoices WHERE organization_id IS NULL;
    SELECT count(*) INTO v_total FROM public.invoices;

    IF v_dups > 0 THEN
        RAISE EXCEPTION 'ainda ha % grupo(s) de invoices com file_path repetido', v_dups;
    END IF;
    IF v_orfas > 0 THEN
        RAISE EXCEPTION 'ainda ha % nota(s) sem organizacao', v_orfas;
    END IF;

    RAISE NOTICE 'OK: % notas, nenhuma duplicata por arquivo, nenhuma sem organizacao.', v_total;
END $$;
