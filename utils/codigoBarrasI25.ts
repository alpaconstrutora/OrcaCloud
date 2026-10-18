/**
 * Leitura do código de barras FEBRABAN (Interleaved 2 of 5, 44 dígitos) a partir
 * de uma IMAGEM — sem DOM, sem pdf.js: recebe os pixels (o formato do `ImageData`)
 * e devolve o código. Quem renderiza o PDF é `boletoParser.lerCodigoDeBarrasDoPdf`.
 *
 * Por que existe (18/10/2026): o boleto #1486, reaviso da Energisa, não imprime a
 * linha digitável — só desenha as barras. O leitor de texto falhava e o boleto
 * ficava impagável pela Asaas. Plano: docs/planos/2026-10-18-boleto-linha-pelo-codigo-de-barras.md.
 *
 * Como lê: varre linhas horizontais; em cada uma, procura o início do I2of5
 * (barra-espaço-barra-espaço estreitos, depois de uma zona branca), lê 22 pares de
 * dígitos (cada par = 5 barras + 5 espaços intercalados, exatamente 2 largos em cada
 * grupo de 5 — é essa garantia, e não um limiar fixo, que separa estreito de largo)
 * e confere o fim (barra larga, espaço e barra estreitos). Só aceita código cujo DV
 * geral confere, e só devolve o que várias linhas leram igual.
 *
 * ⚠️ Imports só relativos e COM extensão `.ts` (mesmo padrão de `boletoTexto.ts`).
 */

import { dvDoCodigoDeBarrasConfere } from './febrabanRules.ts';

export interface ImagemRGBA {
    width: number;
    height: number;
    /** RGBA, 4 bytes por pixel — `ImageData.data`. */
    data: Uint8ClampedArray | Uint8Array;
}

export interface LeituraCodigoDeBarras {
    /** O código escolhido, ou null (nenhum, ou mais de um código diferente na imagem). */
    codigo: string | null;
    /** Todos os códigos válidos lidos, com quantas linhas da imagem leram cada um. */
    candidatos: { codigo: string; linhas: number }[];
    motivo?: 'nenhum_codigo' | 'mais_de_um_codigo';
}

/** Padrões dos dígitos: L = largo, E = estreito (5 elementos, 2 largos). */
const PADRAO_DIGITO: Record<string, string> = {
    EELLE: '0', LEEEL: '1', ELEEL: '2', LLEEE: '3', EELEL: '4',
    LELEE: '5', ELLEE: '6', EEELL: '7', LEELE: '8', ELELE: '9',
};

const PARES = 22;                       // 44 dígitos
const ELEMENTOS = 4 + PARES * 10 + 3;   // início + pares + fim

type Run = { preto: boolean; largura: number };

/** Luminância de uma linha (horizontal) ou de uma coluna (código em pé). */
function luminancia(img: ImagemRGBA, eixo: 'linha' | 'coluna', k: number): Uint8Array {
    const { width, height, data } = img;
    const n = eixo === 'linha' ? width : height;
    const lum = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
        const i = eixo === 'linha' ? (k * width + t) * 4 : (t * width + k) * 4;
        lum[t] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return lum;
}

function runsDe(lum: Uint8Array): Run[] {
    let min = 255, max = 0;
    for (const v of lum) { if (v < min) min = v; if (v > max) max = v; }
    if (max - min < 60) return [];
    const limiar = (min + max) / 2;
    const runs: Run[] = [];
    let atual = lum[0] < limiar;
    let n = 0;
    for (const v of lum) {
        const preto = v < limiar;
        if (preto === atual) n++;
        else { runs.push({ preto: atual, largura: n }); atual = preto; n = 1; }
    }
    runs.push({ preto: atual, largura: n });
    return runs;
}

/** Classifica 5 larguras: as 2 maiores são largas. null se a separação não é nítida. */
function padraoDoGrupo(larguras: number[]): string | null {
    const ordem = larguras.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w);
    const menorLarga = ordem[1].w;
    const maiorEstreita = ordem[2].w;
    if (menorLarga < maiorEstreita * 1.3) return null;
    const largas = new Set([ordem[0].i, ordem[1].i]);
    return larguras.map((_, i) => (largas.has(i) ? 'L' : 'E')).join('');
}

