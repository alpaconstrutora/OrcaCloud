// Carimbo do PDF final da assinatura interna: rodapé em todas as páginas do
// original + uma página de manifesto com QR para a validação pública.
// O texto (o que se escreve) vem de regras.ts; aqui só se desenha.
// @ts-ignore — import por URL (Deno), o mesmo pdf-lib de credit-room-download.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
// @ts-ignore — gerador de QR puro (sem canvas): devolve a matriz de módulos.
import qrcode from "https://esm.sh/qrcode-generator@1.4.4";
import {
    blocosDoManifesto, quebrarLinhas, sanitizarWinAnsi,
    type EnvelopeDoManifesto, type SignatarioDoManifesto,
} from "./regras.ts";

/** Páginas do PDF; recusa PDF protegido por senha (não dá para carimbar). */
export async function contarPaginas(bytes: Uint8Array): Promise<number> {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPageCount();
}

function desenharQr(pagina: any, url: string, x: number, y: number, lado: number) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n: number = qr.getModuleCount();
    const m = lado / n;
    pagina.drawRectangle({ x: x - 4, y: y - 4, width: lado + 8, height: lado + 8, color: rgb(1, 1, 1) });
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) {
                pagina.drawRectangle({ x: x + c * m, y: y + (n - 1 - r) * m, width: m, height: m, color: rgb(0, 0, 0) });
            }
        }
    }
}

export async function carimbar(
    original: Uint8Array,
    env: EnvelopeDoManifesto,
    signatarios: SignatarioDoManifesto[],
    urlValidacao: string,
): Promise<Uint8Array> {
    const pdf = await PDFDocument.load(original);
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
    const cinza = rgb(0.35, 0.35, 0.35);

    // 1. Rodapé em cada página do original.
    const nomes = signatarios.map(s => sanitizarWinAnsi(s.nome)).join(', ');
    const rodape = sanitizarWinAnsi(`Assinado eletronicamente por ${nomes}. Envelope ${env.id} - valide em ${urlValidacao}`);
    for (const pagina of pdf.getPages()) {
        const { width } = pagina.getSize();
        const linhas = quebrarLinhas(rodape, width - 48, t => fonte.widthOfTextAtSize(t, 6.5)).slice(0, 3);
        linhas.forEach((l, i) => {
            pagina.drawText(l, { x: 24, y: 14 + (linhas.length - 1 - i) * 8, size: 6.5, font: fonte, color: cinza });
        });
    }

    // 2. Manifesto (A4), quantas páginas precisar.
    const A4: [number, number] = [595.28, 841.89];
    const margem = 48;
    const largura = A4[0] - margem * 2;
    let pagina = pdf.addPage(A4);
    let y = A4[1] - margem;

    const novaPagina = () => { pagina = pdf.addPage(A4); y = A4[1] - margem; };
    const linha = (t: string, tamanho: number, f: any, cor = rgb(0.1, 0.1, 0.1), recuo = 0, larguraUtil = largura) => {
        for (const l of quebrarLinhas(t, larguraUtil - recuo, s => f.widthOfTextAtSize(s, tamanho))) {
            if (y < margem + 20) novaPagina();
            pagina.drawText(l, { x: margem + recuo, y, size: tamanho, font: f, color: cor });
            y -= tamanho + 4;
        }
    };

    // QR no canto superior direito da 1ª página do manifesto; o cabeçalho fica à esquerda dele.
    const LADO_QR = 84;
    desenharQr(pagina, urlValidacao, A4[0] - margem - LADO_QR, A4[1] - margem - LADO_QR, LADO_QR);
    linha('Manifesto de assinaturas eletrônicas', 16, negrito, undefined, 0, largura - LADO_QR - 16);
    y -= 2;
    linha(sanitizarWinAnsi(env.titulo), 11, fonte, cinza, 0, largura - LADO_QR - 16);
    y = Math.min(y, A4[1] - margem - LADO_QR - 16);

    for (const bloco of blocosDoManifesto(env, signatarios, urlValidacao)) {
        y -= 6;
        if (y < margem + 60) novaPagina();
        linha(bloco.titulo, 10.5, negrito);
        for (const l of bloco.linhas) linha(l, 8.5, fonte, rgb(0.2, 0.2, 0.2), 8);
    }

    return await pdf.save();
}
