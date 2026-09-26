// @vitest-environment jsdom
/**
 * As gavetas CAR e REURB (A5): o quadro e o apoio à Reserva Legal; os arquivos
 * desligados DIZEM por quê; a REURB mostra os ocupantes por lote, o aviso de
 * estudo sem Empreendimento e as pendências, e as peças chamam o pai.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelCar from '../../components/blueprint/PainelCar';
import PainelReurb, { type OcupantesNoPainel } from '../../components/blueprint/PainelReurb';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../../utils/blueprintKernel';
import { carDoImovel } from '../../utils/blueprintCar';
import type { DadosDaReurb } from '../../utils/blueprintReurb';

function gleba(geo: boolean): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  const c = [
    { x: 0, y: 0 },
    { x: 500_000, y: 0 },
    { x: 500_000, y: 400_000 },
    { x: 0, y: 400_000 },
  ];
  m = applyBatch(m, c.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: c[(i + 1) % 4], kind: 'TERRENO' as const }))).model;
  if (geo) m = applyCommand(m, { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.95, elevacaoM: 0 } } as never).model;
  return applyBatch(m, [
    { type: 'AddAreaPublica', levelId: lv, tipo: 'APP', pontos: [{ x: 0, y: 0 }, { x: 500_000, y: 0 }, { x: 500_000, y: 30_000 }, { x: 0, y: 30_000 }] },
    { type: 'AddAreaPublica', levelId: lv, tipo: 'RESERVA_LEGAL', pontos: [{ x: 100_000, y: 100_000 }, { x: 300_000, y: 100_000 }, { x: 300_000, y: 300_000 }, { x: 100_000, y: 300_000 }] },
  ]).model;
}

describe('PainelCar', () => {
  it('quadro com imóvel, APP e RL; RL de 4 ha em 20 ha no bioma "demais" = sobra 0', () => {
    const onExportar = vi.fn();
    render(<PainelCar car={carDoImovel(gleba(true))} bioma="DEMAIS_REGIOES" onBioma={vi.fn()} onExportar={onExportar} />);
    const linhas = within(screen.getByTestId('car-quadro')).getAllByRole('row');
    expect(linhas).toHaveLength(4);
    expect(within(screen.getByTestId('car-reserva-legal')).getByText('Sobra')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Shapefile por tema \(3\)/ }));
    expect(onExportar).toHaveBeenCalledWith('shp');
  });

  it('sem georreferência: os arquivos ficam desligados e dizem por quê', () => {
    render(<PainelCar car={carDoImovel(gleba(false))} bioma="AMAZONIA_FLORESTA" onBioma={vi.fn()} onExportar={vi.fn()} />);
    const kml = screen.getByRole('button', { name: /KML/ }) as HTMLButtonElement;
    expect(kml.disabled).toBe(true);
    expect(kml.title).toMatch(/georreferência/);
    expect(within(screen.getByTestId('car-reserva-legal')).getByText('Falta')).toBeTruthy();
  });
});

function nucleo(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyCommand(m, { type: 'AddQuadra', levelId: lv, nome: 'A', pontos: [{ x: 0, y: 0 }, { x: 24_000, y: 0 }, { x: 24_000, y: 30_000 }, { x: 0, y: 30_000 }] } as never).model;
  const q = m.quadras![0].id;
  return applyBatch(m, [0, 1].map((i) => ({ type: 'AddLote' as const, levelId: lv, quadraId: q, numero: String(i + 1), pontos: [{ x: i * 12_000, y: 0 }, { x: (i + 1) * 12_000, y: 0 }, { x: (i + 1) * 12_000, y: 30_000 }, { x: i * 12_000, y: 30_000 }] })) as never).model;
}

const DADOS: DadosDaReurb = { nome: 'Núcleo Esperança', modalidade: 'REURB-S', responsavelTecnico: 'Eng. Ana' };

describe('PainelReurb', () => {
  it('ocupantes por lote; lote sem ocupante vira pendência; as peças chamam o pai', () => {
    const m = nucleo();
    const [l1] = m.lotes!;
    const ocupantes: OcupantesNoPainel = { estado: 'PRONTO', empreendimento: { id: 'e', nome: 'Vila' }, lotesComUnidade: 2, porLoteUid: { [l1.uid]: [{ nome: 'Maria', documento: '111', papel: 'MORADOR' }] } };
    const onMemoriais = vi.fn();
    const onListagem = vi.fn();
    render(<PainelReurb model={m} dados={DADOS} onDados={vi.fn()} ocupantes={ocupantes} onRecarregar={vi.fn()} onMemoriais={onMemoriais} onListagem={onListagem} onPranchas={vi.fn()} />);
    const tabela = screen.getByTestId('reurb-ocupantes');
    expect(within(tabela).getByText('Maria (111)')).toBeTruthy();
    expect(within(tabela).getByText('nenhum')).toBeTruthy();
    expect(within(screen.getByTestId('reurb-pendencias')).getAllByText(/sem ocupante/).length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /Memoriais REURB \(2\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Listagem de ocupantes/ }));
    expect(onMemoriais).toHaveBeenCalled();
    expect(onListagem).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Pranchas \(4 folhas\)/ })).toBeTruthy();
  });

  it('estudo sem Empreendimento: explica o caminho; editar o núcleo chama onDados', () => {
    const onDados = vi.fn();
    render(
      <PainelReurb model={nucleo()} dados={DADOS} onDados={onDados} ocupantes={{ estado: 'PRONTO', empreendimento: null, lotesComUnidade: 0, porLoteUid: {} }} onRecarregar={vi.fn()} onMemoriais={vi.fn()} onListagem={vi.fn()} onPranchas={vi.fn()} />,
    );
    expect(screen.getByText(/não está ligado a um Empreendimento/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Matrícula de origem'), { target: { value: '12.345' } });
    expect(onDados).toHaveBeenCalledWith({ matricula: '12.345' });
  });

  it('sem lote: as peças ficam desligadas e dizem por quê', () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
    m = { ...m };
    render(<PainelReurb model={m} dados={DADOS} onDados={vi.fn()} ocupantes={{ estado: 'CARREGANDO', empreendimento: null, lotesComUnidade: 0, porLoteUid: {} }} onRecarregar={vi.fn()} onMemoriais={vi.fn()} onListagem={vi.fn()} onPranchas={vi.fn()} />);
    const b = screen.getByRole('button', { name: /Listagem de ocupantes/ }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toMatch(/Desenhe os lotes/);
  });
});
