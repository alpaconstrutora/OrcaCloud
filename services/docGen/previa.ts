import type { Organization } from '../../types/users';
import type { DocTipTap, LayoutModelo } from '../../types/docGen';
import { contextoDeExemplo, resolverTodos } from './catalogoCampos';
import { camposLivresDoModelo, montarDocDefinition, type AnexoRasterizado } from './motorRender';
import { gerarPdfBlob } from './pdf';

/**
 * Prévia de um MODELO (antes de existir documento): contexto de exemplo com a
 * organização real quando houver, campos livres preenchidos com texto de
 * amostra, assinante e anexos fictícios. Serve para ver margens, cabeçalho,
 * quebras de página e quais variáveis o modelo usa.
 */
const AMOSTRA_CAMPO_LIVRE = (rotulo: string): DocTipTap => ({
    type: 'doc',
    content: [
        { type: 'paragraph', content: [{ type: 'text', text: `[Texto de exemplo do campo "${rotulo}".] Vimos por meio deste solicitar a Vossa Senhoria as providências necessárias para a ligação definitiva de energia elétrica do empreendimento, conforme projeto aprovado e documentação anexa.` }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Colocamo-nos à disposição para quaisquer esclarecimentos.' }] },
    ],
});

const logoCache = new Map<string, Promise<string | null>>();

/** Logo como data URL — o pdfmake não baixa imagens por URL. Falha → sem logo. */
export function logoComoDataUrl(url?: string | null): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    if (url.startsWith('data:image/')) return Promise.resolve(url);
    let p = logoCache.get(url);
    if (!p) {
        p = fetch(url)
            .then(r => (r.ok ? r.blob() : null))
            .then(blob => blob && blob.type.startsWith('image/')
                ? new Promise<string | null>(resolve => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
                    fr.onerror = () => resolve(null);
                    fr.readAsDataURL(blob);
                })
                : null)
            .catch(() => null);
        logoCache.set(url, p);
    }
    return p;
}

export interface EntradaPrevia {
    conteudo: DocTipTap;
    layout: LayoutModelo;
    titulo: string;
    /** Organização real (nome, endereço, contato, logo). Sem ela, a de exemplo. */
    organization?: Organization | null;
}

export async function previaDoModelo(e: EntradaPrevia): Promise<Blob> {
    const ctx = contextoDeExemplo();
    if (e.organization) ctx.organization = e.organization;
    const valores = resolverTodos(ctx);
    const camposLivres: Record<string, DocTipTap> = {};
    for (const c of camposLivresDoModelo(e.conteudo)) camposLivres[c.nome] = AMOSTRA_CAMPO_LIVRE(c.rotulo);
    const logoDataUrl = e.layout.cabecalho.logo === 'organizacao'
        ? await logoComoDataUrl(e.organization?.logoUrl ?? null)
        : null;

    const def = montarDocDefinition({
        conteudo: e.conteudo,
        layout: e.layout,
        valores,
        camposLivres,
        assinaturas: ctx.assinante ? [{ nome: ctx.assinante.nome, cargo: ctx.assinante.cargo, registroProfissional: ctx.assinante.registroProfissional }] : [],
        anexos: ctx.documento?.anexos ?? [],
        logoDataUrl,
        titulo: `Prévia — ${e.titulo}`,
    });
    // Data fixa: a prévia do mesmo modelo é sempre o mesmo arquivo.
    return gerarPdfBlob(def, { id: 'previa-do-modelo', criadoEm: new Date(Date.UTC(2026, 0, 1, 12)) });
}

// ─── F2: prévia do DOCUMENTO (dados reais) ───────────────────────────────────

export interface EntradaPreviaDocumento {
    conteudoModelo: DocTipTap;
    layout: LayoutModelo;
    titulo: string;
    /** Valores finais (cadastro + overrides). */
    valores: Record<string, string>;
    camposLivres: Record<string, DocTipTap>;
    assinaturas: { nome: string; cargo?: string | null; registroProfissional?: string | null; imagemDataUrl?: string | null }[];
    anexos: string[];
    organization?: Organization | null;
    /** Número já emitido; no rascunho, o texto avisa que ele nasce na emissão. */
    numero?: string | null;
    /** F5: QR + endereço da validação pública. */
    validacaoUrl?: string | null;
    /** F5: anexos do GED já rasterizados (quando o ofício os leva dentro do PDF). */
    paginasAnexas?: AnexoRasterizado[] | null;
}

export const NUMERO_NO_RASCUNHO = 'nº atribuído na emissão';

export async function previaDoDocumento(
    e: EntradaPreviaDocumento,
    /** PDF DEFINITIVO (emissão): id do documento e data da emissão — o mesmo registro dá os mesmos bytes. */
    oficial?: { id: string; criadoEm: Date },
): Promise<Blob> {
    const logoDataUrl = e.layout.cabecalho.logo === 'organizacao'
        ? await logoComoDataUrl(e.organization?.logoUrl ?? null)
        : null;
    const def = montarDocDefinition({
        conteudo: e.conteudoModelo,
        layout: e.layout,
        valores: { ...e.valores, 'documento.numero': e.numero || NUMERO_NO_RASCUNHO },
        camposLivres: e.camposLivres,
        assinaturas: e.assinaturas,
        anexos: e.anexos,
        logoDataUrl,
        titulo: e.titulo,
        validacao: e.validacaoUrl ? { url: e.validacaoUrl } : null,
        paginasAnexas: e.paginasAnexas ?? null,
    });
    return gerarPdfBlob(def, oficial ?? { id: 'previa-do-documento', criadoEm: new Date(Date.UTC(2026, 0, 1, 12)) });
}
