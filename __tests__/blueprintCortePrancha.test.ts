/**
 * O terreno e as medidas do CORTE na prancha e no DXF (13/10/2026). Antes a
 * exportação chamava `projetarCorte` SEM o terreno: a prancha do corte saía sem
 * o perfil, sem o platô e sem número — e o corte só de terreno era recusado como
 * "vazio". Plano: docs/planos/2026-10-13-corte-medidas-prancha.md.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyModel, point, type Point } from '../utils/blueprintKernel';
import { projetarCorte, type TerrenoParaCorte } from '../utils/blueprintCorte';
import { desenharElevacao, enquadrarElevacao, FAIXA_DOS_COMPRIMENTOS_MM, PAPEIS, type Desenhista, type OpcoesExportacao } from '../utils/blueprintExport';
import { CAMADAS, gerarDxf } from '../utils/blueprintDxf';

/** Só o lote e o platô: nenhuma parede. É o estudo de implantação do print do usuário. */
function soTerreno() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 2800 });
  const r = applyCommand(base.model, { type: 'AddCorte', a: point(-1000, 2000), b: point(7000, 2000) });
  return { model: r.model, corte: r.model.sections[0] };
}
const PLATO: Point[] = [point(1000, 0), point(5000, 0), point(5000, 4000), point(1000, 4000)];
const LOTE: Point[] = [point(-8000, -2000), point(14000, -2000), point(14000, 6000), point(-8000, 6000)];
const TERRENO: TerrenoParaCorte = {
  cotaEmM: () => 103,
  cotaZeroM: 100,
  vertices: LOTE,
  plato: { cotaM: 100, anel: PLATO, taludeCorteH: 1.5, taludeAterroH: 1.5 },
};

const OPCOES = (extra: Partial<OpcoesExportacao> = {}): OpcoesExportacao => ({ denominador: 200, papel: PAPEIS[0], titulo: 'Estudo', revisao: 1, hash: 'h', ...extra });

/** Anota texto com posição e as linhas — o bastante para ler o que a folha diz. */
class Espia implements Desenhista {
  readonly textos: { x: number; y: number; t: string }[] = [];
  readonly linhas: { cor: string }[] = [];
  readonly poligonos: { cor: string }[] = [];
  linha(_x1: number, _y1: number, _x2: number, _y2: number, e: { cor: string }) {
    this.linhas.push({ cor: e.cor });
  }
  poligono(_p: { x: number; y: number }[], cor: string) {
    this.poligonos.push({ cor });
  }
  texto(x: number, y: number, t: string) {
    this.textos.push({ x, y, t });
  }
  retangulo() {}
  larguraDoTexto(t: string, a: number) {
    return t.length * a * 0.5;
  }
}

function folha(extra: Partial<OpcoesExportacao> = {}) {
  const { model, corte } = soTerreno();
  const proj = projetarCorte(model, { corte, terreno: TERRENO });
  const o = OPCOES(extra);
  const enq = enquadrarElevacao(proj, o.denominador, o.papel);
  const d = new Espia();
  desenharElevacao(d, proj, o, enq);
  return { d, enq, proj };
}

