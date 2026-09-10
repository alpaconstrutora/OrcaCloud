/**
 * As fontes de elevação (`utils/blueprintElevacaoProvedores.ts`).
 *
 * O caso que importa é o da FALHA: uma requisição que falha no meio da grade
 * não pode virar cota zero — viraria um penhasco no desenho. Falha é exceção
 * (CA-009), e o teste com `fetch` falso é o que prova isso sem sair para a rede.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  amostrarRemoto,
  FONTES,
  fonteDeElevacao,
  FonteIndisponivel,
} from '../utils/blueprintElevacaoProvedores';

const GLO90 = fonteDeElevacao('OPEN_METEO_GLO90');

function coordenadas(n: number) {
  return Array.from({ length: n }, (_, i) => ({ lat: -22.6 - i * 0.001, lon: -46.1 }));
}

/** Um `fetch` que responde a cota = índice global da coordenada. */
function fetchQueEcoa(urls: string[]) {
  let offset = 0;
  return vi.fn(async (url: string) => {
    urls.push(url);
    const lats = new URL(url).searchParams.get('latitude')!.split(',');
    const elevation = lats.map((_, i) => offset + i);
    offset += lats.length;
    return new Response(JSON.stringify({ elevation }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('registro de fontes', () => {
  it('toda fonte publica a proveniência que o RF-007 exige', () => {
    for (const f of FONTES) {
      expect(f.nome).toBeTruthy();
      expect(f.datasetVersao).toBeTruthy();
      expect(f.licenca).toBeTruthy();
      expect(f.atribuicao).toBeTruthy();
      expect(['PRELIMINAR_REMOTO', 'LEVANTAMENTO_IMPORTADO']).toContain(f.classe);
    }
  });

  it('a fonte remota declara resolução e exige georreferência; a local, não', () => {
    expect(GLO90.resolucaoNominalM).toBe(90);
    expect(GLO90.exigeGeorreferencia).toBe(true);
    const local = fonteDeElevacao('PONTOS_COTADOS');
    expect(local.resolucaoNominalM).toBeNull();
    expect(local.exigeGeorreferencia).toBe(false);
  });
});

describe('amostrarRemoto', () => {
  it('parte em lotes de 100 e devolve as cotas na ordem pedida', async () => {
    const urls: string[] = [];
    const cotas = await amostrarRemoto(GLO90, coordenadas(250), fetchQueEcoa(urls));
    expect(urls).toHaveLength(3);
    expect(cotas).toHaveLength(250);
    expect(cotas[0]).toBe(0);
    expect(cotas[249]).toBe(249);
    expect(new URL(urls[0]).searchParams.get('latitude')!.split(',')).toHaveLength(100);
    expect(new URL(urls[2]).searchParams.get('latitude')!.split(',')).toHaveLength(50);
  });

  it('HTTP 500 vira FonteIndisponivel, nunca cota zero', async () => {
    const f = vi.fn(async () => new Response('erro', { status: 500 })) as unknown as typeof fetch;
    await expect(amostrarRemoto(GLO90, coordenadas(3), f)).rejects.toBeInstanceOf(FonteIndisponivel);
  });

  it('resposta com número errado de cotas é recusada', async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ elevation: [1, 2] }), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(amostrarRemoto(GLO90, coordenadas(3), f)).rejects.toThrow(/esperava 3/);
  });

  it('rede caída vira FonteIndisponivel com a causa', async () => {
    const f = vi.fn(async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(amostrarRemoto(GLO90, coordenadas(1), f)).rejects.toThrow(/Failed to fetch/);
  });

  it('valor não numérico vira nodata, não zero', async () => {
    const f = vi.fn(
      async () => new Response(JSON.stringify({ elevation: [10, null, 'x'] }), { status: 200 }),
    ) as unknown as typeof fetch;
    expect(await amostrarRemoto(GLO90, coordenadas(3), f)).toEqual([10, null, null]);
  });

  it('a fonte local não é remota', async () => {
    await expect(
      amostrarRemoto(fonteDeElevacao('PONTOS_COTADOS'), coordenadas(1)),
    ).rejects.toThrow(/não é remota/);
  });
});
