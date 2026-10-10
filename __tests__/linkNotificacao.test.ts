import { describe, it, expect } from 'vitest';
import { destinoDoLinkDeNotificacao } from '../utils/linkNotificacao';

describe('destinoDoLinkDeNotificacao', () => {
    it('recibo disponível: Contas a Receber focando o título', () => {
        expect(destinoDoLinkDeNotificacao('/contas-a-receber?tx=abc-123'))
            .toEqual({ view: 'contas-a-receber', foco: { ref: 'abc-123', source: 'CONTA_RECEBER' } });
    });
    it('pagamento em atraso: Contas a Pagar com a fonte que ContasPagarManager já consome', () => {
        expect(destinoDoLinkDeNotificacao('/contas-a-pagar?tx=x')?.foco).toEqual({ ref: 'x', source: 'CONTA_PAGAR' });
    });
    it('demais rotas continuam só trocando de tela (query ignorada, como antes)', () => {
        expect(destinoDoLinkDeNotificacao('/rentals?tab=renewals&contract=9')).toEqual({ view: 'rentals' });
        expect(destinoDoLinkDeNotificacao('/contas-a-receber')).toEqual({ view: 'contas-a-receber' });
    });
    it('link que não é rota interna não navega', () => {
        expect(destinoDoLinkDeNotificacao('#/documentos')).toBeNull();
        expect(destinoDoLinkDeNotificacao('#/documentos?tab=juridico')).toBeNull();
        expect(destinoDoLinkDeNotificacao('https://exemplo.com/x')).toBeNull();
        expect(destinoDoLinkDeNotificacao('/')).toBeNull();
    });

    // GED (07/10/2026): o link antigo `#/documentos?…` era morto (acima). O novo abre o
    // GED no documento; com `pending=true` abre direto na aprovação pendente.
    it('GED: abre o documento pelo docId, e a pendência quando pending=true', () => {
        expect(destinoDoLinkDeNotificacao('/opura-docs?docId=d-1'))
            .toEqual({ view: 'opura-docs', foco: { ref: 'd-1', source: 'GED_DOCUMENTO' } });
        expect(destinoDoLinkDeNotificacao('/opura-docs?docId=d-2&pending=true'))
            .toEqual({ view: 'opura-docs', foco: { ref: 'd-2', source: 'GED_DOCUMENTO_PENDENTE' } });
        expect(destinoDoLinkDeNotificacao('/opura-docs')).toEqual({ view: 'opura-docs' });
    });

    // 10/10/2026: o aviso de validade gravava `#/documentos?tab=<cat>&docId=<id>` até a migration
    // aplicar_20271010004000. Um link desses que ainda exista abre o GED no documento.
    // 10/10/2026: o aviso de SLA de Processos gravava `opura-processos` (sem a barra) e não abria.
    it('Processos: abre o processo pela instância; o link antigo sem barra abre a tela', () => {
        expect(destinoDoLinkDeNotificacao('/opura-processos?instance=i-1'))
            .toEqual({ view: 'opura-processos', foco: { ref: 'i-1', source: 'PROCESSO_INSTANCIA' } });
        expect(destinoDoLinkDeNotificacao('opura-processos')).toEqual({ view: 'opura-processos' });
        expect(destinoDoLinkDeNotificacao('opura-processos?instance=i-2'))
            .toEqual({ view: 'opura-processos', foco: { ref: 'i-2', source: 'PROCESSO_INSTANCIA' } });
        expect(destinoDoLinkDeNotificacao('/opura-processos')).toEqual({ view: 'opura-processos' });
    });
    it('link sem barra que não é nome de tela continua sem navegar', () => {
        expect(destinoDoLinkDeNotificacao('https://exemplo.com/opura-processos')).toBeNull();
        expect(destinoDoLinkDeNotificacao('pasta/arquivo')).toBeNull();
        expect(destinoDoLinkDeNotificacao('')).toBeNull();
    });

    it('GED legado: #/documentos com docId abre o GED no documento (e a pendência)', () => {
        expect(destinoDoLinkDeNotificacao('#/documentos?tab=juridico&docId=d-3'))
            .toEqual({ view: 'opura-docs', foco: { ref: 'd-3', source: 'GED_DOCUMENTO' } });
        expect(destinoDoLinkDeNotificacao('#/documentos?docId=d-4&pending=true'))
            .toEqual({ view: 'opura-docs', foco: { ref: 'd-4', source: 'GED_DOCUMENTO_PENDENTE' } });
    });
});
