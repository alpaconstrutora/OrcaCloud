/**
 * A fonte Copernicus GLO-30 no registro (11/10/2026): a principal, sem custo e
 * sem limite de taxa; o Open-Meteo sai dos botões mas fica no registro.
 */
import { describe, expect, it, vi } from 'vitest';
import { amostrarRemoto, FONTES, fonteDeElevacao, FonteIndisponivel } from '../utils/blueprintElevacaoProvedores';
import { verificarResolucao } from '../utils/blueprintTopografia';

describe('fonte Copernicus GLO-30', () => {
  it('é API_FUNCTION pela topografia-copernicus, 30 m, EGM2008, com a atribuição exigida pela licença', () => {
    const f = fonteDeElevacao('COPERNICUS_GLO30');
    expect(f.tipo).toBe('API_FUNCTION');
    expect(f.funcao).toBe('topografia-copernicus');
    expect(f.resolucaoNominalM).toBe(30);
    expect(f.referenciaVertical).toMatch(/EGM2008/);
    expect(f.exigeGeorreferencia).toBe(true);
    expect(f.classe).toBe('PRELIMINAR_REMOTO');
    expect(f.atribuicao).toMatch(/DLR/);
    expect(f.atribuicao).toMatch(/Airbus/);
    expect(f.oferecida).toBe(true);
  });

  it('os botões: Pontos cotados, Copernicus 30 m e SRTM 30 m — nessa ordem', () => {
    expect(FONTES.filter((f) => f.oferecida).map((f) => f.rotuloCurto)).toEqual(['Pontos cotados', 'Copernicus 30 m', 'SRTM 30 m']);
  });

  it('Open-Meteo e DEM do arquivo continuam no registro (versões antigas), mas não são oferecidos', () => {
    expect(fonteDeElevacao('OPEN_METEO_GLO90').oferecida).toBe(false);
    expect(fonteDeElevacao('DEM_ARQUIVO').oferecida).toBe(false);
  });

  it('lote de até 2.000 coordenadas, sem espera entre lotes; null do provedor passa como null', async () => {
    const f = fonteDeElevacao('COPERNICUS_GLO30');
    const coords = Array.from({ length: 4500 }, (_, i) => ({ lat: -22.6 - i / 1e5, lon: -46.04 }));
    const tamanhos: number[] = [];
    const invocar = vi.fn(async (_nome: string, corpo: unknown) => {
      const n = (corpo as { coordenadas: unknown[] }).coordenadas.length;
      tamanhos.push(n);
      return { data: { elevation: Array.from({ length: n }, (_, i) => (i === 0 ? null : 870 + i / 1000)) }, error: null };
    });
    const esperas: number[] = [];
    const cotas = await amostrarRemoto(f, coords, fetch, invocar, async (ms) => {
      esperas.push(ms);
    });
    expect(invocar.mock.calls[0][0]).toBe('topografia-copernicus');
    expect(tamanhos).toEqual([2000, 2000, 500]);
    expect(esperas).toEqual([]);
    expect(cotas).toHaveLength(4500);
    expect(cotas[0]).toBeNull();
    expect(cotas[2000]).toBeNull();
    await expect(amostrarRemoto(f, coords.slice(0, 2), fetch, async () => ({ data: null, error: { message: 'HTTP 502' } }))).rejects.toBeInstanceOf(FonteIndisponivel);
  });

  it('DR-08 continua valendo: lado menor de 89 m é recusado, o terreno do pedido (~248 m) passa', () => {
    const ret = (l: number, a: number) => [
      { x: 0, y: 0 },
      { x: l * 1000, y: 0 },
      { x: l * 1000, y: a * 1000 },
      { x: 0, y: a * 1000 },
    ];
    expect(verificarResolucao(ret(89, 200), 30).ok).toBe(false);
    expect(verificarResolucao(ret(288, 248), 30).ok).toBe(true);
  });
});
