/**
 * Book de crédito em PDF — montado SÓ a partir da VERSÃO congelada do Credit Room.
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
import { COR, MARGEM, altura, limpo, novaPagina, type Ctx, type ExtrasDoBook } from './base';
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

function rodapeEMarca(doc: jsPDF, versao: CreditRoomVersion, extras: ExtrasDoBook) {
    const total = doc.getNumberOfPages();
    const largura = doc.internal.pageSize.getWidth();
    for (let n = 1; n <= total; n++) {
        doc.setPage(n);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
        doc.text(limpo(`${extras.room.code} · V${versao.versionNo} · data-base ${formatDateBR(versao.dataBase)} · página ${n}/${total}`), MARGEM, altura(doc) - 8);
        if (extras.marcaDagua) {
            // Diagonal e clara, por cima do conteúdo (transparência 12%): identifica quem baixou sem esconder nada.
            doc.saveGraphicsState();
            doc.setGState(new (doc as unknown as { GState: new (p: { opacity: number }) => unknown }).GState({ opacity: 0.12 }));
            const marca = limpo(extras.marcaDagua);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(30);
            const tamanho = Math.min(30, (30 * (largura - 40)) / Math.max(1, doc.getTextWidth(marca)));
            doc.setFontSize(tamanho);
            doc.setTextColor(100, 116, 139);
            doc.text(marca, largura / 2, altura(doc) / 2, { align: 'center', angle: 40 });
            doc.restoreGraphicsState();
        }
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
