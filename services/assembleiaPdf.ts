// services/assembleiaPdf.ts
// PDF do EDITAL de convocação e da ATA da assembleia do condomínio (Task A6).
// Plano: docs/planos/2026-11-25-condominio-assembleias-votacoes.md (R4, R9).
//
// Molde: services/relatorioRateioPdf.ts — mesma paleta, mesmo título de seção,
// rodapé em TODAS as páginas e `import()` dinâmico do jsPDF + autotable (~400 KB
// que só pesam no clique de quem gera o documento).
//
// ⚠️ Este módulo NÃO conhece o banco nem o domínio. Recebe `EditalModelo` /
// `AtaModelo` já montados (utils/assembleiaTextos.ts, A5) e só desenha: todo
// texto, rótulo, data no fuso de Brasília e percentual sai pronto de lá.
//
// Saídas:
//   • baixarEditalPdf(m)  → doc.save (o edital é derivado da assembleia; a tela
//     baixa e o gestor distribui).
//   • gerarEditalPdf(m)   → Blob do mesmo edital (teste e quem quiser anexar).
//   • gerarAtaPdf(m)      → Blob; quem chama (A7) grava no GED. A ata termina com
//     as linhas de assinatura de presidente e secretário; o ANEXO de votos por
//     unidade vem depois, sempre em página própria.
//
// Acentos: helvetica padrão do jsPDF é WinAnsi — cobre o português inteiro e
// também "—", "›", "•", "ª", "º" e "Ò" (conferido lendo o PDF de volta com o
// pdfjs em __tests__/assembleiaPdf.test.ts).

import type { AtaModelo, EditalModelo, MedidaPresenca } from '../utils/assembleiaTextos';

type Cor = [number, number, number];
const PRIMARY: Cor = [30, 64, 175];    // blue-800
const LIGHT: Cor = [241, 245, 249];    // slate-100
const DARK: Cor = [15, 23, 42];        // slate-900
const GRAY: Cor = [100, 116, 139];     // slate-500
const HEAD_ALT: Cor = [248, 250, 252]; // slate-50
const GREEN: Cor = [21, 128, 61];      // green-700
const RED: Cor = [185, 28, 28];        // red-700

const MARGEM = 14;
/** Topo das páginas de continuação (a faixa azul só existe na 1ª). */
const TOPO = 18;
/** Faixa do rodapé (12 mm) + respiro: nada de conteúdo abaixo de H - BASE. */
const BASE = 18;

const HEAD_STYLES = { fillColor: PRIMARY, textColor: [255, 255, 255] as Cor, fontStyle: 'bold', fontSize: 8.5 };
const BODY_STYLES = { fontSize: 8.5, textColor: DARK, cellPadding: 1.6 };

// ─── carregamento e utilitários de página ────────────────────────────────────

async function novoDocumento() {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc: any = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    return { doc, autoTable: autoTable as (doc: any, opts: any) => void };
}

/** Estado de desenho: o documento e o "cursor" vertical. */
interface Pagina {
    doc: any;
    autoTable: (doc: any, opts: any) => void;
    W: number;
    H: number;
    y: number;
}

/** Garante `altura` mm livres acima do rodapé; senão, página nova. */
function garantir(p: Pagina, altura: number) {
    if (p.y + altura > p.H - BASE) {
        p.doc.addPage();
        p.y = TOPO;
    }
}

/** Altura de uma linha de texto (mm) para o corpo `tamanho` (pt). */
const alturaLinha = (tamanho: number) => tamanho * 0.45;

