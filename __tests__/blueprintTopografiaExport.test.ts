/**
 * Exportação da topografia (`utils/blueprintTopografiaExport.ts`).
 *
 * O que estes casos protegem é o CA-011: o arquivo que sai daqui vai circular
 * sozinho, e é fora do sistema que alguém o tomará por levantamento. Fonte,
 * data, algoritmo e o aviso têm de estar DENTRO do arquivo — nos dois formatos.
 */

import { describe, expect, it } from 'vitest';
import type { Point } from '../utils/blueprintKernel';
import { fonteDeElevacao } from '../utils/blueprintElevacaoProvedores';
import {
  AVISO_LEVANTAMENTO,
  AVISO_PRELIMINAR,
  estatisticasDoTerreno,
  gerarCurvas,
  nosDaGrade,
  planejarGrade,
} from '../utils/blueprintTopografia';
import {
  csvDaGrade,
  nomeDoArquivoDeTopografia,
  svgDasCurvas,
  type ProvenienciaDaVersao,
} from '../utils/blueprintTopografiaExport';

const QUADRADO: Point[] = [
  { x: 0, y: 0 },
  { x: 20000, y: 0 },
  { x: 20000, y: 20000 },
  { x: 0, y: 20000 },
];

function cenario() {
  const base = planejarGrade(QUADRADO, 1000);
  const grade = { ...base, cotasM: nosDaGrade(base).map((n) => (n.x < 0 ? null : 100 + n.x / 2000)) };
  const curvas = gerarCurvas(grade, QUADRADO, 1);
  const prov: ProvenienciaDaVersao = {
    nomeDoEstudo: 'Casa: teste/1',
    versao: 2,
    fonte: fonteDeElevacao('PONTOS_COTADOS'),
    classe: 'LEVANTAMENTO_IMPORTADO',
    equidistanciaM: 1,
    geradoEm: '2026-09-10T12:00:00Z',
    hashResultado: 'abcdef0123456789',
    estatisticas: estatisticasDoTerreno(grade, QUADRADO, curvas),
    georreferencia: { latitude: -22.6, longitude: -46.1, rotacaoNorteDeg: 15 },
  };
  return { grade, curvas, prov };
}

describe('svgDasCurvas', () => {
  it('uma <path> por curva, mestras marcadas, limite do lote e metadata', () => {
    const { curvas, prov } = cenario();
    const svg = svgDasCurvas(curvas, QUADRADO, prov);
    expect((svg.match(/data-cota=/g) ?? []).length).toBe(curvas.length);
    expect(svg).toContain('class="mestra"');
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('<metadata>');
    expect(svg).toContain('opura-curvas-de-nivel');
    expect(svg).toContain(prov.fonte.nome);
    // A saída LIMPA não tem prancha, mas o aviso vai no metadata mesmo assim.
    expect(svg).toContain(AVISO_LEVANTAMENTO.slice(0, 30));
    expect(svg).not.toContain('>N<');
  });

  it('a prancha escreve fonte, data, hash, aviso e o norte quando há giro', () => {
    const { curvas, prov } = cenario();
    const svg = svgDasCurvas(curvas, QUADRADO, prov, { prancha: true });
    expect(svg).toContain('2026-09-10T12:00:00Z');
    expect(svg).toContain('abcdef012345');
    expect(svg).toContain('>N<');
    expect(svg).toContain('rotate(-15.00)');
    expect((svg.match(new RegExp(AVISO_LEVANTAMENTO.slice(0, 30), 'g')) ?? []).length).toBe(2);
  });

  it('fonte remota leva o aviso de preliminar', () => {
    const { curvas, prov } = cenario();
    const svg = svgDasCurvas(curvas, QUADRADO, {
      ...prov,
      fonte: fonteDeElevacao('OPEN_METEO_GLO90'),
      classe: 'PRELIMINAR_REMOTO',
    });
    expect(svg).toContain(AVISO_PRELIMINAR.slice(0, 40));
    expect(svg).toContain('Copernicus');
  });

  it('escapa o que quebraria o XML', () => {
    const { curvas, prov } = cenario();
    const svg = svgDasCurvas(curvas, QUADRADO, { ...prov, nomeDoEstudo: 'A & B <c>' }, { prancha: true });
    expect(svg).toContain('A &amp; B &lt;c&gt;');
  });
});

describe('csvDaGrade', () => {
  it('um nó por linha, com lat/long, cota e status; cabeçalho com o aviso', () => {
    const { grade, prov } = cenario();
    const csv = csvDaGrade(grade, prov);
    const linhas = csv.split('\r\n');
    const dados = linhas.filter((l) => !l.startsWith('#') && !l.startsWith('seq;'));
    expect(dados).toHaveLength(grade.colunas * grade.linhas);
    expect(linhas.find((l) => l.startsWith('# ' + AVISO_LEVANTAMENTO.slice(0, 20)))).toBeTruthy();
    expect(linhas.find((l) => l.includes('opura-curvas-de-nivel'))).toBeTruthy();
    const primeira = dados[0].split(';');
    expect(primeira[8]).toBe('nodata');
    expect(primeira[7]).toBe('');
    const valida = dados.find((l) => l.endsWith('valido;PONTOS_COTADOS'))!.split(';');
    expect(valida[5]).toMatch(/^-22,\d+$/);
    expect(valida[6]).toMatch(/^-46,\d+$/);
    expect(valida[7]).toMatch(/^\d+,\d{3}$/);
  });

  it('sem georreferência, latitude e longitude ficam vazias', () => {
    const { grade, prov } = cenario();
    const csv = csvDaGrade(grade, { ...prov, georreferencia: null });
    const linha = csv.split('\r\n').find((l) => l.endsWith('valido;PONTOS_COTADOS'))!;
    expect(linha.split(';')[5]).toBe('');
  });
});

describe('nomeDoArquivoDeTopografia', () => {
  it('tira os caracteres que o Windows recusa', () => {
    expect(nomeDoArquivoDeTopografia('Casa: teste/1', 2, 'svg')).toBe(
      'Casa- teste-1 - curvas de nivel v2.svg',
    );
  });
});
