import { describe, expect, it } from 'vitest';
import { mudancasDesdeAVersao } from '../utils/creditRoomVersaoDesatualizada';
import { PARAMETROS_CAPACIDADE_PADRAO } from '../utils/creditCapacity';
import type { CreditRoom, CreditRoomVersion } from '../types/creditRoom';

const DONA = 'org-dona';
const E = (id: string) => ({ id, nome: id });

const room = (over: Partial<CreditRoom> = {}): CreditRoom => ({
    id: 'r1', organizationId: DONA, requestedAmount: 1_000_000,
    eligibleFlows: { noi: true, receivables: false, operating_cash: false },
    escopo: 'EMPRESA', grupoOrganizationIds: [], empreendimentoIds: [],
    parametrosCapacidade: { ...PARAMETROS_CAPACIDADE_PADRAO },
    ...over,
} as CreditRoom);

const versao = (over: { empreendimentos?: string[]; escopo?: { tipo: 'EMPRESA' | 'GRUPO'; orgs: string[] }; parametros?: object; valor?: number; capacidade?: boolean } = {}): CreditRoomVersion => ({
    id: 'v1', versionNo: 1,
    snapshot: {
        schema: 2,
        operacao: { requested_amount: over.valor ?? 1_000_000, eligible_flows: { noi: true, receivables: false, operating_cash: false } },
        escopo: { tipo: over.escopo?.tipo ?? 'EMPRESA', organizacoes: (over.escopo?.orgs ?? [DONA]).map(id => ({ id, nome: id, cnpj: null })) },
        empreendimentos: (over.empreendimentos ?? ['e1', 'e2', 'e3']).map(E),
        capacidade: over.capacidade === false ? null : { parametros: { ...PARAMETROS_CAPACIDADE_PADRAO, ...over.parametros } },
    },
} as unknown as CreditRoomVersion);

describe('mudancasDesdeAVersao — o cadastro mudou depois da versão congelada?', () => {
    it('cadastro igual à versão → nada', () => {
        expect(mudancasDesdeAVersao(room(), versao())).toEqual([]);
    });

    it('caso real CR-00002: versão com 11 empreendimentos, cadastro com 4 marcados → empreendimentos', () => {
        const onze = Array.from({ length: 11 }, (_, i) => `e${i}`);
        expect(mudancasDesdeAVersao(room({ empreendimentoIds: ['e0', 'e3', 'e5', 'e9'] }), versao({ empreendimentos: onze })))
            .toEqual(['empreendimentos']);
    });

    it('mesmos empreendimentos em outra ordem → nada; "todos" (lista vazia) não é comparável → nada', () => {
        expect(mudancasDesdeAVersao(room({ empreendimentoIds: ['e3', 'e1', 'e2'] }), versao())).toEqual([]);
        expect(mudancasDesdeAVersao(room({ empreendimentoIds: [] }), versao({ empreendimentos: ['e1'] }))).toEqual([]);
    });

    it('escopo: EMPRESA → GRUPO, e GRUPO com outra empresa', () => {
        expect(mudancasDesdeAVersao(room({ escopo: 'GRUPO', grupoOrganizationIds: [DONA, 'o2'] }), versao())).toEqual(['escopo']);
        expect(mudancasDesdeAVersao(
            room({ escopo: 'GRUPO', grupoOrganizationIds: [DONA, 'o3'] }),
            versao({ escopo: { tipo: 'GRUPO', orgs: [DONA, 'o2'] } }),
        )).toEqual(['escopo']);
        // A dona entra no grupo mesmo se a lista não a tiver (como o congelamento faz).
        expect(mudancasDesdeAVersao(
            room({ escopo: 'GRUPO', grupoOrganizationIds: ['o2'] }),
            versao({ escopo: { tipo: 'GRUPO', orgs: [DONA, 'o2'] } }),
        )).toEqual([]);
    });

    it('parâmetros: DSCR mínimo trocado → parâmetros; prazo vindo da operação conta como o congelamento conta', () => {
        expect(mudancasDesdeAVersao(room({ parametrosCapacidade: { ...PARAMETROS_CAPACIDADE_PADRAO, dscr_minimo: 1.5 } }), versao()))
            .toEqual(['parametros']);
        expect(mudancasDesdeAVersao(room({ termMonths: 120 }), versao())).toEqual(['parametros']);
        expect(mudancasDesdeAVersao(room({ termMonths: 120 }), versao({ parametros: { prazo_meses: 120 } }))).toEqual([]);
    });

    it('valor solicitado e fluxos elegíveis', () => {
        expect(mudancasDesdeAVersao(room({ requestedAmount: 2_000_000 }), versao())).toEqual(['valor']);
        expect(mudancasDesdeAVersao(room({ eligibleFlows: { noi: true, receivables: true, operating_cash: false } }), versao()))
            .toEqual(['fluxos']);
    });

    it('sem versão, ou versão antiga sem capacidade → nada (as abas já pedem uma versão nova)', () => {
        expect(mudancasDesdeAVersao(room(), null)).toEqual([]);
        expect(mudancasDesdeAVersao(room({ requestedAmount: 9 }), versao({ capacidade: false }))).toEqual([]);
    });
});
