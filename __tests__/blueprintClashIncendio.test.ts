/**
 * INCÊNDIO E9.4 (01/10/2026): o CLASH de incêndio — sprinkler × luminária
 * (obstrução do jato, junto ao teto) e hidrante/mangotinho/extintor × porta
 * (dentro da passagem) — na mesma lista, no BCF e no destaque 3D dos outros.
 */
import { describe, expect, it } from 'vitest';
import { AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM, applyBatch, applyCommand, conflitosArquitetonicos, emptyModel, point, type BlueprintModel, type Command } from '../utils/blueprintKernel';
import { topicosDeConflitosArquitetonicos } from '../utils/blueprintBcf';
import { uidsEmConflitoAberto } from '../utils/blueprintConflitoStatus';

function andar(): { m: BlueprintModel; l: string } {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { m, l: m.levels[0].id };
}
const spk = (l: string, x: number, y: number, cota = 2700): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'Sprinkler', tipoHidraulico: 'SPRINKLER', at: point(x, y), cotaMm: cota }) as Command;
const luz = (l: string, x: number, y: number, cota = 2800): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'ELETRICA', tipo: 'Luz', tipoEletrico: 'ILUMINACAO_TETO', at: point(x, y), cotaMm: cota }) as Command;
const so = (m: BlueprintModel, classe: string) => conflitosArquitetonicos(m).filter((c) => c.classe === classe);

describe('E9.4 · sprinkler × luminária', () => {
  it('⚠️ PRONTO QUANDO: sprinkler a 10 cm de uma luminária é conflito — o tamanho é o que falta para o afastamento', () => {
    const { m, l } = andar();
    const r = so(applyBatch(m, [spk(l, 1000, 1000), luz(l, 1100, 1000)]).model, 'SPRINKLER_X_OBSTRUCAO');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ familia: 'terminal', outroFamilia: 'terminal', medidaMm: AFASTAMENTO_SPRINKLER_OBSTRUCAO_MM - 100, em: { x: 1050, y: 1000 } });
  });

  it('afastada (40 cm), na parede (fora da faixa do teto) ou em outro pavimento: não é', () => {
    const { m, l } = andar();
    const outro = applyCommand(m, { type: 'AddLevel', name: 'S', elevationMm: 3000, defaultHeightMm: 2800 }).model;
    const l2 = outro.levels[1].id;
    const r = applyBatch(outro, [spk(l, 1000, 1000), luz(l, 1400, 1000), luz(l, 1000, 1100, 1800), luz(l2, 1000, 1000)]).model;
    expect(so(r, 'SPRINKLER_X_OBSTRUCAO')).toEqual([]);
  });

  it('a luminária de EMERGÊNCIA também faz sombra', () => {
    const { m, l } = andar();
    const r = applyBatch(m, [spk(l, 1000, 1000), { type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo: 'LE', tipoHidraulico: 'LUMINARIA_EMERGENCIA', at: point(1000, 1150), cotaMm: 2300 } as Command]).model;
    expect(so(r, 'SPRINKLER_X_OBSTRUCAO')).toHaveLength(1);
  });
});

describe('E9.4 · hidrante / extintor × porta', () => {
  /** Parede em y = 0, porta de 900 a 1000–1900 mm. */
  function comPorta(kind: 'door' | 'window' | 'sliding' = 'door') {
    const { m, l } = andar();
    let r = applyCommand(m, { type: 'AddWall', levelId: l, a: point(0, 0), b: point(6000, 0), thicknessMm: 150, heightMm: 2800 }).model;
    r = applyCommand(r, { type: 'AddOpening', wallId: r.walls[0].id, kind, offsetMm: 1000, widthMm: 900, heightMm: kind === 'window' ? 1200 : 2100, sillMm: kind === 'window' ? 1000 : 0 }).model;
    return { m: r, l };
  }
  const peca = (l: string, tipo: string, x: number, y: number, cota = 1300): Command => ({ type: 'AddTerminal', levelId: l, disciplina: 'INCENDIO', tipo, tipoHidraulico: tipo, at: point(x, y), cotaMm: cota }) as Command;

  it('hidrante no giro da folha é conflito; ao lado do batente ou longe, não', () => {
    const { m, l } = comPorta();
    const r = applyBatch(m, [peca(l, 'HIDRANTE_SIMPLES', 1450, 500), peca(l, 'EXTINTOR', 2050, 100), peca(l, 'MANGOTINHO', 1450, 1500)]).model;
    const c = so(r, 'PECA_X_PORTA');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ outroFamilia: 'opening', medidaMm: 450 });
    expect(r.terminais!.find((t) => t.id === c[0].pecaId)!.tipoHidraulico).toBe('HIDRANTE_SIMPLES');
  });

  it('porta de correr: só a faixa da parede (não gira); janela não é passagem', () => {
    const correr = comPorta('sliding');
    expect(so(applyBatch(correr.m, [peca(correr.l, 'EXTINTOR', 1450, 500)]).model, 'PECA_X_PORTA')).toEqual([]);
    expect(so(applyBatch(correr.m, [peca(correr.l, 'EXTINTOR', 1450, 30)]).model, 'PECA_X_PORTA')).toHaveLength(1);
    const janela = comPorta('window');
    expect(so(applyBatch(janela.m, [peca(janela.l, 'HIDRANTE_SIMPLES', 1450, 30)]).model, 'PECA_X_PORTA')).toEqual([]);
  });
});

describe('E9.4 · no BCF e no 3D', () => {
  it('o tópico diz o par e o motivo; o destaque 3D pega os dois uids', () => {
    const { m, l } = andar();
    const r = applyBatch(m, [spk(l, 1000, 1000), luz(l, 1100, 1000)]).model;
    const arq = conflitosArquitetonicos(r);
    const [topico] = topicosDeConflitosArquitetonicos(r, arq, 'eu', new Date('2026-10-01T12:00:00Z'));
    expect(topico.descricao).toMatch(/Interferência entre sprinkler e luminária: luminária a menos de 30 cm do sprinkler \(faltam 200 mm; CONFERIR NA NBR 10897\)/);
    expect(uidsEmConflitoAberto([], arq, new Map())).toEqual(new Set(r.terminais!.map((t) => t.uid)));
  });
});
