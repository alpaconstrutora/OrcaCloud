import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { Packer } from 'docx';
import { montarDocx, dimensoesDaImagem } from '../services/docGen/motorDocx';
import { tabelasDoDocumento } from '../services/docGen/tabelasDinamicas';
import { contextoDeExemplo } from '../services/docGen/catalogoCampos';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

/**
 * Saída em DOCX (pedido de 10/10). Mesma entrada do PDF: o Word tem de dizer o
 * mesmo — variáveis, pendências marcadas, condições, tabelas dinâmicas,
 * assinaturas (com imagem), anexos, cabeçalho/rodapé com paginação, e a nota
 * de cópia editável. Lido de volta do .docx gerado (o XML do word/document.xml).
 */
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const MODELO: DocTipTap = {
    type: 'doc',
    content: [
        { type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'OFÍCIO Nº ' }, { type: 'variavel', attrs: { chave: 'documento.numero' }, marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Ao ' }, { type: 'variavel', attrs: { chave: 'destinatario.razao_social' } }, { type: 'text', text: ' — CNPJ ' }, { type: 'variavel', attrs: { chave: 'destinatario.cpf_cnpj' } }] },
        { type: 'campoLivre', attrs: { nome: 'conteudo', rotulo: 'Conteúdo' } },
        { type: 'condicional', attrs: { expressao: 'contrato.saldo_a_pagar > 0' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Há saldo a pagar.' }] }] },
        { type: 'condicional', attrs: { expressao: 'obra.cno vazio' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nunca aparece.' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item da lista' }] }] }] },
        { type: 'tabelaDinamica', attrs: { fonte: 'parcelas_em_aberto' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://exemplo.com' } }] }] },
        { type: 'assinaturas' },
        { type: 'anexos' },
    ],
};

async function xmlDe(e: Parameters<typeof montarDocx>[0]) {
    const buf = await Packer.toBuffer(montarDocx(e));
    const zip = new PizZip(buf);
    const arquivos = Object.keys(zip.files);
    const ler = (nome: string) => zip.file(nome)?.asText() ?? '';
    const texto = (xml: string) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    return { arquivos, documento: ler('word/document.xml'), texto: texto(ler('word/document.xml')), rodape: arquivos.filter(a => /footer/.test(a)).map(a => ler(a)).join(''), cabecalho: arquivos.filter(a => /header/.test(a)).map(a => ler(a)).join('') };
}

describe('docGen · DOCX', () => {
    it('o Word diz o mesmo que o PDF: valores, pendências, condições, tabela, assinatura, anexos', async () => {
        const ctx = contextoDeExemplo();
        const r = await xmlDe({
            conteudo: MODELO,
            layout: LAYOUT_PADRAO,
            valores: { 'documento.numero': 'OF-ENG-0047/2026', 'destinatario.razao_social': 'Prefeitura de Cambuí', 'contrato.saldo_a_pagar': 'R$ 687.500,00', 'obra.cno': '12.345', 'empresa.razao_social': 'Alpa' },
            camposLivres: { conteudo: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Solicitamos a ligação definitiva.' }] }] } },
            assinaturas: [{ nome: 'Ana Souza', cargo: 'Diretora', imagemDataUrl: PNG_1x1, assinadoEm: '10/10/2026 14:32' }],
            anexos: ['Memorial descritivo'],
            tabelas: tabelasDoDocumento({ conteudo: MODELO }, ctx),
            logoDataUrl: PNG_1x1,
            validacao: { url: 'https://orcacloud.vercel.app/publico/validar-documento/abc' },
            nota: 'Cópia editável do Ofício nº OF-ENG-0047/2026 — o documento oficial é o PDF/A arquivado no GED.',
        });
        expect(r.texto).toContain('OFÍCIO Nº OF-ENG-0047/2026');
        expect(r.texto).toContain('Ao Prefeitura de Cambuí');
        expect(r.texto).toContain('[[destinatario.cpf_cnpj]]');          // pendência marcada, não espaço mudo
        expect(r.documento).toContain('w:highlight w:val="yellow"');
        expect(r.texto).toContain('Solicitamos a ligação definitiva.');
        expect(r.texto).toContain('Há saldo a pagar.');
        expect(r.texto).not.toContain('Nunca aparece.');
        expect(r.texto).toContain('item da lista');
        expect(r.texto).toContain('Total em aberto');
        expect(r.texto).toContain('Assinado eletronicamente por Ana Souza em 10/10/2026 14:32');
        expect(r.texto).toContain('Memorial descritivo');
        expect(r.texto).toContain('https://orcacloud.vercel.app/publico/validar-documento/abc');
        expect(r.arquivos.some(a => a.startsWith('word/media/'))).toBe(true);   // assinatura e logo embutidas
        expect(r.rodape).toContain('PAGE');                                      // "Página X de Y"
        expect(r.rodape).toContain('Cópia editável do Ofício');
        expect(r.cabecalho).toContain('Alpa');
        expect(r.documento).toContain('w:jc w:val="right"');
    });

    it('lê o tamanho de PNG e JPEG pelo cabeçalho', () => {
        const png = Uint8Array.from(Buffer.from(PNG_1x1.split(',')[1], 'base64'));
        expect(dimensoesDaImagem(png)).toEqual({ largura: 1, altura: 1 });
        // JPEG: SOI, depois um SOF0 com altura 80 e largura 240.
        const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x50, 0x00, 0xf0, 0x03, 0, 0, 0, 0]);
        expect(dimensoesDaImagem(jpeg)).toEqual({ largura: 240, altura: 80 });
        expect(dimensoesDaImagem(new Uint8Array([1, 2, 3]))).toBeNull();
    });
});
