/**
 * PDF do edital e da ata da assembleia (Task A6) — services/assembleiaPdf.ts.
 *
 * O módulo só desenha os modelos de utils/assembleiaTextos.ts (A5). Aqui o PDF é
 * gerado de verdade (jsPDF + autotable no Node) e LIDO DE VOLTA pelo pdfjs-dist,
 * para travar o que um teste de modelo não vê:
 *   • acentos saem certos no PDF (helvetica padrão = WinAnsi; "ç ã õ é › —");
 *   • rodapé em TODAS as páginas, com "n / total";
 *   • a ata termina com as assinaturas de presidente e secretário e o anexo de
 *     votos vem DEPOIS, em página própria;
 *   • baixarEditalPdf chama doc.save com nome .pdf.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { montarEdital, montarAta, type EditalModelo, type AtaModelo } from '../utils/assembleiaTextos';
import type { Assembleia, ItemAssembleia, Retrato } from '../services/condominioAssembleiaService';

// doc.save é propriedade da INSTÂNCIA do jsPDF (não do prototype) — por isso a
// troca é numa subclasse, e o que seria baixado fica guardado para o teste ler.
const salvos = vi.hoisted(() => [] as { nome: string; bytes: ArrayBuffer }[]);
vi.mock('jspdf', async (importOriginal) => {
    const orig = await importOriginal<typeof import('jspdf')>();
    class jsPDF extends orig.jsPDF {
        constructor(...args: any[]) {
            super(...(args as []));
            (this as any).save = (nome: string) => {
                salvos.push({ nome, bytes: (this as any).output('arraybuffer') });
            };
        }
    }
    return { ...orig, jsPDF, default: jsPDF };
});

import { baixarEditalPdf, gerarEditalPdf, gerarAtaPdf } from '../services/assembleiaPdf';

// ─── fixture: 8 unidades como o Bella Vista ──────────────────────────────────

const NOME = 'Condomínio Residencial Bella Vista';

const assembleia: Assembleia = {
    id: 'a1', organizationId: 'o1', empreendimentoId: 'e1', tipo: 'AGO',
    titulo: 'Prestação de contas e eleição 2026', local: 'Salão de festas — térreo',
    linkTransmissao: 'https://meet.exemplo/abc',
    primeiraConvocacaoEm: '2026-12-10T22:00:00Z', segundaConvocacaoEm: '2026-12-10T22:30:00Z',
    status: 'ENCERRADA', convocadaEm: '2026-11-25T15:00:00Z', avisoId: 'av1', editalEntregueEm: '2026-12-10T22:31:00Z',
    instaladaEm: '2026-12-10T22:32:00Z', instaladaConvocacao: 2, quorumInstalacao: null, presidenteNome: 'Carlos Lima',
    secretarioNome: 'Daniela Souza', observacaoGeral: null, encerradaEm: '2026-12-11T00:15:00Z', retrato: null,
    ataDocumentoId: null, canceladaEm: null, motivoCancelamento: null, createdBy: null,
    createdAt: '2026-11-20T12:00:00Z', updatedAt: '2026-11-20T12:00:00Z',
};

const itens: ItemAssembleia[] = [
    {
        id: 'i1', assembleiaId: 'a1', ordem: 1, titulo: 'Aprovação das contas de 2026',
        descricao: 'Balancete e demonstração de receitas e despesas do exercício, com parecer do conselho fiscal.',
        tipo: 'APROVACAO', opcoes: null, quorum: 'MAIORIA_PRESENTES', assunto: 'APROVAR_CONTAS', deliberacao: null,
    },
    {
        id: 'i2', assembleiaId: 'a1', ordem: 2, titulo: 'Eleição do síndico', descricao: null,
        tipo: 'ESCOLHA', opcoes: ['Ana Conceição', 'Bruno Gonçalves'], quorum: 'MAIORIA_PRESENTES',
        assunto: 'ELEGER_SINDICO', deliberacao: null,
    },
];

const F = 0.00125;
const PROPRIETARIOS = ['João Araújo', 'Márcia Simões', 'Luís Magalhães', 'Inês Brandão',
    'José Antônio Peçanha', 'Cecília Romão', 'Otávio Leão', 'Lúcia Fontes'];
const unidade = (n: number, extra: Partial<Retrato['unidades'][number]> = {}): Retrato['unidades'][number] => ({
    unitId: `u${n}`, rotulo: `Apto ${n}0${n}`, proprietario: PROPRIETARIOS[n - 1], fracao: F,
    presenca: null, procurador: null, procuracaoDocumentoId: null, presencaEm: null,
    votouPeloPortal: false, impedidaNaInstalacao: false, ...extra,
});

const voto = (itemId: string, n: number, opcao: string, origem: 'PORTAL' | 'PRESENCIAL') => ({
    itemId, unitId: `u${n}`, opcao, origem,
    votadoEm: origem === 'PORTAL' ? '2026-12-01T12:00:00Z' : '2026-12-10T23:00:00Z',
    clientId: origem === 'PORTAL' ? `c${n}` : null, lancadoPor: origem === 'PORTAL' ? null : 'p1',
});

const retrato: Retrato = {
    total: 0.01,
    presentesFracao: 7 * F,
    presentesUnidades: 7,
    itens: [
        {
            itemId: 'i1', ordem: 1, titulo: 'Aprovação das contas de 2026', tipo: 'APROVACAO', quorum: 'MAIORIA_PRESENTES',
            porOpcao: { SIM: { fracao: 4 * F, unidades: 4 }, NAO: { fracao: 2 * F, unidades: 2 }, ABSTENCAO: { fracao: F, unidades: 1 } },
            resultado: 'APROVADO', vencedora: null,
        },
        {
            itemId: 'i2', ordem: 2, titulo: 'Eleição do síndico', tipo: 'ESCOLHA', quorum: 'MAIORIA_PRESENTES',
            porOpcao: {
                'Ana Conceição': { fracao: 2 * F, unidades: 2 }, 'Bruno Gonçalves': { fracao: 4 * F, unidades: 4 },
                ABSTENCAO: { fracao: F, unidades: 1 },
            },
            resultado: 'APROVADO', vencedora: 'Bruno Gonçalves',
        },
    ],
    cabecalho: {
        assembleiaId: 'a1', empreendimentoId: 'e1', condominio: NOME,
        condominioCnpj: '12345678000190', tipo: 'AGO', titulo: assembleia.titulo,
        local: assembleia.local, linkTransmissao: assembleia.linkTransmissao,
        primeiraConvocacaoEm: assembleia.primeiraConvocacaoEm, segundaConvocacaoEm: assembleia.segundaConvocacaoEm,
        convocadaEm: assembleia.convocadaEm, editalEntregueEm: '2026-12-10T22:31:00Z',
        instaladaEm: '2026-12-10T22:32:00Z', convocacao: 2, presidente: 'Carlos Lima', secretario: 'Daniela Souza',
        instaladaPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:32:00Z', nome: 'Gestora Fernanda Ribeiro' },
        editalConfirmadoPor: { id: 'p1', papel: 'GESTOR', em: '2026-12-10T22:31:00Z', nome: 'Gestora Fernanda Ribeiro' },
        quorumInstalacao: {
            convocacao: 2, total: 0.01, presentesFracao: 6 * F, presentesUnidades: 6,
            impedidas: [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Cota de 10/2026 vencida em 10/11/2026', origem: 'AUTOMATICA' }],
            em: '2026-12-10T22:32:00Z', cotasConferidas: true,
        },
        observacaoGeral: 'A reunião transcorreu sem intercorrências; a transmissão ficou disponível durante toda a sessão.',
        encerradaEm: '2026-12-11T00:15:00Z', encerradaPor: 'p1', encerradaPorPapel: 'GESTOR',
    },
    deliberacoes: { i1: 'Contas aprovadas com ressalva quanto à manutenção do elevador, que será reapresentada em janeiro.' },
    unidades: [
        unidade(1, { presenca: 'PRESENCIAL' }),
        unidade(2, { presenca: 'PROCURADOR', procurador: 'Maria Procuradora de Assunção', procuracaoDocumentoId: 'd2' }),
        unidade(3, { votouPeloPortal: true }),
        unidade(4, { votouPeloPortal: true }),
        unidade(5, { presenca: 'PRESENCIAL' }),
        unidade(6, { presenca: 'PRESENCIAL', votouPeloPortal: true }),
        unidade(7, { votouPeloPortal: true, impedidaNaInstalacao: true }),
        unidade(8),
    ],
    votos: [
        voto('i1', 1, 'SIM', 'PRESENCIAL'), voto('i1', 2, 'NAO', 'PRESENCIAL'), voto('i1', 3, 'SIM', 'PORTAL'),
        voto('i1', 4, 'SIM', 'PORTAL'), voto('i1', 5, 'ABSTENCAO', 'PRESENCIAL'), voto('i1', 6, 'SIM', 'PORTAL'),
        voto('i1', 7, 'NAO', 'PORTAL'),
        voto('i2', 1, 'Bruno Gonçalves', 'PRESENCIAL'), voto('i2', 2, 'Ana Conceição', 'PRESENCIAL'),
        voto('i2', 3, 'Bruno Gonçalves', 'PORTAL'), voto('i2', 4, 'Bruno Gonçalves', 'PORTAL'),
        voto('i2', 5, 'ABSTENCAO', 'PRESENCIAL'), voto('i2', 6, 'Ana Conceição', 'PORTAL'),
        voto('i2', 7, 'Bruno Gonçalves', 'PORTAL'),
    ],
    impedidasNaInstalacao: [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Cota de 10/2026 vencida em 10/11/2026', origem: 'AUTOMATICA' }],
};

const condominio = { nome: NOME, cnpj: '12345678000190' };

// ─── leitura do PDF de volta (pdfjs-dist, build legacy = Node) ────────────────

/** Texto de cada página, com espaços normalizados (linha quebrada vira espaço). */
async function textoDasPaginas(bytes: ArrayBuffer): Promise<string[]> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // standardFontDataUrl: sem ele o pdfjs avisa a cada página (as fontes padrão vêm no pdfjs-dist).
    const { createRequire } = await import('node:module');
    const path = await import('node:path');
    const fontes = path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
    const pdf = await pdfjs.getDocument({
        data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false, standardFontDataUrl: fontes,
    }).promise;
    const paginas: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const tc = await (await pdf.getPage(i)).getTextContent();
        paginas.push(tc.items.map((it: any) => it.str ?? '').join(' ').replace(/\s+/g, ' '));
    }
    await pdf.destroy();
    return paginas;
}

