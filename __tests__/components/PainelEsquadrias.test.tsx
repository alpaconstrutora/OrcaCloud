// @vitest-environment jsdom
/**
 * ESQUADRIAS EM LOTE (24/09/2026, P2.49).
 *
 * ⚠️ O número que motivou esta tela é real, medido na planta do usuário depois
 * da importação DXF: **104 esquadrias, 0 com tipo, 0 com item**. E
 * `blueprintBudget` pula a esquadria sem tipo ANTES de gerar linha OU
 * divergência (`if (!e.declarada) continue`) — a planta inteira não produzia
 * uma linha de esquadria no orçamento e não acusava nada. O caminho que
 * existia era nomear uma a uma, no painel do selecionado, 104 vezes.
 *
 * O que se trava aqui é o contrato, não o visual:
 *
 *   1. o aviso diz quantas PEÇAS estão fora do orçamento (não quantos tipos);
 *   2. "Nomear automaticamente" numera por tipo, do mais numeroso ao menos, e
 *      NÃO renomeia quem já tem nome — nem repete um nome já usado;
 *   3. aplicar manda UM lote com todas as aberturas de cada grupo;
 *   4. nome vazio não vira esquadria (o kernel recusa);
 *   5. clicar no tipo seleciona as aberturas dele no desenho.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PainelEsquadrias from '../../components/blueprint/PainelEsquadrias';
import type { QuantidadePorEsquadria } from '../../utils/blueprintKernel/quantities';

vi.mock('../../services/blueprintOpeningTypeService', () => ({
  listOpeningTypes: vi.fn().mockResolvedValue([]),
  saveOpeningType: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../hooks/useOrgContext', () => ({
  useOrgContext: () => ({ orgId: 'org_1' }),
  useOrgWriteTarget: () => ({
    resolveWriteOrg: vi.fn().mockResolvedValue({ kind: 'org', orgId: 'org_1' }),
    orgTargetModal: null,
  }),
  forEachTargetOrg: vi.fn().mockResolvedValue({ ok: 1, failed: [] }),
}));

const buscarNoSinapi = vi.fn();
vi.mock('../../services/sinapiService', () => ({
  sinapiService: { search: (...a: unknown[]) => buscarNoSinapi(...a) },
}));

vi.mock('../../components/DatabasePickerModal', () => ({
  default: ({ isOpen, onSelect }: { isOpen: boolean; onSelect: (i: { code: string; description: string }) => void }) =>
    isOpen ? (
      <button type="button" onClick={() => onSelect({ code: '90843', description: 'Porta semi-oca' })}>
        escolher-item-dublê
      </button>
    ) : null,
}));

/** Um grupo do quadro; por padrão SEM tipo declarado, como sai da importação. */
function grupo(over: Partial<QuantidadePorEsquadria> = {}): QuantidadePorEsquadria {
  const larguraM = over.larguraM ?? 0.8;
  const alturaM = over.alturaM ?? 2.1;
  const tipo = over.tipo ?? 'door';
  const nome = over.nome ?? `Porta ${larguraM * 100}×${alturaM * 100}`;
  return {
    assinatura: over.assinatura ?? `${tipo}|${larguraM * 1000}|${alturaM * 1000}||`,
    declarada: over.declarada ?? false,
    nome,
    tipo,
    larguraM,
    alturaM,
    itemCode: over.itemCode ?? '',
    descricao: over.descricao ?? '',
    quantidade: over.quantidade ?? 1,
    areaM2: larguraM * alturaM * (over.quantidade ?? 1),
    openingIds: over.openingIds ?? ['o1'],
  };
}

const onAplicar = vi.fn();
const onSelecionar = vi.fn();

function montar(grupos: QuantidadePorEsquadria[]) {
  onAplicar.mockClear();
  onSelecionar.mockClear();
  render(<PainelEsquadrias grupos={grupos} onAplicar={onAplicar} onSelecionar={onSelecionar} />);
}

beforeEach(() => vi.clearAllMocks());

