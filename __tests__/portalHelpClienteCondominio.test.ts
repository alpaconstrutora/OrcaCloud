/**
 * Portal do Cliente — o Condomínio COMPLETO no tour e na ajuda.
 * 14/10/2026, docs/planos/2026-10-14-ajuda-tour-portal-cliente.md
 *
 * Duas entregas incompletas no mesmo dia: a 1ª deixou o Condomínio com um
 * artigo genérico; a 2ª tratou o Condomínio como UMA seção. O usuário mandou o
 * print do menu (Dados gerais, Avisos, Documentos, Financeiro, Manutenção,
 * Equipamentos) e perguntou por que não saía completo. Causa: a ajuda só
 * conhecia o 1º nível (aba). Agora cada subseção é `condominio.<id>` — e este
 * teste exige que TODA subseção tenha artigo, pergunta e "como usar".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOURS, DEFAULT_ITEMS, CHECKLIST_ITEMS, PORTAL_SECTIONS, mergePortalHelp } from '../utils/portalHelpDefaults';
import { CONDOMINIO_SECOES, secaoDoCondominio, secoesLiberadas, secaoAtual, destinoDaSecao } from '../utils/clientPortalTabs';

const SUBS = CONDOMINIO_SECOES.map(secaoDoCondominio);

describe('Portal do Cliente › Condomínio por subseção', () => {
  it('as subseções da ajuda são as mesmas do CondominioTab, na mesma ordem', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'components/client/CondominioTab.tsx'), 'utf-8');
    const bloco = fonte.slice(fonte.indexOf('export const ABAS_CONDOMINIO'), fonte.indexOf('] as const', fonte.indexOf('export const ABAS_CONDOMINIO')));
    const ids = [...bloco.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
    expect(ids).toEqual([...CONDOMINIO_SECOES]);
    for (const s of SUBS) expect(PORTAL_SECTIONS.cliente.some(x => x.id === s)).toBe(true);
  });

  it('o tour do portal apresenta o grupo e CADA subitem do Condomínio', () => {
    const ancoras = TOURS.cliente.geral.map(p => p.anchor);
    expect(ancoras).toContain('aba-condominio');
    for (const sub of CONDOMINIO_SECOES) expect(ancoras).toContain(`aba-condominio.${sub}`);
  });

  /**
   * INVENTÁRIO de cada subseção: todo elemento que a tela mostra (âncora no
   * `CondominioTab`) e o termo que o artigo precisa explicar. Elemento novo na
   * tela entra AQUI — e o teste exige passo de tour e texto para ele.
   */
  const INVENTARIO: Record<string, { ancoras: string[]; termos: string[] }> = {
    'condominio.dados': {
      ancoras: ['condominio-predio', 'condominio-secoes', 'condominio-dados-grupo', 'condominio-dados-unidade', 'condominio-dados-fracao', 'condominio-dados-papel', 'condominio-dados-ocupantes'],
      termos: ['CNPJ', 'agrupadas por prédio', 'torre', 'pavimento', 'tipologia', 'Fração ideal', 'Área privativa', 'seu papel', 'Quem consta na unidade', 'Nenhuma unidade de condomínio'],
    },
    'condominio.avisos': {
      ancoras: ['condominio-avisos-contador', 'condominio-avisos-lista', 'condominio-aviso', 'condominio-aviso-categoria'],
      termos: ['número vermelho do menu', 'mais novo', 'Não lido', 'Lido', 'categoria', 'data', 'Nenhum aviso publicado'],
    },
    'condominio.documentos': {
      ancoras: ['condominio-documentos-lista', 'condominio-documento'],
      termos: ['convenção', 'regulamento interno', 'atas', 'categoria', 'aba nova', 'mensagem aparece abaixo da lista'],
    },
    'condominio.financeiro': {
      ancoras: ['condominio-competencia', 'condominio-rateio-cabecalho', 'condominio-rateio-status', 'condominio-rateio-comprovantes', 'condominio-rateio-pdf', 'condominio-rateio-cota', 'condominio-rateio-despesas', 'condominio-rateio-unidades'],
      termos: ['Competência', 'setas', 'tipo da taxa', 'critério', 'Prévia — pode mudar', 'Fechado em', 'Incluir os comprovantes', 'Baixar PDF', 'Despesas do mês', 'Sua cota', 'O que entrou no rateio', 'Rateio por unidade', 'sua unidade'],
    },
    'condominio.manutencao': {
      ancoras: ['condominio-manutencao-plano', 'condominio-manutencao-item', 'condominio-manutencao-proxima', 'condominio-manutencao-ordens', 'condominio-ordem', 'condominio-ordem-situacao'],
      termos: ['O que é mantido', 'NBR 5674', 'sistema', 'periodicidade', 'próxima data', 'Ordens de serviço', 'código', 'tipo', 'agendada ou executada', 'situação'],
    },
    'condominio.equipamentos': {
      ancoras: ['condominio-equipamentos-lista', 'condominio-equipamento', 'condominio-equipamento-garantia'],
      termos: ['elevadores', 'marca', 'modelo', 'garantia até', 'ficha', 'código patrimonial', 'número de série', 'localização', 'vida útil', 'observações'],
    },
  };

  it('o inventário cobre as seis subseções', () => {
    expect(Object.keys(INVENTARIO)).toEqual(SUBS);
  });

  it.each(SUBS)('%s: o tour passa por TODO elemento do inventário, na ordem da tela', (secao) => {
    expect(TOURS.cliente.porAba[secao]?.map(p => p.anchor)).toEqual(INVENTARIO[secao].ancoras);
  });

  it.each(SUBS)('%s: todo elemento do inventário existe na tela', (secao) => {
    const fonte = ['components/client/CondominioTab.tsx', 'components/ClientArea.tsx']
      .map(f => readFileSync(resolve(__dirname, '..', f), 'utf-8')).join(' ');
    for (const a of INVENTARIO[secao].ancoras) expect(fonte, a).toContain(`data-tour="${a}"`);
  });

  it.each(SUBS)('%s: o artigo explica todo item do inventário e há pergunta frequente', (secao) => {
    const texto = DEFAULT_ITEMS.cliente.filter(d => d.kind === 'artigo' && d.section === secao).map(d => d.body_html).join(' ');
    for (const t of INVENTARIO[secao].termos) expect(texto, `${secao}: "${t}"`).toContain(t);
    expect(DEFAULT_ITEMS.cliente.some(d => d.kind === 'faq' && d.section === secao)).toBe(true);
  });

  it('o Condomínio liberado libera as subseções; sem ele, nada de condomínio aparece', () => {
    const com = mergePortalHelp('cliente', [], { visibleSections: secoesLiberadas(['dashboard', 'condominio']) });
    for (const s of SUBS) {
      expect(com.tours[s]?.length ?? 0).toBeGreaterThan(0);
      expect(com.articles.some(a => a.section === s)).toBe(true);
    }
    const sem = mergePortalHelp('cliente', [], { visibleSections: secoesLiberadas(['dashboard', 'financeiro']) });
    expect(sem.articles.some(a => a.section?.startsWith('condominio'))).toBe(false);
    expect(Object.keys(sem.tours).some(t => t.startsWith('condominio'))).toBe(false);
    expect(sem.checklist.some(c => c.section.startsWith('condominio'))).toBe(false);
  });

  it('seção atual e navegação: aba + subseção ida e volta', () => {
    expect(secaoAtual('condominio', 'avisos')).toBe('condominio.avisos');
    expect(secaoAtual('condominio', 'lixo-antigo')).toBe('condominio.dados');
    expect(secaoAtual('financeiro', 'avisos')).toBe('financeiro');
    expect(destinoDaSecao('condominio.equipamentos')).toEqual({ aba: 'condominio', sub: 'equipamentos' });
    expect(destinoDaSecao('condominio')).toEqual({ aba: 'condominio', sub: null });
    expect(destinoDaSecao('documentos')).toEqual({ aba: 'documentos', sub: null });
  });

  it('"Primeiros passos" tem itens do Condomínio, ligados a subseções', () => {
    const itens = CHECKLIST_ITEMS.cliente.filter(i => i.section.startsWith('condominio.'));
    expect(itens.length).toBeGreaterThan(0);
    for (const i of itens) expect(i.evento).toBe(`aba:${i.section}`);
  });

  it('ClientArea fala em subseções com a ajuda (seção atual, liberadas e navegação)', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'components/ClientArea.tsx'), 'utf-8');
    expect(fonte).toContain('currentSection={secaoAtual(activeTab, abaCondominio)}');
    expect(fonte).toContain('visibleSections={secoesDaAjuda}');
    expect(fonte).toContain('destinoDaSecao(s)');
    expect(fonte).toContain('data-tour={`aba-condominio.${sub.id}`}');
  });

  it('Portais › Portal do Condômino: ajuda e tour da SUBSEÇÃO aberta, em modo prévia', () => {
    const fonte = readFileSync(resolve(__dirname, '..', 'components/condominio/PortalCondominoAdmin.tsx'), 'utf-8');
    expect(fonte).toContain('<PortalHelp');
    expect(fonte).toContain('portal="cliente"');
    expect(fonte).toMatch(/modoPrevia\b/);
    expect(fonte).toContain('forcarTour={tourPedido > 0 ? secao : null}');
    expect(fonte).toContain('currentSection={secao}');
  });
});