/** Parágrafo com quebra de linha E de página (linha a linha, nada passa do rodapé). */
function paragrafo(p: Pagina, texto: string, o: { tamanho?: number; cor?: Cor; negrito?: boolean; recuo?: number } = {}) {
    const tamanho = o.tamanho ?? 9;
    const recuo = o.recuo ?? 0;
    p.doc.setFont('helvetica', o.negrito ? 'bold' : 'normal');
    p.doc.setFontSize(tamanho);
    p.doc.setTextColor(...(o.cor ?? DARK));
    const linhas = p.doc.splitTextToSize(texto, p.W - 2 * MARGEM - 2 - recuo) as string[];
    const lh = alturaLinha(tamanho);
    for (const linha of linhas) {
        garantir(p, lh);
        p.doc.text(linha, MARGEM + 2 + recuo, p.y + lh * 0.75);
        p.y += lh;
    }
    p.y += 2;
}

function tituloDeSecao(p: Pagina, titulo: string) {
    // Título sozinho no pé da página é título órfão: exige espaço para ele e
    // um começo de conteúdo.
    garantir(p, 22);
    p.doc.setFillColor(...LIGHT);
    p.doc.rect(MARGEM, p.y, p.W - 2 * MARGEM, 8, 'F');
    p.doc.setTextColor(...PRIMARY);
    p.doc.setFont('helvetica', 'bold');
    p.doc.setFontSize(9.5);
    p.doc.text(titulo, MARGEM + 3, p.y + 5.5);
    p.y += 12;
}

/** autoTable a partir do cursor, sem invadir o rodapé; avança o cursor.
 *  Coluna com `halign: 'right'` no corpo alinha o cabeçalho junto (o autotable
 *  só aplica `columnStyles` ao corpo, e "Peso" à esquerda de 75,00% desalinha). */
function tabela(p: Pagina, opts: Record<string, any>, depois = 6) {
    const colunas = (opts.columnStyles ?? {}) as Record<string, { halign?: string }>;
    const aoMontar = opts.didParseCell as ((d: any) => void) | undefined;
    p.autoTable(p.doc, {
        startY: p.y,
        margin: { left: MARGEM, right: MARGEM, top: TOPO, bottom: BASE },
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        headStyles: HEAD_STYLES,
        bodyStyles: BODY_STYLES,
        alternateRowStyles: { fillColor: HEAD_ALT },
        ...opts,
        didParseCell: (d: any) => {
            if (d.section === 'head' && colunas[d.column.index]?.halign === 'right') d.cell.styles.halign = 'right';
            aoMontar?.(d);
        },
    });
    p.y = p.doc.lastAutoTable.finalY + depois;
}

/** Tabela "rótulo: valor" sem grade (identificação). */
function tabelaDeCampos(p: Pagina, linhas: [string, string][]) {
    tabela(p, {
        body: linhas,
        theme: 'plain',
        alternateRowStyles: {},
        bodyStyles: { fontSize: 9, textColor: DARK, cellPadding: 1.4 },
        columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: GRAY }, 1: { cellWidth: 'auto' } },
    });
}

/** Faixa azul do topo da 1ª página: título do documento + condomínio e CNPJ. */
function cabecalho(p: Pagina, titulo: string, condominio: string, cnpj: string) {
    const { doc, W } = p;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const linhasTitulo = doc.splitTextToSize(titulo, W - 2 * MARGEM) as string[];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const linhasCondominio = doc.splitTextToSize(`${condominio} · CNPJ ${cnpj}`, W - 2 * MARGEM) as string[];
    const altura = 10 + linhasTitulo.length * 6.5 + linhasCondominio.length * 4.8 + 4;

    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, W, altura, 'F');
    doc.setTextColor(255, 255, 255);
    let y = 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    for (const l of linhasTitulo) { doc.text(l, MARGEM, y); y += 6.5; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 0.5;
    for (const l of linhasCondominio) { doc.text(l, MARGEM, y); y += 4.8; }
    p.y = altura + 8;
}

const MARCA = ' · Documento gerado pelo Òpura.';

/** Rodapé em TODAS as páginas (rodar depois da última página existir).
 *  A marca e o "n / total" ficam sempre. Se não couber numa linha, quem encolhe
 *  é o nome do condomínio (e, em último caso, o título), com reticências. */
