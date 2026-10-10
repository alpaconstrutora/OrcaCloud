import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ContentText } from 'pdfmake/interfaces';
import {
    descreverEvento, referenciaDeOficio, respostaDoRecebido, recebidoAguardando, caminhoDosRecebidos, ROTULO_SITUACAO,
} from '../services/docGen/tramitacao';
import { assinaturasValidas } from '../services/docGen/emissao';
import { TRANSICOES, SITUACOES_EM_CURSO } from '../services/docGenDocumentoService';
import { dataHoraCurta } from '../services/docGen/dataExtenso';
import { contextoDeExemplo, resolverCampos } from '../services/docGen/catalogoCampos';
import { montarDocDefinition } from '../services/docGen/motorRender';
import { LAYOUT_PADRAO, type DocGenAssinatura, type DocGenDocumento, type DocGenVinculo } from '../types/docGen';

/**
 * F4 — tramitação do ofício (Fase 2 da proposta). As regras moram no banco
 * (aplicar_20271010000300_oficio_tramitacao.sql); aqui se trava o que a tela
 * espelha delas e o que é puro.
 */

const MIGRATION = readFileSync(path.join(process.cwd(), 'supabase', 'migrations', 'aplicar_20271010000300_oficio_tramitacao.sql'), 'utf8');

const doc = (p: Partial<DocGenDocumento>): DocGenDocumento => ({
    id: 'd1', organization_id: 'o', company_id: null, modelo_id: 'm', modelo_versao: 1, tipo_documental: 'OFICIO', status: 'EMITIDO',
    numero: 'OF-ENG-001/2026', assunto: 'Assunto', data_documento: '2026-10-10', cidade: null, department_id: null,
    destinatario_tipo: 'MANUAL', destinatario_id: null, destinatario_snapshot: { tipo: 'MANUAL', razao_social: 'Prefeitura' },
    project_id: null, empreendimento_id: null, contract_id: null, client_id: null, supplier_id: null, valores: {}, conteudo: {},
    signatarios: [], anexos: [], documento_relacionado_id: null, resposta_esperada_ate: null, versao: 1, ged_document_id: null,
    ged_version_id: null, emitido_por: null, emitido_em: null, approval_status: 'RASCUNHO', approval_chain: [], approval_required_levels: 1,
    created_by: null, created_at: '', updated_at: '', ...p,
});

const vinc = (p: Partial<DocGenVinculo>): DocGenVinculo => ({
    id: Math.random().toString(36), organization_id: 'o', de_documento_id: null, de_ged_id: null, para_documento_id: null, para_ged_id: null,
    tipo: 'RESPONDE', observacao: null, created_by: null, created_at: '', ...p,
});

describe('transições — a tela espelha doc_gen_tramitar', () => {
    it('cada situação tem no banco exatamente as mesmas saídas que TRANSICOES', () => {
        const bloco = MIGRATION.slice(MIGRATION.indexOf('v_permitido := CASE v_doc.status'), MIGRATION.indexOf('ELSE ARRAY[]::TEXT[]'));
        const doBanco: Record<string, string[]> = {};
        for (const m of bloco.matchAll(/WHEN '(\w+)'\s+THEN ARRAY\[([^\]]*)\]/g)) {
            doBanco[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map(x => x[1]);
        }
        for (const [de, para] of Object.entries(TRANSICOES)) {
            expect(doBanco[de] ?? [], `saídas de ${de}`).toEqual(para);
        }
        expect(Object.keys(doBanco).sort()).toEqual(Object.entries(TRANSICOES).filter(([, p]) => p.length).map(([s]) => s).sort());
    });

    it('as situações do CHECK do banco são as do tipo, com rótulo', () => {
        const check = /doc_gen_documentos_status_check\s+CHECK \(status IN \(([^)]*)\)\)/.exec(MIGRATION)?.[1] ?? '';
        const doBanco = [...check.matchAll(/'(\w+)'/g)].map(m => m[1]).sort();
        expect(doBanco).toEqual(Object.keys(ROTULO_SITUACAO).sort());
    });

    it('respondido, encerrado e cancelado não esperam mais resposta', () => {
        expect(SITUACOES_EM_CURSO).toEqual(['EMITIDO', 'ENVIADO', 'RECEBIDO']);
        expect(TRANSICOES.RESPONDIDO).toEqual(['ENCERRADO']);
        expect(TRANSICOES.ENCERRADO).toEqual([]);
        expect(TRANSICOES.CANCELADO).toEqual([]);
    });
});

