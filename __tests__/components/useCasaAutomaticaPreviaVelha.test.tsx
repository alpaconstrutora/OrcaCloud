// @vitest-environment jsdom
/**
 * 11/11/2026 (plano docs/planos/2026-11-11-casa-automatica-previa-velha.md): a prévia guarda a ASSINATURA do pedido que a
 * gerou e o programa curto dele — a tela compara a assinatura com a de agora (prévia velha) e o custo/nome da
 * alternativa saem do programa da prévia.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const planoFalso = { levelId: 'lvl_0001', comandos: [], criados: [] };
vi.mock('../../utils/blueprintCasaAutomatica', async (original) => ({
  ...(await original<typeof import('../../utils/blueprintCasaAutomatica')>()),
  planejarCasaDoPedido: vi.fn(() => planoFalso),
}));

import { assinaturaDoPedidoDaCasa, type PedidoDaCasa } from '../../utils/blueprintCasaAutomatica';
import { useCasaAutomatica } from '../../hooks/useCasaAutomatica';
import { emptyModel } from '../../utils/blueprintKernel';
import { PROGRAMA_CURTO_PADRAO } from '../../utils/blueprintPrograma';

const lote = [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 30000 }];

function pedido(extra: { curto?: Partial<PedidoDaCasa['entrada']['curto']>; levelId?: string; modelo?: PedidoDaCasa['original']; limites?: unknown[]; hip?: PedidoDaCasa['hip'] } = {}): PedidoDaCasa {
  return {
    original: extra.modelo ?? emptyModel(),
    entrada: {
      levelId: extra.levelId ?? 'lvl_0001',
      ctx: { terreno: { areaM2: 360 }, limites: extra.limites ?? [{ pontos: lote }], recuosBase: { frenteMm: 4000 }, zona: { taxaOcupacaoMaxPct: 60 } },
      curto: { ...PROGRAMA_CURTO_PADRAO, ...extra.curto },
      rotacaoNorteDeg: 0,
      latitudeGraus: -21,
    },
    terreno: null,
    hip: extra.hip ?? { sementes: 8 },
  } as unknown as PedidoDaCasa;
}

describe('assinaturaDoPedidoDaCasa', () => {
  it('muda com o programa, as hipóteses e a zona; não muda com o desenho (modelo, lote, pavimento) nem com a ordem das chaves', () => {
    const base = assinaturaDoPedidoDaCasa(pedido());
    expect(assinaturaDoPedidoDaCasa(pedido({ curto: { padrao: 'R1-A' } }))).not.toBe(base);
    expect(assinaturaDoPedidoDaCasa(pedido({ hip: { sementes: 3 } }))).not.toBe(base);
    const outraZona = pedido();
    (outraZona.entrada.ctx.zona as { taxaOcupacaoMaxPct: number }).taxaOcupacaoMaxPct = 50;
    expect(assinaturaDoPedidoDaCasa(outraZona)).not.toBe(base);
    // O desenho é da trava `conferirPlanoDaCasa` (hash), não da assinatura.
    const modelo = { ...emptyModel(), levels: [] };
    expect(assinaturaDoPedidoDaCasa(pedido({ modelo, levelId: 'lvl_0009', limites: [] }))).toBe(base);
    const invertido = pedido();
    invertido.entrada.curto = Object.fromEntries(Object.entries(invertido.entrada.curto).reverse()) as PedidoDaCasa['entrada']['curto'];
    expect(assinaturaDoPedidoDaCasa(invertido)).toBe(base);
  });
});

describe('useCasaAutomatica — a prévia guarda a assinatura e o programa dela', () => {
  it('sem prévia, nulos; gerada, os do pedido que a gerou; limpar zera', async () => {
    const { result } = renderHook(() => useCasaAutomatica());
    expect(result.current.assinatura).toBeNull();
    expect(result.current.curtoDoPlano).toBeNull();
    const p = pedido({ curto: { padrao: 'R1-B', dormitorios: 2 } });
    act(() => result.current.gerar(p));
    await waitFor(() => expect(result.current.plano).toBe(planoFalso));
    expect(result.current.assinatura).toBe(assinaturaDoPedidoDaCasa(p));
    expect(result.current.curtoDoPlano).toMatchObject({ padrao: 'R1-B', dormitorios: 2 });
    act(() => result.current.limpar());
    expect(result.current.assinatura).toBeNull();
    expect(result.current.curtoDoPlano).toBeNull();
  });
});
