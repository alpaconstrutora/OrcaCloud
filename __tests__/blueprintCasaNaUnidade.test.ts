/**
 * F15 da casa automática (16/10/2026): a casa desenhada → os campos da unidade do Empreendimento (o caminho inverso de
 * `programaCurtoDaUnidade`). Desenho à mão, para a conta ser conferível: 10 × 8 m pelo eixo, paredes de 15 cm.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { unidadeDaCasa } from '../utils/blueprintCasaNaUnidade';
import { programaCurtoDaUnidade } from '../utils/blueprintPrograma';

function casa(nomes: [string, string, string, string]): BlueprintModel {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  let m = applyBatch(a, [w(0, 0, 10000, 0), w(10000, 0, 10000, 8000), w(10000, 8000, 0, 8000), w(0, 8000, 0, 0), w(5000, 0, 5000, 8000), w(0, 4000, 10000, 4000)]).model;
  // Os quatro cômodos pelo quadrante: SO, SE, NO, NE.
  const quadrante = (x: number, y: number) => m.spaces.find((s) => s.ring.every((p) => (x ? p.x >= 4900 : p.x <= 5100) && (y ? p.y >= 3900 : p.y <= 4100)))!;
  const cmds: Command[] = [quadrante(0, 0), quadrante(1, 0), quadrante(0, 1), quadrante(1, 1)].map((s, i) => ({ type: 'NameSpace', spaceId: s.id, name: nomes[i] }) as Command);
  m = applyBatch(m, [...cmds, { type: 'AddVaga', levelId: t, at: point(-3000, 2000) } as Command, { type: 'AddVaga', levelId: t, at: point(-3000, 5000) } as Command]).model;
  return m;
}

describe('F15 · a casa desenhada → a unidade do Empreendimento', () => {
  it('térrea: área construída pela face externa; dormitórios com a suíte; banheiro sem o lavabo; as vagas desenhadas; a tipologia com o padrão', () => {
    const r = unidadeDaCasa(casa(['Suíte', 'Banheiro da suíte', 'Dormitório 1', 'Lavabo']), 'R1-N')!;
    expect(r).not.toBeNull();
    // (10 + 0,15) × (8 + 0,15) m — o eixo mais meia parede de cada lado.
    expect(r.privativaM2).toBeCloseTo(10.15 * 8.15, 1);
    expect(r).toMatchObject({ dormitorios: 2, suites: 1, banheiros: 1, vagas: 2, pavimentos: 1, tipologia: 'Casa térrea R1-N' });
  });

  it('sobrado: os dois pavimentos somam a área; a tipologia diz "Sobrado"; sem premissas, sem padrão', () => {
    let m = casa(['Suíte', 'Banheiro da suíte', 'Dormitório 1', 'Sala']);
    m = applyCommand(m, { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
    const s = m.levels[1].id;
    const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: s, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
    m = applyBatch(m, [w(0, 0, 10000, 0), w(10000, 0, 10000, 8000), w(10000, 8000, 0, 8000), w(0, 8000, 0, 0)]).model;
    const r = unidadeDaCasa(m, null)!;
    expect(r.pavimentos).toBe(2);
    expect(r.privativaM2).toBeCloseTo(2 * 10.15 * 8.15, 1);
    expect(r.tipologia).toBe('Sobrado');
  });

  it('sem dormitório nem suíte, não é casa (o adaptador segue o caminho do loteamento)', () => {
    expect(unidadeDaCasa(casa(['Sala', 'Cozinha', 'Lavabo', 'Garagem']), 'R1-N')).toBeNull();
  });

  it('ida e volta: a unidade preenchida pela casa devolve o mesmo programa curto (dormitórios, suítes, banheiros, vagas e padrão)', () => {
    const r = unidadeDaCasa(casa(['Suíte', 'Banheiro da suíte', 'Dormitório 1', 'Lavabo']), 'R1-A')!;
    const { curto } = programaCurtoDaUnidade({ name: 'Casa', typology: r.tipologia, private_area: r.privativaM2, bedrooms: r.dormitorios, suites: r.suites, bathrooms: r.banheiros, parking_spaces: r.vagas });
    expect(curto).toMatchObject({ dormitorios: 2, suites: 1, banheiros: 1, vagas: 2, padrao: 'R1-A' });
  });
});
