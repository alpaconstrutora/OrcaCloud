/**
 * Rota de entrada própria por portal (pedido de 16/10/2026: página de login
 * exclusiva do Portal de Treinamentos).
 *
 * Trava: só o TREINANDO tem endereço próprio. Incluir outro portal (ex.: o
 * Parceiro) é decisão de produto — este teste obriga a tomá-la por escrito.
 */
import { describe, it, expect } from 'vitest';
import { ROTA_DE_ENTRADA_DO_PORTAL, rotaDeEntradaDoPortal } from '../lib/rotaDeEntradaDoPortal';
import { ProfileGroup } from '../types';

describe('rotaDeEntradaDoPortal', () => {
    it('TREINANDO entra por /portal-treinamentos', () => {
        expect(rotaDeEntradaDoPortal(ProfileGroup.TRAINEE)).toBe('/portal-treinamentos');
    });

    it('os demais grupos entram pelo seletor comum (null)', () => {
        expect(rotaDeEntradaDoPortal(ProfileGroup.USER)).toBeNull();
        expect(rotaDeEntradaDoPortal(ProfileGroup.PARTNER)).toBeNull();
        expect(rotaDeEntradaDoPortal(ProfileGroup.LENDER)).toBeNull();
        expect(rotaDeEntradaDoPortal(ProfileGroup.DEVELOPER)).toBeNull();
    });

    it('sem grupo → null', () => {
        expect(rotaDeEntradaDoPortal(null)).toBeNull();
        expect(rotaDeEntradaDoPortal(undefined)).toBeNull();
    });

    it('o mapa tem exatamente um portal — incluir outro é decisão de produto', () => {
        expect(Object.keys(ROTA_DE_ENTRADA_DO_PORTAL)).toEqual([ProfileGroup.TRAINEE]);
    });
});
