// @vitest-environment jsdom
/**
 * AS OPÇÕES DO EXIBIR NAS CAMADAS (25/11/2026). Pedido: *"o que tem em exibir que falta implementar nas camadas como
 * exemplo da terraplanagem?"* → *"Implemente, sem mover para as Camadas os itens de medidas e preenchimento do
 * terreno."* O Terreno expande também em Curvas de nível, Corte e aterro, Declividade, Hipsométrico, Feições, Nós da
 * grade e Envelope; a Estrutura expande em Eixos. Cada linha é o MESMO item do Exibir (`ItemDeExibicao`): o olho
 * chama o `alternar` dele, e item sem efeito fica desligado dizendo o motivo.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mountain } from 'lucide-react';
import PainelCamadas from '../../components/blueprint/PainelCamadas';
import type { ItemDeExibicao } from '../../components/blueprint/MenuExibir';
import { CAMADAS, ESTADOS_PADRAO, type ContagemDasCamadas } from '../../utils/blueprintCamadasPorDisciplina';

const CONTAGEM: ContagemDasCamadas = {
  ...(Object.fromEntries(CAMADAS.map((c) => [c, 0])) as Record<(typeof CAMADAS)[number], number>),
  TERRENO: 4,
  ELETRICA_COMUM: 0,
};

const item = (chave: string, rotulo: string, extra: Partial<ItemDeExibicao> = {}): ItemDeExibicao => ({
  chave,
  rotulo,
  ajuda: `ajuda de ${rotulo}`,
  ligado: false,
  alternar: vi.fn(),
  icone: Mountain,
  ...extra,
});

function montar(exibicao: Parameters<typeof PainelCamadas>[0]['exibicao']) {
  localStorage.clear();
  render(
    <PainelCamadas
      estados={ESTADOS_PADRAO}
      onMudar={() => {}}
      contagem={CONTAGEM}
      baseAtenuada
      onBaseAtenuada={() => {}}
      onIsolar={() => {}}
      onReexibir={() => {}}
      exibicao={exibicao}
    />,
  );
}

const linha = (chave: string) => document.querySelector(`li[data-exibir="${chave}"]`) as HTMLElement | null;

describe('PainelCamadas · opções do Exibir como sublinhas', () => {
  it('⚠️ PRONTO QUANDO: o Terreno abre em "Corte e aterro" e o olho liga/desliga pelo mesmo item do Exibir', async () => {
    const corte = item('terraplenagem', 'Corte e aterro', { ligado: true });
    montar({ TERRENO: [item('curvas-de-nivel', 'Curvas de nível'), corte] });
    expect(linha('terraplenagem')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Terreno' }));
    expect(linha('terraplenagem')).not.toBeNull();
    expect(linha('curvas-de-nivel')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar Corte e aterro' }));
    expect(corte.alternar).toHaveBeenCalledTimes(1);
  });

  it('item desligado (sem efeito agora): o olho fica desligado e diz o motivo', async () => {
    montar({ TERRENO: [item('declividade', 'Declividade', { desabilitado: true, ajuda: 'Não há topografia gerada.' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Terreno' }));
    const olho = screen.getByRole('button', { name: 'Exibir Declividade' });
    expect(olho).toBeDisabled();
    expect(olho.getAttribute('title')).toBe('Não há topografia gerada.');
  });

  it('a Estrutura ganha a seta e abre em Eixos', async () => {
    const eixos = item('eixos', 'Eixos', { ligado: false });
    montar({ ESTRUTURA: [eixos] });
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Estrutura' }));
    await userEvent.click(screen.getByRole('button', { name: 'Exibir Eixos' }));
    expect(eixos.alternar).toHaveBeenCalledTimes(1);
  });

  it('sem opções, Terreno e Estrutura continuam linhas simples (sem seta)', () => {
    montar(undefined);
    expect(screen.queryByRole('button', { name: 'Expandir Terreno' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expandir Estrutura' })).toBeNull();
  });
});
