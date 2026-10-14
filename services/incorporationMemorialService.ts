import { jsPDF } from 'jspdf';
import type { Empreendimento, EmpreendimentoTower } from '../types/empreendimento';
import { cabecalhoDoDocumentoNbr12721, celulaFormatada, situacaoDasAprovacoes, type DocumentoNbr12721 } from '../utils/nbr12721/documento';

export interface IncorporationMemorialData {
    empreendimento: Empreendimento;
    towers: EmpreendimentoTower[];
    /**
     * Áreas NBR 12721 da versão publicada do estudo da Planta ligado ao
     * empreendimento (Fase 8 do plano docs/planos/2026-10-13-areas-nbr12721-na-planta.md —
     * antes vinha do Motor de Áreas). `null` = sem estudo ou sem versão congelada.
     */
    areas: DocumentoNbr12721 | null;
    /** Por que `areas` está vazio — vai no aviso da seção. */
    motivoSemAreas?: string;
}

/** O texto das seções "e" e "i" do memorial, sem jsPDF — é o que os testes conferem. */
export interface AreasNoMemorial {
    campos: [string, string][];
    avisos: string[];
    quadroI: string[];
    quadroII: string[];
    fracoes: string[];
}

export function areasNoMemorial(areas: DocumentoNbr12721 | null, motivoSemAreas?: string): AreasNoMemorial {
    if (!areas) {
        return {
            campos: [],
            avisos: [motivoSemAreas ?? 'Nenhuma versão publicada com os Quadros NBR 12721. Abra "Áreas NBR 12721" na Planta, publique a versão e aprove antes de emitir o memorial final.'],
            quadroI: [],
            quadroII: [],
            fracoes: [],
        };
    }
    const m2 = (v: number) => celulaFormatada(v, 'm2');
    const avisos: string[] = [];
    const situacao = situacaoDasAprovacoes(areas.aprovacoes);
    if (situacao !== 'Técnica e jurídica aprovadas') avisos.push(`A versão citada ainda não tem as aprovações técnica e jurídica (${situacao.toLowerCase()}). Aprove-a no painel Versões da Planta antes do memorial final.`);
    if (areas.saida.status !== 'success') avisos.push('Os quadros desta versão têm pendência bloqueante — corrija na Planta e publique de novo.');
    // O hash vai num campo só dele: inteiro, numa linha (64 caracteres cabem na coluna do valor).
    const campos = cabecalhoDoDocumentoNbr12721(areas)
        .filter(([r]) => r !== 'Empresa' && r !== 'Motor')
        .flatMap(([r, v]): [string, string][] => (r === 'Versão' ? [['Versão publicada', String(areas.revisao)], ['Hash dos quadros', areas.hash]] : [[r, v]]));
    return {
        campos,
        avisos,
        quadroI: areas.saida.quadroI.map((l) => `${l.floor_label}: real ${m2(l.qi_17_floor_real_total_raw)} m² / equivalente ${m2(l.qi_18_floor_equivalent_total_raw)} m²`),
        quadroII: areas.saida.quadroII.map((l) => `${l.unit_label}: coef. ${celulaFormatada(l.qii_31_proportionality_coefficient_raw, 'coef')} — real ${m2(l.qii_37_unit_real_total_raw)} m² / equivalente ${m2(l.qii_38_unit_equivalent_total_raw)} m²`),
        fracoes: areas.saida.fracoes.map((f) => `Unidade ${f.unidade}: fração ${celulaFormatada(f.fraction_decimal_raw, 'decimal')} (${celulaFormatada(f.fraction_percent_raw, 'pct')} %) — ${celulaFormatada(f.milesimos, 'mil')} milésimos`),
    };
}

const PRIMARY: [number, number, number] = [15, 23, 42];
const SECONDARY: [number, number, number] = [37, 99, 235];
const LIGHT_BG: [number, number, number] = [248, 250, 252];
const WARNING: [number, number, number] = [180, 60, 20];
const MARGIN_X = 20;
const DISCLAIMER = 'MINUTA — Documento gerado automaticamente, sujeito a revisão jurídica. Não é documento registrável até validação e assinatura de advogado/incorporador.';

