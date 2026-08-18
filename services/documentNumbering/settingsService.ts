import { supabase } from '../../lib/supabase';
import { getDocTypeDefault } from './catalog';
import { DocType, NumberingConfig } from './types';

interface Row {
    organization_id: string;
    doc_type: DocType;
    slots: NumberingConfig['slots'];
    prefix: string;
    separator: NumberingConfig['separator'];
    seq_padding: number;
}

const toConfig = (row: Row): NumberingConfig => ({
    slots: row.slots ?? [],
    prefix: row.prefix ?? '',
    separator: row.separator ?? '-',
    seqPadding: row.seq_padding ?? 4,
});

/** Config de um único doc_type. Sem linha no banco → default do catálogo. */
export async function getNumberingConfig(organizationId: string, docType: DocType): Promise<NumberingConfig> {
    const { data, error } = await supabase
        .from('document_numbering_settings')
        .select('organization_id, doc_type, slots, prefix, separator, seq_padding')
        .eq('organization_id', organizationId)
        .eq('doc_type', docType)
        .maybeSingle();
    if (error) throw error;

    return data ? toConfig(data as Row) : getDocTypeDefault(docType);
}

/** Todas as configs de uma organização, para a tela de Configurações — 1 ida ao banco. */
export async function listNumberingConfigs(organizationId: string): Promise<Partial<Record<DocType, NumberingConfig>>> {
    const { data, error } = await supabase
        .from('document_numbering_settings')
        .select('organization_id, doc_type, slots, prefix, separator, seq_padding')
        .eq('organization_id', organizationId);
    if (error) throw error;

    const result: Partial<Record<DocType, NumberingConfig>> = {};
    for (const row of (data ?? []) as Row[]) {
        result[row.doc_type] = toConfig(row);
    }
    return result;
}

export async function saveNumberingConfig(
    organizationId: string,
    docType: DocType,
    config: NumberingConfig,
): Promise<void> {
    const { error } = await supabase.from('document_numbering_settings').upsert({
        organization_id: organizationId,
        doc_type: docType,
        slots: config.slots,
        prefix: config.prefix,
        separator: config.separator,
        seq_padding: config.seqPadding,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,doc_type' });
    if (error) throw error;
}

export async function resetNumberingConfig(organizationId: string, docType: DocType): Promise<void> {
    const { error } = await supabase
        .from('document_numbering_settings')
        .delete()
        .eq('organization_id', organizationId)
        .eq('doc_type', docType);
    if (error) throw error;
}
