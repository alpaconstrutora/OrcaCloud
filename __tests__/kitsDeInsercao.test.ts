/**
 * F2 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — os KITS DE INSERÇÃO da
 * organização: a peça principal e N peças com deslocamento, inseridas num lote só,
 * giradas com a principal, somadas ao kit padrão (placa).
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { kitDaPeca } from '../utils/blueprintKitsIncendio';
import { chaveDaPeca, comandosDoKit, itensDoKit, kitDaSelecao, type KitDeInsercao } from '../utils/blueprintKitsDeInsercao';

function nivel(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}
const peca = (l: string, tipo: string, x: number, y = 0, cota = 1300, extra: Record<string, unknown> = {}): Command =>
  ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota, ...extra }) as Command;

const HIDRANTE_COM_EXTINTOR: KitDeInsercao = {
  nome: 'Hidrante + extintor',
  disciplina: 'INCENDIO',
  tipo: 'HIDRANTE_SIMPLES',
  itens: [{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR', agenteExtintor: 'PQS_ABC' } }],
};

describe('F2 · kits de inserção da organização', () => {
  it('⚠️ PRONTO QUANDO: um kit cadastrado é inserido num lote só — a peça, as do kit e a placa de cada uma', () => {
    const { m, l } = nivel();
    const kit = kitDaPeca(m, [peca(l, 'HIDRANTE_SIMPLES', 1000)], [HIDRANTE_COM_EXTINTOR]);
    expect(kit.aviso).toBeNull();
    const depois = applyBatch(m, kit.comandos).model; // UM lote: um Ctrl+Z desfaz tudo
    const h = depois.terminais!.find((t) => t.tipoHidraulico === 'HIDRANTE_SIMPLES')!;
    const e = depois.terminais!.find((t) => t.tipoHidraulico === 'EXTINTOR')!;
    expect([e.at.x, e.at.y, e.cotaMm, e.agenteExtintor]).toEqual([1600, 0, 1600, 'PQS_ABC']);
    const placas = depois.terminais!.filter((t) => t.tipoHidraulico === 'PLACA');
    expect(placas.map((p) => p.alvoId).sort()).toEqual([e.id, h.id].sort()); // o kit padrão continua valendo
  });

  it('as peças do kit giram com a principal (e a rotação delas soma)', () => {
    const { m, l } = nivel();
    const kitGirado: KitDeInsercao = { ...HIDRANTE_COM_EXTINTOR, itens: [{ ...HIDRANTE_COM_EXTINTOR.itens[0], props: { ...HIDRANTE_COM_EXTINTOR.itens[0].props, rotacaoGraus: 300 } }] };
    const kit = kitDaPeca(m, [peca(l, 'HIDRANTE_SIMPLES', 1000, 0, 1300, { rotacaoGraus: 90 })], [kitGirado]);
    const e = applyBatch(m, kit.comandos).model.terminais!.find((t) => t.tipoHidraulico === 'EXTINTOR')!;
    expect([e.at.x, e.at.y, e.rotacaoGraus]).toEqual([1000, 600, 30]); // 600 em X vira 600 em Y; 300° + 90° = 30°
  });

  it('o kit de outro tipo não dispara; a peça do kit não dispara kit (sem recursão)', () => {
    const { m, l } = nivel();
    const doExtintor: KitDeInsercao = { nome: 'Extintor + outro', disciplina: 'INCENDIO', tipo: 'EXTINTOR', itens: [{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 300, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR' } }] };
    const so = kitDaPeca(m, [peca(l, 'MANGOTINHO', 1000)], [HIDRANTE_COM_EXTINTOR, doExtintor]);
    expect(applyBatch(m, so.comandos).model.terminais!.some((t) => t.tipoHidraulico === 'EXTINTOR')).toBe(false);
    const comHidrante = kitDaPeca(m, [peca(l, 'HIDRANTE_SIMPLES', 1000)], [HIDRANTE_COM_EXTINTOR, doExtintor]);
    expect(applyBatch(m, comHidrante.comandos).model.terminais!.filter((t) => t.tipoHidraulico === 'EXTINTOR')).toHaveLength(1);
  });

  it('o kit que o desenho recusa fica de fora inteiro — a peça entra, e o aviso diz qual', () => {
    const { m, l } = nivel();
    const ruim: KitDeInsercao = { ...HIDRANTE_COM_EXTINTOR, nome: 'Kit ruim', itens: [{ ...HIDRANTE_COM_EXTINTOR.itens[0], props: { tipoHidraulico: 'EXTINTOR', agenteExtintor: 'NAO_EXISTE' } }] };
    const kit = kitDaPeca(m, [peca(l, 'HIDRANTE_SIMPLES', 1000)], [ruim]);
    expect(kit.aviso).toMatch(/Kit ruim/);
    const tipos = applyBatch(m, kit.comandos).model.terminais!.map((t) => t.tipoHidraulico).sort();
    expect(tipos).toEqual(['HIDRANTE_SIMPLES', 'PLACA']);
  });

  it('o banco não é confiável: item inválido fica de fora, e id de outra peça não passa', () => {
    const itens = itensDoKit([
      { disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR', alvoId: 'x', centralAlarmeId: 'y' } },
      { disciplina: 'NAO_EXISTE', tipo: 'EXTINTOR', dx: 0, dy: 0, cotaMm: 0 },
      { disciplina: 'INCENDIO', tipo: '', dx: 0, dy: 0, cotaMm: 0 },
      { disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: '1', dy: 0, cotaMm: 0 },
      null,
    ]);
    expect(itens).toEqual([{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR' } }]);
    expect(itensDoKit('não é lista')).toEqual([]);
  });

  it('"salvar a seleção como kit": medido a partir da principal girada, e reinserido noutro lugar dá o mesmo arranjo', () => {
    const { m: m0, l } = nivel();
    const m = applyBatch(m0, [peca(l, 'HIDRANTE_SIMPLES', 1000, 1000, 1300, { rotacaoGraus: 90 }), peca(l, 'EXTINTOR', 1000, 1600, 1600, { agenteExtintor: 'CO2' })]).model;
    const [h, e] = m.terminais!;
    const kit = kitDaSelecao(m, h.id, [e.id], '  Meu kit ')!;
    expect(kit.nome).toBe('Meu kit');
    expect(chaveDaPeca(h)).toEqual({ disciplina: 'INCENDIO', tipo: 'HIDRANTE_SIMPLES' });
    expect(kit.itens).toEqual([{ disciplina: 'INCENDIO', tipo: 'EXTINTOR', dx: 600, dy: 0, cotaMm: 1600, props: { tipoHidraulico: 'EXTINTOR', agenteExtintor: 'CO2', rotacaoGraus: 270 } }]);
    const outra = { ...h, at: point(5000, 5000) };
    const [c] = comandosDoKit(outra, kit) as Array<Command & { at: { x: number; y: number }; rotacaoGraus?: number }>;
    expect([c.at.x, c.at.y, c.rotacaoGraus]).toEqual([5000, 5600, undefined]); // 270 + 90 = 0 → sem giro
    expect(kitDaSelecao(m, h.id, [], 'vazio')).toBeNull();
  });
});
