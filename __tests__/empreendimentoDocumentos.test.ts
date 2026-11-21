import { describe, expect, it } from 'vitest';
import {
  diasEntre, faltantesDaLista, hojeISO, resumoDoChecklist, situacaoExibida,
} from '../utils/empreendimentoDocumentos';
import { LISTAS_PADRAO, TIPOS_DOCUMENTO_LEGAL, infoDoTipo, listaPadrao, type DocumentoLegal } from '../types/empreendimentoDocumentos';

const GERAL = listaPadrao('GERAL');

/**
 * Aba Documentos do empreendimento (12/11/2026).
 * Plano: docs/planos/2026-11-12-empreendimento-aba-documentos.md
 *
 * "Vencido" não é gravado: sai da validade na leitura. Estes testes travam a
 * conta de dias (data pura, sem fuso) e a idempotência da lista padrão.
 */

function doc(p: Partial<DocumentoLegal> = {}): DocumentoLegal {
  return {
    id: 'x', organization_id: 'o', empreendimento_id: 'e', tipo: 'ALVARA_CONSTRUCAO', titulo: 'Alvará',
    numero: null, orgao_emissor: null, protocolo: null, data_protocolo: null, data_emissao: null,
    data_validade: null, alerta_dias_antecedencia: 30, situacao: 'EMITIDO', obrigatorio: true,
    responsavel: null, observacoes: null, document_id: null, storage_path: null, sort_order: 0,
    created_at: '', updated_at: '', ...p,
  };
}

const HOJE = '2026-11-12';

