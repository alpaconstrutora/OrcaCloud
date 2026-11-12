/**
 * Recebimento por safra do Imovib — puro, sem React nem banco.
 *
 * Cada mês de venda é uma safra que paga pelo seu próprio calendário (sinal,
 * parcelas até as chaves, intermediárias, repasse, pós-chaves). O distrato
 * cancela uma fração da safra mais tarde, devolve parte do que ela pagou e, se
 * houver revenda, a fração volta ao estoque como venda nova.
 *
 * Item 1.2 do plano docs/planos/2026-11-11-imovib-viabilidade-de-excelencia.md.
 * Testes: __tests__/imovibRecebimento.test.ts.
 */

/** Percentuais em PERCENTUAL (10 = 10%), na unidade dos campos do estudo. */
export interface PerfilDeRecebimento {
    sinalPct: number;
    parcelasObraPct: number;
    intermediariasPct: number;
    /** Meses entre uma intermediária e a seguinte, a partir do mês da venda. */
    intermediariasIntervalo: number;
    repassePct: number;
    /** Meses entre as chaves e o repasse bancário. */
    atrasoDoRepasse: number;
    posChavesPct: number;
    posChavesMeses: number;
    /** Juro do financiamento direto pós-chaves, % ao mês (Price). */
    posChavesJurosMensal: number;
}

export interface PremissasDeDistrato {
    /** Fração de cada safra que distrata (10 = 10%). */
    taxaPct: number;
    /** Meses entre a venda e o distrato. */
    defasagemMeses: number;
    /** Percentual do que a fração distratada pagou que volta ao comprador. */
    devolucaoPct: number;
    /** A unidade distratada é revendida no mês seguinte (sem novo distrato). */
    revende: boolean;
    /** Desconto da revenda sobre o preço original (10 = 10%). */
    desagioRevendaPct: number;
    /**
     * Inadimplência sobre o que o comprador paga direto (parcelas, intermediárias,
     * pós-chaves), %. A devolução é sobre o que ele PAGOU: sem a parte inadimplente.
     * Vazio = 0 (o motor a aplica nas séries depois; aqui só entra na base da devolução).
     */
    inadimplenciaPct?: number;
}

/** Um valor por mês (índice 0 = mês 1). Todas as séries têm o mesmo tamanho. */
export interface SerieDeRecebimento {
    sinal: number[];
    parcelasObra: number[];
    intermediarias: number[];
    repasse: number[];
    posChaves: number[];
    /** Devolução ao comprador no mês do distrato (≤ 0). */
    devolucaoDistrato: number[];
}

type Linha = keyof SerieDeRecebimento;

/**
 * Recebimento de todas as safras.
 *
 * @param vendasPorMes `vendasPorMes[i]` = VGV vendido no mês i+1 (sem correção).
 * @param mesDasChaves último mês da obra.
 * @param horizonte último mês do estudo: tamanho mínimo das séries, que crescem
 *   quando repasse atrasado, pós-chaves ou revenda recebem depois dele.
 *
 * Distrato (decisão do usuário em 11/11/2026, revisão da Fase 1): acontece no
 * máximo nas chaves — venda feita nas chaves ou depois não distrata, o comprador
 * já recebeu o imóvel e o repasse é do banco. A revenda sai com deságio; sem
 * ele, a retenção do pago fazia mais distrato dar mais lucro.
 */
