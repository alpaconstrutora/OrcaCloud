// utils/imovibEstrutura.ts
//
// A ESTRUTURA do estudo de viabilidade (blocos, tipologias, áreas) lida do
// Empreendimento vinculado — que a recebe da Planta Inteligente — em vez das
// tabelas próprias do estudo (docs/planos/2026-10-19-imovib-premissas-planta-inteligente.md).
//
//   Planta Inteligente ─► Empreendimento (torres, unidades) ─► aqui ─► motor (computeImovibMath)
//
// Leitura, não cópia: o que se publica na Planta aparece na Viabilidade na próxima
// abertura. O estudo continua dono só do que é SIMULAÇÃO — custo/m² e preço/m² por
// torre —, guardado em `imovib_blocks` e ligado à torre por
// `empreendimento_towers.imovib_block_id` (a mesma ligação do espelho de vendas).
//
// O formato devolvido é o `ImovibBlock[]` que o motor já consome, para que CAPEX,
// Estática, Espelho, Resumo e listagem continuem lendo de um lugar só. Cada
// tipologia leva `quantity` = TOTAL de unidades e `pavimentos` = 1: o motor
// multiplica quantidade × pavimentos × área, e o total já é a contagem real do
// cadastro — dividir de volta por pavimento inventaria um número que não existe.

import type { ImovibBlock, ImovibUnit } from '../types/imovib';

/** O que a função precisa da torre (subconjunto de EmpreendimentoTower). */
export interface TorreDaEstrutura {
    id: string;
    name: string;
    imovib_block_id?: string | null;
    construction_cost_sqm?: number | null;
    sales_price_sqm?: number | null;
    sort_order?: number | null;
}

/** O que a função precisa da unidade (subconjunto de EmpreendimentoUnit). */
export interface UnidadeDaEstrutura {
    tower_id: string;
    typology?: string | null;
    private_area?: number | null;
    common_area?: number | null;
    price?: number | null;
    is_vendavel?: boolean | null;
}

export interface EstruturaDerivada {
    blocos: ImovibBlock[];
    /** Blocos do estudo que nenhuma torre reivindica — ficam FORA do cálculo (e são avisados). */
    blocosForaDoCalculo: ImovibBlock[];
    unidades: number;
}

export const SEM_TIPOLOGIA = 'Sem tipologia';

/** Prefixo do id de um bloco que ainda não tem linha em `imovib_blocks`. */
export const PREFIXO_TORRE_SEM_BLOCO = 'torre:';

export const blocoSemLinha = (b: Pick<ImovibBlock, 'id'>): boolean => b.id.startsWith(PREFIXO_TORRE_SEM_BLOCO);

const positivo = (v: number | null | undefined): number | null => (v != null && v > 0 ? v : null);

export function derivarEstruturaDoEmpreendimento(
    studyId: string,
    torres: TorreDaEstrutura[],
    unidades: UnidadeDaEstrutura[],
    blocosDoEstudo: ImovibBlock[],
): EstruturaDerivada {
    const blocoPorId = new Map(blocosDoEstudo.map(b => [b.id, b]));
    const reivindicados = new Set<string>();

    const ordenadas = [...torres].sort((a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));

    const blocos = ordenadas.map((torre): ImovibBlock => {
        const daTorre = unidades.filter(u => u.tower_id === torre.id);
        // Vínculo que aponta para bloco apagado conta como sem bloco.
        const linha = torre.imovib_block_id ? blocoPorId.get(torre.imovib_block_id) : undefined;
        if (linha) reivindicados.add(linha.id);
        const blockId = linha?.id ?? `${PREFIXO_TORRE_SEM_BLOCO}${torre.id}`;

        // Tipologia = unidades agrupadas por (nome, vendável). Área média × total = soma exata.
        const grupos = new Map<string, { nome: string; vendavel: boolean; n: number; priv: number; comum: number }>();
        for (const u of daTorre) {
            const nome = u.typology?.trim() || SEM_TIPOLOGIA;
            const vendavel = u.is_vendavel !== false;
            const chave = `${nome}|${vendavel}`;
            const g = grupos.get(chave) ?? { nome, vendavel, n: 0, priv: 0, comum: 0 };
            g.n += 1;
            g.priv += u.private_area ?? 0;
            g.comum += u.common_area ?? 0;
            grupos.set(chave, g);
        }
        const tipologias: ImovibUnit[] = [...grupos.entries()]
            .sort(([, a], [, b]) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
            .map(([chave, g]) => ({
                id: `${blockId}:${chave}`,
                block_id: blockId,
                name: g.nome,
                quantity: g.n,
                private_area: g.priv / g.n,
                common_area: g.comum / g.n,
                pavimentos: 1,
                is_vendavel: g.vendavel,
            }));

        // Custo e preço: o que o estudo gravou vale; sem isso, o que a torre já sabe
        // (preenche sozinho, nunca por cima do digitado). Preço ainda cai no preço das
        // unidades vendáveis ÷ a área delas — a semente que a Planta dá a cada unidade.
        const vendaveisComPreco = daTorre.filter(u => u.is_vendavel !== false && (u.price ?? 0) > 0 && (u.private_area ?? 0) > 0);
        const areaComPreco = vendaveisComPreco.reduce((s, u) => s + (u.private_area ?? 0), 0);
        const precoDasUnidades = areaComPreco > 0
            ? vendaveisComPreco.reduce((s, u) => s + (u.price ?? 0), 0) / areaComPreco
            : null;

        return {
            id: blockId,
            study_id: studyId,
            name: torre.name,
            construction_cost_sqm: positivo(linha?.construction_cost_sqm) ?? positivo(torre.construction_cost_sqm) ?? 0,
            sales_price_sqm: positivo(linha?.sales_price_sqm) ?? positivo(torre.sales_price_sqm) ?? (precoDasUnidades ? Math.round(precoDasUnidades * 100) / 100 : 0),
            created_at: linha?.created_at,
            updated_at: linha?.updated_at,
            tower_id: torre.id,
            units: tipologias,
        };
    });

    return {
        blocos,
        blocosForaDoCalculo: blocosDoEstudo.filter(b => !reivindicados.has(b.id)),
        unidades: unidades.filter(u => torres.some(t => t.id === u.tower_id)).length,
    };
}