describe('histórico legível', () => {
    it('descreve envio, recebimento, resposta e aprovação com os dados', () => {
        expect(descreverEvento({ tipo: 'ENVIADO', dados: { canal: 'CORREIOS', rastreio: 'BR123', de: 'EMITIDO' } }))
            .toBe('Enviado · Correios (AR) · rastreio BR123');
        expect(descreverEvento({ tipo: 'RECEBIDO', dados: { protocolo: '2026/77', recebido_por: 'Fulano', recebido_em: '2026-10-11' } }))
            .toBe('Recebido pelo destinatário · protocolo 2026/77 · por Fulano · em 11/10/2026');
        expect(descreverEvento({ tipo: 'REJEITADO', dados: { notas: 'falta a ART' } })).toBe('Rejeitado · motivo: falta a ART');
        expect(descreverEvento({ tipo: 'APROVACAO_DESFEITA', dados: { motivo: 'Texto alterado depois da aprovação' } }))
            .toBe('Aprovação desfeita — texto alterado depois da aprovação');
        expect(descreverEvento({ tipo: 'APROVACAO_DESFEITA', dados: {} })).toBe('Retirado da aprovação');
        expect(descreverEvento({ tipo: 'EMITIDO', dados: { numero: 'OF-0001/2026' } })).toBe('Emitido · nº OF-0001/2026');
        expect(descreverEvento({ tipo: 'ASSINADO', dados: { nome: 'Ana', versao: 3 } })).toBe('Assinado eletronicamente por Ana · versão 3');
    });

    it('todo tipo que o gatilho do banco grava tem descrição própria', () => {
        const tipos = ['APROVACAO_SOLICITADA', 'APROVADO', 'REJEITADO', 'APROVACAO_DESFEITA', 'APROVADO_NIVEL', 'ASSINADO', ...Object.keys(ROTULO_SITUACAO).filter(s => s !== 'RASCUNHO')];
        for (const t of tipos) {
            expect(MIGRATION.includes(`'${t}'`), `${t} aparece na migration`).toBe(true);
            expect(descreverEvento({ tipo: t, dados: {} }), t).not.toBe(t);
        }
    });
});

describe('em resposta a', () => {
    it('referência com número, remetente e data', () => {
        expect(referenciaDeOficio({ numero: '312/2026', remetente: 'Companhia de Energia', data: '2026-09-30' }))
            .toBe('Ofício nº 312/2026 de Companhia de Energia, de 30/09/2026');
        expect(referenciaDeOficio({ numero: null, nome: 'Carta da prefeitura' })).toBe('Carta da prefeitura');
    });

    it('a variável {{documento.em_resposta_a}} lê o contexto', () => {
        const ctx = contextoDeExemplo();
        ctx.documento = { ...ctx.documento, emRespostaA: 'Ofício nº 9/2026 de X' };
        expect(resolverCampos(['documento.em_resposta_a'], ctx)['documento.em_resposta_a']).toBe('Ofício nº 9/2026 de X');
    });

    it('recebido respondido só por ofício EMITIDO; rascunho é "em elaboração"; cancelado não conta', () => {
        const nossos = [doc({ id: 'a', status: 'RASCUNHO' }), doc({ id: 'b', status: 'ENVIADO' }), doc({ id: 'c', status: 'CANCELADO' })];
        const so = (ids: string[]) => ids.map(id => vinc({ de_documento_id: id, para_ged_id: 'g1' }));
        expect(respostaDoRecebido('g1', so(['a']), nossos)).toEqual({ emitida: null, rascunho: nossos[0] });
        expect(respostaDoRecebido('g1', so(['a', 'b']), nossos).emitida?.id).toBe('b');
        expect(respostaDoRecebido('g1', so(['c']), nossos)).toEqual({ emitida: null, rascunho: null });
        expect(respostaDoRecebido('g2', so(['b']), nossos).emitida).toBeNull();
        // Vínculo de outro tipo não é resposta.
        expect(respostaDoRecebido('g1', [vinc({ tipo: 'REFERENCIA', de_documento_id: 'b', para_ged_id: 'g1' })], nossos).emitida).toBeNull();
        expect(recebidoAguardando({ responder_ate: '2026-10-20' }, false)).toBe(true);
        expect(recebidoAguardando({ responder_ate: '2026-10-20' }, true)).toBe(false);
        expect(recebidoAguardando({ responder_ate: null }, false)).toBe(false);
        expect(caminhoDosRecebidos('2026')).toEqual(['Ofícios', '2026', 'Recebidos']);
    });
});

