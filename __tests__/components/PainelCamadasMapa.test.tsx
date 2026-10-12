// @vitest-environment jsdom
/**
 * O mapa de fundo no painel Camadas (12/10/2026): *"camada terreno trazer as
 * duas camadas (relevo e ruas)"*. O Terreno expande em Mapa: ruas e Mapa:
 * relevo, com estado próprio — a linha do Terreno continua sendo do lote.
 */
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PainelCamadas from '../../components/blueprint/PainelCamadas';
import { CAMADAS, ESTADOS_PADRAO, type ContagemDasCamadas, type EstadosDasCamadas } from '../../utils/blueprintCamadasPorDisciplina';
import { MAPA_OCULTO, type EstadosDoMapa } from '../../utils/blueprintMapaDeFundo';

const CONTAGEM: ContagemDasCamadas = {
  ...(Object.fromEntries(CAMADAS.map((c) => [c, 0])) as Record<(typeof CAMADAS)[number], number>),
  TERRENO: 4,
  ELETRICA_COMUM: 0,
};

let camadas: EstadosDasCamadas = ESTADOS_PADRAO;
let mapa: EstadosDoMapa = MAPA_OCULTO;

function Controlado({ semOndeFica = false, mapaInicial = MAPA_OCULTO }: { semOndeFica?: boolean; mapaInicial?: EstadosDoMapa }) {
  const [estados, setEstados] = useState(ESTADOS_PADRAO);
  const [m, setM] = useState(mapaInicial);
  return (
    <PainelCamadas
      estados={estados}
      onMudar={(e) => {
        camadas = e;
        setEstados(e);
      }}
      contagem={CONTAGEM}
      baseAtenuada
      onBaseAtenuada={() => {}}
      onIsolar={() => {}}
      onReexibir={() => {}}
      mapa={{
        estados: m,
        onMudar: (e) => {
          mapa = e;
          setM(e);
        },
        motivoDesligado: semOndeFica ? 'Sem "Onde fica": informe a latitude e a longitude.' : null,
      }}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  camadas = ESTADOS_PADRAO;
  mapa = MAPA_OCULTO;
});

const linhaDoMapa = (f: 'RUAS' | 'RELEVO') => document.querySelector(`li[data-mapa="${f}"]`) as HTMLElement;

describe('PainelCamadas · mapa de fundo', () => {
  it('o Terreno ganha a seta; abrir mostra as duas linhas do mapa, ocultas', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    expect(linhaDoMapa('RUAS')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Expandir Terreno' }));
    expect(within(linhaDoMapa('RUAS')).getByText('Mapa: ruas')).toBeTruthy();
    expect(within(linhaDoMapa('RELEVO')).getByText('Mapa: relevo')).toBeTruthy();
    expect(linhaDoMapa('RUAS').dataset.estado).toBe('OCULTA');
    expect(within(linhaDoMapa('RUAS')).getByText('—')).toBeTruthy();
    // Sem Isolar no mapa.
    expect(within(linhaDoMapa('RUAS')).queryByRole('button', { name: /isolar/i })).toBeNull();
  });

  it('olho e meio-tom do mapa mudam SÓ o mapa; a linha do Terreno segue sendo do lote', async () => {
    const user = userEvent.setup();
    render(<Controlado />);
    await user.click(screen.getByRole('button', { name: 'Expandir Terreno' }));
    await user.click(within(linhaDoMapa('RUAS')).getByRole('button', { name: 'Exibir Mapa: ruas' }));
    expect(mapa).toEqual({ RUAS: 'VISIVEL', RELEVO: 'OCULTA' });
    await user.click(within(linhaDoMapa('RELEVO')).getByRole('button', { name: /Mapa: relevo em meio-tom/ }));
    expect(mapa).toEqual({ RUAS: 'VISIVEL', RELEVO: 'ATENUADA' });
    expect(camadas).toBe(ESTADOS_PADRAO);
    // O olho do Terreno esconde o lote e não toca no mapa.
    const terreno = document.querySelector('li[data-camada="TERRENO"]') as HTMLElement;
    await user.click(within(terreno).getByRole('button', { name: 'Ocultar Terreno' }));
    expect(camadas.TERRENO).toBe('OCULTA');
    expect(mapa).toEqual({ RUAS: 'VISIVEL', RELEVO: 'ATENUADA' });
  });

  it('"Ocultar todas" também esconde o mapa; "Mostrar todas" não liga o mapa', async () => {
    const user = userEvent.setup();
    render(<Controlado mapaInicial={{ RUAS: 'VISIVEL', RELEVO: 'OCULTA' }} />);
    await user.click(screen.getByRole('button', { name: /Ocultar todas/ }));
    expect(mapa).toEqual(MAPA_OCULTO);
    expect(camadas.TERRENO).toBe('OCULTA');
    await user.click(screen.getByRole('button', { name: /Mostrar todas/ }));
    expect(camadas).toEqual(ESTADOS_PADRAO);
    expect(mapa).toEqual(MAPA_OCULTO);
  });

  it('com só o mapa à vista, "Ocultar todas" continua ligado (há o que ocultar)', async () => {
    const user = userEvent.setup();
    render(<Controlado mapaInicial={{ RUAS: 'ATENUADA', RELEVO: 'OCULTA' }} />);
    await user.click(screen.getByRole('button', { name: /Ocultar todas/ }));
    expect(mapa).toEqual(MAPA_OCULTO);
    expect((screen.getByRole('button', { name: /Ocultar todas/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem "Onde fica": os botões do mapa ficam desligados dizendo o porquê', async () => {
    const user = userEvent.setup();
    render(<Controlado semOndeFica />);
    await user.click(screen.getByRole('button', { name: 'Expandir Terreno' }));
    const olho = within(linhaDoMapa('RUAS')).getByRole('button', { name: 'Exibir Mapa: ruas' }) as HTMLButtonElement;
    expect(olho.disabled).toBe(true);
    expect(olho.title).toMatch(/Sem "Onde fica"/);
    await user.click(olho);
    expect(mapa).toEqual(MAPA_OCULTO);
  });

  it('sem a prop `mapa`, o Terreno continua uma linha só (nada muda para quem não usa)', () => {
    render(
      <PainelCamadas
        estados={ESTADOS_PADRAO}
        onMudar={() => {}}
        contagem={CONTAGEM}
        baseAtenuada
        onBaseAtenuada={() => {}}
        onIsolar={() => {}}
        onReexibir={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Expandir Terreno' })).toBeNull();
  });
});
