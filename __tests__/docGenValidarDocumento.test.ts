import { describe, it, expect } from 'vitest';
import { validarDocumento, temBloqueante, campoLivreVazio } from '../services/docGen/validarDocumento';
import { LAYOUT_PADRAO, type DocTipTap } from '../types/docGen';

const semCabecalho = { ...LAYOUT_PADRAO, cabecalho: { ...LAYOUT_PADRAO.cabecalho, mostrar: false }, rodape: { ...LAYOUT_PADRAO.rodape, mostrar: false } };

const MODELO: DocTipTap = {
    type: 'doc',
    content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Nº ' }, { type: 'variavel', attrs: { chave: 'documento.numero' } }] },
        { type: 'paragraph', content: [{ type: 'variavel', attrs: { chave: 'destinatario.razao_social' } }] },
        { type: 'paragraph', content: [{ type: 'variavel', attrs: { chave: 'destinatario.cpf_cnpj' } }] },
        { type: 'paragraph', content: [{ type: 'variavel', attrs: { chave: 'obra.cno' } }] },
        { type: 'campoLivre', attrs: { nome: 'conteudo', rotulo: 'Conteúdo do ofício' } },
        { type: 'assinaturas' },
    ],
};

const texto = (t: string): DocTipTap => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });

const base = {
    modelo: { conteudo: MODELO, layout: semCabecalho, campos_obrigatorios: ['destinatario.razao_social', 'destinatario.cpf_cnpj'] },
    assunto: 'Ligação de energia',
    temDestinatario: true,
    quantidadeSignatarios: 1,
    conteudo: { conteudo: texto('Solicitamos.') },
    valores: { 'destinatario.razao_social': 'Prefeitura', 'destinatario.cpf_cnpj': '18.675.983/0001-61', 'obra.cno': '123' },
};

describe('docGen · validar documento', () => {
    it('tudo preenchido: nenhuma pendência (o número nunca é pendência no rascunho)', () => {
        expect(validarDocumento(base)).toEqual([]);
    });

    it('CNPJ obrigatório vazio é bloqueante, e oferece preencher (variavel=true)', () => {
        const p = validarDocumento({ ...base, valores: { ...base.valores, 'destinatario.cpf_cnpj': '' } });
        expect(p).toHaveLength(1);
        expect(p[0]).toMatchObject({ chave: 'destinatario.cpf_cnpj', severidade: 'bloqueante', variavel: true });
        expect(p[0].mensagem).toContain('obrigatório');
        expect(temBloqueante(p)).toBe(true);
    });

    it('variável não obrigatória vazia é só aviso', () => {
        const p = validarDocumento({ ...base, valores: { ...base.valores, 'obra.cno': '  ' } });
        expect(p).toEqual([expect.objectContaining({ chave: 'obra.cno', severidade: 'aviso' })]);
        expect(temBloqueante(p)).toBe(false);
    });

    it('sem destinatário, sem assunto, sem signatário e campo livre vazio: 4 bloqueantes antes dos avisos', () => {
        const p = validarDocumento({
            ...base, temDestinatario: false, assunto: ' ', quantidadeSignatarios: 0, conteudo: { conteudo: texto('   ') },
            valores: { 'destinatario.razao_social': 'X', 'destinatario.cpf_cnpj': 'Y' },
        });
        expect(p.map(x => x.chave)).toEqual(['destinatario', 'assunto', 'signatarios', 'campo:conteudo', 'obra.cno']);
        expect(p.slice(0, 4).every(x => x.severidade === 'bloqueante')).toBe(true);
        expect(p[4].severidade).toBe('aviso');
    });

    it('modelo sem bloco de assinaturas não exige signatário', () => {
        const modelo = { ...base.modelo, conteudo: { type: 'doc' as const, content: MODELO.content!.filter(n => n.type !== 'assinaturas') } };
        expect(validarDocumento({ ...base, modelo, quantidadeSignatarios: 0 })).toEqual([]);
    });

    it('campo livre com só uma variável conta como redigido', () => {
        expect(campoLivreVazio({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'variavel', attrs: { chave: 'obra.nome' } }] }] })).toBe(false);
        expect(campoLivreVazio({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
        expect(campoLivreVazio(null)).toBe(true);
    });
});
