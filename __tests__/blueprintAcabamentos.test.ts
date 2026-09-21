/**
 * Piso, forro e rodapé (19/09/2026, E7.2): acabamentos na etiqueta (kernel
 * 0.43.0) — comandos, invariantes, canônico ida e volta; quantitativo por
 * camada e por material (quant 1.11.0); orçamento por unidade do item; IFC
 * (IfcMaterialLayerSet no IfcCovering, rodapé .SKIRTINGBOARD.); presets e
 * tipos PISO/FORRO.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  applyCommand,
  canonicalPayload,
  computeQuantities,
  emptyModel,
  KERNEL_VERSION,
  modelFromCanonicalPayload,
  parseCanonicalPayload,
  point,
  POLITICA_PADRAO,
  snapshotHash,
  type AcabamentosDoAmbiente,
  type Command,
} from '../utils/blueprintKernel';
import { gerarLancamentosDeAcabamentos } from '../utils/blueprintBudget';
import { gerarIfc } from '../utils/blueprintIfc';
import { aplicarPreset, peDireitoUtilMm, presetDeAcabamento, presetsSugeridos, resumirAcabamentos, resumirAcabamentosDoNivel } from '../utils/blueprintAcabamentos';
import { aplicarTipoDeForro, aplicarTipoDePiso, assinaturaDoTipo, propriedadesDoForro, propriedadesDoPiso, resumoDoTipo } from '../utils/blueprintTipos';
import type { SinapiItem } from '../types';

/** Sala 4 × 3 de eixo (paredes 150) com porta de 0,80 ao sul → piso 3,85 × 2,85 = 10,9725 m². */
function sala() {
  const m0 = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m0.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(m0, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model;
  const sul = m.walls.find((x) => x.a.y === 0 && x.b.y === 0)!;
  m = applyCommand(m, { type: 'AddOpening', wallId: sul.id, kind: 'door', offsetMm: 1000, widthMm: 800, heightMm: 2100, sillMm: 0 }).model;
  return { m, t, spaceId: m.spaces[0].id };
}

const PISO: AcabamentosDoAmbiente['piso'] = [
  { espessuraMm: 40, itemCode: 'CP', descricao: 'Contrapiso', funcao: 'REVESTIMENTO' },
  { espessuraMm: 10, itemCode: 'PORC', descricao: 'Porcelanato', funcao: 'ACABAMENTO' },
];
const ACAB: AcabamentosDoAmbiente = {
  piso: PISO,
  forro: { camadas: [{ espessuraMm: 13, itemCode: 'GESSO', descricao: 'Gesso acartonado', funcao: 'ACABAMENTO' }], rebaixoMm: 300 },
  rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodapé de porcelanato' },
};

describe('acabamentos do ambiente (E7.2)', () => {
  it('NameSpace cria a etiqueta já com acabamentos; SetSpaceLabelProps substitui o conjunto e `null` limpa; `{}` vira ausente; invariantes recusam vazio, função inválida, rebaixo e altura fora da faixa', () => {
    expect(KERNEL_VERSION).toMatch(/^blueprint-kernel-ts-0\.(4[3-9]|[5-9][0-9])\.\d+$/); // ≥ 0.43.0 — os acabamentos entraram nela; bumps posteriores não a invalidam
    const { m, spaceId } = sala();
    let r = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', tipoDeAmbiente: 'SALA_DORMITORIO', acabamentos: ACAB });
    const lbl = r.model.labels[0];
    expect(lbl.acabamentos?.piso).toHaveLength(2);
    expect(lbl.acabamentos?.forro?.rebaixoMm).toBe(300);
    expect(lbl.acabamentos?.rodape).toMatchObject({ alturaMm: 70, itemCode: 'ROD' });
    // Renomear sem `acabamentos` não mexe.
    r = applyCommand(r.model, { type: 'NameSpace', spaceId, name: 'Sala de estar' });
    expect(r.model.labels[0].acabamentos?.forro?.rebaixoMm).toBe(300);
    // Substituir só o piso + "sem rodapé": forro some (substituição inteira).
    r = applyCommand(r.model, { type: 'SetSpaceLabelProps', labelId: lbl.id, acabamentos: { piso: PISO, rodape: null } });
    expect(r.model.labels[0].acabamentos).toEqual({ piso: PISO, rodape: null });
    // `{}` = ausente; `null` = limpa.
    r = applyCommand(r.model, { type: 'SetSpaceLabelProps', labelId: lbl.id, acabamentos: {} });
    expect(r.model.labels[0].acabamentos).toBeUndefined();
    r = applyCommand(r.model, { type: 'SetSpaceLabelProps', labelId: lbl.id, acabamentos: ACAB });
    r = applyCommand(r.model, { type: 'SetSpaceLabelProps', labelId: lbl.id, acabamentos: null });
    expect(r.model.labels[0].acabamentos).toBeUndefined();
    // Recusas.
    const com = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala' }).model;
    const id = com.labels[0].id;
    expect(() => applyCommand(com, { type: 'SetSpaceLabelProps', labelId: id, acabamentos: { piso: [] } })).toThrow(/sem camadas/);
    expect(() => applyCommand(com, { type: 'SetSpaceLabelProps', labelId: id, acabamentos: { piso: [{ espessuraMm: 10, itemCode: '', descricao: '', funcao: 'PINTURA' as never }] } })).toThrow(/Função de camada inválida/);
    expect(() => applyCommand(com, { type: 'SetSpaceLabelProps', labelId: id, acabamentos: { piso: [{ espessuraMm: 0, itemCode: '', descricao: '', funcao: 'ACABAMENTO' }] } })).toThrow();
    expect(() => applyCommand(com, { type: 'SetSpaceLabelProps', labelId: id, acabamentos: { forro: { camadas: [{ espessuraMm: 13, itemCode: '', descricao: '', funcao: 'ACABAMENTO' }], rebaixoMm: 2500 } } })).toThrow(/Rebaixo/);
    expect(() => applyCommand(com, { type: 'SetSpaceLabelProps', labelId: id, acabamentos: { rodape: { alturaMm: 600, itemCode: '', descricao: '' } } })).toThrow(/Altura do rodapé/);
  });

  it('canônico: a chave só existe quando declarado; ida e volta preserva piso, forro, rodapé e o `null`; hash estável', () => {
    const { m, spaceId } = sala();
    const sem = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala' }).model;
    expect(JSON.parse(canonicalPayload(sem)).labels[0].acabamentos).toBeUndefined();
    const com = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', acabamentos: { ...ACAB, rodape: null } }).model;
    const payload = JSON.parse(canonicalPayload(com));
    expect(payload.labels[0].acabamentos).toEqual({
      piso: PISO,
      forro: { camadas: [{ espessuraMm: 13, itemCode: 'GESSO', descricao: 'Gesso acartonado', funcao: 'ACABAMENTO' }], rebaixoMm: 300 },
      rodape: null,
    });
    const volta = modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com)));
    expect(snapshotHash(volta)).toBe(snapshotHash(com));
    expect(volta.labels[0].acabamentos).toEqual(com.labels[0].acabamentos);
    // Rodapé declarado também volta.
    const com2 = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', acabamentos: { rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodapé' } } }).model;
    expect(modelFromCanonicalPayload(parseCanonicalPayload(canonicalPayload(com2))).labels[0].acabamentos).toEqual({ rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodapé' } });
  });

  it('quantitativo 1.11.0: camadas medidas pela área de piso líquida, rodapé declarado vence a política e `null` zera; porAcabamento por escopo × material; ambiente sem declaração não muda', () => {
    expect(POLITICA_PADRAO.version).toBe('quant-1.16.0');
    const { m, spaceId } = sala();
    const antes = computeQuantities(m, POLITICA_PADRAO).ambientes[0];
    expect(antes.areaPisoM2).toBeCloseTo(10.9725, 3);
    expect(antes.comprimentoRodapeM).toBeCloseTo(14 - 0.8, 3); // perímetro de eixo 14 − porta 0,80
    expect(antes.areaRodapeM2).toBeCloseTo(13.2 * 0.1, 3); // política 100 mm
    expect(antes.piso).toBeUndefined();
    expect(computeQuantities(m, POLITICA_PADRAO).totais.porAcabamento).toEqual([]);

    const com = applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', acabamentos: { piso: PISO, forro: ACAB.forro, rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodapé' } } }).model;
    const q = computeQuantities(com, POLITICA_PADRAO);
    const a = q.ambientes[0];
    expect(a.piso?.camadas.map((c) => [c.itemCode, c.areaM2.toFixed(4), c.volumeM3.toFixed(5)])).toEqual([
      ['CP', '10.9725', (10.9725 * 0.04).toFixed(5)],
      ['PORC', '10.9725', (10.9725 * 0.01).toFixed(5)],
    ]);
    expect(a.forro?.rebaixoM).toBe(0.3);
    expect(a.forro?.camadas[0].volumeM3).toBeCloseTo(10.9725 * 0.013, 5);
    expect(a.rodapeDeclarado).toMatchObject({ alturaMm: 70 });
    expect(a.comprimentoRodapeM).toBeCloseTo(13.2, 3);
    expect(a.areaRodapeM2).toBeCloseTo(13.2 * 0.07, 4); // altura declarada, não a política
    expect(q.totais.porAcabamento.map((x) => [x.escopo, x.itemCode, x.funcao, +x.areaM2.toFixed(3), +x.volumeM3.toFixed(4), +x.comprimentoM.toFixed(2), x.ambientes])).toEqual([
      ['PISO', 'CP', 'REVESTIMENTO', 10.973, 0.4389, 0, 1],
      ['PISO', 'PORC', 'ACABAMENTO', 10.973, 0.1097, 0, 1],
      ['FORRO', 'GESSO', 'ACABAMENTO', 10.973, 0.1426, 0, 1],
      ['RODAPE', 'ROD', null, 0.924, 0, 13.2, 1],
    ]);
    // "Sem rodapé": comprimento zero e some do total.
    const semRodape = applyCommand(com, { type: 'SetSpaceLabelProps', labelId: com.labels[0].id, acabamentos: { rodape: null } }).model;
    const q2 = computeQuantities(semRodape, POLITICA_PADRAO);
    expect(q2.ambientes[0].comprimentoRodapeM).toBe(0);
    expect(q2.ambientes[0].rodapeDeclarado).toBeNull();
    expect(q2.totais.comprimentoRodapeM).toBe(0);
    expect(q2.totais.porAcabamento).toEqual([]);
  });

  it('orçamento: piso em m² leva a área, contrapiso em m³ o volume, rodapé em m o comprimento; sem código ou unidade errada vira divergência, não linha', () => {
    const { m, spaceId } = sala();
    const com = applyCommand(m, {
      type: 'NameSpace',
      spaceId,
      name: 'Sala',
      acabamentos: {
        piso: [...PISO, { espessuraMm: 5, itemCode: '', descricao: 'Argamassa', funcao: 'REVESTIMENTO' }],
        forro: { camadas: [{ espessuraMm: 13, itemCode: 'UNID', descricao: 'Item por unidade', funcao: 'ACABAMENTO' }], rebaixoMm: 0 },
        rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodapé' },
      },
    }).model;
    const q = computeQuantities(com, POLITICA_PADRAO);
    const item = (code: string, unit: string): SinapiItem => ({ code, description: code, unit, price: 10, source: 'SINAPI' } as unknown as SinapiItem);
    const itens = new Map([
      ['CP', item('CP', 'M3')],
      ['PORC', item('PORC', 'M2')],
      ['ROD', item('ROD', 'M')],
      ['UNID', item('UNID', 'UN')],
    ]);
    const r = gerarLancamentosDeAcabamentos(q, itens, { studyId: 'std', studyName: 'Teste', snapshotId: 'snp', snapshotHash: 'h'.repeat(20), revision: 1 });
    expect(r.entries.map((e) => [e.id, +e.quantity.toFixed(4), e.group])).toEqual([
      ['bp:std:acabamento:PISO:CP:REVESTIMENTO', +(10.9725 * 0.04).toFixed(4), 'Acabamentos — piso'],
      ['bp:std:acabamento:PISO:PORC:ACABAMENTO', 10.9725, 'Acabamentos — piso'],
      ['bp:std:acabamento:RODAPE:ROD:', 13.2, 'Acabamentos — rodapé'],
    ]);
    expect(r.divergencias.map((d) => d.motivo)).toEqual([
      expect.stringMatching(/sem material vinculado/),
      expect.stringMatching(/cotado em "UN"/),
    ]);
  });

  it('IFC: o IfcCovering do piso/forro declarado ganha IfcMaterialLayerSet e Width; o rodapé declarado sai .SKIRTINGBOARD. com Length e Height; sem declaração nada disso aparece', () => {
    const { m, spaceId } = sala();
    const opts = { titulo: 'Teste', revisao: 1, hash: 'hash-fixo', data: new Date('2026-09-19T12:00:00Z') };
    const sem = gerarIfc(applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala' }).model, opts);
    expect(sem).not.toMatch(/\.SKIRTINGBOARD\.\)/);
    expect(sem).not.toMatch(/'Pset_OpuraAcabamento'/);
    const com = gerarIfc(applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', acabamentos: { piso: PISO, forro: ACAB.forro, rodape: { alturaMm: 70, itemCode: 'ROD', descricao: 'Rodape' } } }).model, opts);
    expect(com).toMatch(/IFCMATERIALLAYERSET\(\(#\d+,#\d+\),'Piso 50 mm',\$\)/);
    expect(com).toMatch(/IFCMATERIALLAYERSET\(\(#\d+\),'Forro 13 mm',\$\)/);
    expect(com).toMatch(/IFCQUANTITYLENGTH\('Width',\$,\$,50\./);
    expect(com).toMatch(/IFCCOVERING\(.*,'Rodape',\$,\$,\$,\.SKIRTINGBOARD\.\)/);
    expect(com).toMatch(/IFCQUANTITYLENGTH\('Length',\$,\$,13200\./);
    expect(com).toMatch(/IFCQUANTITYLENGTH\('Height',\$,\$,70\./);
    expect(com).toMatch(/'Pset_OpuraAcabamento'/);
    // "Sem rodapé" não emite rodapé.
    const semRodape = gerarIfc(applyCommand(m, { type: 'NameSpace', spaceId, name: 'Sala', acabamentos: { rodape: null } }).model, opts);
    expect(semRodape).not.toMatch(/\.SKIRTINGBOARD\.\)/);
  });

  it('presets, sugestão por tipo, resumo e tipos PISO/FORRO (assinatura distingue composições; aplicar preserva o outro escopo)', () => {
    const banheiro = presetsSugeridos('BANHEIRO');
    expect(banheiro.piso.rodape).toBeNull();
    expect(banheiro.forro.id).toBe('FORRO_PVC');
    let a = aplicarPreset(undefined, presetDeAcabamento('PISO_PORCELANATO')!);
    expect(a.piso?.map((c) => c.espessuraMm)).toEqual([40, 5, 10]);
    expect(a.rodape).toMatchObject({ alturaMm: 70 });
    a = aplicarPreset(a, presetDeAcabamento('FORRO_GESSO')!);
    expect(a.forro?.rebaixoMm).toBe(300);
    expect(a.piso).toHaveLength(3); // piso preservado
    expect(resumirAcabamentos(a, 100)).toBe('Piso: Porcelanato (55 mm) · Forro: Placa de gesso acartonado, rebaixo 30 cm · Rodapé: Rodapé de porcelanato 7 cm');
    expect(resumirAcabamentos(undefined, 100)).toMatch(/sem declaração/);
    expect(peDireitoUtilMm(2800, a)).toBe(2800 - 55 - 300 - 14);
    expect(resumirAcabamentosDoNivel([{ acabamentos: a }, {}])).toEqual({ ambientes: 2, declarados: 1, semPiso: 1, semForro: 1, semMaterial: 6 });
    // Tipos (E1.1): assinatura por JSON estável; resumo legível; aplicar piso não mexe no forro e vice-versa.
    const p1 = propriedadesDoPiso(a);
    const p2 = propriedadesDoPiso(aplicarPreset(undefined, presetDeAcabamento('PISO_CERAMICO')!));
    expect(assinaturaDoTipo(p1)).not.toBe(assinaturaDoTipo(p2));
    expect(assinaturaDoTipo(p1)).toBe(assinaturaDoTipo(JSON.parse(JSON.stringify(p1))));
    expect(resumoDoTipo(p1)).toBe('Contrapiso 40 + Argamassa colante 5 + Porcelanato 10 (55 mm) · rodapé 7 cm');
    expect(resumoDoTipo(propriedadesDoForro(a))).toBe('Placa de gesso acartonado 13 + Pintura 1 (14 mm) · rebaixo 30 cm');
    const soForro: AcabamentosDoAmbiente = { forro: a.forro };
    const comPiso = aplicarTipoDePiso(soForro, p2);
    expect(comPiso.forro).toEqual(a.forro);
    expect(comPiso.piso?.[2].descricao).toBe('Cerâmica');
    const trocaForro = aplicarTipoDeForro(comPiso, propriedadesDoForro(aplicarPreset(undefined, presetDeAcabamento('FORRO_LAJE')!)));
    expect(trocaForro.piso).toEqual(comPiso.piso);
    expect(trocaForro.forro?.rebaixoMm).toBe(0);
  });
});
