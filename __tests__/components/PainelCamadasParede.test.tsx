// @vitest-environment jsdom
/**
 * Editor da COMPOSIÇÃO da parede (aba Ambientes do editor de plantas).
 *
 * Pedido do usuário em 01/09/2026: "adicionar, excluir, duplicar e editar
 * quantas camadas ele quiser, e para cada camada mover a ordem, definir
 * espessura e material, com cálculo automático de área e volume". Este arquivo
 * trava exatamente essas seis ações — é o contrato com o usuário, e cada teste
 * abaixo corresponde a uma palavra daquele pedido.
 *
 * O que NÃO se testa aqui: o arraste do dnd-kit. Arrastar depende de
 * `PointerEvent` com captura, que jsdom não implementa — e é por isso que a
 * reordenação tem TAMBÉM botões ↑/↓, que são o caminho testável e, de quebra, o
 * acessível por teclado. O arraste é conferido por print no harness.
 *
 * `ConfirmProvider` vem do root do app (`index.tsx`); montar sem ele faria
 * `useConfirm` estourar na exclusão — a mesma razão de `BlueprintEditor.test`.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PainelCamadasParede from '../../components/blueprint/PainelCamadasParede';
import { ConfirmProvider } from '../../components/ui/confirm';
import { point, type CamadaParede, type Wall } from '../../utils/blueprintKernel';

// O catálogo de tipos de parede vai ao Supabase na montagem. Aqui só interessa
// que o painel não quebre sem ele — o comportamento do catálogo tem service
// próprio.
vi.mock('../../services/blueprintWallTypeService', () => ({
  listWallTypes: vi.fn().mockResolvedValue([]),
  saveWallType: vi.fn(),
}));

vi.mock('../../hooks/useOrgContext', () => ({
  useOrgContext: () => ({ orgId: 'org_1' }),
  useOrgWriteTarget: () => ({
    resolveWriteOrg: vi.fn().mockResolvedValue({ kind: 'org', orgId: 'org_1' }),
    orgTargetModal: null,
  }),
  forEachTargetOrg: vi.fn().mockResolvedValue({ ok: 1, failed: [] }),
}));

const COMPOSICAO: CamadaParede[] = [
  { espessuraMm: 25, itemCode: '87879', descricao: 'Reboco externo', funcao: 'REVESTIMENTO' },
  { espessuraMm: 140, itemCode: '103333', descricao: 'Bloco cerâmico', funcao: 'VEDACAO' },
  { espessuraMm: 25, itemCode: '87879', descricao: 'Reboco interno', funcao: 'REVESTIMENTO' },
];

function parede(over: Partial<Wall> = {}): Wall {
  return {
    id: 'wal_0001',
    levelId: 'lvl_1',
    a: point(0, 0),
    b: point(4000, 0),
    thicknessMm: 190,
    heightMm: 2800,
    camadas: COMPOSICAO,
    ...over,
  };
}

/** Medidas como `computeQuantities` as devolve para 4,00 × 2,80 m. */
const MEDIDAS = COMPOSICAO.map((c, i) => ({
  indice: i,
  itemCode: c.itemCode,
  descricao: c.descricao,
  funcao: c.funcao,
  espessuraM: c.espessuraMm / 1000,
  areaFaceM2: 11.2,
  volumeM3: (11.2 * c.espessuraMm) / 1000,
  formula: '(comprimento × altura − aberturas) × espessura da camada',
}));

function montar(over: Partial<React.ComponentProps<typeof PainelCamadasParede>> = {}) {
  const aoMudar = vi.fn();
  render(
    <ConfirmProvider>
      <PainelCamadasParede
        parede={parede()}
        medidas={MEDIDAS}
        aoMudar={aoMudar}
        {...over}
      />
    </ConfirmProvider>,
  );
  return { aoMudar };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('painel de camadas · parede homogênea', () => {
  it('oferece dividir em camadas, semeando UMA camada com a espessura atual', async () => {
    // Semear com a espessura inteira, e não com um valor arbitrário, é o que
    // faz a conversão não mexer na geometria: a soma continua sendo 150.
    const { aoMudar } = montar({ parede: parede({ camadas: undefined, thicknessMm: 150 }), medidas: [] });

    expect(screen.getByText(/parede homogênea de 150 mm/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /dividir em camadas/i }));

    expect(aoMudar).toHaveBeenCalledWith([
      { espessuraMm: 150, itemCode: '', descricao: '', funcao: 'VEDACAO' },
    ]);
  });
});

