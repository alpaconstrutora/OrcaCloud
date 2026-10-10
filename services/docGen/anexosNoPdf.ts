import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../../lib/supabase';
import type { AnexoDoc } from '../../types/docGen';
import type { AnexoRasterizado } from './motorRender';

/**
 * Anexos do GED DENTRO do PDF do ofício (F5 — "anexos dentro do PDF" da Fase 2).
 *
 * Sem `pdf-lib`: cada página do anexo vira imagem (pdfjs → canvas → JPEG) e entra
 * no pdfmake depois do texto, como o editor de plantas já rasteriza PDF
 * (`blueprintUnderlayService.rasterizarPdf`). Imagem (PNG/JPEG) entra como está.
 * Outro formato (.docx, .dwg…) entra como uma página de aviso — o arquivo
 * continua no GED, ligado ao ofício.
 *
 * Só documentos do GED da MESMA organização do ofício (a RLS do Storage também
 * recorta, mas o motivo de recusa fica claro aqui).
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/** Teto de páginas incorporadas — um PDF de 300 páginas não cabe num ofício. */
export const MAX_PAGINAS_ANEXAS = 30;
const DPI = 110;

async function baixarDoGed(orgId: string, documentId: string): Promise<{ blob: Blob; nomeArquivo: string } | null> {
    const { data: doc } = await supabase.from('opura_documents').select('organization_id, active_version_id').eq('id', documentId).maybeSingle();
    const d = doc as { organization_id?: string; active_version_id?: string } | null;
    if (!d || d.organization_id !== orgId || !d.active_version_id) return null;
    const { data: versao } = await supabase.from('opura_document_versions').select('storage_path').eq('id', d.active_version_id).maybeSingle();
    const path = (versao as { storage_path?: string } | null)?.storage_path;
    if (!path) return null;
    const { data: blob, error } = await supabase.storage.from('opura-docs').download(path);
    if (error || !blob) return null;
    return { blob, nomeArquivo: path.split('/').pop() ?? '' };
}

function lerComoDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}

function dimensoes(dataUrl: string): Promise<{ largura: number; altura: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
        img.onerror = () => reject(new Error('Imagem do anexo ilegível.'));
        img.src = dataUrl;
    });
}

async function paginasDoPdf(blob: Blob, restantes: number): Promise<AnexoRasterizado['paginas']> {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    if (doc.numPages > restantes) {
        throw new Error(`Os anexos passam de ${MAX_PAGINAS_ANEXAS} páginas no PDF — desmarque "anexos dentro do PDF" e envie-os separados.`);
    }
    const out: AnexoRasterizado['paginas'] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: DPI / 72 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível para rasterizar o anexo.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        out.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), largura: canvas.width, altura: canvas.height });
    }
    return out;
}

/** Os anexos do GED do ofício, prontos para o motor. Anexo só descrito não entra (não tem arquivo). */
export async function rasterizarAnexos(orgId: string, anexos: AnexoDoc[]): Promise<AnexoRasterizado[]> {
    const out: AnexoRasterizado[] = [];
    let usadas = 0;
    for (const [i, a] of anexos.entries()) {
        if (a.tipo !== 'GED' || !a.documentId) continue;
        const titulo = `Anexo ${i + 1} — ${a.nome}`;
        const arq = await baixarDoGed(orgId, a.documentId);
        if (!arq) { out.push({ titulo, paginas: [], aviso: 'Arquivo não encontrado no GED desta organização.' }); continue; }
        const tipo = arq.blob.type || '';
        const ext = arq.nomeArquivo.split('.').pop()?.toLowerCase() ?? '';
        if (tipo === 'application/pdf' || ext === 'pdf') {
            const paginas = await paginasDoPdf(arq.blob, MAX_PAGINAS_ANEXAS - usadas);
            usadas += paginas.length;
            out.push({ titulo, paginas });
        } else if (/^image\/(png|jpe?g)$/.test(tipo) || ['png', 'jpg', 'jpeg'].includes(ext)) {
            if (usadas + 1 > MAX_PAGINAS_ANEXAS) throw new Error(`Os anexos passam de ${MAX_PAGINAS_ANEXAS} páginas no PDF.`);
            const dataUrl = await lerComoDataUrl(arq.blob);
            out.push({ titulo, paginas: [{ dataUrl, ...(await dimensoes(dataUrl)) }] });
            usadas += 1;
        } else {
            out.push({ titulo, paginas: [], aviso: `Arquivo .${ext || '?'} não pode ser incorporado ao PDF — consulte o anexo no GED.` });
        }
    }
    return out;
}
