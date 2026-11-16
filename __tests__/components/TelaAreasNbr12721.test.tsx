// @vitest-environment jsdom
/**
 * Tela "Áreas NBR 12721" da Planta (13/10/2026, Fase 6 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`), refeita depois da crítica
 * `/impeccable` de 15/11/2026 (`docs/planos/2026-11-15-areas-nbr12721-critica.md`):
 * abas em dois grupos, pendências legíveis com "Resolver", travas no lote, quadros com
 * as colunas da norma, faixa de etapas e prévia; e a coluna de fração da tela Unidades.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportar = vi.hoisted(() => ({ exportarPdf: vi.fn().mockResolvedValue(undefined), exportarXlsx: vi.fn() }));
vi.mock('../../services/nbr12721ExportService', () => ({ nbr12721ExportService: exportar }));

import TelaAreasNbr12721, { type SituacaoDoDocumentoNaTela } from '../../components/blueprint/TelaAreasNbr12721';
import TelaUnidades from '../../components/blueprint/TelaUnidades';
import { ConfirmProvider } from '../../components/ui/confirm';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../utils/blueprintKernel';
import { HIPOTESES_NBR12721_PADRAO } from '../../utils/blueprintNbr12721';
import { quadroDeUnidades } from '../../utils/blueprintUnidades';

/** "1º" com 2 apartamentos de 6 × 6 m sobre um hall de 12 × 2 m (o mesmo prédio dos testes do adaptador). */
function predio(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '1º', elevationMm: 3000, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [w(0, 0, 12000, 0, 200), w(12000, 0, 12000, 8000, 200), w(12000, 8000, 0, 8000, 200), w(0, 8000, 0, 0, 200), w(0, 6000, 12000, 6000, 150), w(6000, 0, 6000, 6000, 150)]).model;
  const sala = (x: number) => m.spaces.find((s) => s.areaMm2 === 36_000_000 && Math.min(...s.ring.map((p) => p.x)) === x)!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala(0), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: sala(6000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: m.spaces.find((s) => s.areaMm2 === 24_000_000)!.id, name: 'Hall' },
  ]).model;
  return applyBatch(m, [
    { type: 'AddUnidade', numero: '101', labelIds: [m.labels.find((l) => l.name === 'Sala 101')!.id] },
    { type: 'AddUnidade', numero: '102', labelIds: [m.labels.find((l) => l.name === 'Sala 102')!.id] },
  ]).model;
}

/** O mesmo prédio com o Hall gravado como "coberta de padrão diferente" — com ou sem coeficiente. */
function comHallDiferente(coeficiente?: number): BlueprintModel {
  const m = predio();
  const hall = m.labels.find((l) => l.name === 'Hall')!.id;
  return applyCommand(m, { type: 'SetNbr12721DoAmbiente', labelIds: [hall], declaradoIds: [], nbr12721: { cobertura: 'DIFERENTE', divisao: 'PROPORCIONAL', ...(coeficiente ? { coeficiente } : {}) } } as Command).model;
}

function montar(
  model = predio(),
  onSalvarHipoteses: ((h: typeof HIPOTESES_NBR12721_PADRAO) => Promise<void>) | null = vi.fn().mockResolvedValue(undefined),
  extra: Partial<React.ComponentProps<typeof TelaAreasNbr12721>> = {},
) {
  const onRunBatch = vi.fn();
  const onDesfazer = vi.fn();
  render(
    <ConfirmProvider>
      <TelaAreasNbr12721 model={model} hipoteses={HIPOTESES_NBR12721_PADRAO} onSalvarHipoteses={onSalvarHipoteses} onRunBatch={onRunBatch} erro={null} onDesfazer={onDesfazer} {...extra} />
    </ConfirmProvider>,
  );
  return { onRunBatch, onSalvarHipoteses, onDesfazer };
}

/** Aba pelo nome exato — o contador opcional ("Classificação 3") não conta; "Quadro I" não casa "Quadro II". */
const aba = (nome: string) => screen.getByRole('tab', { name: (n) => n.replace(/\s*(\d+|não salvas)$/, '') === nome });
const lote = (fn: ReturnType<typeof vi.fn>, i = -1) => fn.mock.calls.at(i)![0] as Command[];