describe('PainelEsquadrias · o quadro em lote', () => {
  it('anuncia quantas PEÇAS estão fora do orçamento, não quantos tipos', () => {
    montar([
      grupo({ quantidade: 35, openingIds: Array.from({ length: 35 }, (_, i) => `p${i}`) }),
      grupo({ assinatura: 'window|1200|1000||', tipo: 'window', larguraM: 1.2, alturaM: 1, quantidade: 51, openingIds: Array.from({ length: 51 }, (_, i) => `j${i}`) }),
    ]);
    expect(screen.getByTestId('resumo-esquadrias-lote')).toHaveTextContent('86 esquadria(s) em 2 tipo(s)');
    // 86 peças, e não "2 tipos": é a peça que fica fora do orçamento.
    expect(screen.getByTestId('aviso-sem-tipo')).toHaveTextContent('86 peça(s) fora hoje');
  });

  it('nomeia por tipo, do mais numeroso ao menos — P1 é a porta que mais se repete', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 3, larguraM: 0.7 }),
      grupo({ assinatura: 'b', quantidade: 12, larguraM: 0.8 }),
      grupo({ assinatura: 'c', tipo: 'window', larguraM: 1.2, alturaM: 1, quantidade: 8 }),
      grupo({ assinatura: 'd', tipo: 'sliding', larguraM: 1.5, alturaM: 2.1, quantidade: 2 }),
    ]);
    await user.click(screen.getByTestId('nomear-automaticamente'));
    const nomes = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value);
    // A TABELA segue a mesma ordem da numeração — porta, correr, janela; dentro
    // de cada tipo, do mais numeroso ao menos. Medido no app: numerar por uma
    // ordem e listar por outra devolvia "J5, J2, J4, J21…" na tela.
    expect(nomes).toEqual(['P1', 'P2', 'PC1', 'J1']);
  });

  it('⚠️ não renomeia quem já tem nome, e não repete um nome que já existe no desenho', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 9, nome: 'P1', declarada: true }),
      grupo({ assinatura: 'b', quantidade: 20, larguraM: 0.9 }),
    ]);
    await user.click(screen.getByTestId('nomear-automaticamente'));
    const nomes = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value);
    // A nova tem 20 peças e encabeça a lista; a existente (9) vem depois. A nova
    // NÃO pode virar "P1", que já está no desenho — vai para "P2".
    expect(nomes).toEqual(['P2', 'P1']);
  });

  it('aplicar manda UM lote com todas as aberturas do grupo, e só o que mudou', async () => {
    const user = userEvent.setup();
    montar([
      grupo({ assinatura: 'a', quantidade: 3, openingIds: ['o1', 'o2', 'o3'] }),
      grupo({ assinatura: 'b', quantidade: 1, larguraM: 0.9, openingIds: ['o9'] }),
    ]);
    const [primeiro] = screen.getAllByRole('textbox');
    await user.type(primeiro, 'P1');
    await user.click(screen.getByTestId('aplicar-esquadrias'));

    expect(onAplicar).toHaveBeenCalledTimes(1);
    const mudancas = onAplicar.mock.calls[0][0];
    // Só o grupo tocado, com as TRÊS aberturas dele.
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0].openingIds).toEqual(['o1', 'o2', 'o3']);
    expect(mudancas[0].esquadria).toEqual({ nome: 'P1', itemCode: '', descricao: '' });
  });

  it('nome vazio não vira esquadria: o item sozinho não é tipo', async () => {
    const user = userEvent.setup();
    montar([grupo({ assinatura: 'a', openingIds: ['o1'] })]);
    await user.click(screen.getByRole('button', { name: /Item do tipo/ }));
    await user.click(screen.getByRole('button', { name: 'escolher-item-dublê' }));
    // O item entrou no rascunho e o botão de aplicar habilitou…
    expect(screen.getByRole('button', { name: /Item do tipo/ })).toHaveTextContent('90843');
    await user.click(screen.getByTestId('aplicar-esquadrias'));
    // …mas sem nome nada é aplicado, e a tela diz por quê.
    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.getByTestId('aviso-esquadrias-lote')).toHaveTextContent('dê um nome ao tipo antes');
  });

  it('clicar no tipo seleciona as aberturas dele no desenho', async () => {
    const user = userEvent.setup();
    montar([grupo({ assinatura: 'a', quantidade: 2, openingIds: ['o1', 'o2'] })]);
    await user.click(screen.getByRole('button', { name: 'Porta' }));
    expect(onSelecionar).toHaveBeenCalledWith(['o1', 'o2']);
  });

  it('sem esquadria no pavimento, diz isso — e explica que vão livre não conta', () => {
    montar([]);
    expect(screen.getByTestId('esquadrias-vazio')).toHaveTextContent('não há caixilho a orçar');
  });
});

