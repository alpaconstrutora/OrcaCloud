/**
 * Descrição dos tributos automáticos (Tributos a Pagar):
 *   `{código do contrato} - {tributo} - Parcela {n}/{total} ({dd/mm/aaaa})`
 *
 * Cada tributo nasce de UMA parcela de um contrato comercial; a descrição diz
 * qual. Cliente e tributo já têm coluna própria na tela — o tributo aparece
 * aqui mesmo assim porque é parte do formato pedido (contrato - tributo - parcela).
 */

export interface ParcelaParaNumerar {
    reference_id: string;
    /** Vencimento da parcela (ISO `aaaa-mm-dd`). */
    vencimento: string;
}

export interface NumeroDaParcela {
    numero: number;
    total: number;
}

/**
 * Numera as parcelas DENTRO de cada grupo (um contrato, ou a série legada do
 * negócio) pela ordem de vencimento. `grupoDe` devolve a chave do grupo de cada
 * parcela. Empate de vencimento desempata pelo reference_id, para a numeração
 * não variar entre uma geração e outra.
 */
export function numerarParcelas<T extends ParcelaParaNumerar>(
    parcelas: T[],
    grupoDe: (p: T) => string,
): Map<string, NumeroDaParcela> {
    const porGrupo = new Map<string, T[]>();
    for (const p of parcelas) {
        const g = grupoDe(p);
        porGrupo.set(g, [...(porGrupo.get(g) || []), p]);
    }
    const resultado = new Map<string, NumeroDaParcela>();
    porGrupo.forEach(lista => {
        const ordenada = [...lista].sort((a, b) =>
            a.vencimento.localeCompare(b.vencimento) || a.reference_id.localeCompare(b.reference_id));
        ordenada.forEach((p, i) => resultado.set(p.reference_id, { numero: i + 1, total: ordenada.length }));
    });
    return resultado;
}

/** `aaaa-mm-dd…` → `dd/mm/aaaa`. Sem data válida, devolve vazio. */
function dataBr(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function descricaoTributo(
    codigoContrato: string,
    nomeTributo: string,
    parcela: NumeroDaParcela | undefined,
    vencimento: string,
): string {
    const data = dataBr(vencimento);
    const numero = parcela ? `Parcela ${parcela.numero}/${parcela.total}` : 'Parcela';
    return `${codigoContrato} - ${nomeTributo} - ${numero}${data ? ` (${data})` : ''}`;
}