describe('assinatura eletrônica', () => {
    const ass = (p: Partial<DocGenAssinatura>): DocGenAssinatura => ({
        id: 'x', documento_id: 'd1', member_id: 'm1', nome: 'Ana', email: null, versao: 2, assinado_em: '2026-10-10T17:32:00Z', ...p,
    });

    it('só vale a assinatura da versão salva, na ordem dos signatários', () => {
        const signatarios = [{ memberId: 'm1', nome: 'Ana' }, { memberId: 'm2', nome: 'Bia' }, { memberId: null, nome: 'Sem usuário' }];
        const lista = [ass({ member_id: 'm2', versao: 2, id: 'b2' }), ass({ member_id: 'm1', versao: 1, id: 'a1' })];
        const v = assinaturasValidas(signatarios, lista, 2);
        expect(v.map(a => a?.id ?? null)).toEqual([null, 'b2', null]);
        expect(assinaturasValidas(signatarios, lista, 1).map(a => a?.id ?? null)).toEqual(['a1', null, null]);
    });

    it('a hora impressa é a de Brasília, não a da máquina', () => {
        expect(dataHoraCurta('2026-10-10T17:32:00Z')).toBe('10/10/2026 14:32');
        expect(dataHoraCurta('2026-12-31T23:30:00-03:00')).toBe('31/12/2026 23:30');
        expect(dataHoraCurta(null)).toBe('');
    });

    it('o PDF imprime "assinado eletronicamente" só para quem assinou', () => {
        const def = montarDocDefinition({
            conteudo: { type: 'doc', content: [{ type: 'assinaturas' }] },
            layout: LAYOUT_PADRAO,
            valores: {},
            assinaturas: [{ nome: 'Ana', cargo: 'Diretora', assinadoEm: '10/10/2026 14:32' }, { nome: 'Bia' }],
        });
        const textos = JSON.stringify(def.content);
        expect(textos).toContain('Assinado eletronicamente por Ana em 10/10/2026 14:32');
        expect(textos).not.toContain('Assinado eletronicamente por Bia');
        expect((def.content as ContentText[]).length).toBeGreaterThan(0);
    });
});

describe('banco — travas que a tela não substitui', () => {
    it('toda função SECURITY DEFINER nova tem REVOKE de PUBLIC e anon', () => {
        for (const f of ['doc_gen_assinar(UUID)', 'doc_gen_tramitar(UUID, TEXT, JSONB)', 'doc_gen_emitir(UUID, JSONB)', 'fn_doc_gen_registrar_evento()']) {
            expect(MIGRATION, f).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${f.replace(/[()]/g, '\\$&')} FROM PUBLIC, anon`));
        }
    });

    it('a emissão recusa em aprovação, sem aprovação exigida e sem assinatura exigida', () => {
        expect(MIGRATION).toContain('O ofício está em aprovação — aguarde a decisão para emitir.');
        expect(MIGRATION).toContain('Este modelo exige aprovação antes da emissão.');
        expect(MIGRATION).toContain('Falta a assinatura de: %.');
    });

    it('eventos e assinaturas não têm policy de escrita (só as funções gravam)', () => {
        expect(MIGRATION).not.toMatch(/CREATE POLICY doc_gen_eventos_(insert|update|delete)/);
        expect(MIGRATION).not.toMatch(/CREATE POLICY doc_gen_assinaturas_(insert|update|delete)/);
    });
});
