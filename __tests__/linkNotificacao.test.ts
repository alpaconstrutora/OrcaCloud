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
        expect(destinoDoLinkDeNotificacao('#/documentos?docId=1')).toBeNull();
        expect(destinoDoLinkDeNotificacao('/')).toBeNull();
    });
});