function rodapes(p: Pagina, condominio: string, titulo: string) {
    const { doc, W } = p;
    const total = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const cabe = (t: string) => doc.getTextWidth(t) <= W - 2 * MARGEM - 22;
    const curto = (t: string, n: number) => `${t.slice(0, n).trimEnd()}…`;
    let nome = condominio;
    let tit = titulo;
    const montar = () => `${nome} — ${tit}${MARCA}`;
    // 1º o condomínio (até 20 caracteres), depois o título.
    for (let n = condominio.length - 1; n >= 20 && !cabe(montar()); n--) nome = curto(condominio, n);
    for (let n = titulo.length - 1; n >= 1 && !cabe(montar()); n--) tit = curto(titulo, n);
    const textoRodape = montar();
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        const H = doc.internal.pageSize.getHeight();
        doc.setFillColor(...LIGHT);
        doc.rect(0, H - 12, W, 12, 'F');
        doc.setTextColor(...GRAY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(textoRodape, MARGEM, H - 4.5);
        doc.text(`${i} / ${total}`, W - MARGEM, H - 4.5, { align: 'right' });
    }
}

/** Altura (mm) do bloco de assinatura: 16 de espaço para assinar + nome que
 *  pode quebrar em várias linhas + papel. Nome longo não pode cair no rodapé. */
function alturaAssinatura(p: Pagina, largura: number, nome: string, papel: string | null): number {
    p.doc.setFont('helvetica', 'bold');
    p.doc.setFontSize(9);
    const linhas = (p.doc.splitTextToSize(nome, largura) as string[]).length;
    return 16 + 5 + linhas * 4 + (papel ? 4 : 0) + 2;
}

/** Linha de assinatura centrada em `cx`, com nome e papel embaixo. */
function linhaDeAssinatura(p: Pagina, cx: number, largura: number, nome: string, papel: string | null) {
    const { doc } = p;
    const yLinha = p.y + 16;
    doc.setDrawColor(...DARK);
    doc.setLineWidth(0.3);
    doc.line(cx - largura / 2, yLinha, cx + largura / 2, yLinha);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const linhasNome = doc.splitTextToSize(nome, largura) as string[];
    doc.text(linhasNome, cx, yLinha + 5, { align: 'center' });
    if (papel) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY);
        doc.setFontSize(8.5);
        doc.text(papel, cx, yLinha + 5 + linhasNome.length * 4, { align: 'center' });
    }
}

/** Nome de arquivo seguro no Windows (sem \ / : * ? " < > |). */
const nomeDeArquivo = (s: string) =>
    s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150);

// ─── edital ──────────────────────────────────────────────────────────────────

async function desenharEdital(m: EditalModelo) {
    const { doc, autoTable } = await novoDocumento();
    const p: Pagina = { doc, autoTable, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), y: 0 };

    cabecalho(p, m.titulo, m.condominio.nome, m.condominio.cnpj);

    tituloDeSecao(p, 'Identificação');
    const campos: [string, string][] = [
        ['Assembleia', m.tituloAssembleia],
        ['Tipo', m.tipo],
        ['1ª convocação', m.primeiraConvocacao],
        ['2ª convocação', m.segundaConvocacao],
        ['Local', m.local],
    ];
    if (m.link) campos.push(['Transmissão', m.link]);
    tabelaDeCampos(p, campos);

    paragrafo(p, m.abertura, { tamanho: 9.5 });
    p.y += 2;

    tituloDeSecao(p, 'Ordem do dia');
    if (m.pauta.length === 0) {
        paragrafo(p, 'Nenhum item na pauta.', { cor: GRAY });
    } else {
        tabela(p, {
            head: [['#', 'Assunto', 'Tipo', 'Quórum', 'Como decide']],
            body: m.pauta.map(l => {
                const partes = [l.titulo];
                if (l.descricao) partes.push(l.descricao);
                if (l.opcoes.length) partes.push(`Opções: ${l.opcoes.join(' · ')}`);
                return [String(l.numero), partes.join('\n'), l.tipo, l.quorum, l.regraQuorum];
            }),
            columnStyles: {
                0: { cellWidth: 8, halign: 'right' },
                1: { cellWidth: 66 },
                2: { cellWidth: 20 },
                3: { cellWidth: 28, fontStyle: 'bold' },
                4: { cellWidth: 60, textColor: GRAY, fontSize: 8 },
            },
        }, 8);
    }

    tituloDeSecao(p, 'Como votar');
    paragrafo(p, m.instrucoes);
    p.y += 2;

    tituloDeSecao(p, 'Instalação e direito de voto');
    for (const r of m.regras) paragrafo(p, `• ${r}`, { recuo: 1 });
    p.y += 2;

    // Emissão + assinatura da administração: ficam juntas na mesma página.
    const alturaAdm = alturaAssinatura(p, 90, m.assinatura, null);
    garantir(p, alturaAdm + (m.emitidoEm ? 6 : 0));
    if (m.emitidoEm) paragrafo(p, `Emitido em ${m.emitidoEm}.`, { cor: GRAY });
    linhaDeAssinatura(p, p.W / 2, 90, m.assinatura, null);
    p.y += alturaAdm;

    rodapes(p, m.condominio.nome, m.titulo);
    return doc;
}

