// @vitest-environment jsdom
/**
 * Os painéis da Planta preenchidos pela ficha do empreendimento ligado (plano
 * docs/planos/2026-10-21-planta-empreendimento-vinculado-autopreencher.md, itens 2–4):
 * o aviso na zona, frente × profundidade no lote digitado e o endereço no mapa do lote.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as Leaflet from 'leaflet';
import PainelLoteDigitado from '../../components/blueprint/PainelLoteDigitado';
import PainelMapaDoLote, { type ResultadoDaBusca } from '../../components/blueprint/PainelMapaDoLote';
import PainelZonaUrbanistica from '../../components/blueprint/PainelZonaUrbanistica';

const FICHA = { frenteMm: 18000, profundidadeMm: 71000, origem: '011 - Garden Cambuhy' };

describe('Criar o lote digitando — frente × profundidade da ficha', () => {
  const montar = (extra: Partial<React.ComponentProps<typeof PainelLoteDigitado>> = {}) =>
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={vi.fn(async () => null)} sugestaoDaFicha={FICHA} {...extra} />);

  it('lote novo: os campos já vêm da ficha, com o aviso, e o resumo sai sem digitar nada', () => {
    montar();
    expect((screen.getByLabelText('Frente (m)') as HTMLInputElement).value).toBe('18,00');
    expect((screen.getByLabelText('Profundidade (m)') as HTMLInputElement).value).toBe('71,00');
    expect(screen.getByTestId('lote-da-ficha')).toHaveTextContent('ficha de 011 - Garden Cambuhy');
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 1278,00 m²/);
  });

  it('digitar por cima vale, e o aviso some', async () => {
    montar();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Frente (m)'));
    await user.type(screen.getByLabelText('Frente (m)'), '20');
    expect(screen.queryByTestId('lote-da-ficha')).toBeNull();
  });
});

function leafletFalso() {
  const camada = () => {
    const c = { addTo: vi.fn(() => c), remove: vi.fn(), bindTooltip: vi.fn(() => c), clearLayers: vi.fn() };
    return c;
  };
  const mapa = { on: vi.fn(), invalidateSize: vi.fn(), remove: vi.fn(), setView: vi.fn(), fitBounds: vi.fn() };
  const L = { map: vi.fn(() => mapa), layerGroup: vi.fn(camada), tileLayer: vi.fn(camada), polygon: vi.fn(camada), polyline: vi.fn(camada), circleMarker: vi.fn(camada) };
  return { mapa, carregar: async () => L as unknown as typeof Leaflet };
}

describe('Desenhar no mapa — endereço da ficha', () => {
  const ENDERECO = { texto: 'Rua A, 10, Centro, Cambuí - MG', origem: '011 - Garden Cambuhy' };

  it('o endereço entra no campo e é procurado sozinho; resultado único leva o mapa até lá', async () => {
    const f = leafletFalso();
    const buscar = vi.fn(async (): Promise<ResultadoDaBusca[]> => [{ nome: 'Rua A', lat: -22.6, lon: -46.0, caixa: null }]);
    render(<PainelMapaDoLote georreferencia={null} onUsar={vi.fn(() => null)} buscar={buscar} carregarLeaflet={f.carregar} buscaInicial={ENDERECO} />);
    expect((screen.getByLabelText('Endereço ou coordenada') as HTMLInputElement).value).toBe(ENDERECO.texto);
    expect(screen.getByTestId('busca-da-ficha')).toHaveTextContent('ficha de 011 - Garden Cambuhy');
    await waitFor(() => expect(buscar).toHaveBeenCalledWith(ENDERECO.texto));
    await waitFor(() => expect(f.mapa.setView).toHaveBeenCalledWith([-22.6, -46.0], 18));
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('desenho já com "Onde fica": preenche o campo mas não sai procurando', async () => {
    const f = leafletFalso();
    const buscar = vi.fn(async (): Promise<ResultadoDaBusca[]> => []);
    render(
      <PainelMapaDoLote
        georreferencia={{ latitude: -22.6, longitude: -46.0 } as never}
        onUsar={vi.fn(() => null)}
        buscar={buscar}
        carregarLeaflet={f.carregar}
        buscaInicial={ENDERECO}
      />,
    );
    await waitFor(() => expect(f.mapa.on).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('Zona urbanística — avisos de preenchimento automático', () => {
  const base: React.ComponentProps<typeof PainelZonaUrbanistica> = {
    origemDaZona: 'EMPREENDIMENTO',
    onOrigemDaZona: vi.fn(),
    empreendimentos: [{ id: 'e1', nome: '011 - Garden Cambuhy' }],
    empreendimentoId: 'e1',
    onEmpreendimento: vi.fn(),
    cidade: null,
    onCidade: vi.fn(),
    mapas: [],
    mapaId: '',
    onMapa: vi.fn(),
    zonas: [{ id: 'z1', zona: 'ZR-2' }],
    zonaAplicadaId: 'z1',
    zonaRotuloSalvo: 'ZR-2',
    ajustadoAMao: false,
    derivou: false,
    onAplicar: vi.fn(),
    onDesligar: vi.fn(),
  };

  it('empreendimento e zona automáticos: os dois avisos aparecem', () => {
    render(<PainelZonaUrbanistica {...base} avisoDoEmpreendimento="Preenchido automaticamente: é o empreendimento vinculado a esta planta." zonaAplicadaAutomaticamente />);
    expect((screen.getByLabelText('Empreendimento de onde vem a zona urbanística') as HTMLSelectElement).value).toBe('e1');
    expect(screen.getByTestId('aviso-empreendimento-automatico')).toHaveTextContent('vinculado a esta planta');
    expect(screen.getByTestId('aviso-zona-automatica')).toHaveTextContent('única cadastrada');
  });

  it('escolhido à mão: sem aviso', () => {
    render(<PainelZonaUrbanistica {...base} />);
    expect(screen.queryByTestId('aviso-empreendimento-automatico')).toBeNull();
    expect(screen.queryByTestId('aviso-zona-automatica')).toBeNull();
  });
});
