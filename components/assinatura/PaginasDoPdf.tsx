import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * As páginas do documento desenhadas na tela de assinatura (pdfjs-dist, já no
 * projeto), uma embaixo da outra, na largura do espaço — rola como uma página
 * comum, no computador e no celular. Antes o PDF ia num <iframe> de ~450 px numa
 * gaveta, e no celular abria em outra aba (o visualizador do navegador não rola
 * direito ali).
 *
 * Só desenha as páginas perto da área visível (documento de 30+ páginas) e
 * avisa o pai, a cada rolagem, em que página o leitor está, até onde já viu e se
 * chegou ao fim — o "Assinar" só libera no fim (pedido de 22/11/2026).
 * Plano: docs/planos/2026-11-21-assinatura-eletronica-interna.md (Tela de assinatura).
 */

export interface PosicaoDeLeitura {
    /** Página no meio da área visível (1-based). */
    atual: number;
    /** Última página que já apareceu na área visível (1-based). */
    ultimaVista: number;
    total: number;
    /** A rolagem chegou ao fim do documento (a última página está toda à vista). */
    noFim: boolean;
}

/** Folga, em px, para considerar que a rolagem chegou ao fim. */
const FOLGA_FIM = 32;
const LARGURA_MAX = 920;
const MARGEM = 16;

/**
 * Onde o leitor está, a partir da posição de cada página no contêiner de rolagem.
 * Puro — testado em __tests__/telaDeAssinatura.test.tsx.
 */
export function leituraDoScroll(
    topos: number[], scrollTop: number, alturaVisivel: number, alturaTotal: number,
): PosicaoDeLeitura {
    const total = topos.length;
    if (total === 0) return { atual: 0, ultimaVista: 0, total: 0, noFim: false };
    const meio = scrollTop + alturaVisivel / 2;
    const baixo = scrollTop + alturaVisivel;
    let atual = 1;
    let ultimaVista = 1;
    topos.forEach((t, i) => {
        if (t <= meio) atual = i + 1;
        if (t < baixo) ultimaVista = i + 1;
    });
    const noFim = baixo >= alturaTotal - FOLGA_FIM;
    return { atual, ultimaVista: noFim ? total : ultimaVista, total, noFim };
}

// pdfjs é pesado: só carrega quando a tela de assinatura abre.
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPagina>; destroy(): Promise<void> };
type PdfPagina = {
    getViewport(o: { scale: number }): { width: number; height: number };
    render(o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<void>; cancel(): void };
};
async function abrirPdf(url: string): Promise<PdfDoc> {
    const pdfjs = await import('pdfjs-dist');
    // Mesmo worker de services/relatorioAnexos.ts — sem ele o pdfjs trava a aba em documento grande.
    const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
    return (pdfjs as unknown as { getDocument(o: { url: string }): { promise: Promise<PdfDoc> } }).getDocument({ url }).promise;
}

interface Props {
    url: string;
    /** 1 = largura do espaço (até 920 px). */
    zoom: number;
    titulo: string;
    onPosicao: (p: PosicaoDeLeitura) => void;
    onErro: (msg: string) => void;
}

