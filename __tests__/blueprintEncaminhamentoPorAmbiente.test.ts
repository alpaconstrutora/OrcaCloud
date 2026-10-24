/**
 * ENCAMINHAMENTO DO PONTO PELA LUZ DO AMBIENTE (24/10/2026) — a regra pura.
 *
 * Pedido: o eletroduto da tomada não vai ao quadro por conta própria; ele
 * "desce da luz do ambiente", como na obra. Esta regra diz, para cada ponto de
 * parede, ONDE ele se pendura: na luz de teto do ambiente, na tomada vizinha
 * da mesma parede (por dentro dela) ou, sem luz no ambiente, na rede como hoje.
 * Quem consome é o planejador de eletrodutos; aqui só se prova a decisão.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Terminal } from '../utils/blueprintKernel';
import { RAIO_DE_ENCAIXE_ELETRICO_MM } from '../utils/blueprintEletrodutos';
import { RAIO_DO_ENCAMINHAMENTO_MM, encaminhamentoPorAmbiente } from '../utils/blueprintEncaminhamentoPorAmbiente';

type Tipo = 'TUG' | 'ILUMINACAO_TETO' | 'INTERRUPTOR' | 'CAIXA_PASSAGEM';
interface Opc { cota?: number; comando?: string }

/** Pavimento com uma sala 6 × 4 (ou duas, 0–3000 | 3000–6000, com divisória). */
function modeloBase(divisoria = false) {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const parede = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
  });
  const paredes = [parede(0, 0, 6000, 0), parede(6000, 0, 6000, 4000), parede(6000, 4000, 0, 4000), parede(0, 4000, 0, 0)];
  if (divisoria) paredes.push(parede(3000, 0, 3000, 4000));
  let m = applyBatch(base, paredes).model;
  const ponto = (x: number, y: number, tipo: Tipo, opc: Opc = {}): string => {
    const cotaMm = opc.cota ?? (tipo === 'ILUMINACAO_TETO' ? 2800 : tipo === 'INTERRUPTOR' ? 1100 : 300);
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo, at: point(x, y), cotaMm, tipoEletrico: tipo, ...(opc.comando ? { comando: opc.comando } : {}) }).model;
    return m.terminais[m.terminais.length - 1].id;
  };
  return { levelId, ponto, modelo: () => m };
}

const todos = (m: BlueprintModel): Terminal[] => m.terminais ?? [];

