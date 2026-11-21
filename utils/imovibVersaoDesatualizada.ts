/**
 * Versão publicada desatualizada (item 5.1 do plano
 * docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md): o investidor vê os números CONGELADOS;
 * quando o estudo muda depois, o gestor precisa saber que a vitrine ficou para trás.
 * Compara os quatro números que a vitrine mostra. Puro; testes em __tests__/imovibVersaoDesatualizada.test.ts.
 */
export interface NumerosComparados {
    vgv: number;
    vpl: number;
    /** % a.a.; null = sem TIR. */
    tirAnual: number | null;
    exposicaoMaxima: number;
}

export interface DiferencaDaVersao {
    rotulo: string;
    antes: string;
    agora: string;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const pct = (v: number | null) => (v == null ? 'sem TIR' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% a.a.`);

/** Diferenças acima do arredondamento: R$ 1 nos valores, 0,01 p.p. na TIR. */
export function diferencasDaVersaoPublicada(versao: NumerosComparados, atual: NumerosComparados): DiferencaDaVersao[] {
    const out: DiferencaDaVersao[] = [];
    const reais: [string, keyof NumerosComparados][] = [['VGV', 'vgv'], ['VPL', 'vpl'], ['Capital máximo exigido', 'exposicaoMaxima']];
    for (const [rotulo, k] of reais) {
        const a = Number(versao[k]) || 0;
        const b = Number(atual[k]) || 0;
        if (Math.abs(a - b) >= 1) out.push({ rotulo, antes: brl(a), agora: brl(b) });
    }
    const ta = versao.tirAnual;
    const tb = atual.tirAnual;
    if ((ta == null) !== (tb == null) || (ta != null && tb != null && Math.abs(ta - tb) >= 0.01)) {
        out.push({ rotulo: 'TIR', antes: pct(ta), agora: pct(tb) });
    }
    return out;
}

export const textoDasDiferencas = (d: DiferencaDaVersao[]) => d.map(x => `${x.rotulo} ${x.antes} → ${x.agora}`).join('; ');
