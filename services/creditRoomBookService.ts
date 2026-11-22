/**
 * Baixa o book de crédito (PDF) de uma VERSÃO congelada do Credit Room.
 *
 * Fino de propósito: a conta e o desenho moram em `utils/creditRoomBook.ts`
 * (puro, testável). Aqui só o que depende do navegador — buscar as fotos,
 * reduzi-las e entregar o arquivo.
 *
 * Foto que não carrega (CORS, 404, tempo esgotado, formato estranho) é
 * IGNORADA: o book sai sem ela, nunca falha inteiro. As fotos ficam no bucket
 * público `empreendimento-midia`, que libera GET entre origens.
 *
 * O jsPDF e o desenhista do book entram por `import()`: só pesam no bundle
 * de quem clica em "Baixar book".
 */
import type { CreditRoom, CreditRoomDocument, CreditRoomVersion } from '../types/creditRoom';
import type { ExtrasDoBook } from '../utils/creditRoomBook';
import { ehPrevia } from '../utils/creditRoomPrevia';

const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;
const TEMPO_POR_FOTO_MS = 10_000;
const FOTOS_EM_PARALELO = 4;
/** Teto de tempo para TODAS as fotos juntas: estourou, o book sai com o que chegou. */
const ORCAMENTO_TOTAL_MS = 60_000;

/** Uma foto → dataURL JPEG (≤ 1600 px). Qualquer falha devolve `null`. `geral` aborta tudo (teto total). */
async function baixarImagem(url: string, geral: AbortSignal): Promise<string | null> {
    if (!/^https?:\/\//i.test(url) || geral.aborted) return null;
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_POR_FOTO_MS);
    const abortarJunto = () => controle.abort();
    geral.addEventListener('abort', abortarJunto);
    let canvas: HTMLCanvasElement | null = null;
    try {
        // Sem credenciais nem referrer: é um GET público de imagem.
        const resposta = await fetch(url, { signal: controle.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!resposta.ok) return null;
        const blob = await resposta.blob();
        const bitmap = await createImageBitmap(blob);
        try {
            const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
            const largura = Math.max(1, Math.round(bitmap.width * escala));
            const altura = Math.max(1, Math.round(bitmap.height * escala));
            canvas = document.createElement('canvas');
            canvas.width = largura;
            canvas.height = altura;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            // JPEG não tem transparência: sem o fundo branco, PNG com alfa sairia preto.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, largura, altura);
            ctx.drawImage(bitmap, 0, 0, largura, altura);
            const dataUrl = canvas.toDataURL('image/jpeg', QUALIDADE_JPEG);
            return dataUrl.startsWith('data:image/jpeg') ? dataUrl : null;
        } finally {
            bitmap.close();
        }
    } catch {
        return null;
    } finally {
        clearTimeout(relogio);
        geral.removeEventListener('abort', abortarJunto);
        // Solta a memória do bitmap do canvas: com dezenas de fotos de 1600 px elas se acumulam.
        if (canvas) canvas.width = canvas.height = 0;
    }
}

/**
 * As fotos pedidas, no máximo `FOTOS_EM_PARALELO` por vez; só entram no mapa as que carregaram.
 * Passado `orcamentoMs` (60 s no total), não começa foto nova e aborta as em andamento.
 */
export async function baixarImagens(urls: string[], orcamentoMs: number = ORCAMENTO_TOTAL_MS): Promise<Record<string, string>> {
    const imagens: Record<string, string> = {};
    const fila = [...urls];
    const geral = new AbortController();
    const relogio = setTimeout(() => { geral.abort(); fila.length = 0; }, orcamentoMs);
    const trabalhador = async () => {
        for (let url = fila.shift(); url !== undefined; url = fila.shift()) {
            if (geral.signal.aborted) return;
            const dataUrl = await baixarImagem(url, geral.signal);
            if (dataUrl && !geral.signal.aborted) imagens[url] = dataUrl;
        }
    };
    try {
        await Promise.all(Array.from({ length: Math.min(FOTOS_EM_PARALELO, urls.length) }, trabalhador));
    } finally {
        clearTimeout(relogio);
    }
    return imagens;
}

/** Nome de arquivo seguro: o código do room pode trazer barra ou espaço. */
export const nomeDoArquivoDoBook = (code: string, versionNo: number): string =>
    `book-${code.replace(/[^A-Za-z0-9._-]+/g, '_')}-V${versionNo}.pdf`;

/** Book da PRÉVIA (interno): `book-{code}-previa-AAAA-MM-DD.pdf`, com a data-base (= hoje) da prévia. */
export const nomeDoArquivoDaPrevia = (code: string, dataBase: string): string =>
    `book-${code.replace(/[^A-Za-z0-9._-]+/g, '_')}-previa-${dataBase.slice(0, 10)}.pdf`;

export const creditRoomBookService = {
    /**
     * Índice do Data Room para o book: nome, categoria e, no escopo de Grupo,
     * a empresa dona (nome vem da própria versão congelada).
     */
    documentosDoIndice(documentos: CreditRoomDocument[], versao: CreditRoomVersion): ExtrasDoBook['documentos'] {
        const escopo = versao.snapshot.escopo;
        const nomeDaOrg = new Map((escopo?.organizacoes ?? []).map(o => [o.id, o.nome]));
        return documentos.map(d => ({
            nome: d.nome,
            categoria: d.categoria,
            empresa: escopo?.tipo === 'GRUPO' && d.organizationId ? (nomeDaOrg.get(d.organizationId) ?? null) : null,
        }));
    },

    /**
     * Gera o book da versão (liberada ou a prévia da tela) e dispara o download. O book da prévia é interno:
     * sai carimbado "PRÉVIA" e nunca com a marca do credor.
     */
    async baixar(
        room: Pick<CreditRoom, 'code' | 'name' | 'institutionName'>,
        versao: CreditRoomVersion,
        opts: { marcaDagua?: string; documentos: ExtrasDoBook['documentos'] },
    ): Promise<void> {
        if (ehPrevia(versao) && opts.marcaDagua) throw new Error('Prévia não sai para a instituição.');
        const { montarBook, urlsDasFotosDoBook } = await import('../utils/creditRoomBook');
        const imagens = await baixarImagens(urlsDasFotosDoBook(versao));
        const doc = montarBook(versao, {
            room: { code: room.code, name: room.name, institutionName: room.institutionName ?? null },
            imagens,
            documentos: opts.documentos,
            marcaDagua: opts.marcaDagua,
        });
        doc.save(ehPrevia(versao) ? nomeDoArquivoDaPrevia(room.code, versao.dataBase) : nomeDoArquivoDoBook(room.code, versao.versionNo));
    },
};
