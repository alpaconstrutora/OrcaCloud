/**
 * DWG → DXF (20/09/2026, E9.1): o serviço confere o arquivo ANTES de mandar
 * (cabeçalho AC10xx, tamanho), traduz a versão, manda os bytes crus à Edge
 * Function `dwg-converter`, lê a versão dos headers e transforma o JSON de erro
 * da function numa frase. A function em si é provada de fora com curl (doc).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { FunctionsHttpError } from '@supabase/supabase-js';
import { conferirDwg, converterDwgParaDxf, MAX_DWG_BYTES, releaseDoCabecalho } from '../services/blueprintDwgService';

const dwg = (cab = 'AC1032', tamanho = 64) => {
  const b = new Uint8Array(tamanho);
  for (let i = 0; i < 6; i++) b[i] = cab.charCodeAt(i);
  return new File([b], 'planta.dwg');
};

beforeEach(() => invoke.mockReset());

describe('dwg service (E9.1)', () => {
  it('confere localmente: vazio, grande demais e cabeçalho errado são recusados sem ir ao servidor; AC10xx passa; a release vem do cabeçalho', async () => {
    expect(await conferirDwg(new File([], 'x.dwg'))).toMatch(/vazio/);
    expect(await conferirDwg(dwg('DXF!!!'))).toMatch(/não é um DWG/);
    expect(await conferirDwg(dwg('AC1015'))).toBeNull();
    const grande = { size: MAX_DWG_BYTES + 1, slice: () => new Blob([]) } as unknown as File;
    expect(await conferirDwg(grande)).toMatch(/limite é 30 MB/);
    await expect(converterDwgParaDxf(dwg('%PDF-1'))).rejects.toThrow(/não é um DWG/);
    expect(invoke).not.toHaveBeenCalled();
    expect(releaseDoCabecalho('AC1032')).toBe('AutoCAD 2018+');
    expect(releaseDoCabecalho('AC1015')).toBe('AutoCAD 2000/2002');
    expect(releaseDoCabecalho('AC1099')).toBe('desconhecido');
  });

  it('manda os bytes crus como octet-stream e devolve o DXF com a versão e o código dos headers', async () => {
    invoke.mockResolvedValue({
      data: '999\nLibreDWG\n  0\nSECTION\n',
      error: null,
      response: new Response('', { headers: { 'x-dwg-version': 'AC1032', 'x-dwg-release': 'AutoCAD 2018+', 'x-libredwg-code': '4' } }),
    });
    const r = await converterDwgParaDxf(dwg('AC1032', 25920));
    expect(invoke).toHaveBeenCalledTimes(1);
    const [nome, opcoes] = invoke.mock.calls[0] as [string, { body: ArrayBuffer; headers: Record<string, string> }];
    expect(nome).toBe('dwg-converter');
    expect(opcoes.body).toBeInstanceOf(ArrayBuffer);
    expect(opcoes.body.byteLength).toBe(25920);
    expect(opcoes.headers['Content-Type']).toBe('application/octet-stream');
    expect(r).toEqual({ dxf: '999\nLibreDWG\n  0\nSECTION\n', versao: 'AC1032', release: 'AutoCAD 2018+', bytes: 25920, codigoLibredwg: 4 });
  });

  it('sem headers na resposta, a versão vem do próprio cabeçalho; Blob também serve; resposta vazia é erro', async () => {
    invoke.mockResolvedValue({ data: new Blob(['  0\nEOF\n']), error: null });
    const r = await converterDwgParaDxf(dwg('AC1015'));
    expect(r).toMatchObject({ versao: 'AC1015', release: 'AutoCAD 2000/2002', codigoLibredwg: 0, dxf: '  0\nEOF\n' });
    invoke.mockResolvedValue({ data: '', error: null });
    await expect(converterDwgParaDxf(dwg())).rejects.toThrow(/veio vazia/);
  });

  it('o JSON de erro da function vira a frase da tela (422 do libredwg, 401 sem sessão)', async () => {
    const ctx = new Response(JSON.stringify({ error: 'O libredwg não conseguiu ler este DWG (código 256).', versao: 'AC1032' }), { status: 422 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(ctx) });
    await expect(converterDwgParaDxf(dwg())).rejects.toThrow('Conversão DWG → DXF falhou: O libredwg não conseguiu ler este DWG (código 256).');
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    await expect(converterDwgParaDxf(dwg())).rejects.toThrow(/Failed to send a request/);
  });
});
