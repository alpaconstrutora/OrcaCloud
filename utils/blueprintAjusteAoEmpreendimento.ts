// utils/blueprintAjusteAoEmpreendimento.ts
//
// OS BLOCOS DA MASSA SEGUEM AS TORRES DO EMPREENDIMENTO (27/10/2026): *"ao conectar com empreendimento deve-se
// trazer tudo conforme está no empreendimento da aba torres e unidades … Torre A e Torre B, quantidade de
// pavimentos, nome dos pavimentos"*. Plano: docs/planos/2026-10-27-massa-segue-torres-do-empreendimento.md.
//
// Bloco ↔ torre pelo NOME (a regra de adoção da sincronização inversa, `services/sync/planner.ts`); as torres que
// sobram casam com os blocos que sobram, na ordem do nome. Cada torre casada recebe o nome e os pavimentos acima do
// solo (menos os que já estão embaixo dela na pilha: pilotis, embasamento); a que tem garagem ganha um subsolo
// próprio, "<torre> · Garagem", com o contorno dela (decisão de 27/10/2026: subsolo sob cada torre). Com
// pé-direito por pavimento (27/10/2026), a torre vira uma PILHA de blocos, um por trecho de mesma altura
// ("<torre> · Térreo" 4,50 m embaixo, "<torre>" com os tipos em cima) — decisão do usuário. Nada é
// apagado no desenho: o que não é do Empreendimento fica, com aviso. Duas saídas do mesmo plano: comandos para os
// blocos desenhados (o botão "Ajustar ao Empreendimento") e os blocos propostos vestidos (o Aplicar do Gerar
// massa). Puro.

import type { BlueprintModel, Command, ObjectId, Point, UsoDoBloco } from './blueprintKernel';
import { nomeDaGaragem, type EstruturaDaTorre, type PisoDaTorre } from './blueprintEstruturaDaTorre';
import type { BlocoProposto } from './blueprintGeradorDeMassa';

interface BlocoParaAjuste {
  nome: string;
  pontos: Point[];
  cotaBaseMm: number;
  pavimentos: number;
  peDireitoMm: number;
  uso: UsoDoBloco;
  levelId?: ObjectId;
}

export type EstadoDaTorreNaPlanta = 'OK' | 'AJUSTAR' | 'SEM_BLOCO' | 'SEM_PAVIMENTOS';

export interface LinhaDoAjuste {
  torre: string;
  fonte: EstruturaDaTorre['fonte'];
  acima: number;
  garagens: number;
  /** Altura dos pavimentos acima do solo pelo Empreendimento (m) — o piso sem pé-direito conta com o do bloco. */
  alturaAcimaM: number;
  /** O bloco casado (nome de agora) e o que ele tem na planta; null = sem bloco. */
  blocoNome: string | null;
  pavimentosNaPlanta: number | null;
  garagensNaPlanta: number | null;
  estado: EstadoDaTorreNaPlanta;
}

/** O papel de um bloco no Empreendimento: de qual torre é, e o nome de cada piso dele (de baixo para cima). */
export interface PapelDoBloco {
  torre: string;
  tipo: 'TORRE' | 'GARAGEM';
  nomesDosPisos: string[];
}

interface Mudanca {
  indice: number;
  campos: Partial<Pick<BlocoParaAjuste, 'nome' | 'pavimentos' | 'cotaBaseMm' | 'peDireitoMm' | 'pontos'>>;
}

interface PlanoDoAjuste {
  linhas: LinhaDoAjuste[];
  mudancas: Mudanca[];
  novos: BlocoParaAjuste[];
  /** Subsolos que não são de torre nenhuma (o "Subsolo" do lote inteiro do gerador). */
  subsolosAvulsos: number[];
  papeis: Map<number, PapelDoBloco>;
  avisos: string[];
}

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
const caixa = (p: Point[]) => ({ x0: Math.min(...p.map((q) => q.x)), x1: Math.max(...p.map((q) => q.x)), y0: Math.min(...p.map((q) => q.y)), y1: Math.max(...p.map((q) => q.y)) });
const sobrepoe = (a: Point[], b: Point[]) => {
  const ca = caixa(a);
  const cb = caixa(b);
  return ca.x0 < cb.x1 && cb.x0 < ca.x1 && ca.y0 < cb.y1 && cb.y0 < ca.y1;
};
const mesmosPontos = (a: Point[], b: Point[]) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

