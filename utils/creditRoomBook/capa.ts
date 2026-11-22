/** Capa: faixa escura, código, nome, instituição, versão, data-base e a foto principal. */
import type { CreditRoomVersion } from '../../types/creditRoom';
import { formatDateBR } from '../../components/ui/Format';
import {
    COR, MARGEM, altura, fotoNaCaixa, larguraUtil, limpo, money, prepararFoto, type Ctx, type ExtrasDoBook,
} from './base';
import { fotoDaCapa } from './fotos';

export function desenharCapa(c: Ctx, versao: CreditRoomVersion, extras: ExtrasDoBook) {
    const { doc } = c;
    const largura = doc.internal.pageSize.getWidth();
    const op = versao.snapshot.operacao;
    doc.setFillColor(COR.escuro[0], COR.escuro[1], COR.escuro[2]);
    doc.rect(0, 0, largura, 50, 'F');
    doc.setFillColor(COR.destaque[0], COR.destaque[1], COR.destaque[2]);
    doc.rect(0, 50, largura, 2.2, 'F');
    doc.setTextColor(203, 213, 225);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Book de crédito', MARGEM, 22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(limpo(extras.room.code), MARGEM, 32);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    doc.text(limpo(op.institution_name ?? extras.room.institutionName ?? 'Instituição financeira a definir'), MARGEM, 40);

    doc.setTextColor(COR.escuro[0], COR.escuro[1], COR.escuro[2]);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
    const titulo = doc.splitTextToSize(limpo(extras.room.name), larguraUtil(doc)) as string[];
    doc.text(titulo, MARGEM, 70);
    c.y = 70 + titulo.length * 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.setTextColor(COR.texto[0], COR.texto[1], COR.texto[2]);
    const rotulo = `Versão V${versao.versionNo}${versao.label ? ` · ${versao.label}` : ''}`;
    doc.text(limpo(`${rotulo} · data-base ${formatDateBR(versao.dataBase)}`), MARGEM, c.y);
    c.y += 8;
    doc.setFontSize(9.5);
    doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
    doc.text(limpo(`Valor solicitado ${money(op.requested_amount)}${op.modality ? ` · ${op.modality}` : ''}`), MARGEM, c.y);
    c.y += 8;

    // Foto principal: sem foto, a capa sai sem o bloco (nada de caixa vazia).
    const foto = prepararFoto(doc, fotoDaCapa(versao, extras.imagens) ?? undefined);
    if (foto) {
        const altBox = Math.min(110, altura(doc) - c.y - 38);
        if (altBox > 40 && fotoNaCaixa(doc, foto, MARGEM, c.y, larguraUtil(doc), altBox)) c.y += altBox + 4;
    }

    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(COR.suave[0], COR.suave[1], COR.suave[2]);
    const nota = doc.splitTextToSize(limpo(
        'Todos os números deste book vêm da versão congelada acima, na data-base indicada: não são o dado de hoje. '
        + 'Valores contratados, sem reajuste. Clientes aparecem só por rótulo (sem nome). n/d = dado não disponível nesta versão.',
    ), larguraUtil(doc)) as string[];
    doc.text(nota, MARGEM, altura(doc) - 28);
}
