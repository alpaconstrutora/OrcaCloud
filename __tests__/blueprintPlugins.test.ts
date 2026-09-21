/**
 * PLUGINS (21/09/2026, backlog P2): cadastro validado; mensagem ao plugin com
 * modelo, hash e quantitativos só com permissão; mensagens do plugin lidas
 * com origem, forma e permissões; proposta ensaiada pelo kernel (recusa com
 * motivo); plugin de exemplo fala o protocolo.
 */
import { describe, expect, it } from 'vitest';
import { applyBatch, applyCommand, emptyModel, point, snapshotHash, type Command } from '../utils/blueprintKernel';
import { COMANDOS_VEDADOS_AO_PLUGIN, ensaiarProposta, lerMensagemDoPlugin, MAX_COMANDOS_POR_PROPOSTA, mensagemDoModelo, origemDoPlugin, PLUGIN_DE_EXEMPLO, PLUGIN_DE_EXEMPLO_HTML, validarPlugin } from '../utils/blueprintPlugins';

function casa() {
  const nivel = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 });
  const t = nivel.model.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  return { m: applyBatch(nivel.model, [w(0, 0, 4000, 0), w(4000, 0, 4000, 3000), w(4000, 3000, 0, 3000), w(0, 3000, 0, 0)]).model, t };
}

describe('plugins · cadastro e mensagens', () => {
  it('valida o cadastro (https, nome, permissão ler obrigatória) e extrai a origem', () => {
    expect(validarPlugin({ nome: 'X', url: 'https://plugins.exemplo.com/a?b=1', permissoes: ['ler'] })).toEqual([]);
    expect(validarPlugin({ nome: '', url: 'http://x.com', permissoes: ['escrever'] })).toEqual(['Dê um nome ao plugin.', 'A URL tem de começar com https://.', 'Todo plugin lê o desenho: a permissão "ler" é obrigatória.']);
    expect(validarPlugin({ nome: 'X', url: 'https://x.com', permissoes: ['ler', 'voar'] })[0]).toMatch(/Permissão desconhecida: voar/);
    expect(origemDoPlugin('https://plugins.exemplo.com:8443/a/b?c')).toBe('https://plugins.exemplo.com:8443');
    expect(origemDoPlugin('lixo')).toBe('');
  });

  it('a mensagem ao plugin leva o modelo (cópia), o hash e os quantitativos só com permissão', () => {
    const { m, t } = casa();
    const base = { estudo: { id: 'std_1', titulo: 'Casa', revisao: null, hash: '' }, nivelAtivoId: t, selecao: [] };
    const so = mensagemDoModelo(m, { ...base, permissoes: ['ler'] });
    expect(so.tipo).toBe('opura.planta.modelo');
    expect(so.estudo.hash).toBe(snapshotHash(m));
    expect(so.modelo.walls).toHaveLength(4);
    expect(so.modelo).not.toBe(m);
    expect('quantitativos' in so).toBe(false);
    const com = mensagemDoModelo(m, { ...base, permissoes: ['ler', 'quantitativos'] });
    expect(com.quantitativos?.ambientes).toHaveLength(1);
  });

  it('lê as mensagens do plugin: origem, forma, permissões e comandos vedados', () => {
    const ctx = { origemRecebida: 'https://p.com', origemEsperada: 'https://p.com', permissoes: ['ler', 'escrever'] as const };
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.pronto' }, ctx)).toEqual({ ok: true, mensagem: { tipo: 'opura.planta.pronto' } });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.pronto' }, { ...ctx, origemRecebida: 'https://outro.com' })).toMatchObject({ ok: false, motivo: expect.stringMatching(/origem https:\/\/outro.com não é a do plugin/) });
    expect(lerMensagemDoPlugin('texto', ctx)).toMatchObject({ ok: false });
    expect(lerMensagemDoPlugin({ tipo: 'x' }, ctx)).toMatchObject({ ok: false, motivo: 'tipo desconhecido: x' });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.selecionar', uids: ['a'] }, ctx)).toMatchObject({ ok: false, motivo: /permissão para selecionar/ });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.selecionar', uids: ['a'] }, { ...ctx, permissoes: ['ler', 'selecionar'] })).toMatchObject({ ok: true, mensagem: { uids: ['a'] } });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: [{ type: 'NameSpace' }] }, { ...ctx, permissoes: ['ler'] })).toMatchObject({ ok: false, motivo: /permissão para propor comandos/ });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: [] }, ctx)).toMatchObject({ ok: false, motivo: 'proposta sem comandos' });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: [{ nome: 'x' }] }, ctx)).toMatchObject({ ok: false, motivo: 'comando sem `type`' });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: [{ type: 'RemoveLevel', levelId: 'lvl_0001' }] }, ctx)).toMatchObject({ ok: false, motivo: 'comando vedado a plugins: RemoveLevel' });
    expect(COMANDOS_VEDADOS_AO_PLUGIN.has('RemoveLevel')).toBe(true);
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: Array.from({ length: MAX_COMANDOS_POR_PROPOSTA + 1 }, () => ({ type: 'NameSpace' })) }, ctx)).toMatchObject({ ok: false, motivo: /máximo 500/ });
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.comandos', comandos: [{ type: 'NameSpace', spaceId: 's', name: 'A' }], descricao: 'ok' }, ctx)).toMatchObject({ ok: true, mensagem: { tipo: 'opura.planta.comandos', descricao: 'ok' } });
    // Sem origem esperada (srcdoc): qualquer origem passa; a janela é conferida por quem chama.
    expect(lerMensagemDoPlugin({ tipo: 'opura.planta.aviso', texto: 'oi' }, { origemRecebida: 'null', origemEsperada: null, permissoes: ['ler'] })).toMatchObject({ ok: true });
  });

  it('ensaia a proposta: o kernel aceita (resumo e diff) ou recusa com o motivo', () => {
    const { m } = casa();
    const ok = ensaiarProposta(m, [{ type: 'NameSpace', spaceId: m.spaces[0].id, name: 'Sala' }], 'Nomear');
    expect(ok).toMatchObject({ ok: true, mensagem: { resumo: 'NameSpace ×1', criados: 1, descricao: 'Nomear' } });
    const ruim = ensaiarProposta(m, [{ type: 'NameSpace', spaceId: 'spc_9999', name: 'X' }]);
    expect(ruim).toMatchObject({ ok: false, motivo: /o kernel recusou a proposta/ });
    // O ensaio não muda o modelo.
    expect(m.labels).toHaveLength(0);
  });

  it('o plugin de exemplo fala o protocolo (pronto, modelo, comandos NameSpace)', () => {
    expect(PLUGIN_DE_EXEMPLO.permissoes).toEqual(['ler', 'escrever']);
    expect(PLUGIN_DE_EXEMPLO_HTML).toContain("post({tipo:'opura.planta.pronto'})");
    expect(PLUGIN_DE_EXEMPLO_HTML).toContain("d.tipo!=='opura.planta.modelo'");
    expect(PLUGIN_DE_EXEMPLO_HTML).toContain("type:'NameSpace'");
    expect(PLUGIN_DE_EXEMPLO_HTML).toContain("tipo:'opura.planta.comandos'");
  });
});
