/**
 * SUGERIR MELHORIAS (19/09/2026, roadmap E5.3): texto DETERMINÍSTICO a partir
 * dos indicadores da avaliação (E5.2), cada sugestão com o elemento alvo e,
 * quando cabe, a tela/gaveta onde se resolve. Sem LLM: é a base que a IA da
 * E6.4 vai receber (um texto já correto, com números e alvos) — e o que o
 * projetista lê hoje.
 *
 * Regras:
 * - Indicador AVALIADO abaixo de 75 gera sugestões; a prioridade sai do
 *   IMPACTO (100 − nota) × peso: o terço de cima é ALTA, o do meio MÉDIA, o
 *   de baixo BAIXA. Ordem estável: impacto desc, depois a ordem canônica dos
 *   indicadores.
 * - Indicador NÃO AVALIADO por falta de dado barato de conseguir (programa,
 *   nomes dos ambientes, georreferência, prévia do orçamento) gera uma
 *   sugestão de DESBLOQUEIO, prioridade BAIXA, com a porta de entrada.
 * - Cada alvo vira UMA sugestão (no máximo 6 por indicador), para o clique
 *   levar ao elemento; o excedente vira "… e mais N".
 */
import { CHAVES_DOS_INDICADORES, type Avaliacao, type ChaveDoIndicador, type Indicador } from './blueprintAvaliacao';

export type PrioridadeDaSugestao = 'ALTA' | 'MEDIA' | 'BAIXA';
export const ROTULO_DA_PRIORIDADE: Record<PrioridadeDaSugestao, string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };

/** Para onde a sugestão leva quando não é um elemento do desenho. */
export type DestinoDaSugestao = 'programa' | 'legislacao' | 'insolacao' | 'orcamento' | 'terreno' | 'grafo' | 'quantitativos';

export interface Sugestao {
  id: string;
  indicador: ChaveDoIndicador;
  rotuloDoIndicador: string;
  prioridade: PrioridadeDaSugestao;
  /** Verbo no imperativo, curto. */
  titulo: string;
  /** O porquê, com os números. */
  texto: string;
  alvo: { id: string; rotulo: string; levelId: string | null } | null;
  destino: DestinoDaSugestao | null;
  /** Desbloqueio = não é melhoria de projeto, é dado que falta para avaliar. */
  desbloqueio: boolean;
  impacto: number;
}

const MAX_POR_INDICADOR = 6;

function porAlvo(i: Indicador, titulo: (rotulo: string) => string, texto: (rotulo: string, detalhe: string | undefined) => string): Omit<Sugestao, 'prioridade' | 'impacto' | 'id' | 'indicador' | 'rotuloDoIndicador' | 'desbloqueio'>[] {
  const out: Omit<Sugestao, 'prioridade' | 'impacto' | 'id' | 'indicador' | 'rotuloDoIndicador' | 'desbloqueio'>[] = [];
  const alvos = i.alvos.slice(0, MAX_POR_INDICADOR);
  alvos.forEach((a, k) => out.push({ titulo: titulo(a.rotulo), texto: texto(a.rotulo, i.detalhes[k]), alvo: a, destino: null }));
  if (i.alvos.length > MAX_POR_INDICADOR) out.push({ titulo: `… e mais ${i.alvos.length - MAX_POR_INDICADOR} no mesmo indicador`, texto: i.explicacao, alvo: null, destino: null });
  return out;
}