const RODAPE = 'Documento gerado pelo Òpura';

function rodapeEmTodas(paginas: string[]) {
    paginas.forEach((p, i) => {
        expect(p, `página ${i + 1}`).toContain(RODAPE);
        expect(p, `página ${i + 1}`).toContain(`${i + 1} / ${paginas.length}`);
    });
}

let edital: EditalModelo;
let ata: AtaModelo;
let paginasEdital: string[];
let paginasAta: string[];
let blobAta: Blob;

beforeAll(async () => {
    edital = montarEdital(assembleia, itens, condominio);
    ata = montarAta(retrato, assembleia, condominio);
    const blobEdital = await gerarEditalPdf(edital);
    expect(blobEdital.size).toBeGreaterThan(0);
    paginasEdital = await textoDasPaginas(await blobEdital.arrayBuffer());
    blobAta = await gerarAtaPdf(ata);
    paginasAta = await textoDasPaginas(await blobAta.arrayBuffer());
    // Conferência visual (opcional): ASSEMBLEIA_PDF_DIR=<pasta> grava os dois PDFs lá.
    const dir = process.env.ASSEMBLEIA_PDF_DIR;
    if (dir) {
        const fs = await import('node:fs');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(`${dir}/edital.pdf`, Buffer.from(await blobEdital.arrayBuffer()));
        fs.writeFileSync(`${dir}/ata.pdf`, Buffer.from(await blobAta.arrayBuffer()));
    }
}, 60_000);

