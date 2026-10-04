// @vitest-environment jsdom
/**
 * A seção CAMADAS do painel lateral (04/10/2026) — o componente, fora do
 * editor: olho, meio-tom, isolar/reexibir, mostrar/ocultar todas, contagem e
 * o grupo com subcamadas em estado parcial.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelCamadas from '../../components/blueprint/PainelCamadas';
import {
  CAMADAS,
  ESTADOS_PADRAO,
  isolar,
  type AlvoDeCamada,
  type ContagemDasCamadas,
  type EstadosDasCamadas,
} from '../../utils/blueprintCamadasPorDisciplina';

const CONTAGEM: ContagemDasCamadas = {
  ...(Object.fromEntries(CAMADAS.map((c) => [c, 0])) as Record<(typeof CAMADAS)[number], number>),
  ARQUITETURA: 40,
  ESTRUTURA: 12,
  ESGOTO: 7,
  AGUA_FRIA: 5,
  ELETRICA_ILUMINACAO: 3,
  ELETRICA_FORCA: 4,
  ELETRICA_COMUM: 2,
};

let ultimo: EstadosDasCamadas = ESTADOS_PADRAO;

/** O painel com o estado na mão, como o editor o usa (isolar guarda o de antes). */
function Controlado({ inicial = ESTADOS_PADRAO }: { inicial?: EstadosDasCamadas }) {
  const [estados, setEstados] = useState(inicial);
  const [antes, setAntes] = useState<EstadosDasCamadas | null>(null);
  const [base, setBase] = useState(true);
  const mudar = (e: EstadosDasCamadas) => {
    ultimo = e;
    setEstados(e);
  };
  return (
    <PainelCamadas
      estados={estados}
      onMudar={mudar}
      contagem={CONTAGEM}
      baseAtenuada={base}
      onBaseAtenuada={setBase}
      onIsolar={(alvo: AlvoDeCamada) => {
        setAntes(estados);
        mudar(isolar(alvo, { baseAtenuada: base }));
      }}
      onReexibir={() => mudar(antes ?? ESTADOS_PADRAO)}
    />
  );
}

const linha = (camada: string) => document.querySelector(`[data-camada="${camada}"]`) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  ultimo = ESTADOS_PADRAO;
});

describe('PainelCamadas', () => {
  it('lista as sete disciplinas com a contagem; Elétrica soma o comum', () => {
    render(<Controlado />);
    for (const id of ['ARQUITETURA', 'ESTRUTURA', 'TERRENO', 'ELETRICA', 'HIDRAULICA', 'INCENDIO', 'MECANICA']) expect(linha(id)).toBeTruthy();
    expect(within(linha('ARQUITETURA')).getByText('40')).toBeTruthy();
    expect(within(linha('ELETRICA')).getByText('9')).toBeTruthy();
    expect(within(linha('HIDRAULICA')).getByText('12')).toBeTruthy();
    // Camada vazia avisa no title.
    expect(within(linha('INCENDIO')).getByText('0').getAttribute('title')).toMatch(/Nenhuma peça/);
  });

  it('olho oculta e reexibe; o estado sai no data-estado e no aria-pressed', async () => {
    render(<Controlado />);
    const olho = within(linha('ESTRUTURA')).getByRole('button', { name: 'Ocultar Estrutura' });
    expect(olho.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(olho);
    expect(ultimo.ESTRUTURA).toBe('OCULTA');
    expect(linha('ESTRUTURA').dataset.estado).toBe('OCULTA');
    await userEvent.click(within(linha('ESTRUTURA')).getByRole('button', { name: 'Exibir Estrutura' }));
    expect(ultimo.ESTRUTURA).toBe('VISIVEL');
  });

  it('meio-tom liga e desliga', async () => {
    render(<Controlado />);
    await userEvent.click(within(linha('ARQUITETURA')).getByRole('button', { name: /Arquitetura em meio-tom/ }));
    expect(ultimo.ARQUITETURA).toBe('ATENUADA');
    await userEvent.click(within(linha('ARQUITETURA')).getByRole('button', { name: /Tirar Arquitetura do meio-tom/ }));
    expect(ultimo.ARQUITETURA).toBe('VISIVEL');
  });

  it('expandir a Hidráulica mostra as subcamadas; ocultar uma deixa o grupo parcial', async () => {
    render(<Controlado />);
    expect(linha('ESGOTO')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Hidráulica' }));
    expect(within(linha('ESGOTO')).getByText('7')).toBeTruthy();
    await userEvent.click(within(linha('ESGOTO')).getByRole('button', { name: 'Ocultar Esgoto' }));
    expect(linha('HIDRAULICA').dataset.estado).toBe('MISTO');
    expect(within(linha('HIDRAULICA')).getByRole('button', { name: 'Ocultar Hidráulica' }).getAttribute('aria-pressed')).toBe('mixed');
    // Olho do grupo parcial oculta tudo.
    await userEvent.click(within(linha('HIDRAULICA')).getByRole('button', { name: 'Ocultar Hidráulica' }));
    expect([ultimo.AGUA_FRIA, ultimo.AGUA_QUENTE, ultimo.ESGOTO, ultimo.PLUVIAL]).toEqual(['OCULTA', 'OCULTA', 'OCULTA', 'OCULTA']);
  });

  it('isolar deixa só a camada (arquitetura em meio-tom) e Reexibir devolve o de antes', async () => {
    const inicial = { ...ESTADOS_PADRAO, TERRENO: 'OCULTA' as const };
    render(<Controlado inicial={inicial} />);
    await userEvent.click(within(linha('INCENDIO')).getByRole('button', { name: /Isolar Incêndio/ }));
    expect(CAMADAS.filter((c) => ultimo[c] === 'VISIVEL')).toEqual(['INCENDIO']);
    expect(ultimo.ARQUITETURA).toBe('ATENUADA');
    const reexibir = within(linha('INCENDIO')).getByRole('button', { name: /Reexibir/ });
    await userEvent.click(reexibir);
    expect(ultimo).toEqual(inicial);
  });

  it('sem a preferência de base, isolar oculta também a arquitetura', async () => {
    render(<Controlado />);
    await userEvent.click(screen.getByRole('checkbox', { name: /arquitetura em meio-tom/ }));
    await userEvent.click(within(linha('MECANICA')).getByRole('button', { name: /Isolar Mecânica/ }));
    expect(ultimo.ARQUITETURA).toBe('OCULTA');
  });

  it('mostrar/ocultar todas; o botão sem efeito fica desligado dizendo por quê', async () => {
    render(<Controlado />);
    const mostrar = screen.getByRole('button', { name: /Mostrar todas/ });
    expect((mostrar as HTMLButtonElement).disabled).toBe(true);
    expect(mostrar.getAttribute('title')).toMatch(/já estão visíveis/);
    await userEvent.click(screen.getByRole('button', { name: /Ocultar todas/ }));
    expect(CAMADAS.every((c) => ultimo[c] === 'OCULTA')).toBe(true);
    expect((screen.getByRole('button', { name: /Ocultar todas/ }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /Mostrar todas/ }));
    expect(ultimo).toEqual(ESTADOS_PADRAO);
  });
});
