import { describe, it, expect } from 'vitest';
import {
    applyClientChoice, applyCostCenterSuggestion, applyDevelopmentChoice, applyUnitChoice, centroDeCustoSugerido,
    obrasDoEmpreendimento, clientToFill, entregaDoChamado, markManual,
    resolveWarrantyExpiry, unitLabel, unitsOfClient, type ClaimLinkFields,
} from '../utils/warrantyAutofill';
import type { WarrantyUnitOption, WarrantyUnitClient } from '../types/warranty';

const cli = (client_id: string, role = 'PROPRIETARIO', fonte: WarrantyUnitClient['fonte'] = 'ocupacao'): WarrantyUnitClient =>
    ({ client_id, client_name: client_id.toUpperCase(), role, since: null, fonte });

const unit = (unit_id: string, over: Partial<WarrantyUnitOption> = {}): WarrantyUnitOption => ({
    unit_id, unit_name: unit_id, unit_floor: 1, quadra: null, lote: null,
    tower_name: 'Torre A', empreendimento_id: 'emp1', empreendimento_name: 'Bella Vista',
    project_id: 'obra1', clients: [], entrega_data: null, entrega_fonte: null, ...over,
});

const vazio: ClaimLinkFields = { client_id: '', unit_id: '', unidade_ref: '', development_id: '', project_id: '', cost_center_id: '' };
const nada = new Set<never>();

const DIR: WarrantyUnitOption[] = [
    unit('31', { clients: [cli('ana')] }),
    unit('32', { clients: [cli('bia'), cli('caio')] }),               // casal comprador
    unit('41', { clients: [cli('bia', 'INQUILINO')], project_id: null, empreendimento_id: 'emp2' }),
    unit('42', { clients: [cli('dan'), cli('eva', 'INQUILINO')] }),
    unit('51'),
];

describe('unitLabel', () => {
    it('torre · unidade, e quadra · lote em loteamento', () => {
        expect(unitLabel(unit('302'))).toBe('Torre A · 302');
        expect(unitLabel(unit('x', { tower_name: null }))).toBe('x');
        expect(unitLabel(unit('x', { quadra: '3', lote: '12' }))).toBe('Quadra 3 · Lote 12');
    });
});

describe('unitsOfClient / clientToFill', () => {
    it('papel mais forte primeiro', () => {
        expect(unitsOfClient(DIR, 'bia').map(u => u.unit_id)).toEqual(['32', '41']);
        expect(unitsOfClient(DIR, '')).toEqual([]);
    });
    it('único cliente ou único proprietário; casal não é deduzido', () => {
        expect(clientToFill(DIR[0])?.client_id).toBe('ana');
        expect(clientToFill(DIR[1])).toBeNull();
        expect(clientToFill(DIR[3])?.client_id).toBe('dan');
        expect(clientToFill(DIR[4])).toBeNull();
    });
});

describe('applyClientChoice', () => {
    it('cliente com 1 unidade preenche unidade, empreendimento e obra', () => {
        const r = applyClientChoice(vazio, nada, 'ana', DIR);
        expect(r.form).toEqual({ client_id: 'ana', unit_id: '31', unidade_ref: 'Torre A · 31', development_id: 'emp1', project_id: 'obra1', cost_center_id: '' });
        expect(r.hint).toBeNull();
        expect(r.auto.has('client_id')).toBe(false);
    });

    it('cliente com várias unidades não chuta e explica', () => {
        const r = applyClientChoice(vazio, nada, 'bia', DIR);
        expect(r.form.unit_id).toBe('');
        expect(r.hint).toMatch(/2 unidades/);
    });

    it('cliente sem unidade usa o único empreendimento vinculado em Meus Clientes', () => {
        const r = applyClientChoice(vazio, nada, 'zeca', DIR, [{ id: 'emp9', project_id: 'obra9' }]);
        expect(r.form.development_id).toBe('emp9');
        expect(r.form.project_id).toBe('obra9');
        expect(applyClientChoice(vazio, nada, 'zeca', DIR, [{ id: 'a' }, { id: 'b' }]).form.development_id).toBe('');
    });

    it('não sobrescreve campo escolhido à mão', () => {
        const r = applyClientChoice({ ...vazio, project_id: 'obraManual' }, nada, 'ana', DIR);
        expect(r.form.project_id).toBe('obraManual');
        expect(r.form.development_id).toBe('emp1');
    });

    it('trocar de cliente limpa o que o anterior preencheu sozinho', () => {
        const a = applyClientChoice(vazio, nada, 'ana', DIR);
        const b = applyClientChoice(a.form, a.auto, 'bia', DIR);
        expect(b.form).toEqual({ ...vazio, client_id: 'bia' });
    });

    it('unidade escolhida à mão continua mandando', () => {
        const r = applyClientChoice({ ...vazio, unit_id: '51' }, nada, 'ana', DIR);
        expect(r.form.unit_id).toBe('51');
    });

    it('campo marcado como manual depois do autopreenchimento fica', () => {
        const a = applyClientChoice(vazio, nada, 'ana', DIR);
        const auto = markManual(a.auto, 'project_id');
        const b = applyClientChoice({ ...a.form, project_id: 'outra' }, auto, 'bia', DIR);
        expect(b.form.project_id).toBe('outra');
        expect(b.form.development_id).toBe('');
    });
});

