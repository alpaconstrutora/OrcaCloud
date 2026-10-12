/**
 * F10 do plano `2026-10-11-planta-recursos-video-synaps.md` — MODELOS glTF DOS COMPONENTES:
 * o encaixe na caixa da peça, e os ARQUIVOS (são dado de terceiro: cada um é conferido como
 * glTF 2.0 binário autocontido, sem referência externa, dentro do teto de peso, com a licença).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOGO_DE_COMPONENTES, TIPOS_DE_COMPONENTE, ehConjunto, type TipoDeComponente } from '../utils/blueprintKernel';
import { MAX_PESO_DO_MODELO_KB, MODELOS_3D, encaixeDoModelo, modeloDoTipo } from '../utils/blueprintModelos3d';

const PUBLIC = path.join(__dirname, '..', 'public', 'modelos-3d');

describe('modelos 3D — o encaixe na caixa da peça', () => {
  it('escala por eixo para as medidas da peça e leva o centro da caixa do modelo à origem', () => {
    const e = encaixeDoModelo({ min: [-1, 0, -2], max: [1, 1, 0] }, { larguraM: 2, alturaM: 0.5, profundidadeM: 1 });
    expect(e.escala).toEqual([1, 0.5, 0.5]);
    expect(e.deslocamento).toEqual([0, -0.25, 0.5]);
    // Os cantos da caixa do modelo caem nos cantos da caixa da peça (±metade de cada medida).
    const leva = (p: number[]) => p.map((v, i) => v * e.escala[i] + e.deslocamento[i]);
    expect(leva([1, 1, 0])).toEqual([1, 0.25, 0.5]);
    expect(leva([-1, 0, -2])).toEqual([-1, -0.25, -0.5]);
  });

  it('caixa degenerada (modelo achatado) não divide por zero', () => {
    const e = encaixeDoModelo({ min: [0, 0, 0], max: [1, 0, 1] }, { larguraM: 1, alturaM: 1, profundidadeM: 1 });
    expect(e.escala.every(Number.isFinite)).toBe(true);
  });
});

describe('modelos 3D — os arquivos (dado de terceiro)', () => {
  const entradas = Object.entries(MODELOS_3D) as [TipoDeComponente, NonNullable<(typeof MODELOS_3D)[TipoDeComponente]>][];

  it('cada modelo existe, é glTF 2.0 binário AUTOCONTIDO (sem uri externa) e cabe no teto de peso', () => {
    expect(entradas.length).toBeGreaterThanOrEqual(15);
    for (const [tipo, m] of entradas) {
      const arq = path.join(PUBLIC, m.arquivo);
      expect(fs.existsSync(arq), `${tipo}: ${m.arquivo}`).toBe(true);
      const b = fs.readFileSync(arq);
      expect(b.subarray(0, 4).toString('latin1'), tipo).toBe('glTF');
      expect(b.readUInt32LE(4), tipo).toBe(2);
      expect(b.length / 1024, tipo).toBeLessThanOrEqual(MAX_PESO_DO_MODELO_KB);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
      const uris = [...(json.buffers ?? []), ...(json.images ?? [])].filter((x) => x.uri);
      expect(uris, `${tipo} não pode buscar nada fora do arquivo`).toEqual([]);
      expect(m.licenca).toBe('CC0-1.0');
    }
  });

  it('a licença do pacote vai junto e diz CC0', () => {
    const lic = fs.readFileSync(path.join(PUBLIC, 'kenney', 'LICENSE-Kenney-Furniture-Kit.txt'), 'utf8');
    expect(lic).toMatch(/Creative Commons Zero, CC0/);
  });

  it('sem modelo, de propósito: reservas de climatização, o tanque e os conjuntos (desenham os filhos) — esses seguem CAIXA', () => {
    const semModelo = TIPOS_DE_COMPONENTE.filter((t) => !modeloDoTipo(t));
    for (const t of semModelo) {
      expect(CATALOGO_DE_COMPONENTES[t].familia === 'CLIMATIZACAO' || t === 'TANQUE' || ehConjunto(t), t).toBe(true);
    }
    expect(modeloDoTipo('SOFA')?.url).toBe('/modelos-3d/kenney/loungeSofa.glb');
  });

  it('nenhum arquivo solto na pasta sem estar na tabela (o que vai para o ar é o que está creditado)', () => {
    const naPasta = fs.readdirSync(path.join(PUBLIC, 'kenney')).filter((f) => f.endsWith('.glb'));
    const naTabela = new Set(entradas.map(([, m]) => m.arquivo.replace('kenney/', '')));
    expect(naPasta.filter((f) => !naTabela.has(f))).toEqual([]);
  });
});
