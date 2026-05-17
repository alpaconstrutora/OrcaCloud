-- ══════════════════════════════════════════════════════════════════════════════
-- Normaliza descrições antigas de folha de pagamento no JSONB de transactions.
-- Formato antigo: "Folha de Pagamento - Período MM/YYYY - [Obra: ]Nome"
-- Formato novo:   "Folha de Pagamento - Nome - Folha MM/YYYY"
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    proj        record;
    updated_txs jsonb;
    tx          jsonb;
    old_desc    text;
    new_desc    text;
    period_val  text;
    name_val    text;
BEGIN
    FOR proj IN
        SELECT id, settings
        FROM public.projects
        WHERE settings -> 'financialInfo' -> 'transactions' IS NOT NULL
          AND settings -> 'financialInfo' -> 'transactions' != 'null'::jsonb
          AND jsonb_array_length(settings -> 'financialInfo' -> 'transactions') > 0
    LOOP
        updated_txs := '[]'::jsonb;

        FOR tx IN
            SELECT value FROM jsonb_array_elements(proj.settings -> 'financialInfo' -> 'transactions')
        LOOP
            old_desc := tx ->> 'description';

            -- Padrão: "Folha de Pagamento - Período MM/YYYY - [Obra: ]Algo"
            IF old_desc ~ '^Folha de Pagamento - Per.odo [0-9]{2}/[0-9]{4} - ' THEN
                -- Extrai o período (MM/YYYY)
                period_val := substring(old_desc FROM '[0-9]{2}/[0-9]{4}');
                -- Remove o prefixo "Folha de Pagamento - Período MM/YYYY - " e "Obra: " opcional
                name_val := regexp_replace(
                    old_desc,
                    '^Folha de Pagamento - Per.odo [0-9]{2}/[0-9]{4} - (?:Obra: )?',
                    ''
                );
                new_desc := 'Folha de Pagamento - ' || name_val || ' - Folha ' || period_val;
                tx := jsonb_set(tx, '{description}', to_jsonb(new_desc));
            END IF;

            updated_txs := updated_txs || jsonb_build_array(tx);
        END LOOP;

        UPDATE public.projects
        SET settings = jsonb_set(settings, '{financialInfo,transactions}', updated_txs)
        WHERE id = proj.id;
    END LOOP;
END $$;
