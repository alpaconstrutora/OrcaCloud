// @vitest-environment jsdom
/**
 * O CONTORNO DA TORRE NO ESPELHO DE VENDAS 3D (F1b, 10/11/2026): o painel do bloco diz se os portais já têm o
 * contorno deste desenho e envia quando não têm. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PainelBlocoSelecionado from '../../components/blueprint/PainelBlocoSelecionado';
import type { Bloco } from '../../utils/blueprintKernel';
import type { MedidaDoBloco } from '../../utils/blueprintMassa';
import type { LinhaDoAjuste } from '../../utils/blueprintAjusteAoEmpreendimento';

const BLOCO = { id: 'b1', uid: 'u-b1', levelId: 'l0', nome: 'Torre A', uso: 'RESIDENCIAL', pontos: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], cotaBaseMm: 0, pavimentos: 1, peDireitoMm: 3000 } as unknown as Bloco;
const MEDIDA = {
  blocoId: 'b1', nome: 'Torre A', uso: 'RESIDENCIAL', projecaoM2: 176, pavimentos: 1, pavimentosNoSubsolo: 0, areaConstruidaM2: 176, areaComputavelM2: 176, areaNaoComputavelM2: 0,
  baseMm: 0, topoMm: 3000, alturaM: 3, pisos: [], pisosAcimaDoGabarito: 0, pisosForaDoEnvelope: 0, apoiadoEm: null,
} as unknown as MedidaDoBloco;
const LINHA: LinhaDoAjuste = { torre: 'Torre A', fonte: 'UNIDADES', acima: 1, garagens: 0, alturaAcimaM: 3, blocoNome: 'Torre A', pavimentosNaPlanta: 1, garagensNaPlanta: 0, estado: 'IGUAL' as never };

type Contorno = NonNullable<NonNullable<React.ComponentProps<typeof PainelBlocoSelecionado>['empreendimento']>['contorno']>;

const montar = (contorno?: Partial<Contorno>) =>
  render(
    <PainelBlocoSelecionado
      bloco={BLOCO}
      medida={MEDIDA}
      onProps={vi.fn()}
      onExcluir={vi.fn()}
      onAbrirEstudo={vi.fn()}
      pisoSelecionado={null}
      onPiso={vi.fn()}
      unidadesDoPiso={[]}
      unidadeSelecionada={null}
      onUnidade={vi.fn()}
      empreendimento={{
        nome: '011 - Garden Cambuhy',
        papel: { torre: 'Torre A', tipo: 'TORRE', nomesDosPisos: ['Térreo'], pisos: [] },
        linha: LINHA,
        avisos: [],
        pendentes: 0,
        onAjustar: vi.fn(async () => undefined),
        contorno: contorno ? { total: 2, pendentes: 2, enviadoEm: null, onEnviar: vi.fn(async () => 'Contorno de 2 torres enviado'), ...contorno } : undefined,
      }}
    />,
  );

describe('painel do bloco › contorno no Espelho de Vendas 3D', () => {
  it('nunca enviado: diz que as torres aparecem esquemáticas nos portais, e o botão envia', async () => {
    const onEnviar = vi.fn(async () => 'Contorno de 2 torres enviado ao Empreendimento');
    montar({ onEnviar });
    expect(screen.getByTestId('contorno-no-espelho')).toHaveTextContent('2 torres ainda aparecem esquemáticas nos portais — o contorno nunca foi enviado.');
    await userEvent.click(screen.getByTestId('enviar-contorno'));
    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('contorno-resultado')).toHaveTextContent('Contorno de 2 torres enviado ao Empreendimento');
  });

  it('o desenho mudou depois do envio: diz quando foi e quantas torres estão com o contorno antigo', () => {
    montar({ pendentes: 1, enviadoEm: '2026-11-10T14:32:00-03:00' });
    const texto = screen.getByTestId('contorno-no-espelho').textContent ?? '';
    expect(texto).toMatch(/o desenho mudou desde o último envio \(10\/11\/2026/);
    expect(texto).toMatch(/1 torre\(s\) com o contorno antigo nos portais/);
    expect(screen.getByTestId('enviar-contorno')).not.toBeDisabled();
  });

  it('em dia: o botão fica desligado e diz por quê', () => {
    montar({ pendentes: 0, enviadoEm: '2026-11-10T14:32:00-03:00' });
    expect(screen.getByTestId('contorno-no-espelho')).toHaveTextContent('o contorno das 2 torres é o deste desenho');
    const b = screen.getByTestId('enviar-contorno');
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('title', 'O Espelho de Vendas 3D já tem o contorno deste desenho — nada a enviar');
  });

  it('falhou ao gravar: a mensagem do erro aparece no painel (não um "enviado" falso)', async () => {
    montar({ onEnviar: vi.fn(async () => { throw new Error('O contorno da Torre A não foi gravado — você não tem permissão para alterar esta torre.'); }) });
    await userEvent.click(screen.getByTestId('enviar-contorno'));
    expect(await screen.findByTestId('contorno-resultado')).toHaveTextContent('não foi gravado — você não tem permissão');
  });

  it('planta sem bloco casado com torre: o trecho do contorno não aparece', () => {
    montar();
    expect(screen.queryByTestId('contorno-no-espelho')).toBeNull();
  });
});