describe('applyUnitChoice', () => {
    it('unidade com 1 cliente preenche tudo, inclusive o cliente', () => {
        const r = applyUnitChoice(vazio, nada, DIR[0]);
        expect(r.form).toEqual({ client_id: 'ana', unit_id: '31', unidade_ref: 'Torre A · 31', development_id: 'emp1', project_id: 'obra1', cost_center_id: '' });
    });

    it('casal: preenche o resto e pede o cliente', () => {
        const r = applyUnitChoice(vazio, nada, DIR[1]);
        expect(r.form.client_id).toBe('');
        expect(r.form.development_id).toBe('emp1');
        expect(r.hint).toMatch(/2 clientes/);
    });

    it('unidade de outro empreendimento substitui empreendimento e obra escolhidos à mão', () => {
        const r = applyUnitChoice({ ...vazio, development_id: 'emp9', project_id: 'obra9' }, nada, DIR[0]);
        expect(r.form.development_id).toBe('emp1');
        expect(r.form.project_id).toBe('obra1');
    });

    it('unidade do mesmo empreendimento mantém a obra escolhida à mão', () => {
        const r = applyUnitChoice({ ...vazio, development_id: 'emp1', project_id: 'obraTorre' }, nada, DIR[0]);
        expect(r.form.project_id).toBe('obraTorre');
    });

    it('não troca cliente escolhido à mão', () => {
        const r = applyUnitChoice({ ...vazio, client_id: 'eva' }, nada, DIR[3]);
        expect(r.form.client_id).toBe('eva');
    });

    it('trocar a unidade limpa empreendimento/obra/cliente que a anterior preencheu', () => {
        const a = applyUnitChoice(vazio, nada, DIR[0]);
        const b = applyUnitChoice(a.form, a.auto, DIR[2]);
        expect(b.form).toEqual({ client_id: 'bia', unit_id: '41', unidade_ref: 'Torre A · 41', development_id: 'emp2', project_id: '', cost_center_id: '' });
    });

    it('limpar a unidade limpa o que ela preencheu', () => {
        const a = applyUnitChoice(vazio, nada, DIR[0]);
        expect(applyUnitChoice(a.form, a.auto, null).form).toEqual(vazio);
    });
});

describe('vencimento a partir da entrega', () => {
    it('soma meses em data pura e ajusta fim de mês', () => {
        expect(resolveWarrantyExpiry('2024-03-15', 60)).toBe('2029-03-15');
        expect(resolveWarrantyExpiry('2024-01-31', 1)).toBe('2024-02-29');
        expect(resolveWarrantyExpiry('2024-11-30', 3)).toBe('2025-02-28');
        expect(resolveWarrantyExpiry(null, 12)).toBeNull();
        expect(resolveWarrantyExpiry('2024-01-01', 0)).toBeNull();
    });

    it('entrega da unidade; sem unidade, a do empreendimento (nunca a posse de outra unidade)', () => {
        const dir = [
            unit('a', { entrega_data: '2020-01-10', entrega_fonte: 'posse_proprietario' }),
            unit('b', { entrega_data: '2019-06-01', entrega_fonte: 'habite_se' }),
        ];
        expect(entregaDoChamado({ unit_id: 'a' }, dir)).toEqual({ data: '2020-01-10', fonte: 'posse_proprietario' });
        expect(entregaDoChamado({ development_id: 'emp1' }, dir)).toEqual({ data: '2019-06-01', fonte: 'habite_se' });
        expect(entregaDoChamado({ development_id: 'emp1' }, [dir[0]])).toBeNull();
        expect(entregaDoChamado({}, dir)).toBeNull();
    });
});