// ─── edital ──────────────────────────────────────────────────────────────────

describe('PDF do edital', () => {
    it('traz condomínio, convocações, pauta, quórum e instruções com acentos certos', () => {
        const t = paginasEdital.join(' ');
        expect(t).toContain(NOME);
        expect(t).toContain('Edital de convocação — Assembleia Geral Ordinária');
        expect(t).toContain('12.345.678/0001-90');
        expect(t).toContain('10/12/2026 às 19:00');
        expect(t).toContain('10/12/2026 às 19:30');
        expect(t).toContain('Aprovação das contas de 2026');
        expect(t).toContain('Eleição do síndico');
        expect(t).toContain('Ana Conceição');
        expect(t).toContain('Maioria dos presentes');
        expect(t).toContain('abstenção não entra');
        expect(t).toContain('Portal do Cliente › Condomínio › Assembleias');
        expect(t).toContain('CC art. 1.335, III');
        expect(t).toContain(`A administração do ${NOME}`);
        // CC 1.354-A §1º: o edital diz que a assembleia é híbrida e que o voto pelo portal é presença.
        expect(t).toContain(edital.forma);
        expect(t).toContain('A assembleia será realizada de forma híbrida');
        expect(t).toContain('a unidade que votar pelo portal conta como presente (CC art. 1.354-A)');
    });

    it('rodapé em todas as páginas', () => rodapeEmTodas(paginasEdital));

    it('baixarEditalPdf salva um .pdf com o mesmo conteúdo', async () => {
        salvos.length = 0;
        await baixarEditalPdf(edital);
        expect(salvos).toHaveLength(1);
        expect(salvos[0].nome).toMatch(/^Edital .+\.pdf$/);
        expect(salvos[0].nome).not.toMatch(/[\\/:*?"<>|]/);
        expect(salvos[0].bytes.byteLength).toBeGreaterThan(0);
        const p = await textoDasPaginas(salvos[0].bytes);
        expect(p.join(' ')).toContain(NOME);
    });
});

// ─── ata ─────────────────────────────────────────────────────────────────────

describe('PDF da ata', () => {
    it('é um PDF com pelo menos 2 páginas (corpo + anexo)', () => {
        expect(blobAta.size).toBeGreaterThan(0);
        expect(blobAta.type).toBe('application/pdf');
        expect(paginasAta.length).toBeGreaterThanOrEqual(2);
    });

    it('traz cabeçalho, as duas presenças, procuração, impedida e apuração com acentos certos', () => {
        const t = paginasAta.join(' ');
        expect(t).toContain(NOME);
        expect(t).toContain('Ata da Assembleia Geral Ordinária');
        expect(t).toContain('Quórum de instalação');
        expect(t).toContain('Participaram da votação');
        expect(t).toContain(ata.editalConfirmacao);
        expect(t).toContain('procurador: Maria Procuradora de Assunção');
        expect(t).toContain('Apto 707');
        expect(t).toContain('Cota de 10/2026 vencida em 10/11/2026');
        expect(t).toContain('Conferida pelo sistema');
        expect(t).not.toContain('A inadimplência não foi conferida pelo sistema');
        expect(t).toContain('Abstenção');
        expect(t).toContain('Não');
        expect(t).toContain('Vencedora: Bruno Gonçalves');
        expect(t).toContain('Contas aprovadas com ressalva quanto à manutenção do elevador');
        // quórum exigido: rótulo e regra dispostos separados, ambos presentes
        expect(t).toContain('Maioria dos presentes');
        expect(t).toContain(ata.itens[0].quorumExigido.regra);
    });

    it('termina com as assinaturas e o anexo de votos vem depois, em página própria', () => {
        const idxAssinatura = paginasAta.findIndex(p => p.includes('Presidente') && p.includes('Secretário')
            && p.includes('Carlos Lima') && p.includes('Daniela Souza') && p.includes('Nada mais havendo'));
        const idxAnexo = paginasAta.findIndex(p => p.includes('Anexo — votos por unidade'));
        expect(idxAssinatura).toBeGreaterThanOrEqual(0);
        expect(idxAnexo).toBeGreaterThan(idxAssinatura);
        // a página do anexo não carrega corpo da ata
        expect(paginasAta[idxAnexo]).not.toContain('Nada mais havendo');
        const anexo = paginasAta.slice(idxAnexo).join(' ');
        expect(anexo).toContain('Otávio Leão');
        expect(anexo).toContain('Sem voto');
        expect(anexo).toContain('portal');
    });

    it('rodapé em todas as páginas, inclusive as do anexo', () => rodapeEmTodas(paginasAta));
});

describe('PDF da ata: cotas não conferidas (A10)', () => {
    it('diz que a inadimplência não foi conferida e lista a impedida indicada pelo gestor', async () => {
        const manual = [{ unitId: 'u7', rotulo: 'Apto 707', motivo: 'Acordo de parcelamento descumprido', origem: 'MANUAL' as const }];
        const r: Retrato = {
            ...retrato,
            impedidasNaInstalacao: manual,
            cabecalho: { ...retrato.cabecalho,
                quorumInstalacao: { ...retrato.cabecalho.quorumInstalacao!, cotasConferidas: false, impedidas: manual } },
        };
        const t = (await textoDasPaginas(await (await gerarAtaPdf(montarAta(r, assembleia, condominio))).arrayBuffer())).join(' ');
        expect(t).toContain('A inadimplência não foi conferida pelo sistema, porque o condomínio não tem cotas cobradas '
            + 'pelo Òpura; as unidades impedidas foram indicadas pelo gestor.');
        expect(t).toContain('Indicada pelo gestor');
        expect(t).toContain('Acordo de parcelamento descumprido');
    }, 30_000);
});

describe('PDF da ata com anexo longo (60 unidades × 2 itens)', () => {
    it('o anexo quebra em várias páginas, repete o cabeçalho da tabela e mantém o rodapé', async () => {
        const N = 60;
        const fr = 0.01 / N;
        const grande: Retrato = {
            ...retrato,
            presentesFracao: N * fr,
            presentesUnidades: N,
            unidades: Array.from({ length: N }, (_, k) => ({
                ...unidade(1, { presenca: 'PRESENCIAL' }),
                unitId: `g${k}`, rotulo: `Bloco B — Apto ${100 + k}`, fracao: fr,
                proprietario: `Condômino número ${k + 1} com nome bem comprido de família Assunção`,
            })),
            votos: Array.from({ length: N }, (_, k) => ({ ...voto('i1', 1, k % 3 === 0 ? 'NAO' : 'SIM', 'PRESENCIAL'), unitId: `g${k}` })),
        };
        const m = montarAta(grande, assembleia, condominio);
        const blob = await gerarAtaPdf(m);
        const bytes = await blob.arrayBuffer();
        // O pdfjs fica com o buffer (detached) — gravar antes e ler uma cópia.
        const dir = process.env.ASSEMBLEIA_PDF_DIR;
        if (dir) (await import('node:fs')).writeFileSync(`${dir}/ata-longa.pdf`, Buffer.from(bytes));
        const paginas = await textoDasPaginas(bytes.slice(0));

        rodapeEmTodas(paginas);
        const idxAnexo = paginas.findIndex(p => p.includes('Anexo — votos por unidade'));
        expect(idxAnexo).toBeGreaterThan(0);
        const doAnexo = paginas.slice(idxAnexo);
        expect(doAnexo.length).toBeGreaterThanOrEqual(3);   // 120 linhas + 2 de grupo
        for (const p of doAnexo) expect(p).toContain('Unidade Proprietário Voto Origem Data e hora');
        // Nenhuma linha perdida na quebra de página: cada unidade aparece uma vez por item.
        const anexo = doAnexo.join(' ');
        for (let k = 0; k < N; k++) {
            expect(anexo.split(`Condômino número ${k + 1} com nome`).length - 1, `unidade ${k + 1}`).toBe(2);
        }
        expect(anexo).toContain('Bloco B — Apto 159');

        // Toda página do anexo diz de qual item são os votos nela. Na fixture os
        // votos do item 1 são em sala às 20:00 e o item 2 não teve voto — dá para
        // saber pelo texto de que item é cada linha da página.
        doAnexo.forEach((pg, k) => {
            const onde = `página ${idxAnexo + k + 1}`;
            expect(pg, onde).toMatch(/Item [12] — /);
            if (pg.includes('às 20:00')) expect(pg, onde).toContain('Item 1 — Aprovação das contas de 2026');
            if (pg.includes('Sem voto')) expect(pg, onde).toContain('Item 2 — Eleição do síndico');
            // rótulo nunca órfão: se a página tem o rótulo, tem linha do item
            if (pg.includes('Item 1 — ')) expect(pg, onde).toContain('às 20:00');
            if (pg.includes('Item 2 — ')) expect(pg, onde).toContain('Sem voto');
        });
        // o item que continua de página anterior vem marcado
        expect(doAnexo.slice(1).some(pg => pg.includes('(continuação)'))).toBe(true);
    }, 60_000);
});


describe('rodapé com nome de condomínio muito longo', () => {
    const LONGO = 'Condomínio Edifício Residencial e Comercial Parque das Araucárias São João Batista '
        + 'Torres Norte, Sul e Leste — Associação dos Proprietários do Loteamento Jardim Botânico';

    it('a marca e o "n / total" ficam em toda página; encurta o nome do condomínio', async () => {
        const cond = { nome: LONGO, cnpj: '12345678000190' };
        const grande: Retrato = { ...retrato, cabecalho: { ...retrato.cabecalho, condominio: LONGO } };
        for (const blob of [
            await gerarEditalPdf(montarEdital(assembleia, itens, cond)),
            await gerarAtaPdf(montarAta(grande, assembleia, cond)),
        ]) {
            const dir = process.env.ASSEMBLEIA_PDF_DIR;
            if (dir) (await import('node:fs')).writeFileSync(`${dir}/nome-longo-${blob.size}.pdf`, Buffer.from(await blob.arrayBuffer()));
            const paginas = await textoDasPaginas(await blob.arrayBuffer());
            rodapeEmTodas(paginas);
            paginas.forEach((pg, i) => {
                expect(pg, `página ${i + 1}`).toContain('Documento gerado pelo Òpura.');
                // o nome encurtado começa igual e termina com reticências
                expect(pg, `página ${i + 1}`).toMatch(/Condomínio Edifício Residencial[^—]*… — /);
            });
        }
    }, 60_000);
});
