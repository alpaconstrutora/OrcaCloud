import { describe, expect, it } from 'vitest';
import { entornoAVista } from '../utils/blueprintMaqueteEntorno';

// 26/11/2026: "a vegetação é uma camada separada?" — não era; passou a ter a sua linha em Camadas › Terreno
// (e os prédios do entorno também), sem tirar o resto da Maquete.
const entorno = { predios: [{ id: 'p1' }], arvores: [{ x: 1 }, { x: 2 }], chave: 'k' };

describe('entornoAVista', () => {
  it('as duas ligadas: o entorno inteiro', () => {
    const r = entornoAVista(entorno, { arvores: true, predios: true });
    expect(r?.predios).toHaveLength(1);
    expect(r?.arvores).toHaveLength(2);
  });

  it('árvores desligadas: só os prédios; prédios desligados: só as árvores', () => {
    expect(entornoAVista(entorno, { arvores: false, predios: true })).toMatchObject({ predios: [{ id: 'p1' }], arvores: [] });
    expect(entornoAVista(entorno, { arvores: true, predios: false })).toMatchObject({ predios: [], arvores: [{ x: 1 }, { x: 2 }] });
  });

  it('a chave muda com a escolha (o 3D refaz a cena)', () => {
    const a = entornoAVista(entorno, { arvores: true, predios: true })!.chave;
    const b = entornoAVista(entorno, { arvores: false, predios: true })!.chave;
    expect(a).not.toBe(b);
  });

  it('nada a mostrar → null (como hoje sem entorno)', () => {
    expect(entornoAVista(entorno, { arvores: false, predios: false })).toBeNull();
    expect(entornoAVista({ predios: [], arvores: [{ x: 1 }], chave: 'k' }, { arvores: false, predios: true })).toBeNull();
    expect(entornoAVista(null, { arvores: true, predios: true })).toBeNull();
  });
});