/**
 * Gera uma MINUTA do memorial de incorporação (art. 32 da Lei 4.591/64), consolidando
 * automaticamente os dados já cadastrados no Empreendimento e as Áreas NBR 12721 da versão
 * publicada do estudo da Planta.
 * O texto legal/cartorial (certidões, avaliação de custo, convenção de condomínio) fica
 * marcado como pendente — não é gerado por IA, exige validação do jurídico do incorporador.
 */
export function generateIncorporationMemorialDraftPdf(data: IncorporationMemorialData): void {
    const { empreendimento: emp, towers } = data;
    const areas = areasNoMemorial(data.areas, data.motivoSemAreas);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = 25;

    const drawFooter = () => {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...WARNING);
        doc.text(DISCLAIMER, MARGIN_X, pageHeight - 12, { maxWidth: 170 });
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${doc.internal.pages.length - 1}`, doc.internal.pageSize.getWidth() - MARGIN_X - 10, pageHeight - 6);
    };

    const checkPageBreak = (needed: number) => {
        if (currentY + needed > pageHeight - 24) {
            doc.addPage();
            currentY = 25;
            drawFooter();
        }
    };

    const sectionTitle = (letra: string, title: string) => {
        checkPageBreak(14);
        doc.setFillColor(...PRIMARY);
        doc.rect(MARGIN_X, currentY, 170, 0.6, 'F');
        currentY += 6;
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...SECONDARY);
        doc.text(`${letra}) ${title}`, MARGIN_X, currentY);
        currentY += 7;
    };

    const field = (label: string, value?: string | number | null) => {
        checkPageBreak(6);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.text(`${label}:`, MARGIN_X, currentY);
        doc.setFont('Helvetica', 'normal');
        const text = value != null && value !== '' ? String(value) : '[NÃO INFORMADO NO CADASTRO]';
        doc.setTextColor(value != null && value !== '' ? 50 : 180);
        doc.text(text, MARGIN_X + 55, currentY, { maxWidth: 115 });
        currentY += 6;
    };

    // Sem "⚠": a Helvetica do jsPDF não tem o caractere, e um só fora da tabela WinAnsi faz a linha
    // INTEIRA sair letra a letra espaçada e passar da margem. A caixa cresce com as linhas da nota.
    const pendingNote = (text: string) => {
        doc.setFont('Helvetica', 'italic');
        doc.setFontSize(8);
        const linhas = doc.splitTextToSize(`Pendente: ${text}`, 164) as string[];
        const altura = 4 + linhas.length * 3.6;
        checkPageBreak(altura + 3);
        doc.setFillColor(255, 247, 237);
        doc.rect(MARGIN_X, currentY, 170, altura, 'F');
        doc.setTextColor(...WARNING);
        doc.text(linhas, MARGIN_X + 3, currentY + 4.6);
        currentY += altura + 3;
    };

    drawFooter();

    // ─── Capa ───
    doc.setFillColor(...WARNING);
    doc.rect(MARGIN_X, currentY, 170, 8, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('MINUTA — SUJEITA A REVISÃO JURÍDICA', MARGIN_X + 5, currentY + 5.5);
    currentY += 14;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...PRIMARY);
    doc.text('MEMORIAL DE INCORPORAÇÃO', MARGIN_X, currentY);
    currentY += 6;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Nos termos do art. 32 da Lei nº 4.591/64 — ÒPURA Incorporação Imobiliária', MARGIN_X, currentY);
    currentY += 10;

    // ─── a) Título de propriedade do terreno ───
    sectionTitle('a', 'Título de propriedade do terreno');
    field('Empreendimento', emp.name);
    field('Matrícula', emp.matricula);
    field('Endereço do terreno', [emp.terreno_street, emp.terreno_number, emp.terreno_neighborhood, emp.terreno_city, emp.terreno_state].filter(Boolean).join(', '));
    field('Área do terreno (m²)', emp.terreno_area);
    pendingNote('Cadeia dominial, ônus e certidões de matrícula devem ser anexados pelo jurídico (due diligence de aquisição).');
    currentY += 2;

    // ─── b/c) Certidões negativas e histórico de títulos ───
    sectionTitle('b/c', 'Certidões negativas e histórico dos títulos de propriedade');
    pendingNote('Seção não preenchida automaticamente — anexar certidões negativas (federal, estadual, municipal, trabalhista) e histórico de titularidade obtidos na Due Diligence.');
    currentY += 2;

    // ─── d) Projeto aprovado ───
    checkPageBreak(20);
    sectionTitle('d', 'Projeto de construção aprovado');
    field('Responsável técnico', emp.responsavel_tecnico);
    field('CREA/CAU', emp.crea_cau);
    field('Número do processo', emp.numero_processo);
    currentY += 2;

    // ─── e) Cálculo das áreas (Quadros NBR 12721) ───
    checkPageBreak(20);
    sectionTitle('e', 'Cálculo das áreas — Quadros NBR 12721');
    const linhasDeTexto = (titulo: string, linhas: string[]) => {
        if (!linhas.length) return;
        currentY += 2;
        checkPageBreak(6);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...PRIMARY);
        doc.text(titulo, MARGIN_X, currentY);
        currentY += 5;
        linhas.forEach(t => {
            checkPageBreak(5);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(50, 50, 50);
            doc.text(t, MARGIN_X, currentY, { maxWidth: 170 });
            currentY += 4.5;
        });
    };
    areas.campos.forEach(([rotulo, valor]) => field(rotulo, valor));
    areas.avisos.forEach(pendingNote);
    linhasDeTexto('Quadro I — Áreas por pavimento', areas.quadroI);
    linhasDeTexto('Quadro II — Áreas por unidade', areas.quadroII);
    currentY += 4;

    // ─── f) Certidão negativa de tributos federais ───
    checkPageBreak(14);
    sectionTitle('f', 'Certidão negativa de tributos federais relativos ao imóvel');
    pendingNote('Anexar certidão emitida pela Receita Federal referente ao imóvel/incorporador.');
    currentY += 2;

    // ─── g) Memorial descritivo das especificações da obra ───
    checkPageBreak(14);
    sectionTitle('g', 'Memorial descritivo das especificações da obra');
    field('Tipo do empreendimento', emp.tipo ?? undefined);
    field('Construtora', emp.construtora);
    pendingNote('Especificações de acabamento (revestimentos, esquadrias, instalações) devem ser detalhadas pelo setor de Engenharia/Arquitetura.');
    currentY += 2;

    // ─── h) Avaliação do custo global da obra ───
    checkPageBreak(14);
    sectionTitle('h', 'Avaliação do custo global da obra');
    field('VGV total (referência comercial)', emp.vgv_total != null ? emp.vgv_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : undefined);
    pendingNote('Avaliação de custo global por profissional habilitado (ART/RRT) deve ser anexada — não é gerada automaticamente.');
    currentY += 2;

    // ─── i) Discriminação das frações ideais ───
    checkPageBreak(20);
    sectionTitle('i', 'Discriminação das frações ideais');
    if (areas.fracoes.length === 0) {
        pendingNote('Nenhuma fração ideal em versão publicada da Planta até o momento.');
    } else {
        areas.fracoes.forEach(t => {
            checkPageBreak(5);
            doc.setFont('Helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(50, 50, 50);
            doc.text(t, MARGIN_X, currentY);
            currentY += 4.5;
        });
    }
    currentY += 4;

    // ─── Torres/unidades (apoio) ───
    checkPageBreak(14);
    sectionTitle('—', 'Anexo — Torres e unidades cadastradas (referência)');
    towers.forEach(t => {
        checkPageBreak(5);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);
        doc.text(`${t.name}: ${t.floors_count ?? '—'} pavimentos, ${t.units_per_floor ?? '—'} unidades/pavimento`, MARGIN_X, currentY);
        currentY += 4.5;
    });
    currentY += 4;

    // ─── j) Minuta da convenção de condomínio ───
    checkPageBreak(14);
    sectionTitle('j', 'Convenção de condomínio');
    pendingNote('A minuta da convenção de condomínio é um instrumento jurídico próprio e não é gerada por este assistente — deve ser redigida/revisada pelo jurídico do incorporador.');

    // NFD antes de filtrar: "Áreas" vira "Areas", e não "reas".
    const safeTitle = emp.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
    doc.save(`Minuta_Memorial_Incorporacao_${safeTitle}.pdf`);
}