function sugestoesDoIndicador(i: Indicador): Omit<Sugestao, 'prioridade' | 'impacto' | 'id' | 'indicador' | 'rotuloDoIndicador' | 'desbloqueio'>[] {
  const geral = (titulo: string, texto: string, destino: DestinoDaSugestao | null = null) => [{ titulo, texto, alvo: null, destino }];
  switch (i.chave) {
    case 'programa':
      return [
        ...i.detalhes.filter((d) => /faltam/.test(d)).map((d) => ({ titulo: `Crie o ambiente que falta: ${d.replace(/: faltam \d+$/, '')}`, texto: `${d}. O programa pede e o desenho não tem um ambiente com esse uso (o casamento é pelo nome).`, alvo: null, destino: 'programa' as const })),
        ...porAlvo(i, (r) => `Ajuste ${r} ao programa`, (r) => `${r} tem verificação que falta (área, largura, iluminação, ventilação, fachada ou percurso) — veja a aba Programa da Legislação.`),
      ];
    case 'legal':
      return porAlvo(i, (r) => `Corrija: ${r}`, (r, d) => d ?? `${r} viola uma regra com severidade ERRO.`);
    case 'eficiencia':
      return geral('Ganhe área útil', `${i.explicacao} Paredes internas a menos, espessuras justas e menos circulação fechada aumentam a razão útil/construída.`, 'quantitativos');
    case 'circulacao':
      return [
        ...geral('Encurte a circulação', `${i.explicacao} Faça a sala ou o hall distribuir os acessos; corredor só onde a privacidade pede.`, 'grafo'),
        ...porAlvo(i, (r) => `Reveja ${r}`, (r, d) => d ?? `${r} é circulação e pesa na razão.`),
      ];
    case 'compacidade':
      return geral('Aproxime o contorno de um retângulo', `${i.explicacao} Menos reentrâncias = menos fachada, fundação e cobertura por m².`, 'quantitativos');
    case 'insolacao':
      return porAlvo(i, (r) => `Dê sol de inverno a ${r}`, (r, d) => `${r}: ${d ?? 'poucas horas de sol pelas janelas em 21/06'}. Abra ou amplie janela numa fachada norte, nordeste ou noroeste, ou troque de lugar com um ambiente de serviço.`);
    case 'ventilacao':
      return porAlvo(i, (r) => `Cruze a ventilação de ${r}`, (r, d) => `${r}: ${d?.split(': ')[1] ?? 'aberturas só numa fachada'}. Uma segunda abertura para fora numa fachada não paralela faz o ar atravessar.`);
    case 'corredores':
      return porAlvo(i, (r) => (/^Porta/.test(r) ? `Alargue a ${r.toLowerCase()} para 0,80 m` : `Alargue ${r} para 0,90 m`), (r, d) => d ?? `${r} abaixo do mínimo de passagem.`);
    case 'adjacencias':
      return i.detalhes.map((d) => ({ titulo: `Aproxime ${d.split(' (peso')[0]}`, texto: `${d}. Relação desejável da matriz de proximidade não atendida.`, alvo: null, destino: 'grafo' as const }));
    case 'privacidade':
      return porAlvo(i, (r) => `Proteja a privacidade de ${r}`, (r, d) => `${d ?? r}. Mova a porta para a circulação ou para um ambiente social.`);
    case 'acessibilidade':
      return porAlvo(i, (r) => (/^Porta/.test(r) ? `Alargue a ${r.toLowerCase()} para 0,80 m (NBR 9050)` : `Alargue ${r} para 1,20 m (rota acessível)`), (r, d) => d ?? `${r} estreita para a rota acessível.`);
    case 'estrutura':
      return porAlvo(i, (r) => (/^Viga/.test(r) ? `Encurte o vão de ${r}` : `Traga ${r} para o eixo de uma parede`), (r, d) => d ?? `${r} com aviso estrutural.`);
    case 'modulacao':
      return [
        ...geral('Ajuste as paredes ao módulo', i.explicacao, null),
        ...porAlvo(i, (r) => `Module ${r.toLowerCase()}`, (r, d) => d ?? `${r} fora do módulo.`),
      ];
    case 'custo':
      return geral('Reveja o custo por m²', `${i.explicacao} Simplifique o contorno, reduza paredes por m² e revise o de-para do orçamento.`, 'orcamento');
    case 'paredes':
      return geral('Reduza metros de parede por m²', `${i.explicacao} Junte ambientes pequenos, alinhe paredes entre pavimentos e evite recortes.`, 'quantitativos');
    case 'fachada':
      return porAlvo(i, (r) => `Leve ${r} à fachada`, (r, d) => `${d ?? r}. Ambiente de permanência precisa de janela num lado externo — troque de lugar com um de serviço ou abra a fachada.`);
    case 'shafts':
      return porAlvo(i, (r) => `Aproxime ${r} de um shaft`, (r) => `${r} fica longe de um shaft: a prumada vai atravessar laje em lugar sem previsão. Crie um shaft (Circulação › Shaft) ou agrupe as áreas molhadas.`);
    case 'hidraulica':
      return geral('Agrupe as áreas molhadas', `${i.explicacao} Banheiros, cozinha e serviço encostados numa mesma parede hidráulica encurtam a rede.`, null);
    default:
      return geral(i.rotulo, i.explicacao, null);
  }
}

