import { describe, expect, it } from 'vitest';
import {
    ehVinculoDuplicado, rotuloContrato, rotuloDocumento, rotuloNaoConformidade, rotuloPedido, rotuloTarefa,
} from '../utils/riskVinculos';

/**
 * F2.2 — o rótulo gravado no vínculo (`external_label`, "rótulo do momento") tem de ser
 * legível sozinho, porque o objeto de origem pode mudar de nome ou sumir.
 */
describe('riskVinculos — rótulo gravado no vínculo', () => {
    it('contrato, pedido, NC, documento e tarefa', () => {
        expect(rotuloContrato({ number: '012', title: 'Locação de grua' })).toBe('Contrato 012 · Locação de grua');
        expect(rotuloContrato({ number: null, title: null })).toBe('Contrato sem número');
        expect(rotuloPedido({ number: 'PC-0034' })).toBe('Pedido PC-0034');
        expect(rotuloNaoConformidade({ description: 'Armadura exposta', work_order: { code: 'OS-7', title: 'Laje 3' } })).toBe('NC OS-7 · Armadura exposta');
        expect(rotuloNaoConformidade({ description: null, work_order: null })).toBe('NC · sem descrição');
        expect(rotuloDocumento({ nome: '  Alvará   de obra ' })).toBe('Documento · Alvará de obra');
        expect(rotuloTarefa('Escavação do subsolo')).toBe('Tarefa · Escavação do subsolo');
    });

    it('texto longo é cortado com reticências', () => {
        const r = rotuloContrato({ number: '1', title: 'x'.repeat(200) });
        expect(r.length).toBeLessThan(110);
        expect(r.endsWith('…')).toBe(true);
    });

    it('duplicado = 23505 ou o nome da constraint', () => {
        expect(ehVinculoDuplicado({ code: '23505' })).toBe(true);
        expect(ehVinculoDuplicado({ message: 'duplicate key value violates unique constraint "risk_links_unico"' })).toBe(true);
        expect(ehVinculoDuplicado({ code: '42501' })).toBe(false);
        expect(ehVinculoDuplicado(null)).toBe(false);
    });
});
