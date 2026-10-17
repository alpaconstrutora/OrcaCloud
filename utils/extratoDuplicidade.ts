/**
 * Duplicidade de extrato ENTRE FORMATOS — pura, para teste.
 *
 * O `fingerprint` da importação inclui a descrição, e cada formato de arquivo escreve
 * a descrição do seu jeito: o mesmo PIX vem como "PAGAMENTO PIX-PIX_DEB 321… Débora"
 * no OFX e "Pagamento pix 321… Débora" na planilha. Em 02/08/2026 o extrato Sicredi de
 * jan–jun/2024, já importado por OFX em 09/07, entrou de novo por planilha: 339 linhas
 * em dobro (~R$ 250 mil de créditos e ~R$ 242 mil de débitos), e duas delas chegaram a
 * ser conciliadas (docs/planos/2026-10-17-recibo-extrato-debora.md).
 *
 * O critério que pega isso é o que não depende do formato: conta + data + valor +
 * direção. Ele não pode simplesmente recusar "já existe um igual", porque dois PIX de
 * R$ 150 no mesmo dia são dois movimentos reais. Então a conta é por QUANTIDADE: se o
 * banco já tem E movimentos daquela chave e o arquivo traz N, entram só N − E. Entre
 * arquivos do mesmo lote vale o mesmo raciocínio (o OFX e a planilha do mesmo período
 * enviados juntos): o total de uma chave é o MAIOR número trazido por um arquivo só,
 * nunca a soma.
 */

export interface LinhaDeExtrato {
    transaction_date: string;
    amount: number;
    direction: string;
    fingerprint: string;
    external_id?: string | null;
}

export interface SeparacaoDeDuplicadas<T> {
    /** O que entra no banco. */
    novas: T[];
    /** Já estavam no banco pelo fingerprint ou pelo id do banco (mesmo arquivo de novo). */
    jaExistiam: T[];
    /** Mesmo movimento já gravado (ou trazido por outro arquivo do lote) em outro formato. */
    gemeas: T[];
}

/** 'conta + data + valor + direção' sem a conta: a separação roda sempre dentro de UMA conta. */
export function chaveDoMovimento(l: Pick<LinhaDeExtrato, 'transaction_date' | 'amount' | 'direction'>): string {
    return `${(l.transaction_date ?? '').slice(0, 10)}|${Math.abs(Number(l.amount)).toFixed(2)}|${l.direction}`;
}

/**
 * Separa as linhas de um lote (agrupadas por arquivo, na ordem de envio) em novas,
 * já existentes e gêmeas de outro formato, contra o que a conta já tem no período.
 *
 * Preferência dentro de uma chave: linha com id do banco (OFX/CNAB) antes da sem id,
 * e o arquivo que traz mais movimentos daquela chave antes do que traz menos.
 */
export function separarGemeasDeOutroFormato<T extends LinhaDeExtrato>(
    arquivos: T[][],
    existentes: LinhaDeExtrato[],
): SeparacaoDeDuplicadas<T> {
    const fingerprintsNoBanco = new Set(existentes.map(e => e.fingerprint).filter(Boolean));
    const idsNoBanco = new Set(existentes.map(e => (e.external_id ?? '').trim()).filter(Boolean));
    const noBancoPorChave = new Map<string, number>();
    for (const e of existentes) {
        const k = chaveDoMovimento(e);
        noBancoPorChave.set(k, (noBancoPorChave.get(k) ?? 0) + 1);
    }

    const jaExistiam: T[] = [];
    // Por chave: quantos movimentos cada arquivo traz e quais candidatos a entrar.
    const porChave = new Map<string, { maiorPorArquivo: number; candidatas: { linha: T; arquivo: number; ordem: number }[] }>();
    const vistos = new Set<string>();
    let ordem = 0;

    arquivos.forEach((linhas, arquivo) => {
        const porChaveNoArquivo = new Map<string, number>();
        for (const linha of linhas) {
            const k = chaveDoMovimento(linha);
            porChaveNoArquivo.set(k, (porChaveNoArquivo.get(k) ?? 0) + 1);

            const id = (linha.external_id ?? '').trim();
            if (fingerprintsNoBanco.has(linha.fingerprint) || (id && idsNoBanco.has(id))) {
                jaExistiam.push(linha);
                continue;
            }
            // O mesmo fingerprint em dois arquivos do lote (o mesmo extrato enviado duas
            // vezes) é uma linha só.
            if (vistos.has(linha.fingerprint)) {
                jaExistiam.push(linha);
                continue;
            }
            vistos.add(linha.fingerprint);
            const grupo = porChave.get(k) ?? { maiorPorArquivo: 0, candidatas: [] };
            grupo.candidatas.push({ linha, arquivo, ordem: ordem++ });
            porChave.set(k, grupo);
        }
        for (const [k, n] of porChaveNoArquivo) {
            const grupo = porChave.get(k);
            if (grupo) grupo.maiorPorArquivo = Math.max(grupo.maiorPorArquivo, n);
            else porChave.set(k, { maiorPorArquivo: n, candidatas: [] });
        }
    });

    const novas: T[] = [];
    const gemeas: T[] = [];
    for (const [k, grupo] of porChave) {
        if (grupo.candidatas.length === 0) continue;
        const noBanco = noBancoPorChave.get(k) ?? 0;
        const entram = Math.max(0, grupo.maiorPorArquivo - noBanco);
        const nDoArquivo = (arquivo: number) => arquivos[arquivo].filter(l => chaveDoMovimento(l) === k).length;
        const ordenadas = [...grupo.candidatas].sort((a, b) => {
            const idA = (a.linha.external_id ?? '').trim() ? 1 : 0;
            const idB = (b.linha.external_id ?? '').trim() ? 1 : 0;
            if (idA !== idB) return idB - idA;
            const nA = nDoArquivo(a.arquivo), nB = nDoArquivo(b.arquivo);
            if (nA !== nB) return nB - nA;
            return a.ordem - b.ordem;
        });
        ordenadas.forEach((c, i) => (i < entram ? novas : gemeas).push(c.linha));
    }

    // Devolve as novas na ordem em que vieram nos arquivos.
    const posicao = new Map<T, number>();
    arquivos.flat().forEach((l, i) => { if (!posicao.has(l)) posicao.set(l, i); });
    novas.sort((a, b) => (posicao.get(a) ?? 0) - (posicao.get(b) ?? 0));

    return { novas, jaExistiam, gemeas };
}