export function PaginasDoPdf({ url, zoom, titulo, onPosicao, onErro }: Props) {
    const rolagemRef = React.useRef<HTMLDivElement>(null);
    const paginasRef = React.useRef<(HTMLDivElement | null)[]>([]);
    const [doc, setDoc] = React.useState<PdfDoc | null>(null);
    const [tamanhos, setTamanhos] = React.useState<{ w: number; h: number }[]>([]);
    const [largura, setLargura] = React.useState(0);

    const posicaoRef = React.useRef(onPosicao);
    posicaoRef.current = onPosicao;
    const erroRef = React.useRef(onErro);
    erroRef.current = onErro;

    React.useEffect(() => {
        let vivo = true;
        let aberto: PdfDoc | null = null;
        setDoc(null); setTamanhos([]);
        abrirPdf(url)
            .then(async d => {
                aberto = d;
                const ts: { w: number; h: number }[] = [];
                for (let n = 1; n <= d.numPages; n++) {
                    const vp = (await d.getPage(n)).getViewport({ scale: 1 });
                    ts.push({ w: vp.width, h: vp.height });
                }
                if (!vivo) return;
                setTamanhos(ts);
                setDoc(d);
            })
            .catch(e => { if (vivo) erroRef.current(e instanceof Error ? e.message : 'Não foi possível mostrar o documento.'); });
        return () => { vivo = false; void aberto?.destroy(); };
    }, [url]);

    // Largura do espaço — a página acompanha (girar o celular, redimensionar a janela).
    React.useEffect(() => {
        const el = rolagemRef.current;
        if (!el) return;
        const medir = () => setLargura(el.clientWidth);
        medir();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const larguraPagina = Math.max(240, Math.min(Math.max(largura - MARGEM * 2, 0), LARGURA_MAX) * zoom);

    const medirLeitura = React.useCallback(() => {
        const el = rolagemRef.current;
        if (!el || tamanhos.length === 0) return;
        const topos = paginasRef.current.slice(0, tamanhos.length).map(p => p?.offsetTop ?? 0);
        posicaoRef.current(leituraDoScroll(topos, el.scrollTop, el.clientHeight, el.scrollHeight));
    }, [tamanhos.length]);

    // Documento curto que cabe inteiro já está "lido até o fim" sem rolar.
    React.useLayoutEffect(() => { medirLeitura(); }, [medirLeitura, larguraPagina]);

    if (!doc) {
        return (
            <div ref={rolagemRef} className="flex-1 min-h-0 flex items-center justify-center bg-gray-100">
                <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo o documento…</p>
            </div>
        );
    }

    return (
        <div ref={rolagemRef} onScroll={medirLeitura} className="relative flex-1 min-h-0 overflow-auto bg-gray-100"
            role="document" aria-label={`Documento: ${titulo}`} tabIndex={0}>
            <div className="flex flex-col items-center gap-4 py-4 px-4 min-w-fit">
                {tamanhos.map((t, i) => (
                    <div key={i} ref={el => { paginasRef.current[i] = el; }}>
                        <Pagina doc={doc} numero={i + 1} largura={larguraPagina} altura={(larguraPagina * t.h) / t.w} raiz={rolagemRef} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Uma página: o espaço dela existe sempre (a rolagem não pula); o desenho só perto da área visível. */
function Pagina({ doc, numero, largura, altura, raiz }: {
    doc: PdfDoc; numero: number; largura: number; altura: number; raiz: React.RefObject<HTMLDivElement | null>;
}) {
    const caixaRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [perto, setPerto] = React.useState(numero <= 2);

    React.useEffect(() => {
        const el = caixaRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') { setPerto(true); return; }
        const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setPerto(true); },
            { root: raiz.current, rootMargin: '1200px 0px' });
        io.observe(el);
        return () => io.disconnect();
    }, [raiz]);

    React.useEffect(() => {
        if (!perto || !canvasRef.current) return;
        let tarefa: { cancel(): void } | null = null;
        let vivo = true;
        void doc.getPage(numero).then(p => {
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext('2d');
            if (!vivo || !canvas || !ctx) return;
            const base = p.getViewport({ scale: 1 });
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const vp = p.getViewport({ scale: (largura / base.width) * dpr });
            canvas.width = Math.floor(vp.width);
            canvas.height = Math.floor(vp.height);
            const r = p.render({ canvasContext: ctx, viewport: vp });
            tarefa = r;
            r.promise.catch(() => { /* cancelada por novo zoom/largura */ });
        });
        return () => { vivo = false; tarefa?.cancel(); };
    }, [perto, doc, numero, largura]);

    return (
        <div ref={caixaRef} className="bg-white shadow-sm border border-gray-200" style={{ width: largura, height: altura }}>
            {perto && <canvas ref={canvasRef} style={{ width: largura, height: altura }} aria-label={`Página ${numero}`} />}
        </div>
    );
}

export default PaginasDoPdf;
