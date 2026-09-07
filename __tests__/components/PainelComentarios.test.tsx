// @vitest-environment jsdom
/**
 * O painel de comentários ancorados.
 *
 * ─── O QUE ESTA TELA PRECISA DIZER, E QUASE NENHUMA DIZ ─────────────────────
 *
 * Que o elemento comentado SUMIU. Um comentário sobre uma parede apagada não
 * pode desaparecer da lista: quem o escreveu nunca saberia que o assunto virou
 * pó junto com a peça. Metade dos casos abaixo é sobre isso.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point } from '../../utils/blueprintKernel';
import type { BlueprintComment } from '../../services/blueprintCommentService';

const estado: { comentarios: BlueprintComment[] } = { comentarios: [] };
const criar = vi.fn(async () => estado.comentarios[0]);
const resolver = vi.fn(async () => estado.comentarios[0]);

vi.mock('../../services/blueprintCommentService', () => ({
  listarComentarios: vi.fn(async () => estado.comentarios),
  criarComentario: (...a: unknown[]) => criar(...(a as [])),
  resolverComentario: (...a: unknown[]) => resolver(...(a as [])),
  apagarComentario: vi.fn(async () => {}),
}));

import PainelComentarios from '../../components/blueprint/PainelComentarios';

const casa = () => {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'T',
    elevationMm: 0,
    defaultHeightMm: 2800,
  }).model;
  return applyBatch(base, [
    {
      type: 'AddWall',
      levelId: base.levels[0].id,
      a: point(0, 0),
      b: point(4000, 0),
      thicknessMm: 150,
      heightMm: 2800,
    },
  ]).model;
};

const comentario = (over: Partial<BlueprintComment> = {}): BlueprintComment =>
  ({
    id: 'c1',
    organization_id: 'org',
    study_id: 'est',
    snapshot_id: null,
    element_uid: null,
    ponto_x_mm: 100,
    ponto_y_mm: 100,
    level_uid: null,
    texto: 'Conferir a espessura aqui',
    autor_email: 'eu@x.com',
    resolvido_em: null,
    resolvido_por: null,
    created_at: '2026-09-07T12:00:00Z',
    ...over,
  }) as BlueprintComment;

function montar(model = casa(), props: Record<string, unknown> = {}) {
  return render(
    <PainelComentarios
      model={model}
      studyId="est"
      organizationId="org"
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.comentarios = [];
});

describe('painel de comentários · a lista', () => {
  it('mostra o comentário e quem o escreveu', async () => {
    estado.comentarios = [comentario()];
    montar();
    await waitFor(() => expect(screen.getByText('Conferir a espessura aqui')).toBeTruthy());
    expect(screen.getByText(/eu@x.com/)).toBeTruthy();
  });

  it('AVISA quando o comentário aponta para peça que não existe mais', async () => {
    // ⚠️ O caso que justifica o painel. Ele NÃO some da lista: ninguém decidiu
    // fechá-lo, e quem comentou precisa saber que a peça foi embora.
    estado.comentarios = [comentario({ element_uid: 'nao-existe-nesta-revisao' })];
    montar();
    await waitFor(() => expect(screen.getByText(/peça que não existe mais/)).toBeTruthy());
    expect(screen.getByText('Conferir a espessura aqui')).toBeTruthy();
    expect(screen.getByText(/peça removida/)).toBeTruthy();
  });

  it('comentário RESOLVIDO fica escondido até alguém pedir para ver', async () => {
    // A lista serve para saber o que falta. O histórico continua a um clique.
    estado.comentarios = [comentario({ resolvido_em: '2026-09-07T13:00:00Z' })];
    montar();
    await waitFor(() => expect(screen.getByText('Nenhum comentário.')).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: 'Ver resolvidos' }));
    expect(screen.getByText('Conferir a espessura aqui')).toBeTruthy();
  });
});

describe('painel de comentários · escrever', () => {
  it('diz que o comentário fica NO LUGAR quando nada está selecionado', async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByText(/o comentário fica no lugar do desenho/i)).toBeTruthy(),
    );
  });

  it('diz sobre QUAL peça é quando há seleção, e que ele segue a peça', async () => {
    const m = casa();
    montar(m, { selecionadoUid: m.walls[0].uid, selecionadoRotulo: 'P-1A2B' });
    await waitFor(() => expect(screen.getByText(/Sobre P-1A2B/)).toBeTruthy());
    expect(screen.getByText(/segue a peça quando ela se move/)).toBeTruthy();
  });

  it('o botão só liga com texto — comentário vazio não é comentário', async () => {
    montar();
    await waitFor(() => expect(screen.getByLabelText('Texto do comentário')).toBeTruthy());
    const botao = screen.getByRole('button', { name: /Comentar/ });
    expect(botao).toHaveProperty('disabled', true);
    await userEvent.type(screen.getByLabelText('Texto do comentário'), 'algo');
    expect(botao).toHaveProperty('disabled', false);
  });

  it('grava ancorado no uid da peça selecionada', async () => {
    const m = casa();
    montar(m, { selecionadoUid: m.walls[0].uid, snapshotId: 'snap-7' });
    await waitFor(() => expect(screen.getByLabelText('Texto do comentário')).toBeTruthy());
    await userEvent.type(screen.getByLabelText('Texto do comentário'), 'x');
    await userEvent.click(screen.getByRole('button', { name: /Comentar/ }));
    await waitFor(() => expect(criar).toHaveBeenCalled());
    const arg = criar.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.elementUid).toBe(m.walls[0].uid);
    // A revisão em que a pessoa estava olhando vai junto: é o que permite dizer
    // depois "isto é da revisão 7, e o elemento não existe mais na 9".
    expect(arg.snapshotId).toBe('snap-7');
  });
});
