// @vitest-environment jsdom
/**
 * O painel de vias e greide (C2): a via de 200 m a 1 % sobre terreno plano
 * aparece com 11 estacas, a nota simples/composta, os volumes, e editar a
 * cota de uma estaca vira um PIV pelo pai (que é quem grava).
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PainelViasEGreide from '../../components/blueprint/PainelViasEGreide';
import type { ViaDeProjeto } from '../../hooks/useBlueprintVias';
import { SECAO_TIPO_PADRAO } from '../../utils/blueprintVias';

function via(extra: Partial<ViaDeProjeto> = {}): ViaDeProjeto {
  return {
    id: 'v1',
    nome: 'Rua A',
    viaUid: null,
    eixo: [
      { x: 0, y: 0 },
      { x: 0, y: 200_000 },
    ],
    passoM: 20,
    greide: { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }] },
    secaoTipo: { ...SECAO_TIPO_PADRAO },
    topografiaId: null,
    ...extra,
  };
}

function montar(vias: ViaDeProjeto[], extra: Partial<React.ComponentProps<typeof PainelViasEGreide>> = {}) {
  const props: React.ComponentProps<typeof PainelViasEGreide> = {
    vias,
    ativaId: vias[0]?.id ?? null,
    onAtiva: vi.fn(),
    onTracar: vi.fn(),
    onAlterar: vi.fn(),
    onRemover: vi.fn(),
    cotaEmM: () => 100,
    material: { empolamentoPct: 25, contracaoPct: 10 },
    onBaixar: vi.fn(),
    nomeDoEstudo: 'Estudo',
    persistenciaIndisponivel: false,
    ...extra,
  };
  render(<PainelViasEGreide {...props} />);
  return props;
}

describe('PainelViasEGreide', () => {
  it('sem via: ensina a traçar; o botão liga a ferramenta', () => {
    const p = montar([]);
    expect(screen.getByText(/Nenhum eixo traçado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Traçar eixo/ }));
    expect(p.onTracar).toHaveBeenCalled();
  });

  it('a via de 200 m a 1 %: 11 estacas, greide certo, nota simples com aterro e os volumes', () => {
    montar([via()]);
    expect(screen.getByText(/11 estacas · 200,00 m/)).toBeInTheDocument();
    const estacas = screen.getByTestId('vias-estacas');
    expect(within(estacas).getAllByRole('row')).toHaveLength(12);
    expect((screen.getByLabelText('Cota do greide na estaca 5+0,00') as HTMLInputElement).value).toBe('101');
    // PIV só nas pontas
    expect(screen.getByLabelText('Remover PIV da estaca 0+0,00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remover PIV da estaca 5+0,00')).toBeNull();
    const nota = screen.getByTestId('vias-nota');
    expect(within(nota).getAllByRole('row')).toHaveLength(12);
    expect(nota.textContent).toContain('101,000');
    const volumes = screen.getByTestId('vias-volumes');
    expect(volumes.textContent).toContain('Aterro');
    expect(volumes.textContent).toContain('Empréstimo');
    // nota composta acrescenta bordos e pés
    fireEvent.click(screen.getByRole('button', { name: 'Composta' }));
    expect(screen.getByTestId('vias-nota').textContent).toContain('Bordo E');
    expect(screen.getByTestId('vias-nota').textContent).toContain('5,5 / 101,000');
  });

  it('editar a cota de uma estaca cria um PIV pelo pai, com os outros PIVs mantidos', () => {
    const p = montar([via()]);
    fireEvent.change(screen.getByLabelText('Cota do greide na estaca 5+0,00'), { target: { value: '101.5' } });
    expect(p.onAlterar).toHaveBeenCalledWith('v1', {
      greide: { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 102 }, { distM: 100, cotaM: 101.5 }] },
    });
    fireEvent.click(screen.getByLabelText('Remover PIV da estaca 0+0,00'));
    expect(p.onAlterar).toHaveBeenLastCalledWith('v1', { greide: { pontos: [{ distM: 200, cotaM: 102 }] } });
  });

  it('sem greide gravado, usa o de partida (terreno → terreno) e diz isso; sem topografia, avisa', () => {
    montar([via({ greide: null })], { cotaEmM: (p) => 100 + p.y / 100_000 });
    expect(screen.getByText(/greide de partida/)).toBeInTheDocument();
    expect((screen.getByLabelText('Cota do greide na estaca 10+0,00') as HTMLInputElement).value).toBe('102');
    render(<></>);
  });

  it('sem topografia: aviso e nenhuma nota', () => {
    montar([via()], { cotaEmM: null });
    expect(screen.getByText(/sem topografia gerada/)).toBeInTheDocument();
    expect(screen.queryByTestId('vias-nota')).toBeNull();
  });

  it('a rampa acima do máximo é dita; os CSVs saem pelo pai', () => {
    const p = montar([via({ greide: { pontos: [{ distM: 0, cotaM: 100 }, { distM: 200, cotaM: 130 }] } })]);
    expect(screen.getByText(/Rampa de 15,0 %/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nota de serviço \(CSV\)/ }));
    expect(p.onBaixar).toHaveBeenCalledWith(expect.stringMatching(/nota de servico simples\.csv$/), expect.stringContaining('estaca;distancia_m'), 'text/csv');
    fireEvent.click(screen.getByRole('button', { name: /Pontos de locação/ }));
    expect(p.onBaixar).toHaveBeenLastCalledWith(expect.stringMatching(/locacao\.csv$/), expect.stringContaining('ponto;norte;este;cota;descricao'), 'text/csv');
  });
});

describe('PainelViasEGreide · vias do loteamento (C3)', () => {
  const k = { uid: 'u1', nome: 'Rua do Desenho', eixo: [{ x: 0, y: 0 }, { x: 0, y: 100_000 }], larguraMm: 12_000, calcadaMm: 2500 };

  it('as vias do loteamento sem projeto aparecem, e "Projetar" pede ao pai', () => {
    const onUsarViaDoLoteamento = vi.fn();
    montar([], { viasDoLoteamento: [k], onUsarViaDoLoteamento });
    fireEvent.click(screen.getByRole('button', { name: 'Projetar Rua do Desenho' }));
    expect(onUsarViaDoLoteamento).toHaveBeenCalledWith(k);
  });

  it('ligada: some da lista, diz que acompanha o desenho, e o nome fica travado dizendo onde renomear', () => {
    montar([via({ viaUid: 'u1', nome: 'Rua do Desenho' })], { viasDoLoteamento: [k], ligacao: { v1: { doLoteamento: true, orfa: false } }, onUsarViaDoLoteamento: vi.fn() });
    expect(screen.queryByTestId('vias-do-loteamento')).toBeNull();
    expect(screen.getByTestId('via-ligada').textContent).toMatch(/vêm do DESENHO/);
    const nome = screen.getByLabelText('Nome da via') as HTMLInputElement;
    expect(nome).toBeDisabled();
    expect(nome.title).toMatch(/renomeie lá/);
  });

  it('órfã: a via do desenho foi apagada — dito', () => {
    montar([via({ viaUid: 'sumiu' })], { ligacao: { v1: { doLoteamento: false, orfa: true } } });
    expect(screen.getByTestId('via-orfa').textContent).toMatch(/foi apagada do desenho/);
  });

  it('com mais de uma via, a nota de serviço de TODAS sai num CSV com a coluna via', () => {
    const p = montar([via(), via({ id: 'v2', nome: 'Rua B' })]);
    fireEvent.click(screen.getByRole('button', { name: /Notas de todas as vias \(2\)/ }));
    const csv = (p.onBaixar as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1] as string;
    const linhas = csv.split('\n');
    expect(linhas[0]).toBe('via;estaca;distancia_m;cota_terreno_m;cota_projeto_m;aterro_m;corte_m');
    expect(linhas.filter((l) => l.startsWith('Rua A;'))).toHaveLength(11);
    expect(linhas.filter((l) => l.startsWith('Rua B;'))).toHaveLength(11);
  });
});
