// @vitest-environment jsdom
/**
 * A gaveta GeoINCRA / SIGEF (A4): identificação pelo hook; vértices e trechos
 * viram COMANDOS de kernel pelo pai; pendências pelas regras do INCRA; a
 * planilha fica desligada com erro e DIZ por quê; o retorno é conferido.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelSigef from '../../components/blueprint/PainelSigef';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel } from '../../utils/blueprintKernel';
import { IDENTIFICACAO_VAZIA, perimetroSigef, type IdentificacaoSigef } from '../../utils/geo/sigef';
import type { SigefDoEstudo } from '../../hooks/useBlueprintSigef';

const CANTOS = [
  { x: 0, y: 0 },
  { x: 200_000, y: 0 },
  { x: 200_000, y: 300_000 },
  { x: 0, y: 300_000 },
];

function imovel(completo: boolean): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'T', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const lv = m.levels[0].id;
  m = applyBatch(m, CANTOS.map((a, i) => ({ type: 'AddBoundary' as const, levelId: lv, a, b: CANTOS[(i + 1) % 4], kind: 'TERRENO' as const }))).model;
  m = applyCommand(m, { type: 'SetGeorreferencia', georreferencia: { latitude: -19.9, longitude: -43.95, elevacaoM: 850, projetada: { lesteM: 0, norteM: 0, crs: 'EPSG:31983' } } } as never).model;
  if (!completo) return m;
  m = applyBatch(m, [
    ...CANTOS.map((c) => ({ type: 'SetVerticeDoTerreno' as const, ponto: c, nome: 'x', tipo: 'M' as const, sigmaEMm: 20, sigmaNMm: 20, sigmaHMm: 40, altitudeM: 850, metodo: 'PG6' })),
    ...m.boundaries.map((b) => ({ type: 'SetBoundaryEscritura' as const, boundaryId: b.id, medidaMm: null, confrontante: 'Vizinho' })),
    ...m.boundaries.map((b) => ({ type: 'SetBoundarySigef' as const, boundaryId: b.id, tipoDeLimite: 'LA1' as const })),
  ]).model;
  return applyCommand(m, { type: 'NomearVerticesDoTerreno', pontos: CANTOS, sigef: { credenciado: 'ABC1' } }).model;
}

const COMPLETA: IdentificacaoSigef = { ...IDENTIFICACAO_VAZIA, nome: 'João', cpfCnpj: '123.456.789-09', denominacao: 'Fazenda', cns: '1', matricula: '2', municipio: 'Belo Horizonte-MG', credenciado: 'ABC1', responsavelTecnico: 'Eng.' };

function sigef(id: IdentificacaoSigef = IDENTIFICACAO_VAZIA): SigefDoEstudo {
  return { identificacao: id, alterar: vi.fn(), estado: 'SALVO' };
}

function montar(model: BlueprintModel, s = sigef()) {
  const props = { model, sigef: s, onComandos: vi.fn(), onPlanilha: vi.fn(), onBaixarTexto: vi.fn(), meridianoCentral: -45 as number | null };
  render(<PainelSigef {...props} />);
  return props;
}

describe('PainelSigef', () => {
  it('sem georreferência: diz o que falta', () => {
    let m = imovel(false);
    m = applyCommand(m, { type: 'SetGeorreferencia', georreferencia: null } as never).model;
    montar(m);
    expect(screen.getByText(/Sem coordenadas/)).toBeInTheDocument();
  });

  it('identificação vai pelo hook; nomear fica desligado sem credenciado, dizendo por quê', () => {
    const s = sigef();
    const p = montar(imovel(false), s);
    fireEvent.change(screen.getByLabelText('Detentor (nome)'), { target: { value: 'Maria' } });
    expect(s.alterar).toHaveBeenCalledWith({ nome: 'Maria' });
    const nomear = screen.getByRole('button', { name: /Nomear no padrão SIGEF/ });
    expect(nomear).toBeDisabled();
    expect(nomear.title).toMatch(/código do credenciado/);
    void p;
  });

  it('com credenciado, nomear emite UM comando com os pontos na ordem do SIGEF e o início por tipo', () => {
    const m = imovel(false);
    const p = montar(m, sigef({ ...IDENTIFICACAO_VAZIA, credenciado: 'ABC1' }));
    fireEvent.change(screen.getByLabelText('Próximo sequencial M'), { target: { value: '37' } });
    fireEvent.click(screen.getByRole('button', { name: /Nomear no padrão SIGEF/ }));
    expect(p.onComandos).toHaveBeenCalledWith([
      { type: 'NomearVerticesDoTerreno', pontos: perimetroSigef(m)!.linhas.map((l) => l.ponto), sigef: { credenciado: 'ABC1', inicio: { M: 37, P: 1, V: 1 } } },
    ]);
  });

  it('tipo, sigma e método do vértice e o limite do trecho viram comandos', () => {
    const m = imovel(false);
    const p = montar(m);
    const v = screen.getByTestId('sigef-vertices');
    const primeiro = perimetroSigef(m)!.linhas[0];
    fireEvent.change(within(v).getByLabelText(`Tipo do vértice ${primeiro.codigo}`), { target: { value: 'M' } });
    expect(p.onComandos).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'SetVerticeDoTerreno', ponto: primeiro.ponto, tipo: 'M' })]);
    const sigma = within(v).getByLabelText(`σ long do vértice ${primeiro.codigo}`);
    fireEvent.change(sigma, { target: { value: '0,05' } });
    fireEvent.blur(sigma);
    expect(p.onComandos).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'SetVerticeDoTerreno', sigmaEMm: 50 })]);
    const t = screen.getByTestId('sigef-trechos');
    fireEvent.change(within(t).getByLabelText(`Tipo de limite do trecho ${primeiro.codigo}`), { target: { value: 'LN1' } });
    expect(p.onComandos).toHaveBeenLastCalledWith([expect.objectContaining({ type: 'SetBoundarySigef', tipoDeLimite: 'LN1' })]);
  });

  it('com pendências, a planilha fica desligada dizendo quantos erros; completo, sai e o retorno é conferido', () => {
    const { unmount } = render(<PainelSigef model={imovel(false)} sigef={sigef()} onComandos={vi.fn()} onPlanilha={vi.fn()} onBaixarTexto={vi.fn()} meridianoCentral={-45} />);
    const ods = screen.getByRole('button', { name: /Planilha ODS/ });
    expect(ods).toBeDisabled();
    expect(ods.title).toMatch(/Resolva os \d+ erros/);
    unmount();
    const m = imovel(true);
    const p = montar(m, sigef(COMPLETA));
    expect(screen.getByTestId('sigef-pendencias').textContent).toMatch(/Nada que o validador recusaria/);
    fireEvent.click(screen.getByRole('button', { name: /Planilha ODS/ }));
    expect(p.onPlanilha).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Memorial/ }));
    expect(p.onBaixarTexto).toHaveBeenCalledWith(expect.stringMatching(/memorial descritivo\.txt$/), expect.stringContaining('Inicia-se a descrição'), 'text/plain');
    const l = perimetroSigef(m)!.linhas[0];
    fireEvent.change(screen.getByLabelText('Vértices certificados pelo SIGEF'), { target: { value: `${l.codigo};${l.longitudeTexto};${l.latitudeTexto}` } });
    expect(screen.getByTestId('sigef-retorno').textContent).toMatch(/1 vértices conferidos · maior diferença 0,00\d m/);
  });
});
