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

const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;
const TEMPO_POR_FOTO_MS = 10_000;
const FOTOS_EM_PARALELO = 4;

/** Uma foto → dataURL JPEG (≤ 1600 px). Qualquer falha devolve `null`. */
async function baixarImagem(url: string): Promise<string | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_POR_FOTO_MS);
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
            const canvas = document.createElement('canvas');
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
    }
}

/** As fotos pedidas, no máximo `FOTOS_EM_PARALELO` por vez; só entram no mapa as que carregaram. */
export async function baixarImagens(urls: string[]): Promise<Record<string, string>> {
    const imagens: Record<string, string> = {};
    const fila = [...urls];
    const trabalhador = async () => {
        for (let url = fila.shift(); url !== undefined; url = fila.shift()) {
            const dataUrl = await baixarImagem(url);
            if (dataUrl) imagens[url] = dataUrl;
        }
    };
    await Promise.all(Array.from({ length: Math.min(FOTOS_EM_PARALELO, urls.length) }, trabalhador));
    return imagens;
}

/** Nome de arquivo seguro: o código do room pode trazer barra ou espaço. */
export const nomeDoArquivoDoBook = (code: string, versionNo: number): string =>
    `book-${code.replace(/[^A-Za-z0-9._-]+/g, '_')}-V${versionNo}.pdf`;

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

    /** Gera o book da versão e dispara o download. */
    async baixar(
        room: Pick<CreditRoom, 'code' | 'name' | 'institutionName'>,
        versao: CreditRoomVersion,
        opts: { marcaDagua?: string; documentos: ExtrasDoBook['documentos'] },
    ): Promise<void> {
        const { montarBook, urlsDasFotosDoBook } = await import('../utils/creditRoomBook');
        const imagens = await baixarImagens(urlsDasFotosDoBook(versao));
        const doc = montarBook(versao, {
            room: { code: room.code, name: room.name, institutionName: room.institutionName ?? null },
            imagens,
            documentos: opts.documentos,
            marcaDagua: opts.marcaDagua,
        });
        doc.save(nomeDoArquivoDoBook(room.code, versao.versionNo));
    },
};