/**
 * UNIFICAR TIPOS PRÓXIMOS (P2.50) — a parte do painel.
 *
 * ⚠️ A conta mora em `blueprintUnificarEsquadrias` (precisa do modelo, para
 * saber se a medida nova cabe na parede) e tem teste próprio. Aqui se trava o
 * que o painel promete: a PRÉVIA antes do botão, o que não cabe dito na tela,
 * e a tolerância em centímetro subindo em milímetro.
 */
describe('PainelEsquadrias · unificar tipos próximos', () => {
  const unificacao = {
    alvo: { assinatura: 'a', kind: 'door' as const, larguraMm: 800, alturaMm: 2100, esquadria: { nome: 'P1', itemCode: '', descricao: '' }, aberturas: [] },
    absorvidos: [
      { assinatura: 'b', kind: 'door' as const, larguraMm: 802, alturaMm: 2100, esquadria: null, aberturas: [{ openingId: 'o2', maxLarguraMm: 5000, maxAlturaMm: 2800 }] },
    ],
    pecas: 1,
    naoCabem: [{ openingId: 'o9', motivo: 'largura 800 mm não cabe: sobram 770 mm de parede' }],
  };

  it('mostra a PRÉVIA item a item, com o que não cabe, antes de qualquer botão', () => {
    const onUnificar = vi.fn();
    render(
      <PainelEsquadrias
        grupos={[grupo({ assinatura: 'a', quantidade: 12 }), grupo({ assinatura: 'b', larguraM: 0.802 })]}
        onAplicar={vi.fn()}
        onSelecionar={vi.fn()}
        unificacoes={[unificacao]}
        toleranciaMm={20}
        onUnificar={onUnificar}
      />,
    );
    const previa = screen.getByTestId('previa-unificacao');
    expect(previa).toHaveTextContent('80,2×210');
    expect(previa).toHaveTextContent('80×210 cm (P1)');
    expect(previa).toHaveTextContent('1 peça(s)');
    // O que não cabe é dito, não escondido.
    expect(previa).toHaveTextContent('1 não cabe(m) e fica(m) como está');
  });

  it('o botão entrega a proposta inteira e só existe com proposta', async () => {
    const user = userEvent.setup();
    const onUnificar = vi.fn();
    const { rerender } = render(
      <PainelEsquadrias grupos={[grupo()]} onAplicar={vi.fn()} onSelecionar={vi.fn()} unificacoes={[unificacao]} onUnificar={onUnificar} />,
    );
    await user.click(screen.getByTestId('unificar-agora'));
    expect(onUnificar).toHaveBeenCalledWith([unificacao]);

    // Sem proposta: botão desabilitado e a tela explica.
    rerender(<PainelEsquadrias grupos={[grupo()]} onAplicar={vi.fn()} onSelecionar={vi.fn()} unificacoes={[]} onUnificar={onUnificar} />);
    expect(screen.getByTestId('unificar-agora')).toBeDisabled();
    expect(screen.getByTestId('unificar-nada')).toHaveTextContent('Nenhum tipo a menos de 2 cm');
  });

  it('a tolerância é digitada em CENTÍMETRO e sobe em milímetro', async () => {
    const user = userEvent.setup();
    const onTolerancia = vi.fn();
    // Com ESTADO, como no editor: o campo é controlado, e um `toleranciaMm` fixo
    // faria o valor voltar a cada tecla — o teste mediria o próprio dúblê.
    function Controlado() {
      const [mm, setMm] = React.useState(20);
      return (
        <PainelEsquadrias
          grupos={[grupo()]}
          onAplicar={vi.fn()}
          onSelecionar={vi.fn()}
          unificacoes={[]}
          toleranciaMm={mm}
          onTolerancia={(v) => {
            onTolerancia(v);
            setMm(v);
          }}
          onUnificar={vi.fn()}
        />
      );
    }
    render(<Controlado />);
    const campo = screen.getByLabelText(/Tolerância para unificar/) as HTMLInputElement;
    expect(campo.value).toBe('2');
    await user.clear(campo);
    await user.type(campo, '5');
    expect(onTolerancia).toHaveBeenLastCalledWith(50);
    expect(campo.value).toBe('5');
  });

  it('sem `onUnificar`, o bloco nem aparece — quem não tem o modelo não oferece a ação', () => {
    render(<PainelEsquadrias grupos={[grupo()]} onAplicar={vi.fn()} onSelecionar={vi.fn()} />);
    expect(screen.queryByTestId('unificar-tipos')).toBeNull();
  });
});

