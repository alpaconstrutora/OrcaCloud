// @vitest-environment jsdom
/**
 * O painel de classificação e exigências de incêndio (30/09/2026, E0): o aviso
 * de rascunho, a divisão digitada (válida grava, inválida avisa e não grava) e
 * "sem tabela" nunca lido como dispensa.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PainelIncendio from '../../components/blueprint/PainelIncendio';
import {
  HIPOTESES_INCENDIO_PADRAO,
  exigenciasDaEdificacao,
  type ClassificacaoDaEdificacao,
  type HipotesesDeClassificacao,
} from '../../utils/blueprintIncendioClassificacao';

const classificacao = (over: Partial<ClassificacaoDaEdificacao> = {}): ClassificacaoDaEdificacao => ({
  preset: 'MG_CBMMG',
  divisao: { valor: 'A-2', origem: 'SUGERIDA', motivo: '8 ambiente(s) residenciais e 4 unidades' },
  grupo: { grupo: 'A', nome: 'Residencial' },
  altura: { valorM: 14.5, origem: 'DERIVADA', descarga: 'Térreo', ultimo: '5º pavimento' },
  tipoPorAltura: { tipo: 'IV', nome: 'Edificação de média altura', ateM: 23 },
  areaTotalM2: 1200,
  areaPorPavimento: [],
  pavimentos: 6,
  unidades: 4,
  carga: { valorMJm2: 300, origem: 'TABELA', nivel: 'BAIXA' },
  pendencias: [],
  ...over,
});

function montar(c = classificacao(), hip: HipotesesDeClassificacao = HIPOTESES_INCENDIO_PADRAO.classificacao, persistenciaIndisponivel = false) {
  const onHip = vi.fn();
  render(<PainelIncendio hip={hip} onHip={onHip} classificacao={c} exigencias={exigenciasDaEdificacao(c)} niveis={[]} persistenciaIndisponivel={persistenciaIndisponivel} />);
  return onHip;
}

describe('PainelIncendio', () => {
  it('A-2 acima de 12 m (D1: IT 01 do CBMMG): sem aviso de rascunho, hidrantes exigidos com a fonte, alarme dispensado', () => {
    montar();
    expect(screen.queryByTestId('incendio-rascunho')).toBeNull();
    expect(screen.getByTestId('incendio-medida-HIDRANTES')).toHaveTextContent('Exigida');
    expect(screen.getByTestId('incendio-medida-HIDRANTES')).toHaveTextContent('IT 01 do CBMMG');
    expect(screen.getByTestId('incendio-medida-ALARME')).toHaveTextContent('Dispensada');
    expect(screen.getByTestId('incendio-classificacao')).toHaveTextContent('sugerida pelos ambientes');
  });

  it('divisão válida grava normalizada; inválida avisa e não grava', () => {
    const onHip = montar();
    const campo = screen.getByLabelText(/Divisão de ocupação declarada/);
    fireEvent.change(campo, { target: { value: 'c2' } });
    expect(onHip).toHaveBeenLastCalledWith(expect.objectContaining({ divisao: 'C-2' }));
    onHip.mockClear();
    fireEvent.change(campo, { target: { value: 'Z9' } });
    expect(onHip).not.toHaveBeenCalled();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
  });

  it('preset sem tabela: nenhum aviso de rascunho, tudo "Sem tabela"; sem persistência diz que vale só na sessão', () => {
    montar(classificacao({ preset: 'SP_CBPMESP' }), { ...HIPOTESES_INCENDIO_PADRAO.classificacao, preset: 'SP_CBPMESP' }, true);
    expect(screen.queryByTestId('incendio-rascunho')).toBeNull();
    expect(screen.getByTestId('incendio-exigencias')).not.toHaveTextContent('Exigida');
    expect(screen.getByTestId('incendio-sem-persistencia')).toBeInTheDocument();
  });
});
