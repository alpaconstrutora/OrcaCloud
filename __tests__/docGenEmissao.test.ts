import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatDocumentNumber, buildScopeKey, variablesInUse } from '../services/documentNumbering/format';
import { DOC_TYPE_CATALOG, MAIN_DOC_TYPES, ADVANCED_DOC_TYPES, getDocTypeDefault } from '../services/documentNumbering/catalog';
import { nomeDoArquivo, caminhoDaPasta, anoDe } from '../services/docGen/emissao';

const MIGRATION = readFileSync(join(__dirname, '../supabase/migrations/aplicar_20271008000200_oficio_emissao.sql'), 'utf-8');

describe('Nomenclatura · sufixo de ano (Ofícios)', () => {
    it('OF-ENG-047/2026: prefixo, departamento, sequencial de 3 e o ano', () => {
        const cfg = getDocTypeDefault('OFICIO');
        expect(formatDocumentNumber(cfg, { DEPARTAMENTO: 'ENG' }, 47, 2026)).toBe('OF-ENG-047/2026');
    });

    it('sem sigla de departamento o token some (nunca bloqueia)', () => {
        expect(formatDocumentNumber(getDocTypeDefault('OFICIO'), {}, 1, 2026)).toBe('OF-001/2026');
    });

    it('yearSuffix sem ano informado não inventa ano', () => {
        expect(formatDocumentNumber(getDocTypeDefault('OFICIO'), { DEPARTAMENTO: 'ENG' }, 1)).toBe('OF-ENG-001');
    });

    it('o ano entra no escopo do contador: a sequência reinicia a cada ano', () => {
        const slots = getDocTypeDefault('OFICIO').slots;
        expect(buildScopeKey(slots, { DEPARTAMENTO: 'ENG' }, { year: 2026 })).toBe('ENG|2026');
        expect(buildScopeKey(slots, { DEPARTAMENTO: 'ENG' }, { year: 2027 })).toBe('ENG|2027');
        // Sem sigla: o escopo é só o ano — igual ao que `doc_gen_emitir` monta (ele pula
        // variável vazia). Para o ofício, quem decide o escopo é sempre o banco.
        expect(buildScopeKey(slots, {}, { year: 2026 })).toBe('2026');
        expect(buildScopeKey(['PREFIX'], {}, { year: 2026 })).toBe('2026');
        expect(buildScopeKey(slots, { DEPARTAMENTO: 'ENG' })).toBe('ENG');
    });

    it('os 12 tipos anteriores continuam sem ano no número nem no escopo', () => {
        const anteriores = [...MAIN_DOC_TYPES, ...ADVANCED_DOC_TYPES].filter(t => t !== 'OFICIO');
        expect(anteriores).toHaveLength(12);
        for (const t of anteriores) {
            const cfg = getDocTypeDefault(t);
            expect(cfg.yearSuffix, t).toBeFalsy();
            // Com ano informado, quem não usa yearSuffix ignora o ano.
            expect(formatDocumentNumber(cfg, {}, 5, 2026), t).not.toContain('/');
        }
    });

    it('DEPARTAMENTO só é oferecido ao Ofício', () => {
        for (const [t, e] of Object.entries(DOC_TYPE_CATALOG)) {
            if (t === 'OFICIO') expect(e.extraVariables).toEqual(['DEPARTAMENTO']);
            else expect(e.extraVariables, t).toBeUndefined();
        }
        expect(variablesInUse(getDocTypeDefault('OFICIO').slots)).toEqual(['DEPARTAMENTO']);
    });
});

describe('doc_gen_emitir · o padrão do banco é o mesmo do catálogo', () => {
    // Se alguém mudar o default do OFICIO em catalog.ts sem mudar a função SQL (ou o
    // contrário), a prévia da tela mostraria um número e o banco emitiria outro.
    const cfg = getDocTypeDefault('OFICIO');
    it('slots, prefixo, separador, dígitos e ano', () => {
        expect(MIGRATION).toContain(`v_slots := '${JSON.stringify(cfg.slots).replace(/,/g, ', ')}'::jsonb;`);
        expect(MIGRATION).toContain(`v_prefix := '${cfg.prefix}';`);
        expect(MIGRATION).toContain(`v_separator := '${cfg.separator}';`);
        expect(MIGRATION).toContain(`v_padding := ${cfg.seqPadding};`);
        expect(MIGRATION).toContain(`v_year_suf := ${cfg.yearSuffix ? 'true' : 'false'};`);
    });

    it('a função tem REVOKE de PUBLIC/anon e confere a organização dentro dela (REGRA #7)', () => {
        expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.doc_gen_emitir\(UUID, JSONB\) FROM PUBLIC, anon;/);
        const corpo = MIGRATION.slice(MIGRATION.indexOf('FUNCTION public.doc_gen_emitir'), MIGRATION.indexOf('REVOKE ALL ON FUNCTION public.doc_gen_emitir'));
        expect(corpo).toContain('organization_members');
        expect(corpo).toContain('FOR UPDATE');
        expect(corpo).toContain("set_config('docgen.emitindo', 'on', true)");
    });

    it('a formatação de 6 argumentos (usada pelos triggers de Serviços) não é redefinida', () => {
        const redefinicoes = MIGRATION.match(/CREATE OR REPLACE FUNCTION public\.fn_format_document_number\(([^)]*)\)/g) ?? [];
        expect(redefinicoes).toHaveLength(1);
        expect(redefinicoes[0]).toContain('p_year_suffix BOOLEAN');
    });
});

describe('docGen · arquivo e pasta do ofício emitido', () => {
    it('nome do arquivo sem barra', () => {
        expect(nomeDoArquivo('OF-ENG-047/2026')).toBe('OF-ENG-047-2026.pdf');
        expect(nomeDoArquivo(' OF / 1 ')).toBe('OF-1.pdf');
        expect(nomeDoArquivo('')).toBe('oficio.pdf');
    });

    it('pasta Ofícios / ano / departamento', () => {
        expect(caminhoDaPasta('2026', 'Engenharia')).toEqual(['Ofícios', '2026', 'Engenharia']);
        expect(caminhoDaPasta('2026', '')).toEqual(['Ofícios', '2026', 'Sem departamento']);
        expect(anoDe('2026-10-08')).toBe('2026');
    });
});