export function recebimentoPorSafra(
    vendasPorMes: number[],
    perfil: PerfilDeRecebimento,
    mesDasChaves: number,
    distrato: PremissasDeDistrato,
    horizonte: number,
): SerieDeRecebimento {
    const out: SerieDeRecebimento = {
        sinal: [], parcelasObra: [], intermediarias: [], repasse: [], posChaves: [], devolucaoDistrato: [],
    };
    const por = (x: number) => (Number(x) || 0) / 100;
    const taxaDistrato = Math.min(1, Math.max(0, por(distrato.taxaPct)));
    const defasagem = Math.max(0, Math.round(distrato.defasagemMeses || 0));
    const desagio = Math.min(1, Math.max(0, por(distrato.desagioRevendaPct)));
    const chaves = Math.round(mesDasChaves);

    /** Põe `valor` da safra no mês `m`, se o mês vem antes do corte (distrato). */
    // O que o comprador paga direto e pode deixar de pagar (a mesma regra do motor).
    const inadimplencia = Math.min(1, Math.max(0, por(distrato.inadimplenciaPct ?? 0)));
    const PAGO_DIRETO: Linha[] = ['parcelasObra', 'intermediarias', 'posChaves'];
    const lancar = (linha: Linha, m: number, valor: number, corte: number | null, pago: { total: number }) => {
        if (valor === 0 || m < 1) return;
        if (corte != null && m >= corte) return;
        const serie = out[linha];
        while (serie.length < m) serie.push(0);
        serie[m - 1] += valor;
        pago.total += PAGO_DIRETO.includes(linha) ? valor * (1 - inadimplencia) : valor;
    };

    /** Calendário de uma safra de valor `V` vendida no mês `s`. */
    const agendar = (V: number, s: number, corte: number | null): number => {
        const pago = { total: 0 };
        lancar('sinal', s, V * por(perfil.sinalPct), corte, pago);

        const parcelas = V * por(perfil.parcelasObraPct);
        const mesesAteChaves = chaves - s;
        if (mesesAteChaves > 0) {
            for (let m = s + 1; m <= chaves; m++) lancar('parcelasObra', m, parcelas / mesesAteChaves, corte, pago);
        } else {
            lancar('parcelasObra', s, parcelas, corte, pago);
        }

        const intermediarias = V * por(perfil.intermediariasPct);
        const intervalo = Math.round(perfil.intermediariasIntervalo || 0);
        const datas: number[] = [];
        if (s < chaves && intervalo > 0) for (let m = s + intervalo; m <= chaves; m += intervalo) datas.push(m);
        if (datas.length === 0) datas.push(Math.max(s, chaves));
        for (const m of datas) lancar('intermediarias', m, intermediarias / datas.length, corte, pago);

        const entrega = Math.max(chaves, s);
        lancar('repasse', entrega + Math.max(0, Math.round(perfil.atrasoDoRepasse || 0)), V * por(perfil.repassePct), corte, pago);

        const pos = V * por(perfil.posChavesPct);
        const n = Math.round(perfil.posChavesMeses || 0);
        if (n > 0) {
            const j = por(perfil.posChavesJurosMensal);
            const parcela = j > 0 ? pos * j / (1 - Math.pow(1 + j, -n)) : pos / n;
            for (let k = 1; k <= n; k++) lancar('posChaves', entrega + k, parcela, corte, pago);
        } else {
            lancar('posChaves', entrega, pos, corte, pago);
        }
        return pago.total;
    };

    const sem = { total: 0 };
    vendasPorMes.forEach((V, i) => {
        if (!V) return; // venda negativa (permuta acima de 100%) também entra: o motor avisa
        const s = i + 1;
        if (!(taxaDistrato > 0) || s >= chaves) {
            agendar(V, s, null);
            return;
        }
        const mesDoDistrato = Math.min(s + defasagem, chaves);
        agendar(V * (1 - taxaDistrato), s, null);
        const pagoAntes = agendar(V * taxaDistrato, s, mesDoDistrato);
        lancar('devolucaoDistrato', mesDoDistrato, -pagoAntes * por(distrato.devolucaoPct), null, sem);
        if (distrato.revende) agendar(V * taxaDistrato * (1 - desagio), mesDoDistrato + 1, null);
    });

    const tamanho = Math.max(Math.round(horizonte) || 0, ...Object.values(out).map(s => s.length));
    for (const serie of Object.values(out)) while (serie.length < tamanho) serie.push(0);
    return out;
}
