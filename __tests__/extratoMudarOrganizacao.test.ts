import { describe, it, expect } from 'vitest';
import { motivoParaNaoMudarOrganizacao, planoDaMudanca, type OrgDasDimensoes } from '../utils/extratoMudarOrganizacao';

/** Mudar a organização de um lançamento do extrato — docs/planos/2026-10-24-extrato-mudar-organizacao.md */

const ALPA = 'org-alpa';
const ALTAIR = 'org-altair';

describe('motivoParaNaoMudarOrganizacao', () => {
    it('lançamento pendente numa conta que atende duas orgs pode mudar', () => {
        expect(motivoParaNaoMudarOrganizacao({ status: 'NORMALIZED', organization_id: ALPA }, [ALPA, ALTAIR])).toBeNull();
        expect(motivoParaNaoMudarOrganizacao({ status: 'IGNORED', organization_id: ALPA }, [ALPA, ALTAIR])).toBeNull();
    });

    it.each(['MATCHED', 'CONFIRMED', 'TRANSFER', 'LOCKED'])('%s trava: o vínculo foi feito com a org atual', status => {
        expect(motivoParaNaoMudarOrganizacao({ status: status as never, organization_id: ALPA }, [ALPA, ALTAIR]))
            .toMatch(/desfaça a conciliação/);
    });

    it('conta que só atende a dona: não há para onde mover, e o motivo diz como liberar', () => {
        expect(motivoParaNaoMudarOrganizacao({ status: 'NORMALIZED', organization_id: ALPA }, [ALPA]))
            .toMatch(/Atende também/);
    });
});

describe('planoDaMudanca', () => {
    const orgDe: OrgDasDimensoes = {
        obra: id => ({ obraAlpa: ALPA, obraAltair: ALTAIR } as Record<string, string>)[id],
        centroCusto: id => ({ ccAlpa: ALPA, ccAltair: ALTAIR } as Record<string, string>)[id],
        planoContas: id => ({ pcAlpa: ALPA } as Record<string, string>)[id],
    };

    it('limpa as dimensões da org antiga e diz quais', () => {
        const r = planoDaMudanca({ project_id: 'obraAlpa', cost_center_id: 'ccAlpa', plano_de_contas_id: 'pcAlpa' }, ALTAIR, orgDe);
        expect(r.campos).toEqual({ organization_id: ALTAIR, project_id: null, cost_center_id: null, plano_de_contas_id: null });
        expect(r.limpos).toEqual(['Obra', 'Centro de Custo', 'Plano de Contas']);
    });

    it('mantém as dimensões que já são da org de destino', () => {
        const r = planoDaMudanca({ project_id: 'obraAltair', cost_center_id: 'ccAltair' }, ALTAIR, orgDe);
        expect(r.campos).toEqual({ organization_id: ALTAIR });
        expect(r.limpos).toEqual([]);
    });

    it('dimensão de org desconhecida também é limpa (não dá para afirmar que é do destino)', () => {
        const r = planoDaMudanca({ cost_center_id: 'cc-de-quem' }, ALTAIR, orgDe);
        expect(r.campos).toEqual({ organization_id: ALTAIR, cost_center_id: null });
        expect(r.limpos).toEqual(['Centro de Custo']);
    });

    it('sem dimensões: só a organização', () => {
        expect(planoDaMudanca({}, ALTAIR, orgDe)).toEqual({ campos: { organization_id: ALTAIR }, limpos: [] });
    });
});