describe('painel de camadas · as seis ações do pedido', () => {
  it('ADICIONAR acrescenta uma camada no fim, sem tocar nas existentes', async () => {
    const { aoMudar } = montar();
    // `name` exato: `/camada/i` também casaria com "Mover camada 2 para cima".
    await userEvent.click(screen.getByRole('button', { name: 'Camada' }));

    const nova = aoMudar.mock.calls[0][0] as CamadaParede[];
    expect(nova).toHaveLength(4);
    expect(nova.slice(0, 3)).toEqual(COMPOSICAO);
    expect(nova[3].espessuraMm).toBe(25);
  });

  it('DUPLICAR insere a cópia logo ABAIXO da original, não no fim', async () => {
    // Duplicar para reboco dos dois lados é o caso comum, e a cópia tem de
    // nascer vizinha: jogada no fim, ela ficaria do lado errado da parede e o
    // usuário teria de reordenar toda vez.
    const { aoMudar } = montar();
    await userEvent.click(screen.getAllByTitle('Duplicar')[1]);

    const nova = aoMudar.mock.calls[0][0] as CamadaParede[];
    expect(nova).toHaveLength(4);
    expect(nova[1]).toEqual(COMPOSICAO[1]);
    expect(nova[2]).toEqual(COMPOSICAO[1]);
    expect(nova[3]).toEqual(COMPOSICAO[2]);
  });

  it('EXCLUIR pede confirmação e avisa a espessura que vai sobrar', async () => {
    const { aoMudar } = montar();
    await userEvent.click(screen.getAllByTitle('Excluir')[0]);

    // 190 − 25 = 165. O número tem de estar na pergunta: excluir camada MOVE a
    // parede, e confirmar sem saber quanto é confirmar no escuro.
    expect(await screen.findByText(/190 mm para 165 mm/i)).toBeInTheDocument();
    // Dentro do DIÁLOGO: fora dele, "Excluir" também é o title do ícone da linha.
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^excluir$/i }),
    );

    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    expect(aoMudar.mock.calls[0][0]).toEqual([COMPOSICAO[1], COMPOSICAO[2]]);
  });

  it('EXCLUIR a última camada devolve `null` — homogênea, e não lista vazia', async () => {
    // O kernel recusa `[]` (`EMPTY_LAYERS`): lista vazia e ausente seriam duas
    // escritas do mesmo estado. "Tirei a última camada" significa "voltou a ser
    // homogênea", e é isso que o painel manda.
    const uma: CamadaParede[] = [COMPOSICAO[1]];
    const { aoMudar } = montar({
      parede: parede({ camadas: uma, thicknessMm: 140 }),
      medidas: [MEDIDAS[1]],
    });

    await userEvent.click(screen.getByTitle('Excluir'));
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: /^excluir$/i }));

    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(null));
  });

  it('MOVER A ORDEM troca a camada de posição pelos botões ↑/↓', async () => {
    const { aoMudar } = montar();
    await userEvent.click(screen.getByRole('button', { name: /mover camada 2 para cima/i }));

    expect(aoMudar).toHaveBeenCalledWith([COMPOSICAO[1], COMPOSICAO[0], COMPOSICAO[2]]);
  });

  it('MOVER desabilita ↑ na primeira e ↓ na última — não há para onde ir', () => {
    montar();
    expect(screen.getByRole('button', { name: /mover camada 1 para cima/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mover camada 3 para baixo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /mover camada 2 para cima/i })).toBeEnabled();
  });

  it('EDITAR A ESPESSURA aplica o valor digitado só naquela camada', async () => {
    const { aoMudar } = montar();
    const campo = screen.getByLabelText(/espessura da camada 2, em milímetros/i);

    await userEvent.clear(campo);
    await userEvent.type(campo, '190');
    await userEvent.tab();

    expect(aoMudar).toHaveBeenCalledWith([
      COMPOSICAO[0],
      { ...COMPOSICAO[1], espessuraMm: 190 },
      COMPOSICAO[2],
    ]);
  });

  it('EDITAR A FUNÇÃO troca só a função daquela camada', async () => {
    const { aoMudar } = montar();
    await userEvent.selectOptions(screen.getByLabelText(/função da camada 1/i), 'ISOLAMENTO');

    expect(aoMudar).toHaveBeenCalledWith([
      { ...COMPOSICAO[0], funcao: 'ISOLAMENTO' },
      COMPOSICAO[1],
      COMPOSICAO[2],
    ]);
  });

  it('O MATERIAL aparece por código e descrição, e dá para desvincular', async () => {
    const { aoMudar } = montar();
    expect(screen.getByText(/103333 · Bloco cerâmico/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByText('limpar')[1]);
    expect(aoMudar).toHaveBeenCalledWith([
      COMPOSICAO[0],
      { ...COMPOSICAO[1], itemCode: '', descricao: '' },
      COMPOSICAO[2],
    ]);
  });
});

describe('painel de camadas · o cálculo automático', () => {
  it('mostra volume e área de CADA camada, na própria linha', () => {
    // "Cálculo automático de área e volume de cada" — a razão de o número morar
    // aqui, e não só na aba de quantitativos: escolher espessura sem ver quanto
    // de material aquilo dá é chute.
    montar();

    // Bloco: 11,20 × 0,140 = 1,568 m³.
    expect(screen.getByText(/1,568 m³/)).toBeInTheDocument();
    // Reboco: 11,20 × 0,025 = 0,280 m³, duas vezes (uma por face).
    expect(screen.getAllByText(/0,280 m³/)).toHaveLength(2);
    // A área de face é a mesma para as três — o vão atravessa a espessura.
    expect(screen.getAllByText(/11,20 m²/)).toHaveLength(3);
  });

  it('a espessura total é a SOMA, e aparece em leitura — não como campo', () => {
    // Com composição, `SetThickness` é recusado pelo kernel. Um campo editável
    // aqui prometeria uma edição que não acontece.
    montar();

    expect(screen.getByText('Espessura total')).toBeInTheDocument();
    expect(screen.getByText(/190 mm/)).toBeInTheDocument();
    expect(screen.getByText(/soma das camadas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/espessura total/i)).not.toBeInTheDocument();
  });
});
