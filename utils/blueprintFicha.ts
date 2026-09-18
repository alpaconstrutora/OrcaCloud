/**
 * FICHA DO ELEMENTO — o "Objeto Inteligente" (18/09/2026, roadmap E1.5).
 *
 * ─── SÓ LEITURA, E JUNTA O QUE AS FASES ANTERIORES CRIARAM ──────────────────
 *
 * Geometria (kernel) + tipo (E1.1: resumo e quantas iguais) + parâmetros
 * gravados (E1.2) + calculados por fórmula (E1.3) + restrições conferidas
 * (E1.4b) + custo (orçamento, quando apurado) + pavimento. Nada aqui grava;
 * é a mesma informação que os painéis mostram, numa ordem só, legível e
 * copiável — o que se cola num e-mail ou se confere numa reunião.
 *
 * Porta: hospedeira e os ambientes dos dois lados (do arranjo planar), como
 * o roadmap descreveu ("ambiente origem = sala, destino = corredor").
 */
import type { BlueprintModel, Opening, Point, Space, Structural, Wall } from './blueprintKernel';
import { FORMA_ESTRUTURAL, nomeDoTipoDeAbertura, nomeDoTipoEstrutural, pointInPolygon, rotuloCurto, wallLength } from './blueprintKernel';
import { avaliarDefinicoes, formatarValor, variaveisDaPeca, type DefinicaoComFamilia, type Peca } from './blueprintFormulas';
import { assinaturaDoTipo, propriedadesDaEscada, propriedadesDaEstrutura, propriedadesDoTelhado, propriedadesDoTerminal, resumoDoTipo } from './blueprintTipos';
import { ROTULO_DA_RESTRICAO, type Conferencia } from './blueprintRestricoes';
import { ROTULO_DA_DISCIPLINA } from './blueprintRede';

export interface LinhaDaFicha {
  rotulo: string;
  valor: string;
  /** Realce: calculado (ƒ), violado (⚠) ou nada. */
  marca?: 'formula' | 'violada' | 'ok';
}
export interface SecaoDaFicha {
  titulo: string;
  linhas: LinhaDaFicha[];
}
export interface Ficha {
  titulo: string;
  identificador: string;
  secoes: SecaoDaFicha[];
}

export interface ContextoDaFicha {
  definicoes?: readonly (DefinicaoComFamilia & { nome: string; unidade: string })[];
  conferencias?: readonly Conferencia[];
  custo?: { totalBRL: number; linhas: number };
}

/** Modelo montado à mão em teste pode não ter uid: a ficha não pode estourar por isso. */
const rc = (uid: string | undefined, familia: Parameters<typeof rotuloCurto>[1]) => (uid ? rotuloCurto(uid, familia) : '—');

const m2 = (mm: number) => `${(mm / 1000).toFixed(2).replace('.', ',')} m`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O ambiente que contém o ponto, se algum. */
function ambienteEm(model: BlueprintModel, levelId: string, p: Point): Space | null {
  return model.spaces.find((s) => s.levelId === levelId && s.ring.length >= 3 && pointInPolygon(s.ring, p)) ?? null;
}
function nomeDoAmbiente(model: BlueprintModel, s: Space | null): string {
  if (!s) return 'exterior';
  return s.name || `ambiente ${model.spaces.indexOf(s) + 1}`;
}

/** A peça pelo id, com a família — ou `null` quando o id não é de uma família com ficha. */
export function pecaDaFicha(model: BlueprintModel, id: string): Peca | null {
  const w = model.walls.find((x) => x.id === id);
  if (w) return { familia: 'wall', peca: w };
  const o = model.openings.find((x) => x.id === id);
  if (o) return { familia: 'opening', peca: o };
  const s = (model.structures ?? []).find((x) => x.id === id);
  if (s) return { familia: 'structural', peca: s };
  const r = (model.roofs ?? []).find((x) => x.id === id);
  if (r) return { familia: 'roof', peca: r };
  const e = (model.stairs ?? []).find((x) => x.id === id);
  if (e) return { familia: 'stair', peca: e };
  const t = (model.trechos ?? []).find((x) => x.id === id);
  if (t) return { familia: 'trecho', peca: t };
  const te = (model.terminais ?? []).find((x) => x.id === id);
  if (te) return { familia: 'terminal', peca: te };
  const q = (model.quadros ?? []).find((x) => x.id === id);
  if (q) return { familia: 'quadro', peca: q };
  return null;
}

