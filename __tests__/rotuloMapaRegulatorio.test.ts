import { describe, it, expect } from 'vitest';
import { rotuloMapaRegulatorio } from '../utils/rotuloMapaRegulatorio';

const ORGS = [
    { id: 'org-alpa', name: 'Alpa Construtora e Incorporadora' },
    { id: 'org-spe', name: 'Garden Cambuhy SPE' },
];
const m = (id: string, organization_id: string, name: string) => ({ id, organization_id, name });

describe('rotuloMapaRegulatorio', () => {
    it('todos da mesma organização: só o nome do mapa', () => {
        const mapas = [m('a', 'org-alpa', 'Plano Diretor'), m('b', 'org-alpa', 'Lei de Uso 2024')];
        expect(rotuloMapaRegulatorio(mapas[0], mapas, ORGS)).toBe('Plano Diretor');
    });

    it('mapas de organizações diferentes: o nome leva a organização dona', () => {
        const mapas = [m('a', 'org-alpa', 'Plano Diretor'), m('b', 'org-spe', 'Plano Diretor')];
        expect(rotuloMapaRegulatorio(mapas[0], mapas, ORGS)).toBe('Plano Diretor · Alpa Construtora e Incorporadora');
        expect(rotuloMapaRegulatorio(mapas[1], mapas, ORGS)).toBe('Plano Diretor · Garden Cambuhy SPE');
    });

    it('organização fora da lista conhecida: fica só o nome, sem inventar', () => {
        const mapas = [m('a', 'org-alpa', 'Plano Diretor'), m('b', 'org-x', 'Plano Diretor')];
        expect(rotuloMapaRegulatorio(mapas[1], mapas, ORGS)).toBe('Plano Diretor');
    });
});
