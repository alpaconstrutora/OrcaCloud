/**
 * Concorrentes monitorados do Market e a ponte para os comparáveis do Imovib
 * (Fase 7.7 de docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). Puro, sem I/O.
 *
 * Um concorrente pertence a um estudo de terreno do Market (opura_market_monitored_competitors) e é um
 * anúncio, um lançamento ou um nome/preço digitado. O estudo do Imovib criado a partir daquele estudo de
 * terreno (`imovib_studies.opura_terrain_study_id`) importa os concorrentes como comparáveis.
 */
import type { ImovibComparable } from './imovibMercado';

export interface Ponto { latitude: number; longitude: number }

export interface ConcorrenteMonitorado {
    id: string;
    studyId: string;
    origem: 'anuncio' | 'lancamento' | 'proprio';
    nome: string;
    endereco: string | null;
    /** Preço total (anúncio: preço pedido; lançamento: ticket médio; próprio: o digitado). */
    preco: number | null;
    area: number | null;
    precoM2: number | null;
    totalDeUnidades: number | null;
    incorporadora: string | null;
    lancamento: string | null;
    posicao: Ponto | null;
    listingId: string | null;
    developmentId: string | null;
}

/** Distância em km com uma casa (haversine). */
export function distanciaEmKm(a: Ponto, b: Ponto): number {
    const rad = (g: number) => (g * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** Caixa de latitude/longitude que contém o raio (para filtrar no banco antes da conta exata). */
export function caixaDoRaio(centro: Ponto, raioM: number): { latMin: number; latMax: number; lngMin: number; lngMax: number } {
    const dLat = raioM / 111_320;
    const dLng = raioM / (111_320 * Math.max(0.01, Math.cos((centro.latitude * Math.PI) / 180)));
    return { latMin: centro.latitude - dLat, latMax: centro.latitude + dLat, lngMin: centro.longitude - dLng, lngMax: centro.longitude + dLng };
}

/** Só o que está dentro do raio, do mais perto ao mais longe. */
export function noRaio<T extends { latitude: number | null; longitude: number | null }>(itens: T[], centro: Ponto, raioM: number): (T & { distanciaKm: number })[] {
    return itens
        .filter((i): i is T & Ponto => i.latitude != null && i.longitude != null)
        .map(i => ({ ...i, distanciaKm: distanciaEmKm(centro, i) }))
        .filter(i => i.distanciaKm * 1000 <= raioM)
        .sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/** Preço por m²: o informado, senão preço ÷ área. */
const precoPorM2 = (c: Pick<ConcorrenteMonitorado, 'preco' | 'area' | 'precoM2'>): number | null =>
    c.precoM2 != null && c.precoM2 > 0 ? c.precoM2
        : c.preco != null && c.preco > 0 && c.area != null && c.area > 0 ? Math.round((c.preco / c.area) * 100) / 100
            : null;

/** O concorrente como comparável do estudo (o que o Market não tem — vendidas, valorização — fica em branco). */
export function comparavelDoConcorrente(
    c: ConcorrenteMonitorado,
    estudoId: string,
    centro: Ponto | null,
    hoje: string,
    ordem: number,
): Omit<ImovibComparable, 'id' | 'created_at'> {
    return {
        study_id: estudoId,
        name: c.nome,
        developer: c.incorporadora,
        address: c.endereco,
        distance_km: centro && c.posicao ? distanciaEmKm(centro, c.posicao) : null,
        launch_date: c.lancamento,
        total_units: c.totalDeUnidades != null && c.totalDeUnidades > 0 ? c.totalDeUnidades : null,
        sold_units: null,
        typical_area: c.area,
        price_sqm: precoPorM2(c),
        ticket: c.preco,
        appreciation_pct: null,
        source: c.origem === 'anuncio' ? 'Ópura Market (anúncio)' : c.origem === 'lancamento' ? 'Ópura Market (lançamento)' : 'Ópura Market (monitorado)',
        collected_at: hoje,
        notes: null,
        sort_order: ordem,
    };
}

/** Já está entre os comparáveis (mesmo nome e endereço)? Evita importar duas vezes. */
export function jaEhComparavel(c: Pick<ConcorrenteMonitorado, 'nome' | 'endereco'>, comparaveis: Pick<ImovibComparable, 'name' | 'address'>[]): boolean {
    const n = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();
    return comparaveis.some(x => n(x.name) === n(c.nome) && n(x.address) === n(c.endereco));
}
