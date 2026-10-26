// utils/rotuloMapaRegulatorio.ts
//
// Rótulo de um mapa regulatório numa lista de mapas DA CIDADE (26/10/2026).
// A busca por cidade não filtra pela organização (ver `regulatoryMapService.listByCity`):
// o mapa é a lei da cidade, cadastrada uma vez — em geral na incorporadora — e o
// empreendimento que o importa vive na SPE dele. Com mapas de mais de uma organização na
// mesma lista, dois "Plano Diretor" ficariam indistinguíveis; aí o nome leva a dona.

interface MapaRotulavel {
    id: string;
    organization_id: string;
    name: string;
}

export function rotuloMapaRegulatorio(
    mapa: MapaRotulavel,
    mapas: MapaRotulavel[],
    organizacoes: { id: string; name: string }[],
): string {
    const variasOrgs = new Set(mapas.map(m => m.organization_id)).size > 1;
    if (!variasOrgs) return mapa.name;
    const dona = organizacoes.find(o => o.id === mapa.organization_id)?.name;
    return dona ? `${mapa.name} · ${dona}` : mapa.name;
}
