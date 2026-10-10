import { supabase } from '../../lib/supabase';
import { documentService } from '../documentService';
import type { OpuraDocumentCategoria } from '../../types/documents';

/**
 * Pastas do GED onde os ofícios são arquivados (Ofícios / 2026 / Engenharia,
 * Ofícios / 2026 / Recebidos). Separado de `emissao.ts` para a tramitação usar
 * sem importar a emissão (e vice-versa).
 */

/** Ano de `YYYY-MM-DD`. Puro. */
export const anoDe = (data: string | null | undefined): string => (data ?? '').slice(0, 4) || String(new Date().getFullYear());

/** Garante a pasta (e as do caminho) no GED, na categoria pedida. Devolve o id da última. */
export async function garantirPasta(orgId: string, categoria: OpuraDocumentCategoria, caminho: string[]): Promise<string> {
    let paiId: string | null = null;
    for (const nome of caminho) {
        let q = supabase.from('opura_folders').select('id')
            .eq('organization_id', orgId).eq('categoria', categoria).eq('name', nome).is('project_id', null);
        q = paiId ? q.eq('parent_id', paiId) : q.is('parent_id', null);
        const { data, error } = await q.limit(1);
        if (error) throw error;
        if (data && data.length > 0) { paiId = (data[0] as { id: string }).id; continue; }
        const criada = await documentService.createFolder({ organization_id: orgId, name: nome, categoria, parent_id: paiId ?? undefined });
        paiId = criada.id;
    }
    return paiId!;
}