describe('encaminhamentoPorAmbiente — onde cada ponto de parede se pendura', () => {
  it('o raio de encaixe é o do planejador (a cópia local não se afasta da origem)', () => {
    expect(RAIO_DO_ENCAMINHAMENTO_MM).toBe(RAIO_DE_ENCAIXE_ELETRICO_MM);
  });

  it('o modelo de teste deriva um ambiente por sala', () => {
    expect(modeloBase().modelo().spaces).toHaveLength(1);
    expect(modeloBase(true).modelo().spaces).toHaveLength(2);
  });

  it('tomada sem vizinha → LUZ do ambiente; a luz não entra no mapa', () => {
    const c = modeloBase();
    const luz = c.ponto(3000, 2000, 'ILUMINACAO_TETO');
    const tug = c.ponto(2000, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(tug)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.has(luz)).toBe(false);
    expect(r.size).toBe(1);
  });

  it('2 tomadas a 0,6 m na mesma parede, luz a 2 m: a mais perto da luz desce nela e a mais longe se pendura na vizinha', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const a = c.ponto(2000, 75, 'TUG');
    const b = c.ponto(2600, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(b)).toEqual({ tipo: 'VIZINHA', terminalId: a });
  });

  it('a cadeia termina sempre numa luz: três tomadas em fila, cada uma pendurada na anterior, em qualquer ordem da lista', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const a = c.ponto(2000, 75, 'TUG');
    const b = c.ponto(2600, 75, 'TUG');
    const d = c.ponto(3200, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(b)).toEqual({ tipo: 'VIZINHA', terminalId: a });
    expect(r.get(d)).toEqual({ tipo: 'VIZINHA', terminalId: b });
    const invertido = encaminhamentoPorAmbiente(m, c.levelId, [...todos(m)].reverse());
    expect([...invertido.entries()].sort()).toEqual([...r.entries()].sort());
  });

  it('só liga na vizinha se ela estiver mais perto que a luz: duas tomadas a 1 m uma da outra, cada uma a 0,7 m da luz, ficam as duas na luz', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 575, 'ILUMINACAO_TETO');
    const a = c.ponto(1500, 75, 'TUG'); // a luz está a ~707 mm de cada uma; a vizinha, a 1.000 mm
    const b = c.ponto(2500, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(b)).toEqual({ tipo: 'LUZ', luzId: luz });
  });

  it('tomadas em paredes diferentes → cada uma na LUZ', () => {
    const c = modeloBase();
    const luz = c.ponto(3000, 2000, 'ILUMINACAO_TETO');
    const sul = c.ponto(2000, 75, 'TUG');
    const leste = c.ponto(5925, 3000, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(sul)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(leste)).toEqual({ tipo: 'LUZ', luzId: luz });
  });

  it('a mesma parede em faces opostas não encadeia (a divisória entre dois cômodos)', () => {
    const c = modeloBase(true);
    const l1 = c.ponto(1500, 2000, 'ILUMINACAO_TETO');
    const l2 = c.ponto(4500, 2000, 'ILUMINACAO_TETO');
    const esq = c.ponto(2925, 2100, 'TUG');
    const dir = c.ponto(3075, 2300, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(esq)).toEqual({ tipo: 'LUZ', luzId: l1 });
    expect(r.get(dir)).toEqual({ tipo: 'LUZ', luzId: l2 });
  });

  it('cotas diferentes (30 cm × 1,10 m) → não encadeiam; dentro de ±50 mm encadeiam', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const baixa = c.ponto(2000, 75, 'TUG', { cota: 300 });
    const media = c.ponto(2600, 75, 'TUG', { cota: 1100 });
    const quase = c.ponto(1400, 75, 'TUG', { cota: 340 });
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(baixa)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(media)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(quase)).toEqual({ tipo: 'VIZINHA', terminalId: baixa });
  });

  it('interruptor → a luz que ele comanda, mesmo havendo outra mais perto; sem comando, a mais perto', () => {
    const c = modeloBase();
    const la = c.ponto(1000, 2000, 'ILUMINACAO_TETO', { comando: 'a' });
    const lb = c.ponto(5000, 2000, 'ILUMINACAO_TETO', { comando: 'b' });
    const comanda = c.ponto(1100, 75, 'INTERRUPTOR', { comando: 'b' });
    const semComando = c.ponto(1300, 75, 'INTERRUPTOR');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(comanda)).toEqual({ tipo: 'LUZ', luzId: lb });
    expect(r.get(semComando)).toEqual({ tipo: 'LUZ', luzId: la });
  });

  it('o interruptor nunca vira vizinha, nem serve de vizinha para a tomada', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const sw = c.ponto(2000, 75, 'INTERRUPTOR', { cota: 300 });
    const tug = c.ponto(2600, 75, 'TUG', { cota: 300 });
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(sw)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(tug)).toEqual({ tipo: 'LUZ', luzId: luz });
  });

  it('2 luzes no mesmo ambiente → cada ponto na mais perto', () => {
    const c = modeloBase();
    const la = c.ponto(1000, 2000, 'ILUMINACAO_TETO');
    const lb = c.ponto(5000, 2000, 'ILUMINACAO_TETO');
    const oeste = c.ponto(75, 2000, 'TUG');
    const leste = c.ponto(5925, 2000, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(oeste)).toEqual({ tipo: 'LUZ', luzId: la });
    expect(r.get(leste)).toEqual({ tipo: 'LUZ', luzId: lb });
  });

  it('ambiente sem luz → REDE (e a luz de outro ambiente não serve)', () => {
    const c = modeloBase(true);
    const luz = c.ponto(1500, 2000, 'ILUMINACAO_TETO');
    const comLuz = c.ponto(1000, 75, 'TUG');
    const semLuz = c.ponto(4500, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(comLuz)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(semLuz)).toEqual({ tipo: 'REDE' });
  });

  it('ponto na face da parede, fora do polígono → o cômodo mais perto (até 600 mm); mais longe disso → REDE', () => {
    const c = modeloBase();
    const luz = c.ponto(3000, 2000, 'ILUMINACAO_TETO');
    const naFace = c.ponto(2000, -75, 'TUG'); // face externa da parede sul, fora do contorno de eixo
    const longe = c.ponto(2000, -2000, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(naFace)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(longe)).toEqual({ tipo: 'REDE' });
  });

  it('só as luzes da LISTA contam (a luz de outro quadro não é candidata)', () => {
    const c = modeloBase();
    c.ponto(3000, 2000, 'ILUMINACAO_TETO'); // de "outro quadro": não está na lista
    const tug = c.ponto(2000, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m).filter((t) => t.id === tug));
    expect(r.get(tug)).toEqual({ tipo: 'REDE' });
  });

  it('infraestrutura (caixa de passagem) fica fora do mapa e não serve de vizinha, mesmo na mesma parede e cota', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const a = c.ponto(2000, 75, 'TUG');
    const caixa = c.ponto(2300, 75, 'CAIXA_PASSAGEM', { cota: 300 });
    const b = c.ponto(2600, 75, 'TUG');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.has(caixa)).toBe(false);
    expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.get(b)).toEqual({ tipo: 'VIZINHA', terminalId: a }); // a caixa, mais perto, é ignorada
    expect(r.size).toBe(2);
  });

  it('hall → sala: o interruptor sem luz no ambiente desce da luz que comanda, em outro ambiente; sem comando, REDE', () => {
    const c = modeloBase(true);
    const luzDaSala = c.ponto(4500, 2000, 'ILUMINACAO_TETO', { comando: 'a' });
    const doHall = c.ponto(2000, 75, 'INTERRUPTOR', { comando: 'a' }); // o hall (0–3000) não tem luz
    const semComando = c.ponto(1000, 75, 'INTERRUPTOR');
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.get(doHall)).toEqual({ tipo: 'LUZ', luzId: luzDaSala });
    expect(r.get(semComando)).toEqual({ tipo: 'REDE' });
  });

  it('hall → sala: se o ambiente do interruptor TEM luz e a comandada é de outro, vale a luz mais perto do próprio ambiente', () => {
    const c = modeloBase(true);
    const luzDoHall = c.ponto(1500, 2000, 'ILUMINACAO_TETO', { comando: 'b' });
    const luzDaSala = c.ponto(4500, 2000, 'ILUMINACAO_TETO', { comando: 'a' });
    const doHall = c.ponto(2000, 75, 'INTERRUPTOR', { comando: 'a' });
    const m = c.modelo();
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(luzDaSala).not.toBe(luzDoHall);
    expect(r.get(doHall)).toEqual({ tipo: 'LUZ', luzId: luzDoHall });
  });

  it('pontos de outro pavimento são ignorados: não entram no mapa nem servem de luz ou de vizinha', () => {
    const c = modeloBase();
    const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
    const a = c.ponto(2000, 75, 'TUG');
    let m = applyCommand(c.modelo(), { type: 'AddLevel', name: 'Superior', elevationMm: 2900, defaultHeightMm: 2800 }).model;
    const outro = m.levels[1].id;
    const ponto2 = (x: number, y: number, tipoEletrico: Tipo, cotaMm: number): string => {
      m = applyCommand(m, { type: 'AddTerminal', levelId: outro, disciplina: 'ELETRICA', tipo: tipoEletrico, at: point(x, y), cotaMm, tipoEletrico }).model;
      return m.terminais[m.terminais.length - 1].id;
    };
    const luzDeCima = ponto2(2000, 100, 'ILUMINACAO_TETO', 2800);
    const tugDeCima = ponto2(2300, 75, 'TUG', 300);
    const r = encaminhamentoPorAmbiente(m, c.levelId, todos(m));
    expect(r.has(tugDeCima)).toBe(false);
    expect(r.has(luzDeCima)).toBe(false);
    expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
    expect(r.size).toBe(1);
  });

  it('5 tomadas em duas paredes e duas luzes: qualquer permutação embaralhada da lista dá o MESMO mapa', () => {
    const c = modeloBase();
    const la = c.ponto(1500, 1575, 'ILUMINACAO_TETO');
    const lb = c.ponto(4500, 1575, 'ILUMINACAO_TETO');
    const sul = [c.ponto(1000, 75, 'TUG'), c.ponto(1700, 75, 'TUG'), c.ponto(2400, 75, 'TUG'), c.ponto(4300, 75, 'TUG')];
    const leste = c.ponto(5925, 1500, 'TUG');
    const m = c.modelo();
    const lista = todos(m);
    const base = encaminhamentoPorAmbiente(m, c.levelId, lista);
    // A regra faz sentido, não só estável: a cadeia da parede sul acaba numa luz e a de leste desce direto.
    const raizes = new Set<string>();
    for (const id of [...sul, leste]) {
      let p = base.get(id);
      let guarda = 0;
      while (p?.tipo === 'VIZINHA' && guarda++ < 10) p = base.get(p.terminalId);
      expect(p?.tipo).toBe('LUZ');
      if (p?.tipo === 'LUZ') raizes.add(p.luzId);
    }
    expect([...raizes].every((id) => id === la || id === lb)).toBe(true);
    // Permutações determinísticas (rotações, inversão e um embaralhamento fixo).
    const permutacoes = [
      [...lista].reverse(),
      [...lista.slice(3), ...lista.slice(0, 3)],
      [lista[4], lista[0], lista[6], lista[2], lista[1], lista[5], lista[3]],
    ];
    for (const perm of permutacoes) {
      expect(perm).toHaveLength(lista.length);
      expect([...encaminhamentoPorAmbiente(m, c.levelId, perm).entries()].sort()).toEqual([...base.entries()].sort());
    }
  });

  // Correção 1 (24/10/2026): a vizinha corre DENTRO da parede — não atravessa vão de porta nem pilar.
  describe('a vizinha não atravessa vão nem pilar', () => {
    /** Luz a 2 m da parede sul; duas tomadas baixas na face dela, a 0,6 m uma da outra; mais o que vier entre elas. */
    const duasTomadas = (entre: (m: BlueprintModel) => Command | null) => {
      const c = modeloBase();
      const luz = c.ponto(2000, 2075, 'ILUMINACAO_TETO');
      const a = c.ponto(2000, 75, 'TUG');
      const b = c.ponto(2600, 75, 'TUG');
      let m = c.modelo();
      const cmd = entre(m);
      if (cmd) m = applyCommand(m, cmd).model;
      return { m, levelId: c.levelId, luz, a, b };
    };
    const sul = (m: BlueprintModel) => m.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;
    const vao = (kind: 'door' | 'window', sillMm: number, heightMm: number) => (m: BlueprintModel): Command => ({
      type: 'AddOpening', wallId: sul(m).id, kind, offsetMm: 2100, widthMm: 400, heightMm, sillMm,
    }) as Command;

    it('sem nada entre elas, encadeia (o controle)', () => {
      const { m, levelId, a, b } = duasTomadas(() => null);
      expect(encaminhamentoPorAmbiente(m, levelId, todos(m)).get(b)).toEqual({ tipo: 'VIZINHA', terminalId: a });
    });

    it('PORTA entre as duas tomadas → nenhuma vira VIZINHA (as duas descem da luz)', () => {
      const { m, levelId, luz, a, b } = duasTomadas(vao('door', 0, 2100));
      expect(m.openings).toHaveLength(1);
      const r = encaminhamentoPorAmbiente(m, levelId, todos(m));
      expect(r.get(a)).toEqual({ tipo: 'LUZ', luzId: luz });
      expect(r.get(b)).toEqual({ tipo: 'LUZ', luzId: luz });
    });

    it('JANELA com peitoril de 1,10 m entre tomadas a 30 cm → encadeia (o eletroduto passa por baixo dela)', () => {
      const { m, levelId, a, b } = duasTomadas(vao('window', 1100, 1000));
      expect(m.openings).toHaveLength(1);
      expect(encaminhamentoPorAmbiente(m, levelId, todos(m)).get(b)).toEqual({ tipo: 'VIZINHA', terminalId: a });
    });

    it('PILAR entre as duas tomadas → não encadeia', () => {
      const { m, levelId, luz, b } = duasTomadas((mm) => ({ type: 'AddStructural', levelId: mm.levels[0].id, kind: 'PILAR', pontos: [{ x: 2300, y: 200 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 }) as unknown as Command);
      expect((m.structures ?? []).filter((s) => s.kind === 'PILAR')).toHaveLength(1);
      expect(encaminhamentoPorAmbiente(m, levelId, todos(m)).get(b)).toEqual({ tipo: 'LUZ', luzId: luz });
    });
  });
});