beforeEach(() => {
  // A aba e o filtro ficam no navegador (usePersistedState): cada teste começa do zero.
  localStorage.clear();
  exportar.exportarPdf.mockClear();
  exportar.exportarXlsx.mockClear();
});

describe('TelaAreasNbr12721', () => {
  it('oito abas em dois grupos (Entrada | Quadros), sem a aba Pendências; KPIs; Classificação lista a sugestão', () => {
    montar();
    for (const nome of ['Classificação', 'Declarados', 'Acessórios', 'Hipóteses', 'Quadro I', 'Quadro II', 'Quadro IV-B', 'Frações']) expect(aba(nome)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Pendências/ })).toBeNull();
    expect(screen.getByText('Entrada')).toBeTruthy();
    expect(screen.getByText('Quadros')).toBeTruthy();
    expect(screen.getByText('Área real')).toBeTruthy();
    const tela = screen.getByTestId('tela-areas-nbr12721');
    expect(within(tela).getByText('Hall')).toBeTruthy();
    expect(within(tela).getByText(/sugestão: Coberta de padrão · proporcional/)).toBeTruthy();
    // O título acompanha a aba (§19.1).
    expect(screen.getByRole('heading', { level: 2, name: 'Classificação dos ambientes' })).toBeTruthy();
  });

  it('"Aplicar sugestões" confirma com o resumo e a área equivalente; cancelar não grava; gravar manda UM lote e o aviso desfaz', async () => {
    const { onRunBatch, onDesfazer } = montar();
    await userEvent.click(screen.getByRole('button', { name: /Aplicar sugestões \(3\)/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/Gravar a sugestão da Planta em 3 ambientes/)).toBeTruthy();
    expect(within(dialogo).getByText('Coberta de padrão: 2 ambientes')).toBeTruthy();
    expect(within(dialogo).getByText(/Área equivalente:/)).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(onRunBatch).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Aplicar sugestões \(3\)/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gravar sugestões' }));
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    expect(lote(onRunBatch)).toHaveLength(3);
    expect(lote(onRunBatch).every((c) => c.type === 'SetNbr12721DoAmbiente')).toBe(true);
    expect(screen.getByText('3 ambientes classificados pela sugestão da Planta.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onDesfazer).toHaveBeenCalledTimes(1);
  });

  it('sem unidades, a confirmação avisa que TUDO vai como comum', async () => {
    let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
    m = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: m.levels[0].id, nome: 'Suíte', areaMm2: 12_000_000 }).model;
    montar(m);
    await userEvent.click(screen.getByRole('button', { name: /Aplicar sugestões \(1\)/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/não tem unidades: TODOS os ambientes vão como área comum/)).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: 'Gravar mesmo assim' })).toBeTruthy();
  });

  it('clicar na linha abre o drawer DAQUELE ambiente; aplicar não apaga a seleção em lote que já existia', async () => {
    const { onRunBatch } = montar();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Sala 101 (1º)' }));
    expect(screen.getByText('1 ambiente selecionado')).toBeTruthy();
    await userEvent.click(screen.getByText('Hall'));
    expect(await screen.findByText('Classificar Hall')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Cobertura'), 'DIFERENTE');
    await userEvent.type(screen.getByLabelText('Coeficiente de equivalência'), '0,5');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(lote(onRunBatch)).toEqual([expect.objectContaining({ type: 'SetNbr12721DoAmbiente', nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' } })]);
    expect(screen.getByText('1 ambiente selecionado')).toBeTruthy();
  });

  it('lote com valores diferentes: o campo diz "valores diferentes" e aplicar MANTÉM o de cada ambiente', async () => {
    const { onRunBatch } = montar(comHallDiferente(0.5));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Hall (1º)' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Sala 101 (1º)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Classificar em lote' }));
    expect(await screen.findByText('Classificar 2 ambientes')).toBeTruthy();
    expect((screen.getByLabelText('Cobertura') as HTMLSelectElement).value).toBe('__misto');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const cmds = lote(onRunBatch) as unknown as { nbr12721: { cobertura: string; coeficiente?: number } }[];
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => c.nbr12721.cobertura).sort()).toEqual(['DIFERENTE', 'PADRAO']);
    expect(cmds.find((c) => c.nbr12721.cobertura === 'DIFERENTE')!.nbr12721.coeficiente).toBe(0.5);
    // A seleção que foi aplicada sai.
    expect(screen.queryByText(/selecionados?$/)).toBeNull();
  });

  it('"Voltar à sugestão da Planta" pede confirmação antes de apagar a classificação gravada', async () => {
    const { onRunBatch } = montar(comHallDiferente(0.5));
    await userEvent.click(screen.getByText('Hall'));
    await userEvent.click(await screen.findByRole('button', { name: 'Voltar à sugestão da Planta' }));
    expect(await screen.findByText('Voltar "Hall" à sugestão da Planta?')).toBeTruthy();
    expect(onRunBatch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à sugestão' }));
    expect(lote(onRunBatch)).toEqual([expect.objectContaining({ type: 'SetNbr12721DoAmbiente', nbr12721: null })]);
  });

  it('pendência que bloqueia diz o AMBIENTE (não o uid) e "Resolver" leva ao drawer dele e ao campo das Hipóteses', async () => {
    montar(comHallDiferente());
    const faixa = screen.getByRole('region', { name: /O cálculo está bloqueado/ });
    expect(within(faixa).getByText('Área fora do padrão sem coeficiente')).toBeTruthy();
    expect(within(faixa).getByText('Hall · 1º')).toBeTruthy();
    expect(within(faixa).queryByText(/[0-9a-f]{8}-[0-9a-f]{4}/)).toBeNull();
    // Com o cálculo bloqueado, as áreas não afirmam zero.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    await userEvent.click(within(faixa).getByRole('button', { name: 'Classificar o ambiente' }));
    expect(await screen.findByText('Classificar Hall')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(faixa).getByRole('button', { name: 'Definir o padrão em Hipóteses' }));
    expect(aba('Hipóteses').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('hip-diferente');
  });

  it('Quadro I com as colunas da norma: grupos em dois níveis, "(n)" em cada coluna e total; Frações fecham 1000 milésimos', async () => {
    montar();
    await userEvent.click(aba('Quadro I'));
    expect(screen.getByRole('columnheader', { name: 'Área privativa' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Total do pavimento' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: /Coberta padrão \(2\)/ }).length).toBe(1);
    expect(screen.getAllByRole('columnheader', { name: /Real \(17\)/ }).length).toBe(1);
    expect(screen.getByText('1º')).toBeTruthy();
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0);
    await userEvent.click(aba('Frações'));
    expect(screen.getAllByText('1.000,0000').length).toBeGreaterThan(0);
  });

  it('Hipóteses: o que foi digitado sobrevive à troca de aba e a aba avisa "não salvas"; salvar grava', async () => {
    const { onSalvarHipoteses } = montar();
    await userEvent.click(aba('Hipóteses'));
    const salvar = screen.getByRole('button', { name: 'Salvar hipóteses' });
    expect((salvar as HTMLButtonElement).disabled).toBe(true);
    expect(salvar.getAttribute('title')).toBe('Nada mudou');
    await userEvent.type(screen.getByLabelText('Coberta de padrão diferente'), '0,75');
    await userEvent.click(aba('Quadro I'));
    expect(aba('Hipóteses').textContent).toContain('não salvas');
    await userEvent.click(aba('Hipóteses'));
    expect((screen.getByLabelText('Coberta de padrão diferente') as HTMLInputElement).value).toBe('0,75');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar hipóteses' }));
    expect(onSalvarHipoteses).toHaveBeenCalledWith(expect.objectContaining({ coeficientesPadrao: { DIFERENTE: 0.75, DESCOBERTA: null } }));
  });

  it('sem permissão de editar, o botão de salvar hipóteses diz o motivo', async () => {
    montar(predio(), null);
    await userEvent.click(aba('Hipóteses'));
    expect(screen.getByRole('button', { name: 'Salvar hipóteses' }).getAttribute('title')).toBe('Sem permissão para editar as hipóteses deste estudo');
  });

  it('faixa de etapas: sem versão, o próximo passo é publicar e "Abrir Versões" chama o editor; bloqueado, leva às pendências', async () => {
    const onAbrirVersoes = vi.fn();
    const pronto: SituacaoDoDocumentoNaTela = { estado: 'pronto', versao: null, empreendimento: { nome: '011 - Garden', fracoesLevadas: false } };
    montar(predio(), undefined, { situacaoDoDocumento: pronto, onAbrirVersoes });
    const etapas = screen.getByRole('list', { name: 'Etapas do documento da incorporação' });
    expect(within(etapas).getAllByRole('listitem')).toHaveLength(5);
    expect(within(etapas).getByText('Versão publicada').closest('li')!.getAttribute('aria-current')).toBe('step');
    await userEvent.click(screen.getByRole('button', { name: /Abrir Versões/ }));
    expect(onAbrirVersoes).toHaveBeenCalled();
  });

  it('"Baixar prévia" exporta o documento do rascunho marcado como prévia', async () => {
    montar(predio(), undefined, { nomeDoEstudo: 'Garden' });
    await userEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(exportar.exportarPdf).toHaveBeenCalledWith(expect.objectContaining({ previa: true, estudo: 'Garden', hash: '' }));
  });
});

describe('TelaUnidades — a coluna de fração diz QUAL fração', () => {
  const base = (fracoesNbr12721: React.ComponentProps<typeof TelaUnidades>['fracoesNbr12721']) => {
    const m = predio();
    render(<TelaUnidades model={m} quadro={quadroDeUnidades(m)} onRun={vi.fn()} onRunBatch={vi.fn()} erro={null} fracoesNbr12721={fracoesNbr12721} />);
  };

  it('com o Quadro IV-B: "Fração ideal (NBR 12721)" em milésimos', () => {
    base({ porNumero: new Map([['101', { decimal: 0.5, milesimos: 500 }], ['102', { decimal: 0.5, milesimos: 500 }]]), motivo: null });
    expect(screen.getByText('Fração ideal (NBR 12721)')).toBeTruthy();
    expect(screen.getAllByText('500,0000 ‰')).toHaveLength(2);
    expect(screen.queryByText('Fração estimada (sem coeficiente)')).toBeNull();
  });

  it('bloqueado: "Fração estimada (sem coeficiente)" e o motivo', () => {
    base({ porNumero: null, motivo: 'O quadro NBR 12721 está bloqueado (MOTOR_007: x)' });
    expect(screen.getByText('Fração estimada (sem coeficiente)')).toBeTruthy();
    expect(screen.getByText(/está bloqueado \(MOTOR_007/)).toBeTruthy();
    expect(screen.queryByText('Fração ideal (NBR 12721)')).toBeNull();
  });
});

describe('TelaAreasNbr12721 — Acessórios e Ambientes declarados (Fase 6b)', () => {
  function comVagaEDeclarado() {
    let m = predio();
    m = applyCommand(m, { type: 'AddVaga', levelId: m.levels[0].id, at: point(3000, 7000) }).model;
    return applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: m.levels[0].id, nome: 'Depósito 7', areaMm2: 3_000_000 }).model;
  }

  it('Acessórios: escolher a unidade dona manda um lote SetAcessoriosDaUnidade; marcar "no coeficiente" exige dona', async () => {
    const { onRunBatch } = montar(comVagaEDeclarado());
    await userEvent.click(aba('Acessórios'));
    const deposito = screen.getByLabelText('Unidade dona de Depósito 7');
    expect((screen.getByLabelText('Depósito 7: entra no coeficiente') as HTMLInputElement).disabled).toBe(true);
    await userEvent.selectOptions(deposito, '102');
    expect(lote(onRunBatch, 0)).toEqual([expect.objectContaining({ type: 'SetAcessoriosDaUnidade', acessorios: [expect.objectContaining({ afetaPrivativa: true, afetaCoeficiente: true })] })]);
  });

  it('Ambientes declarados: lista, adiciona pela barra (motivo quando falta área), excluir pede confirmação; "a classificar" abre o drawer', async () => {
    const { onRunBatch } = montar(comVagaEDeclarado());
    await userEvent.click(aba('Declarados'));
    expect((screen.getByLabelText('Nome do ambiente declarado Depósito 7') as HTMLInputElement).value).toBe('Depósito 7');
    const adicionar = screen.getByRole('button', { name: /Adicionar/ });
    await userEvent.type(screen.getByLabelText('Nome do novo ambiente'), 'Guarita');
    expect(adicionar.parentElement!.getAttribute('title')).toBe('Informe a área em m²');
    await userEvent.type(screen.getByLabelText('Área do novo ambiente (m²)'), '6,5');
    await userEvent.click(adicionar);
    expect(lote(onRunBatch)).toEqual([expect.objectContaining({ type: 'AddAmbienteDeclarado', nome: 'Guarita', areaMm2: 6_500_000 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Excluir Depósito 7' }));
    expect(await screen.findByText('Excluir "Depósito 7"?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(lote(onRunBatch)).toEqual([expect.objectContaining({ type: 'DeleteAmbienteDeclarado' })]);
    await userEvent.click(screen.getByRole('button', { name: /A classificar — classificar agora/ }));
    expect(await screen.findByText('Classificar Depósito 7')).toBeTruthy();
  });
});

describe('Hipóteses — salvar com o estado de verdade (achado da prova no app real, 14/10)', () => {
  it('Fase 10: só leitura (sem canEditAreaEngine) — aviso, nada grava, cada controle diz o motivo; ler e buscar seguem', async () => {
    const motivo = 'Seu usuário não tem permissão para editar as Áreas NBR 12721 nesta organização.';
    const onRunBatch = vi.fn();
    let m = predio();
    m = applyCommand(m, { type: 'AddAmbienteDeclarado', levelId: m.levels[0].id, nome: 'Depósito', areaMm2: 4_000_000 }).model;
    render(
      <ConfirmProvider>
        <TelaAreasNbr12721 model={m} hipoteses={HIPOTESES_NBR12721_PADRAO} onSalvarHipoteses={null} onRunBatch={onRunBatch} erro={null} somenteLeitura={motivo} />
      </ConfirmProvider>,
    );
    expect(screen.getByTestId('areas-somente-leitura').textContent).toContain(motivo);
    // Classificação: sem seleção em lote, linha não clicável; "Aplicar sugestões" desligado com o motivo.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.querySelectorAll('tr[tabindex]')).toHaveLength(0);
    const aplicar = screen.getByRole('button', { name: /Aplicar sugestões/ });
    expect((aplicar as HTMLButtonElement).disabled).toBe(true);
    expect(aplicar.parentElement!.getAttribute('title')).toBe(motivo);
    // Ambientes declarados: campos e "Adicionar" desligados com o motivo; a busca continua.
    await userEvent.click(aba('Declarados'));
    const nome = screen.getByLabelText('Nome do ambiente declarado Depósito') as HTMLInputElement;
    expect(nome.disabled).toBe(true);
    expect(nome.getAttribute('title')).toBe(motivo);
    const adicionar = screen.getByRole('button', { name: /Adicionar/ });
    expect((adicionar as HTMLButtonElement).disabled).toBe(true);
    expect(adicionar.parentElement!.getAttribute('title')).toBe(motivo);
    expect((screen.getByPlaceholderText(/Buscar ambiente/) as HTMLInputElement).disabled).toBe(false);
    // Acessórios: a dona desligada com o motivo.
    await userEvent.click(aba('Acessórios'));
    const dona = screen.getByLabelText('Unidade dona de Depósito') as HTMLSelectElement;
    expect(dona.disabled).toBe(true);
    expect(dona.getAttribute('title')).toBe(motivo);
    // Hipóteses: salvar diz o motivo de verdade, não o genérico.
    await userEvent.click(aba('Hipóteses'));
    expect(screen.getByRole('button', { name: /Salvar hipóteses/ }).getAttribute('title')).toBe(motivo);
    expect(onRunBatch).not.toHaveBeenCalled();
  });

  it('as hipóteses que voltam do salvar NÃO apagam o "Hipóteses salvas."; o campo mostra o valor gravado', async () => {
    function ComEstado() {
      const [h, setH] = React.useState(HIPOTESES_NBR12721_PADRAO);
      return (
        <ConfirmProvider>
          <TelaAreasNbr12721 model={predio()} hipoteses={h} onSalvarHipoteses={async (n) => setH({ ...n })} onRunBatch={vi.fn()} erro={null} />
        </ConfirmProvider>
      );
    }
    render(<ComEstado />);
    await userEvent.click(aba('Hipóteses'));
    await userEvent.type(screen.getByLabelText('Coberta de padrão diferente'), '0,75');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar hipóteses' }));
    expect(await screen.findByText('Hipóteses salvas.')).toBeTruthy();
    expect((screen.getByLabelText('Coberta de padrão diferente') as HTMLInputElement).value).toBe('0,75');
    expect(screen.getByRole('button', { name: 'Salvar hipóteses' }).getAttribute('title')).toBe('Nada mudou');
  });
});
