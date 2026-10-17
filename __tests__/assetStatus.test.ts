import { describe, it, expect } from 'vitest';
import { ASSET_STATUS_LABELS, MAINTENANCE_STATUS_LABELS, RESERVATION_STATUS_LABELS, rotuloDoStatus } from '../utils/assetStatus';

describe('rótulos de status da Gestão de Ativos', () => {
    it('nenhum rótulo é o próprio código (o defeito era mostrar "disponivel" cru)', () => {
        for (const mapa of [ASSET_STATUS_LABELS, RESERVATION_STATUS_LABELS, MAINTENANCE_STATUS_LABELS]) {
            for (const [codigo, rotulo] of Object.entries(mapa)) {
                expect(rotulo).not.toBe(codigo);
                expect(rotulo[0]).toBe(rotulo[0].toUpperCase());
            }
        }
    });

    it('em_uso tem UM rótulo só (era "Em Obra" na tabela e "Em Uso" no filtro)', () => {
        expect(ASSET_STATUS_LABELS.em_uso).toBe('Em obra');
    });

    it('rotuloDoStatus: código legado fora do mapa aparece como está; vazio vira travessão', () => {
        expect(rotuloDoStatus(ASSET_STATUS_LABELS, 'disponivel')).toBe('Disponível');
        expect(rotuloDoStatus(ASSET_STATUS_LABELS as Record<string, string>, 'legado')).toBe('legado');
        expect(rotuloDoStatus(ASSET_STATUS_LABELS, null)).toBe('—');
    });
});