/**
 * SUGERIR ITEM PELA MEDIDA (P2.53) — a parte do painel.
 *
 * A regra tem teste próprio (`blueprintItemPorMedida.test.ts`, com descrições
 * reais do SINAPI). Aqui fica o contrato da tela: a sugestão só preenche o
 * rascunho, não sobrescreve escolha feita, e o aviso põe a dúvida no lugar
 * certo — a mesma medida serve a madeira, alumínio e corta-fogo.
 */
describe('PainelEsquadrias · sugerir item pela medida', () => {
  const CATALOGO = [
    { code: '39496', description: 'KIT PORTA PRONTA DE MADEIRA, FOLHA MEDIA DE 800 X 2100 MM', unit: 'UN' },
    { code: '94570', description: 'JANELA DE ALUMINIO DE CORRER, 120X120 CM, COM VIDRO', unit: 'M2' },
  ];

  it('preenche o item dos tipos cuja medida bate, e avisa para conferir', async () => {
    const user = userEvent.setup();
    buscarNoSinapi.mockResolvedValue(CATALOGO);
    montar([
      grupo({ assinatura: 'a', larguraM: 0.8, alturaM: 2.1, quantidade: 5 }),
      grupo({ assinatura: 'b', tipo: 'window', larguraM: 1.2, alturaM: 1.2, quantidade: 3 }),
    ]);
    await user.click(screen.getByTestId('sugerir-itens'));
    await screen.findByText(/2 tipo\(s\) com item sugerido/);
    const itens = screen.getAllByRole('button', { name: /Item do tipo/ }).map((b) => b.textContent);
    expect(itens.join(' ')).toContain('39496');
    expect(itens.join(' ')).toContain('94570');
    // ⚠️ O aviso tem de pôr a dúvida no lugar certo.
    expect(screen.getByTestId('aviso-esquadrias-lote')).toHaveTextContent('madeira, alumínio e corta-fogo');
  });

  it('⚠️ não sobrescreve item já escolhido — sugestão não desfaz decisão', async () => {
    const user = userEvent.setup();
    buscarNoSinapi.mockResolvedValue(CATALOGO);
    montar([grupo({ assinatura: 'a', larguraM: 0.8, alturaM: 2.1, itemCode: '11111', descricao: 'Escolhido à mão' })]);
    await user.click(screen.getByTestId('sugerir-itens'));
    await screen.findByText(/Nenhum item do catálogo bate|tipo\(s\) com item/);
    expect(screen.getByRole('button', { name: /Item do tipo/ })).toHaveTextContent('11111');
  });

  it('catálogo fora do ar não quebra a tela — diz o que fazer', async () => {
    const user = userEvent.setup();
    buscarNoSinapi.mockRejectedValue(new Error('rede'));
    montar([grupo({ assinatura: 'a' })]);
    await user.click(screen.getByTestId('sugerir-itens'));
    await screen.findByText(/Não consegui ler o catálogo/);
  });
});