describe('empreendimento recorta a obra (pedido seguinte, 2026-10-10)', () => {
    const MAPA = { obra1: { id: 'emp1' }, obra1b: { id: 'emp1' }, obra2: { id: 'emp2' } };
    const OBRAS = [{ id: 'obra1' }, { id: 'obra1b' }, { id: 'obra2' }, { id: 'solta' }];

    it('lista só as obras do empreendimento; sem empreendimento, todas', () => {
        expect(obrasDoEmpreendimento(OBRAS, MAPA, 'emp1').map(o => o.id)).toEqual(['obra1', 'obra1b']);
        expect(obrasDoEmpreendimento(OBRAS, MAPA, 'emp9')).toEqual([]);
        expect(obrasDoEmpreendimento(OBRAS, MAPA, '')).toHaveLength(4);
    });

    it('trocar o empreendimento tira a obra que não é dele, mesmo escolhida à mão', () => {
        const r = applyDevelopmentChoice({ ...vazio, project_id: 'obra2' }, nada, 'emp1', ['obra1', 'obra1b']);
        expect(r.form.development_id).toBe('emp1');
        expect(r.form.project_id).toBe('');
    });

    it('mantém a obra que é do empreendimento', () => {
        const r = applyDevelopmentChoice({ ...vazio, project_id: 'obra1b' }, nada, 'emp1', ['obra1', 'obra1b']);
        expect(r.form.project_id).toBe('obra1b');
    });

    it('com uma obra só, preenche a obra', () => {
        const r = applyDevelopmentChoice(vazio, nada, 'emp2', ['obra2']);
        expect(r.form.project_id).toBe('obra2');
        expect(r.auto.has('project_id')).toBe(true);
    });

    it('tira a unidade de outro empreendimento', () => {
        const a = applyUnitChoice(vazio, nada, DIR[0]);                // emp1, obra1
        const r = applyDevelopmentChoice(a.form, a.auto, 'emp2', ['obra2'], DIR);
        expect(r.form.unit_id).toBe('');
        expect(r.form.unidade_ref).toBe('');
        expect(r.form.project_id).toBe('obra2');
    });

    it('limpar o empreendimento limpa só a obra que ele tinha preenchido', () => {
        const a = applyDevelopmentChoice(vazio, nada, 'emp2', ['obra2']);
        expect(applyDevelopmentChoice(a.form, a.auto, '', []).form.project_id).toBe('');
        expect(applyDevelopmentChoice({ ...vazio, project_id: 'solta' }, nada, '', []).form.project_id).toBe('solta');
    });
});

describe('centro de custo sugerido pela obra / empreendimento (2026-10-10)', () => {
    const CCS = [
        { id: 'grupo', parent_id: null, project_id: 'obra1' },              // grupo não conta
        { id: 'ccObra1', parent_id: 'grupo', project_id: 'obra1' },
        { id: 'ccObra2a', parent_id: 'grupo', project_id: 'obra2' },
        { id: 'ccObra2b', parent_id: 'grupo', project_id: 'obra2' },
        { id: 'ccEmp1', parent_id: 'grupo', empreendimento_id: 'emp1' },
        { id: 'ccEmp3a', parent_id: 'grupo', empreendimento_id: 'emp3' },
        { id: 'ccEmp3b', parent_id: 'grupo', empreendimento_id: 'emp3' },
    ];

    it('um CC da obra → ele; vários → nenhum (e não cai para o do empreendimento)', () => {
        expect(centroDeCustoSugerido(CCS, 'obra1', 'emp1')).toBe('ccObra1');
        expect(centroDeCustoSugerido(CCS, 'obra2', 'emp1')).toBeNull();
    });

    it('obra sem CC → o do empreendimento, se for um só', () => {
        expect(centroDeCustoSugerido(CCS, 'obraSemCC', 'emp1')).toBe('ccEmp1');
        expect(centroDeCustoSugerido(CCS, '', 'emp1')).toBe('ccEmp1');
        expect(centroDeCustoSugerido(CCS, '', 'emp3')).toBeNull();
        expect(centroDeCustoSugerido(CCS, '', '')).toBeNull();
    });

    it('preenche, troca quando a obra muda e limpa quando não há sugestão', () => {
        const a = applyCostCenterSuggestion({ ...vazio, project_id: 'obra1' }, nada, CCS);
        expect(a.form.cost_center_id).toBe('ccObra1');
        expect(a.auto.has('cost_center_id')).toBe(true);
        const b = applyCostCenterSuggestion({ ...a.form, project_id: 'obraSemCC', development_id: 'emp1' }, a.auto, CCS);
        expect(b.form.cost_center_id).toBe('ccEmp1');
        const c = applyCostCenterSuggestion({ ...b.form, project_id: 'obra2', development_id: '' }, b.auto, CCS);
        expect(c.form.cost_center_id).toBe('');
        expect(c.auto.has('cost_center_id')).toBe(false);
    });

    it('CC escolhido à mão nunca é trocado', () => {
        const r = applyCostCenterSuggestion({ ...vazio, project_id: 'obra1', cost_center_id: 'meu' }, nada, CCS);
        expect(r.form.cost_center_id).toBe('meu');
    });
});
