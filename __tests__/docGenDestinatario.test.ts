import { describe, it, expect } from 'vitest';
import {
    snapshotDe, colunaNoCadastro, snapshotComCampo, resumoDoDestinatario, CAMPO_DO_SNAPSHOT, COLUNA_NO_CADASTRO, TIPOS_DESTINATARIO,
} from '../services/docGen/destinatario';
import { GRUPOS_DOC } from '../services/docGen/catalogoCampos';

describe('docGen · destinatário', () => {
    it('fornecedor (prefeitura em Meus Fornecedores) vira snapshot, com street preferido a address', () => {
        const s = snapshotDe('FORNECEDOR', {
            id: 'f1', name: 'Prefeitura Municipal de Cambuí', nickname: '', document: '', street: 'Praça Coronel Justiniano', address: 'antigo',
            number: '164', neighborhood: 'Centro', city: 'Cambuí', state: 'MG', zip_code: '37600-000', contact_name: 'Secretaria de Obras', email: 'obras@cambui.mg.gov.br', phone: '',
        });
        expect(s).toMatchObject({
            tipo: 'FORNECEDOR', id: 'f1', razao_social: 'Prefeitura Municipal de Cambuí', nome_fantasia: null, cpf_cnpj: null,
            logradouro: 'Praça Coronel Justiniano', cidade: 'Cambuí', uf: 'MG', contato_nome: 'Secretaria de Obras', contato_telefone: null,
        });
    });

    it('cliente, organização, colaborador, corretor e investidor leem as colunas certas', () => {
        expect(snapshotDe('CLIENTE', { id: 'c', name: 'Ana', document: '123', address: 'Rua A', address_number: '1', legal_rep_name: 'Rep' }))
            .toMatchObject({ logradouro: 'Rua A', numero: '1', contato_nome: 'Rep', cpf_cnpj: '123' });
        expect(snapshotDe('ORGANIZACAO', { id: 'o', name: 'Alpa', cnpj: '9', address: { street: 'R', city: 'Cambuí', state: 'MG', zipCode: '376' } }))
            .toMatchObject({ cpf_cnpj: '9', logradouro: 'R', cidade: 'Cambuí', cep: '376' });
        expect(snapshotDe('COLABORADOR', { id: 'e', name: 'João', cpf: '111', address_city: 'Pouso Alegre', address_uf: 'MG', address_zip_code: '375' }))
            .toMatchObject({ cpf_cnpj: '111', cidade: 'Pouso Alegre', uf: 'MG', cep: '375' });
        expect(snapshotDe('CORRETOR', { id: 'b', name: 'Bia', cpf: '222', agency_name: 'Imob' })).toMatchObject({ nome_fantasia: 'Imob', cpf_cnpj: '222' });
        const inv = snapshotDe('INVESTIDOR', { id: 'i', name: 'Fundo', document: '333' });
        expect(inv).toMatchObject({ cpf_cnpj: '333' });
        expect(inv.cidade).toBeUndefined();   // investidor não tem endereço no cadastro
    });

    it('manual não tem id e lê os próprios nomes de campo', () => {
        expect(snapshotDe('MANUAL', { razao_social: 'Cemig', cidade: 'BH', uf: 'MG' })).toMatchObject({ tipo: 'MANUAL', id: null, razao_social: 'Cemig', cidade: 'BH' });
    });

    it('atualizar cadastro: só onde há UMA coluna; organização/corretor/investidor/manual não gravam', () => {
        expect(colunaNoCadastro('FORNECEDOR', 'destinatario.cpf_cnpj')).toBe('document');
        expect(colunaNoCadastro('CLIENTE', 'destinatario.contato_nome')).toBeNull();
        expect(colunaNoCadastro('COLABORADOR', 'destinatario.cpf_cnpj')).toBe('cpf');
        expect(colunaNoCadastro('FORNECEDOR', 'destinatario.endereco_completo')).toBeNull();
        for (const t of ['ORGANIZACAO', 'CORRETOR', 'INVESTIDOR', 'MANUAL'] as const) expect(colunaNoCadastro(t, 'destinatario.cpf_cnpj')).toBeNull();
        expect(colunaNoCadastro(null, 'destinatario.cpf_cnpj')).toBeNull();
    });

    it('toda chave mapeada existe no catálogo e no snapshot', () => {
        const chavesCatalogo = new Set(GRUPOS_DOC.find(g => g.id === 'destinatario')!.campos.map(c => c.chave));
        for (const chave of Object.keys(CAMPO_DO_SNAPSHOT)) expect(chavesCatalogo.has(chave), chave).toBe(true);
        for (const mapa of Object.values(COLUNA_NO_CADASTRO)) for (const chave of Object.keys(mapa!)) expect(CAMPO_DO_SNAPSHOT[chave], chave).toBeDefined();
        expect(TIPOS_DESTINATARIO).toHaveLength(7);
    });

    it('snapshotComCampo aplica o valor e ignora chave composta', () => {
        const base = snapshotDe('FORNECEDOR', { id: 'f', name: 'X' });
        expect(snapshotComCampo(base, 'destinatario.cpf_cnpj', ' 18.675.983/0001-61 ').cpf_cnpj).toBe('18.675.983/0001-61');
        expect(snapshotComCampo(base, 'destinatario.endereco_completo', 'qualquer')).toBe(base);
    });

    it('resumo para listas', () => {
        expect(resumoDoDestinatario({ tipo: 'MANUAL', razao_social: 'Cemig', cpf_cnpj: '1', cidade: 'BH', uf: 'MG' })).toBe('Cemig · 1 · BH/MG');
        expect(resumoDoDestinatario(null)).toBe('');
    });
});
