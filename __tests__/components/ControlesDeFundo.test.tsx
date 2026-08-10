// @vitest-environment jsdom
/**
 * Planta de fundo — os controles e o aviso.
 *
 * A classe alvo é a de sempre: **ação apresentada que não funciona**, e aqui há
 * uma variante pior — o desenho que PARECE certo. Uma planta de fundo sem escala
 * aferida deixa traçar normalmente, com aparência perfeita, e produz geometria
 * fora de escala. Nada na tela denuncia isso a não ser o aviso.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ControlesDeFundo, { ResumoDaAfericao } from '../../components/blueprint/ControlesDeFundo';
import type { UnderlayRow } from '../../services/blueprintUnderlayService';
import { calibrar } from '../../utils/blueprintUnderlay';

const P1 = { px: 100, py: 400 };
const P2 = { px: 500, py: 400 };
const UNDERLAY = calibrar({ p1: P1, p2: P2, distanciaMm: 4000 });

function linha(over: Partial<UnderlayRow> = {}): UnderlayRow {
  return {
    id: 'und_1',
    study_id: 'std_1',
    organization_id: 'org_1',
    level_id: 'lvl_0001',
    storage_path: 'org_1/std_1/abc.png',
    nome_arquivo: 'planta.pdf',
    nome: 'planta.pdf · p.2',
    ordem: 0,
    file_sha256: 'abc123',
    pdf_pagina: 2,
    origem_x_mm: UNDERLAY.origemXMm,
    origem_y_mm: UNDERLAY.origemYMm,
    mm_por_pixel: UNDERLAY.mmPorPixel,
    rotacao_mrad: UNDERLAY.rotacaoMrad,
    calib_p1_px: P1.px,
    calib_p1_py: P1.py,
    calib_p2_px: P2.px,
    calib_p2_py: P2.py,
    calib_distancia_mm: 4000,
    calib_alinhado: false,
    opacidade: 0.55,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function montar(over: Partial<React.ComponentProps<typeof ControlesDeFundo>> = {}) {
  const props = {
    // `linhas` acompanha `linha` por padrão: quem não está exercitando o seletor
    // de prancha não deveria ter de montar a lista à mão.
    linhas: over.linha ? [over.linha] : [],
    linha: null,
    underlay: null,
    opacidade: 0.55,
    calibrando: false,
    ocupado: false,
    totalPaginas: 1,
    onSelecionar: vi.fn(),
    onImportar: vi.fn(),
    onCalibrar: vi.fn(),
    onOpacidade: vi.fn(),
    onRemover: vi.fn(),
    ...over,
  };
  render(<ControlesDeFundo {...props} />);
  return props;
}

describe('ControlesDeFundo · o que aparece quando', () => {
  it('sem fundo, NÃO oferece aferir nem opacidade', () => {
    // Aferir escala de uma imagem que não existe é ação sem objeto.
    montar();
    expect(screen.getByRole('button', { name: /planta de fundo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aferir escala/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/opacidade/i)).not.toBeInTheDocument();
  });

  it('com fundo, oferece aferir, opacidade e remover', () => {
    montar({ linha: linha(), underlay: UNDERLAY });
    expect(screen.getByRole('button', { name: /aferir escala/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/opacidade/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remover esta prancha/i })).toBeInTheDocument();
    // E o botão de importar muda de rótulo: importar de novo ACRESCENTA.
    expect(screen.getByRole('button', { name: /acrescentar prancha/i })).toBeInTheDocument();
  });

  it('IMPORTAR ACRESCENTA, e não substitui', () => {
    // O rótulo é a única coisa na tela que diz o que o botão faz com a prancha
    // que já existe. Enquanto ele dizia "Trocar fundo", a promessa era a de
    // SUBSTITUIR — e a aferição da primeira, que é trabalho manual, ia junto.
    montar({ linha: linha(), underlay: UNDERLAY });
    expect(screen.queryByRole('button', { name: /trocar fundo/i })).not.toBeInTheDocument();
  });

  it('a escolha de página só aparece em PDF de mais de uma página', () => {
    montar({ linha: linha(), underlay: UNDERLAY, totalPaginas: 1 });
    expect(screen.queryByLabelText(/página do pdf/i)).not.toBeInTheDocument();
  });

  it('com várias páginas, a escolha aparece e é limitada ao total', () => {
    montar({ linha: linha(), underlay: UNDERLAY, totalPaginas: 12 });
    const campo = screen.getByLabelText(/página do pdf/i);
    expect(campo).toHaveAttribute('max', '12');
    expect(screen.getByText(/de 12/)).toBeInTheDocument();
  });

  it('em calibração, o botão diz o que fazer em vez de repetir o nome', async () => {
    const props = montar({ linha: linha(), underlay: UNDERLAY, calibrando: true });
    const botao = screen.getByRole('button', { name: /clique 2 pontos/i });
    expect(botao).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(botao);
    expect(props.onCalibrar).toHaveBeenCalled();
  });

  it('a opacidade EXIBE porcento e DEVOLVE fração', () => {
    // O controle mostra 0–100 porque é assim que se pensa em opacidade, e o
    // canvas quer 0–1. Devolver 80 em vez de 0,8 faria o `globalAlpha` saturar:
    // o fundo ficaria sólido e esconderia o desenho por baixo.
    const props = montar({ linha: linha(), underlay: UNDERLAY, opacidade: 0.55 });
    const campo = screen.getByLabelText(/opacidade/i) as HTMLInputElement;

    expect(campo.value).toBe('55');

    fireEvent.change(campo, { target: { value: '80' } });
    expect(props.onOpacidade).toHaveBeenCalledWith(0.8);
  });
});

describe('ControlesDeFundo · seletor de prancha', () => {
  const A = linha({ id: 'und_1', nome: 'Térreo', ordem: 0 });
  const B = linha({ id: 'und_2', nome: 'Cobertura', ordem: 1 });

  it('COM UMA SÓ PRANCHA NÃO OFERECE ESCOLHA', () => {
    // Um seletor de opção única é um controle que não controla nada: ocupa a
    // barra e sugere que existe outra prancha para escolher.
    montar({ linhas: [A], linha: A, underlay: UNDERLAY });
    expect(screen.queryByLabelText(/prancha ativa/i)).not.toBeInTheDocument();
  });

  it('a partir da segunda, lista as pranchas pelo nome', () => {
    montar({ linhas: [A, B], linha: A, underlay: UNDERLAY });
    const seletor = screen.getByLabelText(/prancha ativa/i);
    expect(seletor).toHaveValue('und_1');
    expect(screen.getByRole('option', { name: 'Térreo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cobertura' })).toBeInTheDocument();
  });

  it('O NOME COMPLETO FICA NO TOOLTIP, porque o campo trunca', () => {
    // Nome de prancha é longo por natureza — vem de nome de arquivo de projeto.
    // Sem o tooltip, ler o nome inteiro exigiria abrir o menu.
    montar({ linhas: [A, B], linha: A, underlay: UNDERLAY });
    expect(screen.getByLabelText(/prancha ativa/i)).toHaveAttribute(
      'title',
      expect.stringContaining('Térreo'),
    );
  });

  it('trocar de prancha chega ao pai', () => {
    const props = montar({ linhas: [A, B], linha: A, underlay: UNDERLAY });
    fireEvent.change(screen.getByLabelText(/prancha ativa/i), {
      target: { value: 'und_2' },
    });
    expect(props.onSelecionar).toHaveBeenCalledWith('und_2');
  });
});

describe('ResumoDaAfericao · o desenho que parece certo', () => {
  it('SEM AFERIÇÃO, AVISA QUE O TRAÇADO SAI FORA DE ESCALA', () => {
    // É o defeito silencioso deste recurso: dá para traçar normalmente sobre uma
    // imagem sem escala, com aparência perfeita, e todo o quantitativo depois
    // fica errado. Nada mais na tela denuncia.
    render(
      <ResumoDaAfericao
        linha={linha({ calib_distancia_mm: null, calib_p1_px: null, calib_p2_px: null })}
        underlay={UNDERLAY}
      />,
    );
    expect(screen.getByText(/ainda NÃO aferida/i)).toBeInTheDocument();
  });

  it('o aviso sobre raster fica VISÍVEL, não escondido em ajuda', () => {
    // A escala aferida num canto da folha pode não valer no outro, e nenhuma
    // conta detecta isso.
    render(<ResumoDaAfericao linha={linha()} underlay={UNDERLAY} />);
    expect(screen.getByText(/pode não valer no resto da folha/i)).toBeInTheDocument();
  });

  it('mostra a aferição por extenso e a confere de volta', () => {
    // Guardar só o mm/px tornaria impossível saber QUAL cota foi clicada. E
    // conferir de volta é a verificação que o usuário faria com o escalímetro.
    render(<ResumoDaAfericao linha={linha()} underlay={UNDERLAY} />);

    // A distância declarada vem em negrito; a conferida, no texto corrido. As
    // duas dizem "4,00 m", daí a busca por papel em vez de por texto solto.
    expect(screen.getByText('4,00 m').tagName).toBe('STRONG');
    expect(screen.getByText(/confere em 4,00 m/)).toBeInTheDocument();
    // 4000 mm em 400 px = 10 mm por pixel.
    expect(screen.getByText(/10,00 mm por pixel/)).toBeInTheDocument();
  });

  it('avisa quando a planta foi endireitada pela referência', () => {
    render(
      <ResumoDaAfericao linha={linha({ calib_alinhado: true })} underlay={UNDERLAY} />,
    );
    expect(screen.getByText(/planta alinhada pela referência/i)).toBeInTheDocument();
  });
});
