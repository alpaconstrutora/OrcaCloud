/**
 * Book de crédito em PDF — montado SÓ a partir da VERSÃO do Credit Room: a congelada (liberada) ou a prévia de hoje
 * (carimbada "PRÉVIA — não liberada à instituição", que nunca leva a marca do credor).
 *
 * Puro (como `utils/imovibRelatorioPdf.ts`): recebe a versão e as imagens já
 * baixadas (dataURL) e devolve o `jsPDF` sem salvar — dá para gerar e conferir
 * fora do navegador. Nunca lê dado vivo: a empresa e o banco olham para o mesmo
 * papel. O cenário Base do estresse é o número CONGELADO (`capacidade_maxima`,
 * `resumo.dscr_minimo_12m`), nunca recalculado — a mesma regra da tela (F2).
 *
 * Regras que o book respeita:
 *   · Nome de cliente nunca sai: a carteira só tem rótulo mascarado ("Comprador 01").
 *   · "Dado ausente ≠ zero": bloco `null` vira frase, valor ausente vira "n/d".
 *     Versão schema 1 sai sem as seções de capacidade, dizendo por quê.
 *   · Foto que não carrega (ou dataURL inválido) não derruba o book: sai sem ela.
 *   · Texto em Latin-1: o jsPDF com fonte padrão vira UTF-16 quebrado se o texto
 *     tem "—", "≥" etc. `limpo()` troca por equivalentes antes de desenhar.
 *   · Datas por split (`formatDateBR`), nunca `new Date('AAAA-MM-DD')`.
 *
 * Uma seção por arquivo (este diretório); este índice monta a ordem e desenha
 * o rodapé e a marca d'água depois de todo o conteúdo.
 */
import { jsPDF } from 'jspdf';
import { formatDateBR } from '../../components/ui/Format';
import type { CreditRoomVersion } from '../../types/creditRoom';
import { MARCA_DA_PREVIA, ehPrevia } from '../creditRoomPrevia';
import { COR, MARGEM, altura, limpo, nomeDaVersao, novaPagina, type Ctx, type ExtrasDoBook } from './base';
import { desenharCapa } from './capa';
import { secaoResumo } from './resumo';
import { secaoCapacidade } from './capacidade';
import { secaoEstresse } from './estresse';
import { secaoEmpreendimentos } from './empreendimentos';
import { secaoCarteira, secaoDataRoom } from './carteira';

export type { ExtrasDoBook } from './base';
export { limpo } from './base';
export { fotosDoEmpreendimento, urlsDasFotosDoBook } from './fotos';

// ── Rodapé e marca d'água (depois de todo o conteúdo, página a página) ───────

/** Marca diagonal e clara por cima do conteúdo (transparência), centrada na página; `deslocamento` empilha marcas. */
function desenharMarca(doc: jsPDF, marca: string, opts: { opacidade: number; cor: readonly [number, number, number]; deslocamento: number }) {
    const largura = doc.internal.pageSize.getWidth();
    doc.saveGraphicsState();
    doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: opts.opacidade }));
    const texto = limpo(marca);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    const tamanho = Math.min(30, (30 * (largura - 40)) / Math.max(1, doc.getTextWidth(texto)));
    doc.setFontSize(tamanho);
    doc.setTextColor(opts.cor[0], opts.cor[1], opts.cor[2]);
    doc.text(texto, largura / 2, altura(doc) / 2 + opts.deslocamento, { align: 'center', angle: 40 });
    doc.restoreGraphicsState();
}

function rodapeEMarca(doc: jsPDF, versao: CreditRoomVersion, extras: ExtrasDoBook) {
    const total = doc.getNumberOfPages();
    const previa = ehPrevia(versao);
    for (let n = 1; n <= total; n++) {
        doc.setPage(n);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
        doc.text(limpo(`${extras.room.code} · ${nomeDaVersao(versao)} · data-base ${formatDateBR(versao.dataBase)} · página ${n}/${total}`), MARGEM, altura(doc) - 8);
        let deslocamento = 0;
        if (previa) {
            // Book interno da prévia: o carimbo sai em TODA página, mais forte que a marca do credor.
            desenharMarca(doc, MARCA_DA_PREVIA, { opacidade: 0.16, cor: COR.vermelho, deslocamento });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
            doc.setTextColor(COR.vermelho[0], COR.vermelho[1], COR.vermelho[2]);
            doc.text(limpo(MARCA_DA_PREVIA), doc.internal.pageSize.getWidth() - MARGEM, altura(doc) - 8, { align: 'right' });
            deslocamento = 35;
        }
        // Diagonal e clara: identifica quem baixou sem esconder nada.
        if (extras.marcaDagua) desenharMarca(doc, extras.marcaDagua, { opacidade: 0.12, cor: [100, 116, 139], deslocamento });
    }
}

// ── O book ───────────────────────────────────────────────────────────────────

export function montarBook(versao: CreditRoomVersion, extras: ExtrasDoBook): jsPDF {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const c: Ctx = { doc, y: MARGEM };

    desenharCapa(c, versao, extras);
    novaPagina(c); secaoResumo(c, versao);
    novaPagina(c); secaoCapacidade(c, versao);
    novaPagina(c); secaoEstresse(c, versao);
    novaPagina(c); secaoEmpreendimentos(c, versao, extras.imagens);
    novaPagina(c); secaoCarteira(c, versao);
    novaPagina(c); secaoDataRoom(c, extras.documentos);

    rodapeEMarca(doc, versao, extras);
    return doc;
}
