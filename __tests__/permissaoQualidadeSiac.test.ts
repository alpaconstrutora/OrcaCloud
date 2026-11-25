import { describe, expect, it } from 'vitest';
import {
    MOTIVO_SEM_EDICAO_QUALIDADE, podeEditarQualidadeSiac, podeVerQualidadeSiac,
} from '../utils/permissaoQualidadeSiac';

describe('podeVerQualidadeSiac — permissão própria → matriz do cargo → herança de Obras', () => {
    it('canViewQualitySystem:false explícito vence obras=true', () => {
        expect(podeVerQualidadeSiac({ permissoes: { canViewQualitySystem: false }, matrizDoCargo: { qualidade_siac: true }, podeVerObras: true })).toBe(false);
    });
    it('canViewQualitySystem:true explícito vence obras=false', () => {
        expect(podeVerQualidadeSiac({ permissoes: { canViewQualitySystem: true }, matrizDoCargo: { qualidade_siac: false }, podeVerObras: false })).toBe(true);
    });
    it('sem a chave própria, a matriz do cargo decide', () => {
        expect(podeVerQualidadeSiac({ permissoes: {}, matrizDoCargo: { qualidade_siac: false }, podeVerObras: true })).toBe(false);
        expect(podeVerQualidadeSiac({ permissoes: undefined, matrizDoCargo: { qualidade_siac: true }, podeVerObras: false })).toBe(true);
    });
    it('sem nada gravado, herda o que Obras decide', () => {
        expect(podeVerQualidadeSiac({ permissoes: {}, matrizDoCargo: {}, podeVerObras: true })).toBe(true);
        expect(podeVerQualidadeSiac({ permissoes: null, matrizDoCargo: null, podeVerObras: false })).toBe(false);
    });
});

describe('podeEditarQualidadeSiac', () => {
    it('administrador sempre edita, mesmo com a chave desligada', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: false }, administrador: true })).toBe(true);
    });
    it('chave própria manda', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: false, canEditBudget: true }, administrador: false })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: { canEditQualitySystem: true, canEditBudget: false }, administrador: false })).toBe(true);
    });
    it('sem a chave própria, herda canEditBudget', () => {
        expect(podeEditarQualidadeSiac({ permissoes: { canEditBudget: false }, administrador: false })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: { canEditBudget: true }, administrador: false, papel: 'viewer' })).toBe(true);
    });
    it('papel viewer sem nenhuma chave não edita; outro papel edita', () => {
        expect(podeEditarQualidadeSiac({ permissoes: {}, administrador: false, papel: 'viewer' })).toBe(false);
        expect(podeEditarQualidadeSiac({ permissoes: {}, administrador: false, papel: 'member' })).toBe(true);
    });
    it('o motivo da tela só-leitura cita a permissão certa', () => {
        expect(MOTIVO_SEM_EDICAO_QUALIDADE).toContain('Qualidade');
    });
});
