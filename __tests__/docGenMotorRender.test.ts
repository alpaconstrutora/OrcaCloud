import { describe, it, expect } from 'vitest';
import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
    camposLivresDoModelo, chavesDoModelo, mmParaPt, modeloTem, montarDocDefinition,
} from '../services/docGen/motorRender';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';
import { comMetadadosFixos } from '../services/docGen/pdf';

const P = (texto: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) =>
    ({ type: 'paragraph', content: [{ type: 'text', text: texto, marks }] });

const MODELO: DocTipTap = {
    type: 'doc',
    content: [
        { type: 'paragraph', attrs: { textAlign: 'right' }, content: [
            { type: 'text', text: 'OFÍCIO Nº ' },
            { type: 'variavel', attrs: { chave: 'documento.numero' }, marks: [{ type: 'bold' }] },
        ] },
        { type: 'paragraph', content: [{ type: 'variavel', attrs: { chave: 'documento.local_e_data' } }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Assunto' }] },
        P('Prezados Senhores,'),
        { type: 'campoLivre', attrs: { nome: 'conteudo', rotulo: 'Conteúdo do ofício' } },
        { type: 'bulletList', content: [
            { type: 'listItem', content: [P('Item um')] },
            { type: 'listItem', content: [P('Item dois'), P('segunda linha')] },
        ] },
        { type: 'table', content: [
            { type: 'tableRow', content: [
                { type: 'tableHeader', content: [P('Medição')] },
                { type: 'tableHeader', content: [P('Valor')] },
            ] },
            { type: 'tableRow', content: [
                { type: 'tableCell', content: [P('03')] },
                { type: 'tableCell', content: [P('R$ 45.000')] },
            ] },
        ] },
        P('Veja o site', [{ type: 'link', attrs: { href: 'https://exemplo.com' } }, { type: 'underline' }]),
        { type: 'horizontalRule' },
        { type: 'assinaturas' },
        { type: 'anexos' },
    ],
};

const texto = (c: Content): string => JSON.stringify(c);

describe('docGen · motor de render (TipTap → pdfmake)', () => {
    it('lista as variáveis do modelo, inclusive as do cabeçalho e rodapé', () => {
        expect(chavesDoModelo(MODELO, LAYOUT_PADRAO)).toEqual([
            'documento.numero', 'documento.local_e_data',
            'empresa.razao_social', 'empresa.endereco_completo', 'empresa.telefone', 'empresa.email', 'empresa.site',
        ]);
        expect(camposLivresDoModelo(MODELO)).toEqual([{ nome: 'conteudo', rotulo: 'Conteúdo do ofício' }]);
        expect(modeloTem(MODELO, 'assinaturas')).toBe(true);
        expect(modeloTem({ type: 'doc', content: [P('x')] }, 'anexos')).toBe(false);
    });

    it('mm → pt', () => {
        expect(mmParaPt(25.4)).toBe(72);
        expect(mmParaPt(20)).toBeCloseTo(56.69, 1);
    });

    it('variável com valor vira texto; sem valor vira [[chave]] marcada em âmbar', () => {
        const def = montarDocDefinition({ conteudo: MODELO, layout: LAYOUT_PADRAO, valores: { 'documento.numero': 'OF-ENG-047/2026' } });
        const content = def.content as Content[];
        const primeiro = content[0] as ContentText;
        expect(primeiro.alignment).toBe('right');
        const partes = primeiro.text as ContentText[];
        expect(partes[0]).toEqual({ text: 'OFÍCIO Nº ' });
        expect(partes[1]).toMatchObject({ text: 'OF-ENG-047/2026', bold: true });
        const segundo = content[1] as ContentText;
        expect((segundo.text as ContentText[])[0]).toMatchObject({ text: '[[documento.local_e_data]]', color: '#b45309' });
    });

    it('título, listas, tabela, link, régua, campo livre vazio, assinaturas pendentes', () => {
        const def = montarDocDefinition({ conteudo: MODELO, layout: LAYOUT_PADRAO, valores: {} });
        const c = def.content as Content[];
        expect(c[2]).toMatchObject({ bold: true, fontSize: 13.8 });                   // heading 2 = 11 × 1.25
        expect(texto(c[4])).toContain('[[Conteúdo do ofício]]');                      // campo livre não preenchido
        const lista = c[5] as { ul: Content[] };
        expect(lista.ul).toHaveLength(2);
        expect((lista.ul[1] as { stack: Content[] }).stack).toHaveLength(2);         // item com 2 parágrafos vira stack
        const tabela = c[6] as { table: { widths: string[]; body: Content[][] } };
        expect(tabela.table.widths).toEqual(['*', '*']);
        expect(tabela.table.body).toHaveLength(2);
        expect(tabela.table.body[0][0]).toMatchObject({ bold: true, fillColor: '#f1f5f9' });
        const link = (c[7] as ContentText).text as ContentText[];
        expect(link[0]).toMatchObject({ link: 'https://exemplo.com', decoration: 'underline', color: '#1d4ed8' });
        expect(texto(c[8])).toContain('"type":"line"');
        expect(texto(c[9])).toContain('[[assinaturas]]');
        expect(c).toHaveLength(10);                                                  // anexos vazios: bloco omitido
    });

    it('campo livre preenchido injeta os blocos digitados; assinaturas e anexos renderizam', () => {
        const def = montarDocDefinition({
            conteudo: MODELO,
            layout: LAYOUT_PADRAO,
            valores: {},
            camposLivres: { conteudo: { type: 'doc', content: [P('Solicitamos a ligação definitiva.'), P('Atenciosamente,')] } },
            assinaturas: [{ nome: 'João da Silva', cargo: 'Diretor de Engenharia', registroProfissional: 'CREA-MG 123' }, { nome: 'Maria', imagemDataUrl: 'data:image/png;base64,AAAA' }],
            anexos: ['Memorial Descritivo', 'Planta'],
        });
        const c = def.content as Content[];
        expect(texto(c[4])).toContain('Solicitamos a ligação definitiva.');
        const ass = texto(c[9]);
        expect(ass).toContain('João da Silva');
        expect(ass).toContain('CREA-MG 123');
        expect(ass).toContain('data:image/png;base64,AAAA');
        const anexos = texto(c[10]);
        expect(anexos).toContain('"Anexos"');
        expect(anexos).toContain('Memorial Descritivo');
    });

    it('cabeçalho e rodapé: margens em pt, logo quando houver, variáveis substituídas, paginação', () => {
        const def = montarDocDefinition({
            conteudo: MODELO, layout: LAYOUT_PADRAO,
            valores: { 'empresa.razao_social': 'ALPA', 'empresa.endereco_completo': 'Rua X, 1' },
            logoDataUrl: 'data:image/png;base64,BBBB',
        });
        expect(def.pageSize).toBe('A4');
        const [esq, topo, dir, base] = def.pageMargins as [number, number, number, number];
        expect(esq).toBeCloseTo(mmParaPt(25), 2);
        expect(dir).toBeCloseTo(mmParaPt(20), 2);
        expect(topo).toBeCloseTo(mmParaPt(20) + mmParaPt(22), 2);
        expect(base).toBeCloseTo(mmParaPt(20) + mmParaPt(14), 2);
        const cab = texto(def.header as Content);
        expect(cab).toContain('BBBB');
        expect(cab).toContain('ALPA');
        expect(cab).toContain('[[empresa.telefone]]' === cab ? '' : 'Rua X, 1');
        const rodape = (def.footer as (p: number, t: number) => Content)(2, 5);
        const r = texto(rodape);
        expect(r).toContain('Página 2 de 5');
        expect(r).toContain('[[empresa.telefone]]');
    });

    it('sem cabeçalho/rodapé o topo e a base são só as margens', () => {
        const layout = { ...LAYOUT_PADRAO, cabecalho: { ...LAYOUT_PADRAO.cabecalho, mostrar: false }, rodape: { ...LAYOUT_PADRAO.rodape, mostrar: false } };
        const def = montarDocDefinition({ conteudo: MODELO, layout, valores: {} });
        expect(def.header).toBeUndefined();
        expect(def.footer).toBeUndefined();
        expect((def.pageMargins as number[])[1]).toBeCloseTo(mmParaPt(20), 2);
    });

    it('é determinístico: mesmo input → mesmo JSON', () => {
        const entrada = { conteudo: MODELO, layout: LAYOUT_PADRAO, valores: { 'documento.numero': '1' }, anexos: ['A'] };
        expect(JSON.stringify(montarDocDefinition(entrada))).toBe(JSON.stringify(montarDocDefinition(entrada)));
    });

    it('comMetadadosFixos fixa criação/modificação e guarda o id', () => {
        const def: TDocumentDefinitions = { content: [], info: { title: 'T' } };
        const d = new Date('2026-10-07T12:00:00Z');
        const r = comMetadadosFixos(def, { id: 'abc', criadoEm: d });
        expect(r.info).toMatchObject({ title: 'T', subject: 'abc', creationDate: d, modDate: d });
    });
});
