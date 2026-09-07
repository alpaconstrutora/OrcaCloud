// @vitest-environment jsdom
/**
 * O painel de importação de DXF.
 *
 * ─── AS DUAS PERGUNTAS QUE ELE FAZ ──────────────────────────────────────────
 *
 * Qual camada é parede e em que unidade o arquivo está. Nenhuma das duas dá
 * para adivinhar: o projeto real da empresa tem `PAREDE`, mas também
 * `ARQ-LAYOUT` e `dc_paisagismo` cheias de traço; e ele DECLARA milímetro
 * estando em metro.
 *
 * ⚠️ A unidade é o caso mais perigoso. Errá-la dá uma casa de 13 centímetros
 * COM A FORMA PERFEITA — plausível na miniatura, e o erro só aparece quando
 * alguém cota alguma coisa.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PainelImportarDxf from '../../components/blueprint/PainelImportarDxf';
import { applyCommand, emptyModel } from '../../utils/blueprintKernel';

/** Um DXF mínimo com uma parede de 150 mm: duas faces paralelas de 4 m. */
function dxfDeUmaParede(escala = 1): string {
  const e = (v: number) => String(v * escala);
  const pares: [string, string][] = [
    ['0', 'SECTION'],
    ['2', 'HEADER'],
    ['9', '$INSUNITS'],
    ['70', '4'],
    ['0', 'ENDSEC'],
    ['0', 'SECTION'],
    ['2', 'ENTITIES'],
    // Face de baixo e face de cima, a 150 mm uma da outra.
    ['0', 'LINE'],
    ['8', 'PAREDE'],
    ['10', e(0)],
    ['20', e(0)],
    ['11', e(4000)],
    ['21', e(0)],
    ['0', 'LINE'],
    ['8', 'PAREDE'],
    ['10', e(0)],
    ['20', e(150)],
    ['11', e(4000)],
    ['21', e(150)],
    // Um traço de cota, noutra camada, para a escolha ter o que escolher.
    ['0', 'LINE'],
    ['8', 'COTAS'],
    ['10', e(0)],
    ['20', e(-500)],
    ['11', e(4000)],
    ['21', e(-500)],
    ['0', 'ENDSEC'],
    ['0', 'EOF'],
  ];
  return pares.flatMap(([c, v]) => [c, v]).join('\n');
}

function comNivel() {
  const r = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  return { model: r.model, levelId: r.model.levels[0].id };
}

async function abrirComArquivo(texto: string) {
  const onImportar = vi.fn();
  const { model, levelId } = comNivel();
  const { container } = render(
    <PainelImportarDxf model={model} levelIdAtivo={levelId} onImportar={onImportar} />,
  );
  const input = container.querySelector('#importar-dxf-arquivo') as HTMLInputElement;
  const arquivo = new File([texto], 'planta.dxf', { type: 'application/dxf' });
  // jsdom não implementa File.text().
  Object.defineProperty(arquivo, 'text', { value: async () => texto });
  fireEvent.change(input, { target: { files: [arquivo] } });
  await waitFor(() => expect(screen.getByText('planta.dxf')).toBeTruthy());
  return { onImportar };
}

describe('importar DXF · as escolhas', () => {
  it('oferece as camadas do arquivo, com a contagem de traços', async () => {
    await abrirComArquivo(dxfDeUmaParede());
    const select = screen.getByLabelText('Camada que contém as paredes') as HTMLSelectElement;
    const rotulos = [...select.options].map((o) => o.textContent);
    expect(rotulos.some((r) => r?.includes('PAREDE'))).toBe(true);
    expect(rotulos.some((r) => r?.includes('COTAS'))).toBe(true);
  });

  it('SUGERE a unidade medindo, e mostra quantas paredes cada uma daria', async () => {
    // Num arquivo desenhado em milímetro, a opção "milímetro" é a que produz
    // parede plausível — e é ela que a tela põe na frente.
    await abrirComArquivo(dxfDeUmaParede(1));
    const select = screen.getByLabelText(
      'Unidade em que o arquivo foi desenhado',
    ) as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/milímetro/);
    expect(select.options[0].textContent).toMatch(/plausíve/);
  });

  it('a mesma planta desenhada em METRO é reconhecida como metro', async () => {
    // ⚠️ Escala 0,001: a mesma geometria, em metro. Se a tela acreditasse no
    // `$INSUNITS` (que continua dizendo milímetro), a casa entraria mil vezes
    // menor, com a forma perfeita.
    await abrirComArquivo(dxfDeUmaParede(0.001));
    const select = screen.getByLabelText(
      'Unidade em que o arquivo foi desenhado',
    ) as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/metro/);
  });
});

describe('importar DXF · o que entra', () => {
  it('a parede entra com a espessura DERIVADA das faces', async () => {
    const { onImportar } = await abrirComArquivo(dxfDeUmaParede());
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(1);
    expect(comandos[0].type).toBe('AddWall');
    expect(comandos[0].thicknessMm).toBe(150);
    // O DXF não sabe altura: ela vem do pé-direito do pavimento.
    expect(comandos[0].heightMm).toBe(2800);
  });

  it('pelo modo EIXO, cada traço vira uma parede com a espessura informada', async () => {
    // Duas faces viram DOIS eixos aqui, de propósito: no modo eixo o traço não
    // é interpretado, é lido. Quem escolhe a camada sabe o que ela contém.
    const { onImportar } = await abrirComArquivo(dxfDeUmaParede());
    fireEvent.click(screen.getByRole('button', { name: 'Camada de eixo' }));
    fireEvent.change(screen.getByLabelText('Espessura das paredes da camada de eixo'), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const comandos = onImportar.mock.calls[0][0];
    expect(comandos).toHaveLength(2);
    expect(comandos.every((c: { thicknessMm: number }) => c.thicknessMm === 200)).toBe(true);
  });

  it('camada sem parede reconhecível NÃO deixa importar', async () => {
    // O botão desabilitado é a resposta certa: importar zero parede e dizer que
    // deu certo seria pior que dizer que não deu.
    await abrirComArquivo(dxfDeUmaParede());
    fireEvent.change(screen.getByLabelText('Camada que contém as paredes'), {
      target: { value: 'COTAS' },
    });
    expect(screen.getByText(/Nenhuma parede reconhecida/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Importar/ })).toHaveProperty('disabled', true);
  });
});