export function fichaDoElemento(model: BlueprintModel, id: string, ctx: ContextoDaFicha = {}): Ficha | null {
  const alvo = pecaDaFicha(model, id);
  if (!alvo) return null;
  const secoes: SecaoDaFicha[] = [];
  const vars = variaveisDaPeca(model, alvo);
  const nivelNome = typeof vars['pavimento.nome'] === 'string' ? (vars['pavimento.nome'] as string) : null;

  // ── Identificação e geometria por família ─────────────────────────────────
  let titulo = '';
  let familiaTipo: 'ESTRUTURA' | 'TERMINAL' | 'ESCADA' | 'TELHADO' | null = null;
  let assinatura: string | null = null;
  const geo: LinhaDaFicha[] = [];
  switch (alvo.familia) {
    case 'wall': {
      const w = alvo.peca as Wall;
      titulo = `Parede ${rc(w.uid, 'wall')}`;
      geo.push({ rotulo: 'Comprimento', valor: m2(wallLength(w)) }, { rotulo: 'Espessura', valor: `${w.thicknessMm} mm` }, { rotulo: 'Altura', valor: m2(w.heightMm) });
      geo.push({ rotulo: 'Área (uma face, bruta)', valor: `${(vars.area as number).toFixed(2).replace('.', ',')} m²` });
      if (w.camadas?.length) geo.push({ rotulo: 'Composição', valor: w.camadas.map((c) => `${c.espessuraMm} ${c.descricao || c.funcao.toLowerCase()}`).join(' + ') });
      const aberturas = model.openings.filter((o) => o.wallId === w.id);
      if (aberturas.length) geo.push({ rotulo: 'Vãos', valor: aberturas.map((o) => `${nomeDoTipoDeAbertura(o.kind)} ${o.widthMm}×${o.heightMm}`).join(', ') });
      break;
    }
    case 'opening': {
      const o = alvo.peca as Opening;
      const w = model.walls.find((x) => x.id === o.wallId);
      titulo = `${nomeDoTipoDeAbertura(o.kind)} ${o.esquadria?.nome || rc(o.uid, 'opening')}`;
      geo.push({ rotulo: 'Largura × altura', valor: `${o.widthMm} × ${o.heightMm} mm` });
      if (o.sillMm > 0) geo.push({ rotulo: 'Peitoril', valor: `${o.sillMm} mm` });
      if (w) {
        geo.push({ rotulo: 'Parede hospedeira', valor: `${rc(w.uid, 'wall')} · a ${o.offsetMm} mm da ponta` });
        // Os dois lados do vão: um pouco para cada lado da normal, no meio do vão.
        const comp = wallLength(w) || 1;
        const ux = (w.b.x - w.a.x) / comp;
        const uy = (w.b.y - w.a.y) / comp;
        const meio = { x: w.a.x + ux * (o.offsetMm + o.widthMm / 2), y: w.a.y + uy * (o.offsetMm + o.widthMm / 2) };
        const off = w.thicknessMm / 2 + 50;
        const lado1 = ambienteEm(model, w.levelId, { x: meio.x - uy * off, y: meio.y + ux * off });
        const lado2 = ambienteEm(model, w.levelId, { x: meio.x + uy * off, y: meio.y - ux * off });
        geo.push({ rotulo: 'Liga', valor: `${nomeDoAmbiente(model, lado1)} ↔ ${nomeDoAmbiente(model, lado2)}` });
      }
      if (o.esquadria?.itemCode) geo.push({ rotulo: 'Item de catálogo', valor: `${o.esquadria.itemCode}${o.esquadria.descricao ? ` — ${o.esquadria.descricao}` : ''}` });
      if (o.kind === 'door') geo.push({ rotulo: 'Acessível (NBR 9050, vão ≥ 800)', valor: o.widthMm >= 800 ? 'sim' : `não — ${o.widthMm} mm` });
      break;
    }
    case 'structural': {
      const s = alvo.peca as Structural;
      titulo = `${nomeDoTipoEstrutural(s.kind)} ${s.rotulo || rc(s.uid, 'structural')}`;
      familiaTipo = 'ESTRUTURA';
      assinatura = assinaturaDoTipo(propriedadesDaEstrutura(s));
      geo.push({ rotulo: 'Tipo', valor: resumoDoTipo(propriedadesDaEstrutura(s)) });
      if (FORMA_ESTRUTURAL[s.kind] === 'LINHA') geo.push({ rotulo: 'Comprimento', valor: m2((vars.comprimento as number) * 1000) });
      geo.push({ rotulo: 'Cota da base', valor: m2(s.baseMm) }, { rotulo: 'Volume bruto', valor: `${(vars.volume as number).toFixed(3).replace('.', ',')} m³` });
      break;
    }
    case 'roof': {
      familiaTipo = 'TELHADO';
      assinatura = assinaturaDoTipo(propriedadesDoTelhado(alvo.peca));
      titulo = `Água de telhado ${rc(alvo.peca.uid, 'roof')}`;
      geo.push({ rotulo: 'Tipo', valor: resumoDoTipo(propriedadesDoTelhado(alvo.peca)) }, { rotulo: 'Área em planta', valor: `${(vars.area as number).toFixed(2).replace('.', ',')} m²` });
      break;
    }
    case 'stair': {
      familiaTipo = 'ESCADA';
      assinatura = assinaturaDoTipo(propriedadesDaEscada(alvo.peca));
      titulo = alvo.peca.rotulo || `${alvo.peca.tipo === 'RAMPA' ? 'Rampa' : 'Escada'} ${rc(alvo.peca.uid, 'stair')}`;
      geo.push({ rotulo: 'Tipo', valor: resumoDoTipo(propriedadesDaEscada(alvo.peca)) }, { rotulo: 'Percurso', valor: m2((vars.comprimento as number) * 1000) });
      break;
    }
    case 'trecho': {
      const t = alvo.peca;
      titulo = `Trecho ${ROTULO_DA_DISCIPLINA[t.disciplina]} ${t.rotulo || rc(t.uid, 'trecho')}`;
      geo.push({ rotulo: 'Comprimento (3D)', valor: m2((vars.comprimento as number) * 1000) }, { rotulo: 'Bitola / DN', valor: `${t.bitolaMm} mm` }, { rotulo: 'Cotas', valor: `${t.cotaAMm} → ${t.cotaBMm} mm` });
      break;
    }
    case 'terminal': {
      const t = alvo.peca;
      familiaTipo = 'TERMINAL';
      assinatura = assinaturaDoTipo(propriedadesDoTerminal(t));
      titulo = `Ponto ${ROTULO_DA_DISCIPLINA[t.disciplina]} ${t.rotulo || rc(t.uid, 'terminal')}`;
      geo.push({ rotulo: 'Tipo', valor: resumoDoTipo(propriedadesDoTerminal(t)) });
      const amb = ambienteEm(model, t.levelId, t.at);
      geo.push({ rotulo: 'Ambiente', valor: nomeDoAmbiente(model, amb) });
      break;
    }
    case 'quadro': {
      const q = alvo.peca;
      titulo = `Quadro ${q.nome || rc(q.uid, 'quadro')}`;
      geo.push({ rotulo: 'Cota', valor: m2(q.cotaMm) });
      if (q.tensaoV) geo.push({ rotulo: 'Tensão', valor: `${q.tensaoV} V` });
      break;
    }
  }
  if (nivelNome) geo.push({ rotulo: 'Pavimento', valor: `${nivelNome} · pé-direito ${m2((vars['pavimento.pe_direito'] as number) * 1000)}` });
  secoes.push({ titulo: 'Geometria', linhas: geo });

  // ── Tipo: quantas peças iguais ────────────────────────────────────────────
  if (familiaTipo && assinatura) {
    const iguais =
      familiaTipo === 'ESTRUTURA'
        ? (model.structures ?? []).filter((s) => assinaturaDoTipo(propriedadesDaEstrutura(s)) === assinatura).length
        : familiaTipo === 'TERMINAL'
          ? (model.terminais ?? []).filter((t) => assinaturaDoTipo(propriedadesDoTerminal(t)) === assinatura).length
          : familiaTipo === 'ESCADA'
            ? (model.stairs ?? []).filter((e) => assinaturaDoTipo(propriedadesDaEscada(e)) === assinatura).length
            : (model.roofs ?? []).filter((r) => assinaturaDoTipo(propriedadesDoTelhado(r)) === assinatura).length;
    secoes.push({ titulo: 'Tipo', linhas: [{ rotulo: 'Peças iguais no desenho', valor: iguais === 1 ? 'só esta' : String(iguais) }] });
  }

  // ── Parâmetros: gravados + calculados ─────────────────────────────────────
  const gravados = (alvo.peca as { parametros?: Record<string, string | number | boolean> }).parametros ?? {};
  const defs = (ctx.definicoes ?? []).filter((d) => d.familia === null || d.familia === alvo.familia);
  const nomeDe = (chave: string) => {
    const d = defs.find((x) => x.chave === chave);
    return d ? (d.unidade ? `${d.nome} (${d.unidade})` : d.nome) : chave;
  };
  const linhasParam: LinhaDaFicha[] = Object.keys(gravados)
    .sort()
    .map((k) => ({ rotulo: nomeDe(k), valor: formatarValor(gravados[k]) }));
  const calculados = avaliarDefinicoes(
    defs.map((d) => ({ chave: d.chave, formula: d.formula })),
    vars,
  );
  for (const c of calculados) {
    linhasParam.push({ rotulo: nomeDe(c.chave), valor: c.erro ? `erro: ${c.erro}` : formatarValor(c.valor!), marca: 'formula' });
  }
  if (linhasParam.length) secoes.push({ titulo: 'Parâmetros', linhas: linhasParam });

  // ── Custo ─────────────────────────────────────────────────────────────────
  if (ctx.custo) secoes.push({ titulo: 'Custo (orçamento)', linhas: [{ rotulo: 'Total', valor: `${brl(ctx.custo.totalBRL)} em ${ctx.custo.linhas} linha(s)` }] });

  // ── Restrições ────────────────────────────────────────────────────────────
  const minhas = (ctx.conferencias ?? []).filter((c) => c.restricao.alvo.uid === alvo.peca.uid);
  if (minhas.length) {
    secoes.push({
      titulo: 'Restrições',
      linhas: minhas.map((c) => ({
        rotulo: `${ROTULO_DA_RESTRICAO[c.restricao.tipo]}${c.referencia ? ` ${c.referencia}` : ''}`,
        valor: c.atendida ? 'atendida' : `violada — ${c.unidade === 'mm' ? `${Math.round(c.desvio)} mm` : `${c.desvio.toFixed(1)}°`}`,
        marca: c.atendida ? 'ok' : 'violada',
      })),
    });
  }

  return { titulo, identificador: rc(alvo.peca.uid, alvo.familia === 'structural' ? 'structural' : alvo.familia === 'roof' ? 'roof' : alvo.familia === 'stair' ? 'stair' : alvo.familia), secoes };
}

/** A ficha em texto — o que "Copiar ficha" põe na área de transferência. */
export function fichaComoTexto(f: Ficha): string {
  const linhas: string[] = [`${f.titulo} (${f.identificador})`];
  for (const s of f.secoes) {
    linhas.push('', s.titulo.toUpperCase());
    for (const l of s.linhas) linhas.push(`  ${l.rotulo}: ${l.valor}${l.marca === 'formula' ? ' (fórmula)' : ''}`);
  }
  return linhas.join('\n');
}
