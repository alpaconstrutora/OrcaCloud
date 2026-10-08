import { describe, it, expect } from 'vitest';
import {
    CAMPOS_POR_CHAVE, GRUPOS_DOC, GRUPOS_LEGADOS, contextoDeExemplo, resolverCampos, resolverTodos, rotuloDaChave,
} from '../services/docGen/catalogoCampos';
import { FIELD_GROUPS } from '../services/docxFieldCatalog';

describe('docGen · catálogo de campos', () => {
    it('toda chave do catálogo é única e tem a forma grupo.campo', () => {
        const todas = [...GRUPOS_DOC, ...GRUPOS_LEGADOS].flatMap(g => g.campos.map(c => c.chave));
        expect(new Set(todas).size).toBe(todas.length);
        for (const chave of todas) expect(chave).toMatch(/^[a-z_]+\.[a-z_0-9]+$/i);
    });

    it('os grupos novos cobrem o que a proposta pede', () => {
        const ids = GRUPOS_DOC.map(g => g.id);
        expect(ids).toEqual(expect.arrayContaining(['empresa', 'destinatario', 'documento', 'assinante', 'usuario', 'obra', 'empreendimento', 'contrato', 'cliente', 'fornecedor']));
        for (const chave of [
            'empresa.razao_social', 'empresa.cnpj', 'empresa.cidade', 'empresa.telefone', 'empresa.email',
            'destinatario.razao_social', 'destinatario.cpf_cnpj', 'destinatario.cidade_uf', 'destinatario.contato_nome',
            'documento.numero', 'documento.assunto', 'documento.data', 'documento.data_extenso', 'documento.local_e_data',
            'assinante.nome', 'assinante.cargo', 'assinante.registro_profissional',
            'obra.nome', 'obra.codigo', 'obra.cno', 'obra.contrato',
            'empreendimento.nome', 'empreendimento.spe', 'contrato.numero', 'contrato.objeto', 'contrato.valor',
            'usuario.nome', 'usuario.cargo', 'usuario.departamento',
        ]) expect(CAMPOS_POR_CHAVE[chave], chave).toBeDefined();
    });

    it('os 12 grupos legados do .docx continuam acessíveis por source.field', () => {
        expect(GRUPOS_LEGADOS.length).toBe(FIELD_GROUPS.length);
        expect(CAMPOS_POR_CHAVE['organization.name']).toBeDefined();
        expect(CAMPOS_POR_CHAVE['contract.payment_method']).toBeDefined();
    });

    it('cada chave resolve com o contexto de exemplo (prévia do modelo nunca sai vazia por bug de getter)', () => {
        const ctx = contextoDeExemplo('2026-10-07');
        const valores = resolverTodos(ctx);
        // Os grupos novos têm de resolver TODOS os campos no exemplo — é o que a prévia mostra.
        const vazios = GRUPOS_DOC.flatMap(g => g.campos.map(c => c.chave)).filter(ch => !valores[ch]);
        expect(vazios).toEqual([]);
        expect(valores['empresa.razao_social']).toBe('Construtora Exemplo Ltda.');
        expect(valores['empresa.cidade_uf']).toBe('Cambuí/MG');
        expect(valores['empresa.endereco_completo']).toBe('Rua das Acácias, 100 - Centro - Cambuí/MG - CEP 37600-000');
        expect(valores['destinatario.razao_social']).toBe('Prefeitura Municipal de Cambuí');
        expect(valores['documento.data_extenso']).toBe('7 de outubro de 2026');
        expect(valores['documento.local_e_data']).toBe('Cambuí, 7 de outubro de 2026');
        expect(valores['documento.ano']).toBe('2026');
        expect(valores['documento.anexos']).toBe('1. Memorial Descritivo\n2. Planta Arquitetônica\n3. ART nº 1234567');
        expect(valores['contrato.valor']).toContain('1.250.000,00');
        expect(valores['contrato.valor_extenso']).toMatch(/milhão/);
        expect(valores['obra.cno']).toBe('12.345.67890/01');
    });

    it('empresa do grupo (company) manda sobre a organização quando existe', () => {
        const ctx = contextoDeExemplo();
        ctx.company = {
            id: 'c1', razao_social: 'Central Empreendimentos SPE Ltda.', nome_fantasia: 'Central', cnpj: '98.765.432/0001-10',
            endereco_fiscal: { logradouro: 'Av. Brasil', numero: '1500', bairro: 'Jardins', cidade: 'Pouso Alegre', uf: 'MG', cep: '37550-000' },
            telefone: '(35) 3000-1111',
        } as unknown as NonNullable<typeof ctx.company>;
        const v = resolverCampos(['empresa.razao_social', 'empresa.cidade', 'empresa.telefone', 'empresa.site', 'empresa.cnpj'], ctx);
        expect(v['empresa.razao_social']).toBe('Central Empreendimentos SPE Ltda.');
        expect(v['empresa.cidade']).toBe('Pouso Alegre');
        expect(v['empresa.telefone']).toBe('(35) 3000-1111');
        expect(v['empresa.cnpj']).toBe('98.765.432/0001-10');
        // site não existe na empresa → cai na organização
        expect(v['empresa.site']).toBe('www.exemplo.com.br');
    });

    it('chave desconhecida resolve vazio, sem lançar', () => {
        expect(resolverCampos(['nao.existe'], contextoDeExemplo())).toEqual({ 'nao.existe': '' });
        expect(rotuloDaChave('nao.existe')).toBe('nao.existe');
        expect(rotuloDaChave('empresa.cnpj')).toBe('Empresa emitente › CNPJ');
    });

    it('contexto vazio: tudo resolve string vazia (vira pendência, não erro)', () => {
        const v = resolverTodos({});
        for (const ch of Object.keys(v)) expect(typeof v[ch]).toBe('string');
        expect(v['destinatario.razao_social']).toBe('');
        expect(v['assinante.nome']).toBe('');
    });
});
