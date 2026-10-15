import { describe, it, expect } from 'vitest';
import { CATALOGO_MANUTENCAO, SISTEMAS_PADRAO, slugDoSistema, slugLivre } from '../services/maintenanceCatalog';

describe('slugDoSistema', () => {
    it('tira acento, caixa e pontuação', () => {
        expect(slugDoSistema('Portões e automação')).toBe('portoes-e-automacao');
        expect(slugDoSistema('  SPDA (para-raios)  ')).toBe('spda-para-raios');
    });

    it('nome só de símbolos não vira slug vazio (o banco exige NOT NULL e UNIQUE)', () => {
        expect(slugDoSistema('!!!')).toBe('sistema');
    });

    it('corta em 60 sem deixar hífen pendurado', () => {
        const slug = slugDoSistema(`${'a'.repeat(59)} b`);
        expect(slug.length).toBeLessThanOrEqual(60);
        expect(slug.endsWith('-')).toBe(false);
    });
});

describe('slugLivre', () => {
    it('usa o slug base quando está livre', () => {
        expect(slugLivre('Piscina', [{ slug: 'elevadores' }])).toBe('piscina');
    });

    it('nome diferente com o mesmo slug ganha sufixo em vez de bater no UNIQUE', () => {
        expect(slugLivre('Portões!', [{ slug: 'portoes' }])).toBe('portoes-2');
        expect(slugLivre('Portões!', [{ slug: 'portoes' }, { slug: 'portoes-2' }])).toBe('portoes-3');
    });
});

describe('SISTEMAS_PADRAO', () => {
    it('todo slug padrão tem itens no catálogo — senão "Criar plano" não sugere nada para ele', () => {
        for (const s of SISTEMAS_PADRAO) expect(CATALOGO_MANUTENCAO[s.slug]?.length ?? 0).toBeGreaterThan(0);
    });

    it('slugs únicos (o seed é um upsert por organization_id+slug)', () => {
        const slugs = SISTEMAS_PADRAO.map(s => s.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
    });
});
