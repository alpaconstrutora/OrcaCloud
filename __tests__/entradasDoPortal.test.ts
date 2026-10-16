/**
 * Entradas próprias dos portais (16/10/2026): cada portal com página de login
 * exclusiva no seu endereço. Trava:
 *  1. o conjunto é exatamente Cliente, Fornecedor, Parceiro, Corretor e Treinamentos —
 *     incluir Investidor/Crédito/Colaborador/Desenvolvedor é decisão de produto;
 *  2. rota ↔ grupo nos dois sentidos;
 *  3. "primeiro acesso" (criar a própria conta) só onde não há convite obrigatório;
 *  4. "Sair" leva à página do próprio portal; sem portal próprio, ao seletor.
 */
import { describe, it, expect } from 'vitest';
import {
    ENTRADAS_DO_PORTAL, entradaDoPortal, rotaDeEntradaDoPortal, entradaDaRota, destinoAposSair,
} from '../lib/entradasDoPortal';
import { ProfileGroup } from '../types';

describe('entradasDoPortal', () => {
    it('1. o conjunto de portais com entrada própria é fechado', () => {
        expect(Object.keys(ENTRADAS_DO_PORTAL).sort()).toEqual(
            [ProfileGroup.CLIENT, ProfileGroup.SUPPLIER, ProfileGroup.PARTNER, ProfileGroup.BROKER, ProfileGroup.TRAINEE].sort(),
        );
        for (const g of [ProfileGroup.USER, ProfileGroup.INVESTOR, ProfileGroup.LENDER, ProfileGroup.DEVELOPER]) {
            expect(entradaDoPortal(g)).toBeNull();
            expect(rotaDeEntradaDoPortal(g)).toBeNull();
        }
        expect(entradaDoPortal(null)).toBeNull();
        expect(rotaDeEntradaDoPortal(undefined)).toBeNull();
    });

    it('2. rota ↔ grupo nos dois sentidos, sem rota repetida', () => {
        const esperado: Array<[ProfileGroup, string]> = [
            [ProfileGroup.CLIENT, '/portal-cliente'],
            [ProfileGroup.SUPPLIER, '/portal-fornecedor'],
            [ProfileGroup.PARTNER, '/portal-parceiro'],
            [ProfileGroup.BROKER, '/portal-corretor'],
            [ProfileGroup.TRAINEE, '/portal-treinamentos'],
        ];
        for (const [grupo, rota] of esperado) {
            expect(rotaDeEntradaDoPortal(grupo)).toBe(rota);
            expect(entradaDaRota(rota)?.grupo).toBe(grupo);
            expect(entradaDaRota(rota + '/')?.grupo).toBe(grupo);
        }
        const rotas = Object.values(ENTRADAS_DO_PORTAL).map(e => e.rota);
        expect(new Set(rotas).size).toBe(rotas.length);
        expect(entradaDaRota('/')).toBeNull();
        expect(entradaDaRota('/portal')).toBeNull();
        expect(entradaDaRota('/portal-investidor')).toBeNull();
    });

    it('3. primeiro acesso só onde a pessoa cria a própria conta', () => {
        const comPrimeiroAcesso = Object.values(ENTRADAS_DO_PORTAL).filter(e => e.permitePrimeiroAcesso).map(e => e.grupo).sort();
        expect(comPrimeiroAcesso).toEqual([ProfileGroup.CLIENT, ProfileGroup.SUPPLIER, ProfileGroup.BROKER].sort());
    });

    it('4. cada entrada tem identidade completa (título do cartão, 3 destaques, cores por extenso)', () => {
        for (const e of Object.values(ENTRADAS_DO_PORTAL)) {
            expect(e.titulo).toMatch(/^Portal d[eo] /);
            expect(e.destaques).toHaveLength(3);
            expect(e.cores.botao).toMatch(/^bg-[a-z]+-\d{3} hover:bg-[a-z]+-\d{3}$/);
            expect(e.cores.painel).toMatch(/^bg-[a-z]+-\d{3}$/);
            expect(e.rodape.length).toBeGreaterThan(10);
        }
    });

    it('5. "Sair" volta à página do portal; sem portal próprio, ao seletor', () => {
        expect(destinoAposSair(ProfileGroup.CLIENT)).toBe('/portal-cliente');
        expect(destinoAposSair(ProfileGroup.TRAINEE)).toBe('/portal-treinamentos');
        expect(destinoAposSair(ProfileGroup.USER)).toBe('/');
        expect(destinoAposSair(null)).toBe('/');
    });
});