/** Trechos de pisos consecutivos com o mesmo pé-direito (o piso sem pé-direito usa o do bloco). */
function trechos(pisos: readonly PisoDaTorre[], pdDoBloco: number): { pisos: PisoDaTorre[]; pd: number }[] {
  const out: { pisos: PisoDaTorre[]; pd: number }[] = [];
  for (const p of pisos) {
    const pd = p.peDireitoMm ?? pdDoBloco;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.pd === pd) ultimo.pisos.push(p);
    else out.push({ pisos: [p], pd });
  }
  return out;
}

function planejar(blocos: readonly BlocoParaAjuste[], estruturas: readonly EstruturaDaTorre[]): PlanoDoAjuste {
  const linhas: LinhaDoAjuste[] = [];
  const mudancas: Mudanca[] = [];
  const novos: BlocoParaAjuste[] = [];
  const papeis = new Map<number, PapelDoBloco>();
  const avisos: string[] = [];

  // Um bloco com outro apoiado em cima (embasamento, o térreo empilhado) não é torre; garagem e subsolo também não.
  const temOutroEmCima = (i: number) => {
    const b = blocos[i];
    const topo = b.cotaBaseMm + b.pavimentos * b.peDireitoMm;
    return blocos.some((o, j) => j !== i && Math.abs(o.cotaBaseMm - topo) < 1 && sobrepoe(o.pontos, b.pontos));
  };
  const candidatos = blocos.map((_, i) => i).filter((i) => blocos[i].uso !== 'GARAGEM' && blocos[i].cotaBaseMm >= 0 && !temOutroEmCima(i));
  // Os blocos que o ajuste cria levam "<torre> · <pavimento>": o térreo empilhado, as garagens.
  const nomesDaPilha = (torre: string, e: EstruturaDaTorre) => new Set([...e.acima, ...e.garagens].map((p) => norm(`${torre} · ${p.nome}`)));
  const daPilha = new Set<string>();
  for (const e of estruturas) {
    for (const n of nomesDaPilha(e.nome, e)) daPilha.add(n);
    daPilha.add(norm(nomeDaGaragem(e.nome)));
  }

  const comPisos = estruturas.filter((e) => e.acima.length > 0);
  const par = new Map<EstruturaDaTorre, number>();
  const usados = new Set<number>();
  for (const e of comPisos) {
    const i = candidatos.find((c) => !usados.has(c) && norm(blocos[c].nome) === norm(e.nome));
    if (i !== undefined) {
      par.set(e, i);
      usados.add(i);
    }
  }
  const sobra = candidatos.filter((c) => !usados.has(c)).sort((a, b) => blocos[a].nome.localeCompare(blocos[b].nome, 'pt-BR', { numeric: true }));
  for (const e of comPisos) {
    if (par.has(e) || sobra.length === 0) continue;
    const i = sobra.shift()!;
    par.set(e, i);
    usados.add(i);
  }

  for (const e of estruturas) {
    const base = { torre: e.nome, fonte: e.fonte, acima: e.acima.length, garagens: e.garagens.length };
    if (e.acima.length === 0) {
      linhas.push({ ...base, alturaAcimaM: 0, blocoNome: null, pavimentosNaPlanta: null, garagensNaPlanta: null, estado: 'SEM_PAVIMENTOS' });
      continue;
    }
    const i = par.get(e);
    if (i === undefined) {
      linhas.push({ ...base, alturaAcimaM: 0, blocoNome: null, pavimentosNaPlanta: null, garagensNaPlanta: null, estado: 'SEM_BLOCO' });
      avisos.push(`Torre "${e.nome}" não tem bloco na planta — desenhe o bloco ou gere a massa.`);
      continue;
    }
    const b = blocos[i];
    let mudou = false;
    // Os nomes que a pilha desta torre pode ter: com o nome do Empreendimento e com o nome de agora do bloco.
    const nossos = new Set([...nomesDaPilha(e.nome, e), ...nomesDaPilha(b.nome, e)]);
    const acharNosso = (nome: string, outroNome: string) => blocos.findIndex((o, j) => j !== i && (norm(o.nome) === norm(nome) || norm(o.nome) === norm(outroNome)));
    const usadosDaPilha = new Set<number>([i]);
    /** Põe o bloco `j` (ou um novo) no lugar `alvo`; devolve se mudou algo. */
    const colocar = (j: number, alvo: BlocoParaAjuste): boolean => {
      if (j < 0) {
        novos.push(alvo);
        return true;
      }
      usadosDaPilha.add(j);
      const o = blocos[j];
      const c: Mudanca['campos'] = {};
      if (o.nome !== alvo.nome) c.nome = alvo.nome;
      if (o.pavimentos !== alvo.pavimentos) c.pavimentos = alvo.pavimentos;
      if (o.cotaBaseMm !== alvo.cotaBaseMm) c.cotaBaseMm = alvo.cotaBaseMm;
      if (o.peDireitoMm !== alvo.peDireitoMm) c.peDireitoMm = alvo.peDireitoMm;
      if (!mesmosPontos(o.pontos, alvo.pontos)) c.pontos = alvo.pontos;
      if (Object.keys(c).length === 0) return false;
      mudancas.push({ indice: j, campos: c });
      return true;
    };

    // Embaixo da torre, o que NÃO é da pilha dela (pilotis, embasamento do gerador): são os primeiros pisos.
    const alheiosEmbaixo = blocos.filter(
      (o, j) =>
        j !== i && o.cotaBaseMm >= 0 && !nossos.has(norm(o.nome)) && o.cotaBaseMm + o.pavimentos * o.peDireitoMm <= b.cotaBaseMm + 1 && sobrepoe(o.pontos, b.pontos),
    );
    const embaixo = alheiosEmbaixo.reduce((n, o) => n + o.pavimentos, 0);
    const baseDaPilha = alheiosEmbaixo.reduce((m, o) => Math.max(m, o.cotaBaseMm + o.pavimentos * o.peDireitoMm), 0);
    let pisosDaPilha = e.acima.slice(embaixo);
    if (pisosDaPilha.length === 0) {
      avisos.push(`Torre "${e.nome}": o Empreendimento tem ${e.acima.length} pavimento(s) e o bloco começa no ${embaixo + 1}º — ficou com 1.`);
      pisosDaPilha = [e.acima[e.acima.length - 1]];
    }
    // A torre (o bloco casado) é o trecho de CIMA; os de baixo viram "<torre> · <1º pavimento do trecho>".
    const ts = trechos(pisosDaPilha, b.peDireitoMm);
    let cota = baseDaPilha;
    ts.forEach((t, k) => {
      const ehTopo = k === ts.length - 1;
      const nome = ehTopo ? e.nome : `${e.nome} · ${t.pisos[0].nome}`;
      const alvo: BlocoParaAjuste = { nome, pontos: b.pontos, cotaBaseMm: cota, pavimentos: t.pisos.length, peDireitoMm: t.pd, uso: b.uso, levelId: b.levelId };
      const j = ehTopo ? i : acharNosso(nome, `${b.nome} · ${t.pisos[0].nome}`);
      if (colocar(j, alvo)) mudou = true;
      if (j >= 0) papeis.set(j, { torre: e.nome, tipo: 'TORRE', nomesDosPisos: t.pisos.map((p) => p.nome) });
      cota += t.pisos.length * t.pd;
    });
    const alturaAcimaM = Math.round(cota / 10) / 100;

    // As garagens, da mais funda para a mais rasa: o trecho de cima é "<torre> · Garagem"; os de baixo,
    // "<torre> · <1º pavimento do trecho>". O subsolo desce a partir do 0.
    const tg = trechos(e.garagens, b.peDireitoMm);
    let cotaG = -tg.reduce((soma, t) => soma + t.pisos.length * t.pd, 0);
    tg.forEach((t, k) => {
      const ehTopo = k === tg.length - 1;
      const nome = ehTopo ? nomeDaGaragem(e.nome) : `${e.nome} · ${t.pisos[0].nome}`;
      const alvo: BlocoParaAjuste = { nome, pontos: b.pontos, cotaBaseMm: cotaG, pavimentos: t.pisos.length, peDireitoMm: t.pd, uso: 'GARAGEM', levelId: b.levelId };
      const j = acharNosso(nome, ehTopo ? nomeDaGaragem(b.nome) : `${b.nome} · ${t.pisos[0].nome}`);
      if (colocar(j, alvo)) mudou = true;
      if (j >= 0) papeis.set(j, { torre: e.nome, tipo: 'GARAGEM', nomesDosPisos: t.pisos.map((p) => p.nome) });
      cotaG += t.pisos.length * t.pd;
    });
    if (e.garagens.length === 0) {
      const iG = acharNosso(nomeDaGaragem(e.nome), nomeDaGaragem(b.nome));
      if (iG >= 0) {
        usadosDaPilha.add(iG);
        avisos.push(`O bloco "${blocos[iG].nome}" existe na planta, mas a torre "${e.nome}" não tem garagem no Empreendimento — fica como está.`);
      }
    }
    // O que já foi desta pilha e não é mais (as alturas mudaram): fica, com aviso — nunca apagado aqui.
    blocos.forEach((o, j) => {
      if (!usadosDaPilha.has(j) && (nossos.has(norm(o.nome)) || norm(o.nome) === norm(nomeDaGaragem(e.nome)))) {
        avisos.push(`O bloco "${o.nome}" não é mais usado pela torre "${e.nome}" (as alturas do Empreendimento mudaram) — fica como está; apague se não for usar.`);
      }
    });

    const naPilha = [...usadosDaPilha].map((j) => blocos[j]);
    linhas.push({
      ...base,
      alturaAcimaM,
      blocoNome: b.nome,
      pavimentosNaPlanta: embaixo + naPilha.filter((o) => o.cotaBaseMm >= 0).reduce((n, o) => n + o.pavimentos, 0),
      garagensNaPlanta: naPilha.filter((o) => o.cotaBaseMm < 0).reduce((n, o) => n + o.pavimentos, 0),
      estado: mudou ? 'AJUSTAR' : 'OK',
    });
  }

  for (const c of candidatos) if (!usados.has(c)) avisos.push(`O bloco "${blocos[c].nome}" não corresponde a nenhuma torre do Empreendimento — fica como está.`);
  const subsolosAvulsos = blocos
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.uso === 'GARAGEM' && b.cotaBaseMm < 0 && !daPilha.has(norm(b.nome)))
    .map(({ i }) => i);
  return { linhas, mudancas, novos, subsolosAvulsos, papeis, avisos };
}