describe('diasEntre / hojeISO', () => {
  it('conta dias de calendário, inclusive atravessando o horário de verão e a virada do ano', () => {
    expect(diasEntre('2026-11-12', '2026-11-12')).toBe(0);
    expect(diasEntre('2026-11-12', '2026-11-22')).toBe(10);
    expect(diasEntre('2026-11-12', '2026-11-11')).toBe(-1);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('hojeISO usa a data LOCAL, não a UTC (23h em São Paulo ainda é o mesmo dia)', () => {
    const noite = new Date(2026, 10, 12, 23, 30); // 12/11 23:30 local
    expect(hojeISO(noite)).toBe('2026-11-12');
  });
});

describe('situacaoExibida', () => {
  it('emitido sem validade = Emitido (verde)', () => {
    expect(situacaoExibida(doc(), HOJE)).toEqual({ rotulo: 'Emitido', tom: 'ok', dias: null });
  });

  it('validade passada = Vencido, mesmo com a situação gravada "Emitido"', () => {
    const s = situacaoExibida(doc({ data_validade: '2026-11-02' }), HOJE);
    expect(s.tom).toBe('vencido');
    expect(s.rotulo).toBe('Vencido há 10 dias');
    expect(situacaoExibida(doc({ data_validade: '2026-11-11' }), HOJE).rotulo).toBe('Vencido há 1 dia');
  });

  it('dentro do prazo de alerta = Vence em N dias; fora dele volta ao andamento', () => {
    expect(situacaoExibida(doc({ data_validade: '2026-11-22' }), HOJE)).toMatchObject({ tom: 'vencendo', rotulo: 'Vence em 10 dias', dias: 10 });
    expect(situacaoExibida(doc({ data_validade: '2026-11-12' }), HOJE).rotulo).toBe('Vence hoje');
    expect(situacaoExibida(doc({ data_validade: '2026-11-13' }), HOJE).rotulo).toBe('Vence amanhã');
    // alerta de 5 dias: 10 dias de folga ainda é "Emitido"
    expect(situacaoExibida(doc({ data_validade: '2026-11-22', alerta_dias_antecedencia: 5 }), HOJE).tom).toBe('ok');
  });

  it('pendente/em andamento sem validade fica neutro', () => {
    expect(situacaoExibida(doc({ situacao: 'PENDENTE' }), HOJE)).toMatchObject({ rotulo: 'Pendente', tom: 'neutro' });
    expect(situacaoExibida(doc({ situacao: 'EM_ANDAMENTO' }), HOJE)).toMatchObject({ rotulo: 'Em andamento', tom: 'neutro' });
  });

  it('dispensado ignora a validade', () => {
    expect(situacaoExibida(doc({ situacao: 'DISPENSADO', data_validade: '2020-01-01' }), HOJE).tom).toBe('dispensado');
  });
});

describe('faltantesDaLista — lista Geral', () => {
  const base = { organization_id: 'o', empreendimento_id: 'e' };

  it('checklist vazio recebe a lista padrão inteira, na ordem do ciclo, tudo Pendente', () => {
    const novos = faltantesDaLista('GERAL', [], base);
    expect(novos).toHaveLength(18);
    expect(novos.map(n => n.tipo)).toEqual(GERAL.itens.map(t => t.tipo));
    expect(novos[0].sort_order).toBe(10);
    expect(novos[17].sort_order).toBe(180);
    expect(novos.every(n => n.situacao === 'PENDENTE' && n.organization_id === 'o' && n.empreendimento_id === 'e')).toBe(true);
    expect(novos.map(n => n.sort_order)).toEqual([...novos.map(n => n.sort_order)].sort((a, b) => a - b));
    expect(novos.some(n => n.tipo === 'OUTRO')).toBe(false);
  });

  it('é idempotente: rodar de novo depois de aplicar não acrescenta nada', () => {
    const primeira = faltantesDaLista('GERAL', [], base);
    expect(faltantesDaLista('GERAL', primeira, base)).toEqual([]);
  });

  it('só traz o que falta; item OUTRO não conta como tipo padrão', () => {
    const novos = faltantesDaLista('GERAL', [{ tipo: 'HABITE_SE' }, { tipo: 'OUTRO' }], base);
    expect(novos).toHaveLength(GERAL.itens.length - 1);
    expect(novos.some(n => n.tipo === 'HABITE_SE')).toBe(false);
  });

  it('preenche o órgão sugerido do tipo', () => {
    const habite = faltantesDaLista('GERAL', [], base).find(n => n.tipo === 'HABITE_SE')!;
    expect(habite.orgao_emissor).toBe('Prefeitura');
  });

  it('duas escrituras no checklist (mais de uma por tipo, 21/11) não atrapalham a carga', () => {
    const novos = faltantesDaLista('GERAL', [{ tipo: 'ESCRITURA' }, { tipo: 'ESCRITURA' }], base);
    expect(novos).toHaveLength(17);
    expect(novos.some(n => n.tipo === 'ESCRITURA')).toBe(false);
  });
});

describe('faltantesDaLista — lista Incorporação (Lei 4.591/64, 21/11/2026)', () => {
  const base = { organization_id: 'o', empreendimento_id: 'e' };

  it('checklist vazio recebe os 15 documentos, na ordem e com os títulos do pedido', () => {
    const novos = faltantesDaLista('INCORPORACAO', [], base);
    expect(novos.map(n => n.titulo)).toEqual([
      'Memorial de incorporação',
      'Título de propriedade do terreno',
      'Certidões negativas de tributos federais, estaduais e municipais',
      'Certidões das justiças federal e estadual',
      'Certidões de protesto de títulos',
      'Certidões do imóvel',
      'Histórico dos títulos de propriedade do imóvel (últimos 20 anos)',
      'Quadros da NBR 12.721:2006, com ART/RRT',
      'Projeto arquitetônico de construção',
      'Alvará de construção',
      'Atestado de idoneidade financeira',
      'Contrato-padrão',
      'Declaração em que se defina a parcela do preço (art. 39, II, Lei 4.591/64)',
      'Certidão de instrumento público de mandato',
      'Declaração do prazo de carência',
    ]);
    expect(novos.every(n => n.situacao === 'PENDENTE' && n.obrigatorio)).toBe(true);
    // bloco próprio de ordem: fica depois da lista Geral, em qualquer ordem de carga
    expect(novos[0].sort_order).toBe(1010);
    expect(novos[14].sort_order).toBe(1150);
  });

  it('depois da Geral traz 11: escritura, certidões do imóvel, projeto e alvará não se repetem', () => {
    const geral = faltantesDaLista('GERAL', [], base);
    const novos = faltantesDaLista('INCORPORACAO', geral, base);
    expect(novos).toHaveLength(11);
    for (const t of ['ESCRITURA', 'CERTIDOES_IMOVEL', 'APROVACAO_PROJETO', 'ALVARA_CONSTRUCAO'] as const) {
      expect(novos.some(n => n.tipo === t)).toBe(false);
    }
    // e a Geral depois da Incorporação traz 14
    expect(faltantesDaLista('GERAL', faltantesDaLista('INCORPORACAO', [], base), base)).toHaveLength(14);
  });

  it('é idempotente', () => {
    const primeira = faltantesDaLista('INCORPORACAO', [], base);
    expect(faltantesDaLista('INCORPORACAO', primeira, base)).toEqual([]);
  });

  it('o mesmo tipo aparece uma vez em cada lista', () => {
    for (const l of LISTAS_PADRAO) {
      const tipos = l.itens.map(i => i.tipo);
      expect(new Set(tipos).size).toBe(tipos.length);
    }
  });
});

describe('tipo → categoria do GED', () => {
  it('cada tipo da lista cai numa categoria que o GED tem', () => {
    const categorias = new Set(['juridico', 'engenharia', 'compliance', 'financeiro', 'comercial']);
    for (const t of TIPOS_DOCUMENTO_LEGAL) expect(categorias.has(t.categoria)).toBe(true);
  });

  it('todo tipo das listas padrão está no catálogo (e não cai no "Outro" por engano)', () => {
    for (const l of LISTAS_PADRAO) {
      for (const i of l.itens) expect(TIPOS_DOCUMENTO_LEGAL.some(t => t.tipo === i.tipo)).toBe(true);
    }
  });

  it('alvarás e habite-se em Licenças & Alvarás; escritura e registro em Contratos; ART em Projetos', () => {
    expect(infoDoTipo('ALVARA_CONSTRUCAO').categoria).toBe('compliance');
    expect(infoDoTipo('HABITE_SE').categoria).toBe('compliance');
    expect(infoDoTipo('ESCRITURA').categoria).toBe('juridico');
    expect(infoDoTipo('REGISTRO_INCORPORACAO').categoria).toBe('juridico');
    expect(infoDoTipo('ART_RRT').categoria).toBe('engenharia');
    expect(infoDoTipo('OUTRO').categoria).toBe('compliance');
  });

  it('os tipos da lista batem com o CHECK da migration', async () => {
    const { readFileSync } = await import('node:fs');
    // o CHECK vigente é o da migration de 21/11/2026 (lista Incorporação)
    const sql = readFileSync('supabase/migrations/aplicar_20271121910000_empreendimento_documentos_varios_por_tipo.sql', 'utf8');
    for (const t of [...TIPOS_DOCUMENTO_LEGAL.map(x => x.tipo), 'OUTRO']) expect(sql).toContain(`'${t}'`);
  });
});

describe('resumoDoChecklist (KPIs)', () => {
  it('conta exigidos sem os dispensados e os opcionais; vencidos/vencendo pela mesma regra da coluna', () => {
    const r = resumoDoChecklist([
      doc({ id: '1', situacao: 'EMITIDO' }),
      doc({ id: '2', situacao: 'PENDENTE' }),
      doc({ id: '3', situacao: 'DISPENSADO' }),
      doc({ id: '4', situacao: 'EMITIDO', obrigatorio: false }),
      doc({ id: '5', situacao: 'EMITIDO', data_validade: '2026-11-01' }),
      doc({ id: '6', situacao: 'EMITIDO', data_validade: '2026-11-20' }),
    ], HOJE);
    expect(r.exigidos).toBe(4);           // 1, 2, 5, 6
    expect(r.emitidosExigidos).toBe(3);   // 1, 5, 6
    expect(r.pendentes).toBe(1);
    expect(r.vencidos).toBe(1);
    expect(r.vencendo).toBe(1);
  });
});