/** Não avaliado por dado barato: o que abrir para destravar. */
function desbloqueio(i: Indicador): Omit<Sugestao, 'prioridade' | 'impacto' | 'id' | 'indicador' | 'rotuloDoIndicador' | 'desbloqueio'> | null {
  if (i.nota != null) return null;
  const ex = i.explicacao;
  if (i.chave === 'programa' && /Sem programa/.test(ex)) return { titulo: 'Defina o programa de necessidades', texto: 'Sem programa, a conferência (E4.3), as adjacências e o indicador de programa não têm contra o que medir. Uma semente (2Q, 3Q suíte, casa térrea) leva um minuto.', alvo: null, destino: 'programa' };
  if (/reconhecido pelo nome/.test(ex)) return { titulo: 'Nomeie os ambientes', texto: `${i.rotulo}: ${ex} Nomes como "Sala", "Dorm. 1", "Banho", "Cozinha" são reconhecidos e destravam insolação, privacidade, fachada e shafts.`, alvo: null, destino: null };
  if (i.chave === 'custo' && /Sem prévia/.test(ex)) return { titulo: 'Peça a prévia do orçamento', texto: 'O custo por m² só pontua depois da prévia (Analisar › Orçamento › Prever) e do custo/m² de referência nas hipóteses da avaliação.', alvo: null, destino: 'orcamento' };
  if (i.chave === 'custo' && /referência/.test(ex)) return { titulo: 'Informe o custo/m² de referência', texto: ex, alvo: null, destino: null };
  if (i.chave === 'legal' && /Nenhuma regra/.test(ex)) return { titulo: 'Desenhe ambientes fechados e aplique uma zona', texto: ex, alvo: null, destino: 'legislacao' };
  if (i.chave === 'acessibilidade' && /Sem saída/.test(ex)) return { titulo: 'Ponha uma porta para o exterior', texto: 'Sem porta para fora não há rota de saída para medir acessibilidade nem percursos.', alvo: null, destino: 'grafo' };
  if (i.chave === 'adjacencias' && /não tem relações/.test(ex)) return { titulo: 'Preencha a matriz de proximidade', texto: ex, alvo: null, destino: 'programa' };
  return null;
}

export function sugerirMelhorias(avaliacao: Avaliacao): Sugestao[] {
  const ordem = new Map(CHAVES_DOS_INDICADORES.map((k, i) => [k, i] as const));
  const candidatos: { i: Indicador; impacto: number }[] = avaliacao.indicadores
    .filter((i) => i.nota != null && i.nota < 75 && i.peso > 0)
    .map((i) => ({ i, impacto: (100 - i.nota!) * i.peso }))
    .sort((a, b) => b.impacto - a.impacto || ordem.get(a.i.chave)! - ordem.get(b.i.chave)!);
  const n = candidatos.length;
  const prioridadeDe = (k: number): PrioridadeDaSugestao => (n === 0 ? 'BAIXA' : k < Math.ceil(n / 3) ? 'ALTA' : k < Math.ceil((2 * n) / 3) ? 'MEDIA' : 'BAIXA');
  const out: Sugestao[] = [];
  candidatos.forEach(({ i, impacto }, k) => {
    sugestoesDoIndicador(i).forEach((s, j) => out.push({ ...s, id: `${i.chave}-${j}`, indicador: i.chave, rotuloDoIndicador: i.rotulo, prioridade: prioridadeDe(k), desbloqueio: false, impacto }));
  });
  for (const i of avaliacao.indicadores) {
    const d = desbloqueio(i);
    if (d) out.push({ ...d, id: `${i.chave}-desbloqueio`, indicador: i.chave, rotuloDoIndicador: i.rotulo, prioridade: 'BAIXA', desbloqueio: true, impacto: 0 });
  }
  return out;
}

export interface ResumoDasSugestoes {
  total: number;
  altas: number;
  medias: number;
  baixas: number;
  desbloqueios: number;
}

export function resumirSugestoes(lista: readonly Sugestao[]): ResumoDasSugestoes {
  return {
    total: lista.length,
    altas: lista.filter((s) => s.prioridade === 'ALTA').length,
    medias: lista.filter((s) => s.prioridade === 'MEDIA').length,
    baixas: lista.filter((s) => s.prioridade === 'BAIXA' && !s.desbloqueio).length,
    desbloqueios: lista.filter((s) => s.desbloqueio).length,
  };
}

/** Texto corrido (markdown simples) — o que se cola numa reunião e o que a IA (E6.4) recebe. */
export function textoDasSugestoes(avaliacao: Avaliacao, lista: readonly Sugestao[]): string {
  const linhas: string[] = [];
  linhas.push(`# Avaliação: nota geral ${avaliacao.notaGeral ?? '—'} (${avaliacao.avaliados} indicador(es) avaliado(s), ${avaliacao.naoAvaliados} sem dado)`);
  for (const p of ['ALTA', 'MEDIA', 'BAIXA'] as const) {
    const dp = lista.filter((s) => s.prioridade === p && !s.desbloqueio);
    if (dp.length === 0) continue;
    linhas.push('', `## Prioridade ${ROTULO_DA_PRIORIDADE[p].toLowerCase()}`);
    for (const s of dp) linhas.push(`- [${s.rotuloDoIndicador}] ${s.titulo}${s.alvo ? ` — ${s.alvo.rotulo}` : ''}: ${s.texto}`);
  }
  const des = lista.filter((s) => s.desbloqueio);
  if (des.length) {
    linhas.push('', '## Para avaliar o que falta');
    for (const s of des) linhas.push(`- ${s.titulo}: ${s.texto}`);
  }
  return linhas.join('\n');
}
