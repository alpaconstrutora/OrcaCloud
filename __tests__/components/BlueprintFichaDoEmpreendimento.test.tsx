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

const FICHA = { frenteMm: 18000, fundosMm: null, profundidadeMm: 71000, profundidadePelaAreaMm: null, areaM2: null, origem: '011 - Garden Cambuhy' };

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

describe('Criar lote pela ficha — irregular e a pergunta da profundidade (22/10/2026)', () => {
  const GARDEN = { frenteMm: 18000, fundosMm: 21000, profundidadeMm: 71000, profundidadePelaAreaMm: 63030, areaM2: 1229, origem: '011 - Garden Cambuhy' };
  const lancar = () => screen.getByRole('button', { name: 'Lançar o lote' });

  it('fundos vêm da ficha; a profundidade nasce vazia e a tela PERGUNTA; lançar só depois da escolha', async () => {
    const onLancar = vi.fn(async () => null as string | null);
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={onLancar} sugestaoDaFicha={GARDEN} />);
    expect((screen.getByLabelText('Fundos (m, opcional)') as HTMLInputElement).value).toBe('21,00');
    expect((screen.getByLabelText('Profundidade (m)') as HTMLInputElement).value).toBe('');
    const pergunta = screen.getByTestId('pergunta-profundidade');
    expect(pergunta).toHaveTextContent('Manter a profundidade da ficha: 71,00 m — o lote fica com 1.384,50 m²');
    expect(pergunta).toHaveTextContent('Ajustar a profundidade para fechar a área: 63,03 m — 1.229,09 m²');
    expect(lancar()).toBeDisabled();
    expect(lancar()).toHaveAttribute('title', 'Escolha acima: manter a profundidade da ficha ou ajustar para fechar a área');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Ajustar a profundidade/));
    expect((screen.getByLabelText('Profundidade (m)') as HTMLInputElement).value).toBe('63,03');
    expect(screen.getByTestId('lote-da-ficha')).toHaveTextContent('ajustada pela área');
    expect(lancar()).not.toBeDisabled();
    await user.click(lancar());
    const [lote] = onLancar.mock.calls[0] as unknown as [{ areaMm2: number; lados: { papel: string; medidaMm: number | null }[] }];
    expect(lote.areaMm2 / 1e6).toBeCloseTo(1229.085, 2);
    // Frente e fundos são da matrícula; as laterais saíram da conta.
    expect(lote.lados.map((l) => l.medidaMm)).toEqual([18000, null, 21000, null]);
  });

  it('manter a profundidade da ficha também é escolha válida (lote com a área que ela dá)', async () => {
    const onLancar = vi.fn(async () => null as string | null);
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={onLancar} sugestaoDaFicha={GARDEN} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Manter a profundidade da ficha/));
    expect((screen.getByLabelText('Profundidade (m)') as HTMLInputElement).value).toBe('71,00');
    expect(screen.getByTestId('lote-da-ficha')).not.toHaveTextContent('ajustada pela área');
    await user.click(lancar());
    const [lote] = onLancar.mock.calls[0] as unknown as [{ areaMm2: number }];
    expect(lote.areaMm2 / 1e6).toBeCloseTo(1384.5, 1);
  });

  it('mudar os fundos refaz a prévia (área do trapézio); antes da escolha, nenhum aviso de "informe a profundidade"', async () => {
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={vi.fn(async () => null)} sugestaoDaFicha={GARDEN} />);
    expect(screen.queryByText(/Informe a frente e a profundidade/)).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Manter a profundidade da ficha/));
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 1384,50 m²/);
    await user.clear(screen.getByLabelText('Fundos (m, opcional)'));
    await user.type(screen.getByLabelText('Fundos (m, opcional)'), '18');
    expect(screen.getByTestId('resumo-do-lote')).toHaveTextContent(/área 1278,00 m²/);
  });

  it('profundidade e área concordando: sem pergunta', () => {
    render(<PainelLoteDigitado rotacaoNorteDeg={0} georreferencia={null} temLote={false} onLancar={vi.fn(async () => null)} sugestaoDaFicha={{ ...GARDEN, profundidadeMm: 63030 }} />);
    expect(screen.queryByTestId('pergunta-profundidade')).toBeNull();
    expect((screen.getByLabelText('Profundidade (m)') as HTMLInputElement).value).toBe('63,03');
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

// Plano docs/planos/2026-10-26-zona-aplicavel-chega-na-planta.md: a zona que o empreendimento marca como aplicável
// precisa chegar à planta — e a zona em vigor que SUMIU da origem (reimportação) não pode seguir calada.
describe('Zona urbanística — zona aplicável do empreendimento', () => {
  const APLICAVEL = { id: 'zb', zona: 'ZEPEC 2', macroarea: 'Urbanização Consolidada', aplicavel: true };
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
    zonas: [{ id: 'za', zona: 'ZM 4' }, APLICAVEL],
    zonaAplicadaId: null,
    zonaRotuloSalvo: null,
    ajustadoAMao: false,
    derivou: false,
    onAplicar: vi.fn(),
    onDesligar: vi.fn(),
  };

  it('zona em vigor que sumiu da origem: avisa e oferece a aplicável', async () => {
    const onAplicar = vi.fn();
    render(<PainelZonaUrbanistica {...base} zonaAplicadaId="apagada" zonaRotuloSalvo="ZEPEC 2 · Urbanização Consolidada" zonaAplicadaSumiu zonaAplicavel={APLICAVEL} onAplicar={onAplicar} />);
    const aviso = screen.getByTestId('aviso-zona-sumiu');
    expect(aviso).toHaveTextContent('não existe mais');
    expect(aviso).toHaveTextContent('valores de quando foi aplicada');
    await userEvent.click(screen.getByRole('button', { name: /aplicar a zona aplicável/i }));
    expect(onAplicar).toHaveBeenCalledWith('zb');
    expect(screen.queryByTestId('aviso-zona-aplicavel')).toBeNull();
  });

  it('zona sumida e nenhuma aplicável marcada: avisa e manda escolher', () => {
    render(<PainelZonaUrbanistica {...base} zonaAplicadaId="apagada" zonaRotuloSalvo="ZR-2" zonaAplicadaSumiu zonaAplicavel={null} />);
    expect(screen.getByTestId('aviso-zona-sumiu')).toHaveTextContent('Escolha a zona');
    expect(screen.queryByRole('button', { name: /aplicar a zona aplicável/i })).toBeNull();
  });

  it('nada em vigor e o empreendimento marca uma zona: oferece aplicá-la', async () => {
    const onAplicar = vi.fn();
    render(<PainelZonaUrbanistica {...base} zonaAplicavel={APLICAVEL} onAplicar={onAplicar} />);
    expect(screen.getByTestId('aviso-zona-aplicavel')).toHaveTextContent('ZEPEC 2 · Urbanização Consolidada');
    await userEvent.click(screen.getByRole('button', { name: /aplicar a zona aplicável/i }));
    expect(onAplicar).toHaveBeenCalledWith('zb');
  });

  it('em vigor outra zona: diz qual vale no empreendimento', () => {
    render(<PainelZonaUrbanistica {...base} zonaAplicadaId="za" zonaRotuloSalvo="ZM 4" zonaAplicavel={APLICAVEL} />);
    expect(screen.getByTestId('aviso-zona-aplicavel')).toHaveTextContent('esta planta usa ZM 4');
  });

  it('em vigor a própria aplicável: sem aviso', () => {
    render(<PainelZonaUrbanistica {...base} zonaAplicadaId="zb" zonaRotuloSalvo="ZEPEC 2 · Urbanização Consolidada" zonaAplicavel={APLICAVEL} />);
    expect(screen.queryByTestId('aviso-zona-aplicavel')).toBeNull();
    expect(screen.queryByTestId('aviso-zona-sumiu')).toBeNull();
  });

  it('aplicada sozinha por ser a aplicável: o aviso diz isso, não "a única"', () => {
    render(<PainelZonaUrbanistica {...base} zonaAplicadaId="zb" zonaRotuloSalvo="ZEPEC 2" zonaAplicavel={APLICAVEL} zonaAplicadaAutomaticamente motivoDaZonaAutomatica="APLICAVEL" />);
    expect(screen.getByTestId('aviso-zona-automatica')).toHaveTextContent('marcada como aplicável no empreendimento');
    expect(screen.getByTestId('aviso-zona-automatica')).not.toHaveTextContent('única');
  });
});
