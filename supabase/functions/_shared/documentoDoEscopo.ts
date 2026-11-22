// supabase/functions/_shared/documentoDoEscopo.ts
//
// O documento (opura_documents.organization_id) pertence ao ESCOPO do Credit
// Room? Regra única: a org dona do room, ou — só quando o room é de GRUPO — uma
// das orgs listadas em `grupo_organization_ids`. Escopo Empresa (ou qualquer
// valor que não seja 'GRUPO') = só a org dona, mesmo que o array tenha sobrado
// de um escopo anterior; array nulo/ausente = nenhuma org de grupo.
//
// REGRA GÊMEA no banco (mantê-las iguais; sem isso o credor vê o documento na
// lista e leva 403 no download, ou o contrário):
//   supabase/migrations/aplicar_20271122300000_credit_room_documentos_grupo.sql
//   doc.organization_id = r.organization_id
//     OR (r.escopo = 'GRUPO' AND doc.organization_id = ANY(r.grupo_organization_ids))
//
// Usada por `credit-room-download`. Fica em _shared (e não no index.ts) para o
// vitest importar: o index.ts carrega módulos por URL e não roda no Node.
export function documentoDoEscopo(
    docOrg: string | null | undefined,
    room: {
        organization_id: string;
        escopo?: string | null;
        grupo_organization_ids?: string[] | null;
    },
): boolean {
    if (!docOrg) return false;
    if (docOrg === room.organization_id) return true;
    return room.escopo === 'GRUPO'
        && Array.isArray(room.grupo_organization_ids)
        && room.grupo_organization_ids.includes(docOrg);
}