/** Gera o edital e devolve o PDF (para anexar ou testar). */
export async function gerarEditalPdf(m: EditalModelo): Promise<Blob> {
    const doc = await desenharEdital(m);
    return doc.output('blob') as Blob;
}

/** Gera e BAIXA o edital. */
export async function baixarEditalPdf(m: EditalModelo): Promise<void> {
    const doc = await desenharEdital(m);
    doc.save(`${nomeDeArquivo(`Edital ${m.tituloAssembleia} - ${m.condominio.nome}`)}.pdf`);
}

// ─── ata ─────────────────────────────────────────────────────────────────────

function tabelaDePresencas(p: Pagina, medidas: MedidaPresenca[]) {
    tabela(p, {
        head: [['Medida', 'Peso', 'Unidades', 'Como se conta']],
        body: medidas.map(m => [m.rotulo, m.percentual, `${m.unidades} de ${m.totalUnidades}`, m.explicacao]),
        columnStyles: {
            0: { cellWidth: 42, fontStyle: 'bold' },
            1: { cellWidth: 18, halign: 'right' },
            2: { cellWidth: 20, halign: 'right' },
            3: { cellWidth: 102, textColor: GRAY, fontSize: 8 },
        },
    }, 8);
}

export async function gerarAtaPdf(m: AtaModelo): Promise<Blob> {
    const { doc, autoTable } = await novoDocumento();
    const p: Pagina = { doc, autoTable, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), y: 0 };
    const c = m.cabecalho;

    cabecalho(p, m.titulo, c.condominio, c.cnpj);

    // ── Identificação ────────────────────────────────────────────────────
    tituloDeSecao(p, 'Identificação');
    const campos: [string, string][] = [
        ['Assembleia', c.tituloAssembleia],
        ['Tipo', c.tipo],
        ['Data e hora', c.dataHora],
        ['Local', c.local],
    ];
    if (c.link) campos.push(['Transmissão', c.link]);
    campos.push(['Convocação', c.convocacao], ['Presidente', c.presidente], ['Secretário', c.secretario]);
    tabelaDeCampos(p, campos);

    paragrafo(p, m.instalacao, { tamanho: 9.5 });
    paragrafo(p, m.editalConfirmacao, { tamanho: 9.5 });
    p.y += 2;

    // ── Quórum: as duas presenças, com rótulos diferentes ────────────────
    tituloDeSecao(p, 'Quórum');
    tabelaDePresencas(p, [m.quorumInstalacao, m.participaramDaVotacao]);

    // ── Presença ─────────────────────────────────────────────────────────
    tituloDeSecao(p, 'Presença');
    if (m.presenca.length === 0) {
        paragrafo(p, 'Nenhuma unidade com presença registrada ou voto pelo portal.', { cor: GRAY });
    } else {
        tabela(p, {
            head: [['Unidade', 'Proprietário', 'Peso', 'Forma']],
            body: m.presenca.map(l => [l.unidade, l.nome, l.peso, l.forma]),
            columnStyles: {
                0: { cellWidth: 30 }, 1: { cellWidth: 62 }, 2: { cellWidth: 20, halign: 'right' }, 3: { cellWidth: 70 },
            },
        }, 8);
    }

    if (m.ausentes.length > 0) {
        tituloDeSecao(p, 'Ausentes');
        tabela(p, {
            head: [['Unidade', 'Proprietário']],
            body: m.ausentes.map(a => [a.unidade, a.nome]),
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 142 } },
        }, 8);
    }

    if (m.impedidas.length > 0) {
        tituloDeSecao(p, 'Impedidas na instalação');
        tabela(p, {
            head: [['Unidade', 'Motivo']],
            body: m.impedidas.map(i => [i.unidade, i.motivo]),
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 142 } },
        }, 8);
    }

    if (m.procuracoes.length > 0) {
        tituloDeSecao(p, 'Procurações');
        tabela(p, {
            head: [['Unidade', 'Procurador', 'Documento']],
            body: m.procuracoes.map(pr => [
                pr.unidade, pr.procurador, pr.documentoId ? 'Procuração arquivada no sistema' : 'Sem documento anexado',
            ]),
            columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 82 }, 2: { cellWidth: 60 } },
        }, 8);
    }

    // ── Ordem do dia ─────────────────────────────────────────────────────
    tituloDeSecao(p, 'Ordem do dia');
    if (m.ordemDoDia.length === 0) paragrafo(p, 'Nenhum item na pauta.', { cor: GRAY });
    for (const linha of m.ordemDoDia) paragrafo(p, linha, { recuo: 1 });
    p.y += 2;

    // ── Deliberações: um bloco por item ──────────────────────────────────
    tituloDeSecao(p, 'Deliberações');
    for (const it of m.itens) {
        garantir(p, 40);
        paragrafo(p, `${it.numero}. ${it.titulo}`, { tamanho: 10, negrito: true });
        // Rótulo e regra do quórum em linhas próprias: o rótulo é o nome do
        // quórum, a regra é COMO ele decide (com o artigo do CC).
        tabelaDeCampos(p, [
            ['Tipo', it.tipo],
            ['Quórum exigido', it.quorumExigido.rotulo],
            ['Como decide', it.quorumExigido.regra],
        ]);
        p.y -= 3;
        const corpo = [
            ...it.opcoes.map(o => [o.opcao, o.percentual, String(o.unidades)]),
            ['Sem voto', it.semVoto.percentual, String(it.semVoto.unidades)],
        ];
        tabela(p, {
            head: [['Opção', 'Peso', 'Unidades']],
            body: corpo,
            columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 35, halign: 'right' }, 2: { cellWidth: 35, halign: 'right' } },
            didParseCell: (d: any) => {
                if (d.section !== 'body') return;
                if (d.row.index === corpo.length - 1) {
                    d.cell.styles.textColor = GRAY;
                    d.cell.styles.fontStyle = 'italic';
                } else if (it.vencedora && d.row.index === it.opcoes.findIndex(o => o.opcao === it.vencedora)) {
                    d.cell.styles.fontStyle = 'bold';
                }
            },
        }, 4);
        const aprovado = it.vencedora || it.resultado === 'Aprovado';
        const reprovado = !aprovado && it.resultado !== 'Sem decisão';
        paragrafo(p, it.vencedora ? it.resultado : `Resultado: ${it.resultado}`, {
            negrito: true, tamanho: 9.5, cor: aprovado ? GREEN : reprovado ? RED : DARK,
        });
        if (it.deliberacao) paragrafo(p, `Deliberação: ${it.deliberacao}`);
        p.y += 4;
    }

    if (m.observacaoGeral) {
        tituloDeSecao(p, 'Observações');
        paragrafo(p, m.observacaoGeral);
        p.y += 2;
    }

    // ── Encerramento + assinaturas (juntos, na mesma página) ─────────────
    tituloDeSecao(p, 'Encerramento');
    const n = m.assinaturas.length;
    const largura = Math.min(80, (p.W - 2 * MARGEM) / Math.max(n, 1) - 10);
    const alturaAss = Math.max(0, ...m.assinaturas.map(a => alturaAssinatura(p, largura, a.nome, a.papel)));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const linhasEnc = (doc.splitTextToSize(m.encerramento, p.W - 2 * MARGEM - 2) as string[]).length;
    garantir(p, linhasEnc * alturaLinha(9.5) + 8 + alturaAss);
    paragrafo(p, m.encerramento, { tamanho: 9.5 });
    p.y += 6;
    m.assinaturas.forEach((a, i) => {
        const cx = MARGEM + ((p.W - 2 * MARGEM) / n) * (i + 0.5);
        linhaDeAssinatura(p, cx, largura, a.nome, a.papel);
    });
    p.y += alturaAss;

    // ── Anexo: voto de cada unidade em cada item, SEMPRE em página própria ─
    doc.addPage();
    p.y = TOPO;
    doc.setTextColor(...PRIMARY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Anexo — votos por unidade', MARGEM, p.y + 2);
    p.y += 6;
    paragrafo(p, `${c.condominio} — ${c.tituloAssembleia} (${c.dataHora})`, { cor: GRAY, tamanho: 8.5 });
    p.y += 2;

    if (m.anexo.length === 0) {
        paragrafo(p, 'Nenhum item na pauta, nenhum voto a listar.', { cor: GRAY });
    } else {
        // Uma tabela por item. O rótulo do item é a 1ª linha do CABEÇALHO, e o
        // cabeçalho se repete em toda página que a tabela atravessa: página de
        // continuação nunca mostra votos sem dizer de qual item são (documento
        // legal). O garantir() antes impede rótulo órfão no pé da página.
        const porItem = new Map<number, typeof m.anexo>();
        for (const l of m.anexo) porItem.set(l.item, [...(porItem.get(l.item) ?? []), l]);
        for (const [numero, linhas] of porItem) {
            const rotulo = `Item ${numero} — ${linhas[0].itemTitulo}`;
            garantir(p, 30);   // 2 linhas de cabeçalho + ao menos 1 linha de voto
            tabela(p, {
                head: [
                    [{
                        content: rotulo, colSpan: 5,
                        styles: { fillColor: LIGHT, textColor: PRIMARY, fontStyle: 'bold', fontSize: 9 },
                    }],
                    ['Unidade', 'Proprietário', 'Voto', 'Origem', 'Data e hora'],
                ],
                body: linhas.map(l => [l.unidade, l.nome, l.voto, l.origem, l.votadoEm ?? '—']),
                columnStyles: {
                    0: { cellWidth: 28 }, 1: { cellWidth: 60 }, 2: { cellWidth: 40 }, 3: { cellWidth: 18 }, 4: { cellWidth: 36 },
                },
                didParseCell: (d: any) => {
                    if (d.section === 'body' && linhas[d.row.index]?.voto === 'Sem voto') {
                        d.cell.styles.textColor = GRAY;
                        d.cell.styles.fontStyle = 'italic';
                    }
                },
                willDrawCell: (d: any) => {
                    // pageNumber conta as páginas DESTA tabela: > 1 = continuação.
                    if (d.section === 'head' && d.row.index === 0 && d.pageNumber > 1) {
                        d.cell.text = [`${rotulo} (continuação)`];
                    }
                },
            }, 8);
        }
    }

    rodapes(p, c.condominio, m.titulo);
    return doc.output('blob') as Blob;
}