/** Tenta ler um código começando no run `i` (que deve ser a 1ª barra do início). */
function lerAPartirDe(runs: Run[], i: number): string | null {
    if (i + ELEMENTOS > runs.length) return null;
    const inicio = runs.slice(i, i + 4).map(r => r.largura);
    const estreito = inicio.reduce((s, w) => s + w, 0) / 4;
    if (inicio.some(w => w < estreito * 0.5 || w > estreito * 1.6)) return null;
    // Zona quieta antes do início (branco de pelo menos 5 estreitos).
    const antes = runs[i - 1];
    if (!antes || antes.preto || antes.largura < estreito * 5) return null;

    let digitos = '';
    for (let p = 0; p < PARES; p++) {
        const o = i + 4 + p * 10;
        const grupo = runs.slice(o, o + 10).map(r => r.largura);
        const barras = padraoDoGrupo([grupo[0], grupo[2], grupo[4], grupo[6], grupo[8]]);
        const espacos = padraoDoGrupo([grupo[1], grupo[3], grupo[5], grupo[7], grupo[9]]);
        if (!barras || !espacos) return null;
        const d1 = PADRAO_DIGITO[barras];
        const d2 = PADRAO_DIGITO[espacos];
        if (d1 === undefined || d2 === undefined) return null;
        digitos += d1 + d2;
    }
    // Fim: barra larga, espaço estreito, barra estreita.
    const f = i + 4 + PARES * 10;
    const [barraLarga, espaco, barraFim] = [runs[f].largura, runs[f + 1].largura, runs[f + 2].largura];
    if (barraLarga < Math.max(espaco, barraFim) * 1.3) return null;
    return dvDoCodigoDeBarrasConfere(digitos) ? digitos : null;
}

function lerLinha(runs: Run[]): string[] {
    const achados: string[] = [];
    for (let i = 1; i < runs.length; i++) {
        if (!runs[i].preto) continue;
        const c = lerAPartirDe(runs, i);
        if (c) { achados.push(c); i += ELEMENTOS - 1; }
    }
    return achados;
}

/**
 * Lê o(s) código(s) de barras FEBRABAN da imagem. `passo` = de quantas em quantas
 * linhas varrer; `minLinhas` = quantas linhas precisam ler o mesmo código.
 */
export function lerCodigoDeBarras(img: ImagemRGBA, opcoes: { passo?: number; minLinhas?: number } = {}): LeituraCodigoDeBarras {
    const passo = Math.max(1, opcoes.passo ?? 2);
    const minLinhas = Math.max(1, opcoes.minLinhas ?? 3);
    const votos = new Map<string, number>();
    // Linhas e colunas: há boleto com o código EM PÉ na lateral (visto na amostra
    // real, "Banco 312"). De trás para frente também: documento girado 180°.
    const varrer = (eixo: 'linha' | 'coluna', total: number) => {
        for (let k = 0; k < total; k += passo) {
            const runs = runsDe(luminancia(img, eixo, k));
            if (runs.length < ELEMENTOS) continue;
            const lidos = [...lerLinha(runs), ...lerLinha([...runs].reverse())];
            for (const c of new Set(lidos)) votos.set(c, (votos.get(c) ?? 0) + 1);
        }
    };
    varrer('linha', img.height);
    varrer('coluna', img.width);
    const candidatos = [...votos.entries()]
        .filter(([, n]) => n >= minLinhas)
        .map(([codigo, linhas]) => ({ codigo, linhas }))
        .sort((a, b) => b.linhas - a.linhas);
    if (candidatos.length === 0) return { codigo: null, candidatos, motivo: 'nenhum_codigo' };
    if (candidatos.length > 1) return { codigo: null, candidatos, motivo: 'mais_de_um_codigo' };
    return { codigo: candidatos[0].codigo, candidatos };
}
