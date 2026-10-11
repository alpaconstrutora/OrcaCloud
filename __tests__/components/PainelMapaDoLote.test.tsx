// @vitest-environment jsdom
/**
 * A gaveta "Desenhar o lote no mapa" (11/10/2026). O Leaflet de verdade não
 * desenha no jsdom: entra um Leaflet falso que guarda o handler de clique, e o
 * teste "clica no mapa" chamando-o com a coordenada.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';
import PainelMapaDoLote, { type ResultadoDaBusca } from '../../components/blueprint/PainelMapaDoLote';

function leafletFalso() {
  let clique: ((e: { latlng: { lat: number; lng: number } }) => void) | null = null;
  const camada = () => {
    const c = { addTo: vi.fn(() => c), remove: vi.fn(), bindTooltip: vi.fn(() => c), clearLayers: vi.fn() };
    return c;
  };
  const mapa = {
    on: vi.fn((evento: string, fn: typeof clique) => {
      if (evento === 'click') clique = fn;
    }),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
  };
  const L = {
    map: vi.fn(() => mapa),
    layerGroup: vi.fn(camada),
    tileLayer: vi.fn(camada),
    polygon: vi.fn(camada),
    polyline: vi.fn(camada),
    circleMarker: vi.fn(camada),
  };
  return {
    L,
    mapa,
    carregar: async () => L as unknown as typeof Leaflet,
    clicar: (lat: number, lon: number) =>
      act(() => {
        clique!({ latlng: { lat, lng: lon } });
      }),
  };
}

// O terreno do pedido: ~288 × 248 m.
const NO = { lat: -22.615333, lon: -46.042601 };
const NE = { lat: -22.615333, lon: -46.039801 };
const SE = { lat: -22.617571, lon: -46.039801 };
const SO = { lat: -22.617571, lon: -46.042601 };

async function montar(extra: Partial<React.ComponentProps<typeof PainelMapaDoLote>> = {}) {
  const f = leafletFalso();
  const onUsar = vi.fn(() => null as string | null);
  const buscar = vi.fn(async (): Promise<ResultadoDaBusca[]> => []);
  render(<PainelMapaDoLote georreferencia={null} onUsar={onUsar} buscar={buscar} carregarLeaflet={f.carregar} {...extra} />);
  await waitFor(() => expect(f.mapa.on).toHaveBeenCalled());
  return { ...f, onUsar, buscar };
}

const botaoUsar = () => screen.getByRole('button', { name: 'Usar esta área' }) as HTMLButtonElement;

describe('PainelMapaDoLote', () => {
  it('sem vértice: "Usar esta área" desligado e dizendo o porquê', async () => {
    await montar();
    expect(botaoUsar().disabled).toBe(true);
    expect(botaoUsar().title).toMatch(/Clique no mapa para marcar os vértices/);
    expect(screen.getAllByText(/Clique no mapa para marcar os vértices/).length).toBeGreaterThan(0);
  });

  it('quatro cliques: medidas ao vivo e o lote sai com a origem no centro', async () => {
    const { clicar, onUsar } = await montar();
    clicar(NO.lat, NO.lon);
    clicar(NE.lat, NE.lon);
    expect(screen.getByText(/Faltam 1 vértice/)).toBeTruthy();
    clicar(SE.lat, SE.lon);
    clicar(SO.lat, SO.lon);
    const medidas = screen.getByTestId('medidas-da-area').textContent!;
    expect(medidas).toMatch(/Lado menor/);
    expect(screen.queryByTestId('aviso-copernicus')).toBeNull();
    expect(botaoUsar().disabled).toBe(false);
    fireEvent.click(botaoUsar());
    expect(onUsar).toHaveBeenCalledTimes(1);
    const area = (onUsar.mock.calls[0] as unknown[])[0] as { georreferenciaNova: boolean; pontosMm: unknown[]; medidas: { serveCopernicus: boolean } };
    expect(area.georreferenciaNova).toBe(true);
    expect(area.pontosMm).toHaveLength(4);
    expect(area.medidas.serveCopernicus).toBe(true);
  });

  it('desfazer vértice tira o último; limpar apaga tudo', async () => {
    const { clicar } = await montar();
    clicar(NO.lat, NO.lon);
    clicar(NE.lat, NE.lon);
    clicar(SE.lat, SE.lon);
    expect(botaoUsar().disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer vértice' }));
    expect(botaoUsar().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(botaoUsar().title).toMatch(/Clique no mapa/);
  });

  it('modo Retângulo: dois cantos opostos fecham a área', async () => {
    const { clicar, onUsar } = await montar();
    fireEvent.click(screen.getByRole('tab', { name: 'Retângulo' }));
    expect(botaoUsar().title).toMatch(/Clique em um canto/);
    clicar(NO.lat, NO.lon);
    expect(botaoUsar().title).toMatch(/canto oposto/);
    clicar(SE.lat, SE.lon);
    fireEvent.click(botaoUsar());
    expect(((onUsar.mock.calls[0] as unknown[])[0] as { pontosMm: unknown[] }).pontosMm).toHaveLength(4);
  });

  it('terreno pequeno: avisa que o Copernicus pede 90 m, mas deixa criar o lote', async () => {
    const { clicar } = await montar();
    clicar(-22.6, -46.04);
    clicar(-22.6, -46.0397);
    clicar(-22.6003, -46.0397);
    clicar(-22.6003, -46.04);
    expect(screen.getByTestId('aviso-copernicus').textContent).toMatch(/pelo menos 90 m/);
    expect(botaoUsar().disabled).toBe(false);
  });

  it('erro do lançamento aparece ao lado do botão', async () => {
    const { clicar } = await montar({ onUsar: () => 'Já há um lote.' });
    clicar(NO.lat, NO.lon);
    clicar(NE.lat, NE.lon);
    clicar(SE.lat, SE.lon);
    fireEvent.click(botaoUsar());
    expect(screen.getByText('Já há um lote.')).toBeTruthy();
  });

  it('coordenada colada vai direto, sem buscar na rede', async () => {
    const { mapa, buscar } = await montar();
    fireEvent.change(screen.getByLabelText('Endereço ou coordenada'), { target: { value: '-22,6153, -46,0426' } });
    fireEvent.click(screen.getByRole('button', { name: 'Procurar' }));
    expect(buscar).not.toHaveBeenCalled();
    expect(mapa.setView).toHaveBeenCalledWith([-22.6153, -46.0426], 18);
  });

  it('endereço: vários resultados viram lista; escolher enquadra pela caixa', async () => {
    const resultados: ResultadoDaBusca[] = [
      { nome: 'Extrema, Minas Gerais', lat: -22.85, lon: -46.31, caixa: [-22.9, -22.8, -46.4, -46.2] },
      { nome: 'Extrema, Rondônia', lat: -9.77, lon: -66.35, caixa: null },
    ];
    const { mapa } = await montar({ buscar: async () => resultados });
    fireEvent.change(screen.getByLabelText('Endereço ou coordenada'), { target: { value: 'Extrema' } });
    fireEvent.keyDown(screen.getByLabelText('Endereço ou coordenada'), { key: 'Enter' });
    const lista = await screen.findByTestId('resultados-da-busca');
    fireEvent.click(within(lista).getByText('Extrema, Minas Gerais'));
    expect(mapa.fitBounds).toHaveBeenCalledWith([[-22.9, -46.4], [-22.8, -46.2]], { maxZoom: 18 });
    expect(screen.queryByTestId('resultados-da-busca')).toBeNull();
  });

  it('busca sem resultado ou fora do ar diz o que fazer', async () => {
    await montar({ buscar: async () => { throw new Error('HTTP 429'); } });
    fireEvent.change(screen.getByLabelText('Endereço ou coordenada'), { target: { value: 'Rua X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Procurar' }));
    expect(await screen.findByText(/Não foi possível buscar agora \(HTTP 429\)\. Cole a coordenada/)).toBeTruthy();
  });

  it('com "Onde fica" já informado, o mapa abre lá e a origem é mantida', async () => {
    const f = leafletFalso();
    const onUsar = vi.fn(() => null as string | null);
    render(<PainelMapaDoLote georreferencia={{ latitude: NO.lat, longitude: NO.lon }} onUsar={onUsar} carregarLeaflet={f.carregar} />);
    await waitFor(() => expect(f.mapa.on).toHaveBeenCalled());
    expect(f.L.map).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ center: [NO.lat, NO.lon], zoom: 17, doubleClickZoom: false }));
    expect(screen.getByText(/já informada em "Onde fica" \(ponto laranja\) é mantida/)).toBeTruthy();
    f.clicar(NO.lat, NO.lon);
    f.clicar(NE.lat, NE.lon);
    f.clicar(SE.lat, SE.lon);
    fireEvent.click(botaoUsar());
    expect(((onUsar.mock.calls[0] as unknown[])[0] as { georreferenciaNova: boolean }).georreferenciaNova).toBe(false);
  });
});