/** Os blocos DESENHADOS: o que mostrar (linhas, papéis por id, avisos) e os comandos do "Ajustar ao Empreendimento". */
export function comandosDoAjuste(
  model: BlueprintModel,
  estruturas: readonly EstruturaDaTorre[],
): { linhas: LinhaDoAjuste[]; comandos: Command[]; papeis: Map<ObjectId, PapelDoBloco>; avisos: string[] } {
  const blocos = model.blocos ?? [];
  const p = planejar(blocos, estruturas);
  const avisos = [...p.avisos];
  if (p.subsolosAvulsos.length > 0 && estruturas.some((e) => e.garagens.length > 0)) {
    for (const i of p.subsolosAvulsos) avisos.push(`O bloco "${blocos[i].nome}" não é de nenhuma torre (as garagens do Empreendimento ficam sob cada torre) — fica como está; apague se não for usar.`);
  }
  const comandos: Command[] = [
    ...p.mudancas.map((m): Command => ({ type: 'SetBlocoProps', blocoId: blocos[m.indice].id, ...m.campos })),
    ...p.novos.map((n): Command => ({ type: 'AddBloco', levelId: n.levelId!, nome: n.nome, pontos: n.pontos, cotaBaseMm: n.cotaBaseMm, pavimentos: n.pavimentos, peDireitoMm: n.peDireitoMm, uso: n.uso })),
  ];
  const papeis = new Map<ObjectId, PapelDoBloco>();
  for (const [i, papel] of p.papeis) papeis.set(blocos[i].id, papel);
  return { linhas: p.linhas, comandos, papeis, avisos };
}

/**
 * Os blocos PROPOSTOS pelo Gerar massa, vestidos com as torres antes do `AddBloco`. O subsolo do lote inteiro
 * do gerador sai quando o Empreendimento declara garagem em alguma torre — a garagem passa a ser a dele.
 */
export function vestirBlocosPropostos(blocos: readonly BlocoProposto[], estruturas: readonly EstruturaDaTorre[]): { blocos: BlocoProposto[]; avisos: string[] } {
  const p = planejar(blocos, estruturas);
  const avisos = [...p.avisos];
  const tirar = new Set(estruturas.some((e) => e.garagens.length > 0) ? p.subsolosAvulsos : []);
  if (tirar.size > 0) avisos.push('O subsolo do lote inteiro do gerador saiu: as garagens são as do Empreendimento, sob cada torre.');
  const out = blocos.map((b) => ({ ...b }));
  for (const m of p.mudancas) Object.assign(out[m.indice], m.campos);
  return {
    blocos: [...out.filter((_, i) => !tirar.has(i)), ...p.novos.map(({ levelId: _l, ...n }) => n)],
    avisos,
  };
}