describe('corte com terreno na prancha', () => {
  it('o corte só de terreno NÃO é vazio, e reserva a faixa dos comprimentos', () => {
    const { model, corte } = soTerreno();
    const sem = projetarCorte(model, { corte });
    const com = projetarCorte(model, { corte, terreno: TERRENO });
    expect(enquadrarElevacao(sem, 200, PAPEIS[0]).vazio).toBe(true);
    const enq = enquadrarElevacao(com, 200, PAPEIS[0]);
    expect(enq.vazio).toBe(false);
    expect(enq.cabe).toBe(true);
    // Centralizado CONTANDO a faixa: a margem que a centralização em X revela é a mesma que
    // a centralização em Y revela só se a faixa entrou na conta da altura.
    const margemPeloX = enq.offsetXMm - (enq.utilLarguraMm - enq.desenhoLarguraMm) / 2;
    const margemPeloY = enq.offsetYMm - (enq.utilAlturaMm - enq.desenhoAlturaMm - FAIXA_DOS_COMPRIMENTOS_MM) / 2;
    expect(margemPeloY).toBeCloseTo(margemPeloX, 6);
  });

  it('desenha o perfil, o platô e as medidas — os mesmos números da tela', () => {
    const { d } = folha();
    const textos = d.textos.map((t) => t.t);
    expect(textos).toContain('corte 3,00 m');
    expect(textos).toContain('platô 4,00 m');
    expect(textos.filter((t) => t === 'h 3,00 m')).toHaveLength(2);
    expect(textos).toContain('100,00');
    expect(textos.some((t) => t.startsWith('perfil '))).toBe(true);
    // O perfil (marrom) e a terra embaixo dele; o platô (azul) tracejado.
    expect(d.linhas.some((l) => l.cor === '#92400e')).toBe(true);
    expect(d.poligonos.some((p) => p.cor === '#f5efe8')).toBe(true);
    expect(d.linhas.filter((l) => l.cor === '#1d4ed8').length).toBeGreaterThan(10);
  });

  it('os itens de Exibir mandam: sem "Cotas do terreno" sai só a cadeia; sem os dois, nenhum número', () => {
    const soComprimentos = folha({ cotasDoTerrenoNoCorte: false }).d.textos.map((t) => t.t);
    expect(soComprimentos).toContain('platô 4,00 m');
    expect(soComprimentos).not.toContain('corte 3,00 m');
    const nenhum = folha({ cotasDoTerrenoNoCorte: false, comprimentosNoCorte: false }).d.textos.map((t) => t.t);
    expect(nenhum.some((t) => /\d,\d\d m/.test(t))).toBe(false);
  });

  it('a cadeia de comprimentos fica DENTRO da faixa reservada, abaixo do desenho e acima do carimbo', () => {
    const { d, enq } = folha();
    const fundoDoDesenho = enq.offsetYMm + enq.desenhoAlturaMm;
    const cadeia = d.textos.filter((t) => t.t.startsWith('platô') || t.t.startsWith('perfil'));
    expect(cadeia.length).toBe(2);
    for (const t of cadeia) {
      expect(t.y).toBeGreaterThan(fundoDoDesenho);
      expect(t.y).toBeLessThanOrEqual(fundoDoDesenho + FAIXA_DOS_COMPRIMENTOS_MM);
    }
  });

  it('sem terreno, o corte sai como sempre: nenhuma medida do terreno', () => {
    const { model, corte } = soTerreno();
    const r = applyCommand(model, { type: 'AddWall', levelId: model.levels[0].id, a: point(0, 3000), b: point(6000, 3000), thicknessMm: 150, heightMm: 2800 });
    const proj = projetarCorte(r.model, { corte: r.model.sections[0] });
    const d = new Espia();
    desenharElevacao(d, proj, OPCOES(), enquadrarElevacao(proj, 200, PAPEIS[0]));
    expect(d.textos.some((t) => /corte \d|platô|perfil/.test(t.t))).toBe(false);
  });
});

describe('corte com terreno no DXF', () => {
  it('perfil, platô e medidas em camadas CORTE-* próprias, sem acento', () => {
    const { model, corte } = soTerreno();
    const dxf = gerarDxf(model, { titulo: 'Estudo', revisao: 1, hash: 'h', elevacoes: [projetarCorte(model, { corte, terreno: TERRENO })] });
    for (const c of [CAMADAS.CORTE_TERRENO, CAMADAS.CORTE_PLATO, CAMADAS.CORTE_COTAS]) expect(dxf).toMatch(new RegExp(`\n8\n${c}\n`));
    expect(dxf).toContain('corte 3,00 m');
    expect(dxf).toContain('plato 4,00 m');
    expect(dxf).toContain('talude 4,50 m - 1:1,5');
    expect(dxf).not.toContain('platô');
  });
});
