// @vitest-environment jsdom
/**
 * O PAINEL DO PLATÔ NO 3D (25/11/2026) — pedido: *"assista o video https://www.instagram.com/reel/DgLvZqTSc-h/ e
 * implemente e ou aprimore o painel de visualizacao lateral como no video. hoje no rodapé ja tenho algumas destas
 * informações. Crie opcao para o usuário escolher como ele quer visualizar, compacto no rodapé ou completo no painel
 * lateral"*. O card à esquerda do 3D, como o "Bulldozed area" do reel: cota (deslizante), talude, área, perímetro e
 * volumes em barra — os MESMOS números do selo do rodapé.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PainelDoPlato3d, { PlatoNo3d, type DadosDoPainelDoPlato } from '../../components/blueprint/PainelDoPlato3d';

const DADOS: DadosDoPainelDoPlato = {
  base: 'DESENHADO',
  cotaM: 883.9,
  equilibrio: false,
  faixaDaCotaM: [850, 910],
  areaM2: 1018,
  perimetroM: 134.2,
  corteM3: 11135,
  aterroM3: 2347,
  saldoM3: -8788,
  foraDoRelevo: false,
  aviso: null,
  taludeCorteH: 1.5,
  taludeAterroH: 2,
};

function montar(extra: Partial<React.ComponentProps<typeof PainelDoPlato3d>> = {}, dados: Partial<DadosDoPainelDoPlato> = {}) {
  const props = {
    dados: { ...DADOS, ...dados },
    onCotaPrevia: vi.fn(),
    onCota: vi.fn(),
    onEquilibrio: vi.fn(),
    onParametros: vi.fn(),
    onRecolher: vi.fn(),
    ...extra,
  };
  render(<PainelDoPlato3d {...props} />);
  return props;
}

describe('PainelDoPlato3d', () => {
  it('⚠️ PRONTO QUANDO: mostra cota, área, perímetro e os volumes do selo (corte, aterro, saldo)', () => {
    montar();
    expect(screen.getByText('Platô desenhado')).toBeTruthy();
    expect((screen.getByLabelText('Cota do platô (m)') as HTMLInputElement).value).toBe('883.9');
    expect(screen.getByTestId('painel-plato-area').textContent).toMatch(/1\.018\s*m²/);
    expect(screen.getByTestId('painel-plato-perimetro').textContent).toMatch(/134\s*m/);
    expect(screen.getByTestId('painel-plato-corte').textContent).toMatch(/11\.135\s*m³/);
    expect(screen.getByTestId('painel-plato-aterro').textContent).toMatch(/2\.347\s*m³/);
    expect(screen.getByTestId('painel-plato-saldo').textContent).toMatch(/-8\.788\s*m³/);
  });

  it('a barra de volumes é proporcional (corte × aterro)', () => {
    montar();
    const corte = screen.getByTestId('painel-plato-barra-corte') as HTMLElement;
    // 11135 / (11135 + 2347) = 82,6 %
    expect(parseFloat(corte.style.width)).toBeCloseTo(82.6, 0);
  });

  it('o deslizante mostra a prévia enquanto anda e grava UMA vez ao soltar', async () => {
    const p = montar();
    const faixa = screen.getByLabelText('Cota do platô — deslizante') as HTMLInputElement;
    expect(faixa.min).toBe('850');
    expect(faixa.max).toBe('910');
    fireEvent.change(faixa, { target: { value: '890' } });
    fireEvent.change(faixa, { target: { value: '892.5' } });
    expect(p.onCota).not.toHaveBeenCalled();
    await waitFor(() => expect(p.onCotaPrevia).toHaveBeenLastCalledWith(892.5));
    fireEvent.pointerUp(faixa);
    expect(p.onCota).toHaveBeenCalledTimes(1);
    expect(p.onCota).toHaveBeenCalledWith(892.5);
  });

  it('o campo numérico grava ao confirmar (Enter)', () => {
    const p = montar();
    const campo = screen.getByLabelText('Cota do platô (m)') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '880,25' } });
    expect(p.onCota).not.toHaveBeenCalled();
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(p.onCota).toHaveBeenCalledWith(880.25);
  });

  it('Equilíbrio: chama, e fica desligado dizendo por quê quando já está em equilíbrio', () => {
    const p = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Equilíbrio' }));
    expect(p.onEquilibrio).toHaveBeenCalledTimes(1);
  });
  it('em equilíbrio o botão fica desligado com o motivo no title', () => {
    montar({}, { equilibrio: true });
    const b = screen.getByRole('button', { name: 'Equilíbrio' });
    expect(b).toBeDisabled();
    expect(b.getAttribute('title')).toMatch(/já está na cota de equilíbrio/i);
  });

  it('talude: muda corte e aterro 1:h, com a inclinação em %', () => {
    const p = montar();
    expect(screen.getByTestId('painel-plato-talude-corte-pct').textContent).toMatch(/67\s*%/);
    fireEvent.change(screen.getByLabelText('Talude de corte 1:'), { target: { value: '2' } });
    expect(p.onParametros).toHaveBeenCalledWith({ taludeCorteH: 2 });
    fireEvent.change(screen.getByLabelText('Talude de aterro 1:'), { target: { value: '3' } });
    expect(p.onParametros).toHaveBeenCalledWith({ taludeAterroH: 3 });
  });

  it('Recolher vai para o modo compacto; Excluir só com o desenho', () => {
    const onExcluir = vi.fn();
    const p = montar({ onExcluir });
    fireEvent.click(screen.getByRole('button', { name: 'Recolher para o rodapé' }));
    expect(p.onRecolher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir platô desenhado' }));
    expect(onExcluir).toHaveBeenCalledTimes(1);
  });
  it('sem onExcluir (platô no envelope), não há botão de excluir', () => {
    montar({}, { base: 'ENVELOPE' });
    expect(screen.getByText('Platô no envelope')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Excluir platô desenhado' })).toBeNull();
  });

  it('avisos: fora do relevo e o aviso do platô', () => {
    montar({}, { foraDoRelevo: true, aviso: 'O contorno não pode se cruzar.' });
    expect(screen.getByText(/fora do relevo/i)).toBeTruthy();
    expect(screen.getByText('O contorno não pode se cruzar.')).toBeTruthy();
  });
});

describe('PlatoNo3d (selo compacto × painel completo)', () => {
  const saldo = { corteM3: 100, aterroM3: 40, saldoM3: -60, equilibrio: false, foraDoRelevo: false };
  const painel = (modo: 'COMPLETO' | 'COMPACTO') => ({
    modo,
    onModo: vi.fn(),
    dados: DADOS,
    onCotaPrevia: vi.fn(),
    onCota: vi.fn(),
    onEquilibrio: vi.fn(),
    onParametros: vi.fn(),
  });

  it('COMPLETO: o painel à esquerda, sem o selo do rodapé', () => {
    render(<PlatoNo3d saldo={saldo} painel={painel('COMPLETO')} onEquilibrio={vi.fn()} aviso={null} />);
    expect(screen.getByTestId('painel-do-plato')).toBeTruthy();
    expect(screen.queryByTestId('saldo-do-plato')).toBeNull();
  });

  it('COMPACTO: o selo de hoje, com "Abrir painel" que volta ao completo', () => {
    const p = painel('COMPACTO');
    render(<PlatoNo3d saldo={saldo} painel={p} onEquilibrio={vi.fn()} aviso={null} />);
    expect(screen.queryByTestId('painel-do-plato')).toBeNull();
    expect(screen.getByTestId('saldo-do-plato').textContent).toMatch(/Corte 100 m³/);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir painel' }));
    expect(p.onModo).toHaveBeenCalledWith('COMPLETO');
  });

  it('Recolher no painel vai para o compacto', () => {
    const p = painel('COMPLETO');
    render(<PlatoNo3d saldo={saldo} painel={p} onEquilibrio={vi.fn()} aviso={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recolher para o rodapé' }));
    expect(p.onModo).toHaveBeenCalledWith('COMPACTO');
  });

  it('sem painel (quem usa o viewer sem ele): só o selo, sem "Abrir painel"', () => {
    render(<PlatoNo3d saldo={saldo} painel={null} onEquilibrio={vi.fn()} aviso="Aviso X" />);
    expect(screen.getByTestId('saldo-do-plato')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir painel' })).toBeNull();
    expect(screen.getByText('Aviso X')).toBeTruthy();
  });
});
