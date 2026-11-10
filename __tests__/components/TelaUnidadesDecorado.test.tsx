// @vitest-environment jsdom
/**
 * O CORTE 3D DA UNIDADE NO ESPELHO DE VENDAS (F9, 10/11/2026): a coluna da Tela Unidades diz a situação do corte de
 * cada unidade nos portais e o botão de enviar diz por que está desligado. O diálogo (que carrega o 3D) fica de fora:
 * aqui ele é um marcador que mostra o que recebeu. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const recebido = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('../../components/blueprint/EnviarCorteDaUnidade', () => ({
  default: (p: Record<string, unknown>) => {
    recebido.props = p;
    return <div data-testid="dialogo-do-corte">{String((p.situacao as { tipo: string }).tipo)}</div>;
  },
}));

import TelaUnidades, { type EspelhoNaTelaUnidades } from '../../components/blueprint/TelaUnidades';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { quadroDeUnidades } from '../../utils/blueprintUnidades';
import { assinaturaDoDecorado } from '../../utils/espelhoDecoradoDaPlanta';
import type { ImagemDoDecorado } from '../../utils/espelhoDecoradoDaTipologia';
import type { CorteGravado } from '../../utils/espelhoDecoradoDaPlanta';

/** Dois apartamentos de 6 × 6 m sobre um hall: 101 "Tipo A", 102 "Tipo B", 103 sem ambiente. */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(0, 6000, 12000, 6000, 150), w(6000, 0, 6000, 6000, 150)]).model;
  const sala = (x: number) => m.spaces.find((s) => s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala(0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: sala(6000), name: 'Sala 102' },
  ]).model;
  const etiqueta = (nome: string) => m.labels.find((l) => l.name === nome)!.id;
  m = applyCommand(m, { type: 'AddUnidade', numero: '101', tipologia: 'Tipo A', labelIds: [etiqueta('Sala 101')] }).model;
  m = applyCommand(m, { type: 'AddUnidade', numero: '102', tipologia: 'Tipo B', labelIds: [etiqueta('Sala 102')] }).model;
  m = applyCommand(m, { type: 'AddUnidade', numero: '103', tipologia: 'Tipo A' }).model;
  return m;
}

const EMP = { id: 'e1', nome: 'Garden', organizationId: 'o1' };
const corte = (over: Partial<ImagemDoDecorado & CorteGravado>): ImagemDoDecorado & CorteGravado => ({
  id: 'c1', tipologia: 'Tipo A', tipologia_chave: 'tipo a', papel: 'CORTE', legenda: null, ordem: 0, imagem_url: 'https://x/c.png',
  origem: 'PLANTA', planta_assinatura: null, updated_at: '2026-11-10T12:00:00Z', ...over,
});

const montar = (m: BlueprintModel, espelho?: Partial<EspelhoNaTelaUnidades>) =>
  render(
    <TelaUnidades
      model={m}
      quadro={quadroDeUnidades(m)}
      onRun={vi.fn()}
      onRunBatch={vi.fn()}
      erro={null}
      {...(espelho ? { espelho: { empreendimento: EMP, tipologiasDoEmpreendimento: new Set(['tipo a', 'tipo b']), cortes: new Map(), estudoId: 's1', onRecarregar: vi.fn(), ...espelho } } : {})}
    />,
  );
const situacao = (numero: string) => screen.getByTestId(`corte-situacao-${numero}`).textContent;
const botao = (numero: string) => screen.getByRole('button', { name: `Enviar o corte 3D da unidade ${numero} ao Espelho de Vendas` });

describe('TelaUnidades — o corte no Espelho de Vendas 3D (F9)', () => {
  it('sem a prop do espelho, a tabela é a de antes (sem coluna nem botão)', () => {
    montar(predio());
    expect(screen.queryByText('Corte no Espelho 3D')).toBeNull();
    expect(screen.queryByRole('button', { name: /Enviar o corte 3D/ })).toBeNull();
  });

  it('estudo sem Empreendimento: a coluna diz isso e o botão fica desligado com o mesmo motivo', () => {
    montar(predio(), { empreendimento: null });
    expect(situacao('101')).toBe('O estudo não está ligado a um Empreendimento.');
    expect(botao('101')).toBeDisabled();
    expect(botao('101').parentElement!.getAttribute('title')).toBe('O estudo não está ligado a um Empreendimento.');
  });

  it('tipologia que o Empreendimento não tem: aviso e botão desligado', () => {
    montar(predio(), { tipologiasDoEmpreendimento: new Set(['tipo a']) });
    expect(situacao('102')).toBe('O Empreendimento não tem a tipologia "Tipo B".');
    expect(botao('102')).toBeDisabled();
    expect(botao('101')).not.toBeDisabled();
  });

  it('unidade sem ambiente não gera corte: o botão diz o que falta', () => {
    montar(predio(), {});
    expect(botao('103')).toBeDisabled();
    expect(botao('103').parentElement!.getAttribute('title')).toMatch(/Componha a unidade/);
  });

  it('em dia, de outra unidade, desatualizado e imagem enviada — pela assinatura de verdade', () => {
    const m = predio();
    const u101 = m.unidades.find((u) => u.numero === '101')!;
    const u102 = m.unidades.find((u) => u.numero === '102')!;
    const { unmount } = montar(m, { cortes: new Map([['tipo a', corte({ planta_assinatura: assinaturaDoDecorado(m, u101.id) })]]) });
    expect(situacao('101')).toBe('É o deste desenho (enviado em 10/11/2026).');
    unmount();

    const outra = montar(m, { cortes: new Map([['tipo a', corte({ planta_assinatura: assinaturaDoDecorado(m, u102.id) })]]) });
    expect(situacao('101')).toBe('Enviado da unidade 102 em 10/11/2026.');
    outra.unmount();

    const velho = montar(m, { cortes: new Map([['tipo a', corte({ planta_assinatura: `${u101.uid}|00000000` })]]) });
    expect(situacao('101')).toBe('O desenho mudou desde o envio de 10/11/2026.');
    velho.unmount();

    montar(m, { cortes: new Map([['tipo a', corte({ origem: 'ENVIADA' })]]) });
    expect(situacao('101')).toBe('A tipologia usa uma imagem enviada em 10/11/2026.');
  });

  it('enviar abre o diálogo com a unidade, o Empreendimento e o corte atual da tipologia', () => {
    const m = predio();
    const atual = corte({ origem: 'ENVIADA' });
    montar(m, { cortes: new Map([['tipo a', atual]]) });
    fireEvent.click(botao('101'));
    expect(within(screen.getByTestId('dialogo-do-corte')).getByText('IMAGEM_ENVIADA')).toBeTruthy();
    expect(recebido.props).toMatchObject({ unidadeId: m.unidades.find((u) => u.numero === '101')!.id, empreendimento: EMP, estudoId: 's1', corteAtual: atual });
  });
});
