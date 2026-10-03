/**
 * CRIAR O LOTE DIGITANDO (03/10/2026) — *"hoje o terreno ou lote é criado
 * apenas desenhando. implementar também digitando"*.
 *
 * Cinco abas, uma por forma de dizer o contorno: frente × fundo, lados e
 * ângulos, azimutes/rumos, coordenadas e o memorial colado (que antes morava
 * no Roteiro, inalcançável sem lote). Embaixo, comum a todas: a prévia, a área,
 * o erro de fechamento e — quando ele passa da tolerância — a escolha de como
 * fechar. Nada grava aqui: "Lançar o lote" entrega o contorno fechado ao pai,
 * que aplica os comandos num lote só (Ctrl+Z desfaz).
 *
 * EDITAR (03/10/2026) — *"se o lote já estiver sido criado, e ao clicar em
 * digitar, carregar os valores do lote e permita editar (alterar)"*: com
 * `existente`, as abas nascem preenchidas com o lote atual (no mesmo lugar do
 * desenho) e "Aplicar as alterações" o substitui. Cada linha carrega a HERANÇA
 * do lado e do vértice de onde veio — papel, medida da escritura, SIGEF, tipo e
 * sigmas do vértice — e ela vai junto mesmo que a linha mude de posição.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Pencil, Plus } from 'lucide-react';
import type { Georreferencia } from '../../utils/blueprintKernel';
import {
  anguloTexto,
  aplicarHeranca,
  fecharLote,
  herancaPorVertices,
  lerAnguloDigitado,
  lerAzimuteOuRumo,
  lerMedidaEmMetros,
  lotePorAzimutes,
  lotePorCoordenadas,
  lotePorLadosEAngulos,
  loteRetangular,
  metrosTexto,
  toleranciaDeFechamentoMm,
  type DadosDoVertice,
  type DecisaoDeFechamento,
  type HerancaDoLado,
  type LoteExistente,
  type LoteDigitado,
  type LoteFechado,
  type ModoDoLoteDigitado,
} from '../../utils/blueprintLoteDigitado';
import { restituirMemorial } from '../../utils/blueprintRoteiroPerimetrico';
import { numeroBr } from '../../utils/blueprintMemorialLote';
import { azimuteTexto } from '../../utils/geo';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import ActionIconButton from '../ui/ActionIconButton';

export interface OpcoesDoLancamento {
  substituir: boolean;
  medidasDaEscritura: boolean;
  /** Edição do lote existente: substitui sem perguntar — nada se perde, tudo vai pela herança. */
  editando: boolean;
}

interface Props {
  rotacaoNorteDeg: number;
  georreferencia: Georreferencia | null;
  /** O estudo já tem divisas de lote: lançar exige "substituir". */
  temLote: boolean;
  /** Aplica o lote; devolve a mensagem de erro, ou `null` quando lançou. */
  onLancar: (lote: LoteFechado, opcoes: OpcoesDoLancamento) => Promise<string | null>;
  /** A aba com que a gaveta abre (o Roteiro abre direto no memorial). */
  abaInicial?: ModoDoLoteDigitado;
  /** O lote fechado que o estudo já tem: as abas nascem com ele, para editar. */
  existente?: LoteExistente | null;
}

const ABAS: TabsBarItem<ModoDoLoteDigitado>[] = [
  { id: 'RETANGULO', label: 'Frente × fundo' },
  { id: 'LADOS', label: 'Lados e ângulos' },
  { id: 'AZIMUTES', label: 'Azimutes/rumos' },
  { id: 'COORDENADAS', label: 'Coordenadas' },
  { id: 'MEMORIAL', label: 'Memorial (colar)' },
];

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO = 'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300';
const CELULA = 'w-full rounded-[6px] border border-gray-100 bg-gray-50 px-2 py-1 text-sm font-normal text-gray-900';
const TH = 'px-3 py-2 border-r border-gray-100';
const TD = 'px-3 py-2.5 border-r border-gray-100';

/** O que a linha herda do lote existente (edição); viaja com a linha. */
interface Herda {
  herdaLado?: HerancaDoLado | null;
  herdaVertice?: DadosDoVertice | null;
}
interface LinhaDeLado extends Herda {
  vertice: string;
  medida: string;
  angulo: string;
  confrontante: string;
}
interface LinhaDeAzimute extends Herda {
  vertice: string;
  azimute: string;
  distancia: string;
  confrontante: string;
}

type ColunaDeLado = 'vertice' | 'medida' | 'angulo' | 'confrontante';
type ColunaDeAzimute = 'vertice' | 'azimute' | 'distancia' | 'confrontante';

const linhasVazias = <T,>(n: number, f: () => T): T[] => Array.from({ length: n }, f);
const ladoVazio = (): LinhaDeLado => ({ vertice: '', medida: '', angulo: '', confrontante: '' });
const azimuteVazio = (): LinhaDeAzimute => ({ vertice: '', azimute: '', distancia: '', confrontante: '' });

/**
 * Colar do Excel: as células chegam separadas por tabulação e as linhas por
 * quebra. Preenche a partir da célula onde se colou, sem apagar o resto.
 */
function colarNaTabela<T extends object>(texto: string, linhas: T[], linhaInicial: number, colunas: (keyof T)[], colunaInicial: number, vazia: () => T): T[] | null {
  if (!/[\t\n]/.test(texto.trim())) return null;
  const grade = texto.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
  const novo = linhas.map((l) => ({ ...l }));
  grade.forEach((celulas, i) => {
    const r = linhaInicial + i;
    while (novo.length <= r) novo.push(vazia());
    celulas.forEach((valor, j) => {
      const c = colunas[colunaInicial + j];
      if (c) (novo[r] as Record<keyof T, unknown>)[c] = valor.trim();
    });
  });
  return novo;
}

export default function PainelLoteDigitado({ rotacaoNorteDeg, georreferencia, temLote, onLancar, abaInicial, existente = null }: Props) {
  const e = existente;
  const ret = e?.retangulo ?? null;
  // Editando: abre onde o lote se lê melhor — o retângulo na sua aba, o resto pelos azimutes (o que a escritura traz).
  const [aba, setAba] = useState<ModoDoLoteDigitado>(abaInicial ?? (e ? (ret ? 'RETANGULO' : 'AZIMUTES') : 'RETANGULO'));
  // Frente × fundo
  const [frente, setFrente] = useState(ret ? metrosTexto(ret.frenteMm) : '');
  const [profundidade, setProfundidade] = useState(ret ? metrosTexto(ret.profundidadeMm) : '');
  const [voltadaPara, setVoltadaPara] = useState(ret ? anguloTexto(ret.frenteVoltadaPara) : '');
  const [confrontantesRet, setConfrontantesRet] = useState({
    FRENTE: ret?.lados.FRENTE.confrontante ?? '',
    LATERAL_DIREITA: ret?.lados.LATERAL_DIREITA.confrontante ?? '',
    FUNDOS: ret?.lados.FUNDOS.confrontante ?? '',
    LATERAL_ESQUERDA: ret?.lados.LATERAL_ESQUERDA.confrontante ?? '',
  });
  // Lados e ângulos
  const [lados, setLados] = useState<LinhaDeLado[]>(() =>
    e
      ? e.anel.map((_, i) => ({
          vertice: e.vertices[i]?.nome ?? '',
          medida: metrosTexto(e.distanciasMm[i]),
          angulo: anguloTexto(e.angulosInternos[i]),
          confrontante: e.lados[i].confrontante ?? '',
          herdaLado: e.lados[i],
          herdaVertice: e.vertices[i],
        }))
      : linhasVazias(4, ladoVazio),
  );
  const [azPrimeiro, setAzPrimeiro] = useState(e ? anguloTexto(e.azimutes[0]) : '');
  // Azimutes
  const [azimutes, setAzimutes] = useState<LinhaDeAzimute[]>(() =>
    e
      ? e.anel.map((_, i) => ({
          vertice: e.vertices[i]?.nome ?? '',
          azimute: anguloTexto(e.azimutes[i]),
          distancia: metrosTexto(e.distanciasMm[i]),
          confrontante: e.lados[i].confrontante ?? '',
          herdaLado: e.lados[i],
          herdaVertice: e.vertices[i],
        }))
      : linhasVazias(4, azimuteVazio),
  );
  // Coordenadas — editando, as do DESENHO (em metros), que ficam onde estão.
  const [coordenadas, setCoordenadas] = useState(
    e ? e.anel.map((p, i) => [e.vertices[i]?.nome, metrosTexto(p.x), metrosTexto(p.y)].filter(Boolean).join('  ')).join('\n') : '',
  );
  const [ordem, setOrdem] = useState<'EN' | 'NE'>('EN');
  const [unidade, setUnidade] = useState<'AUTO' | 'M' | 'MM' | 'UTM'>(e ? 'M' : 'AUTO');
  const [manterCoordenadas, setManterCoordenadas] = useState(!!e);
  // Memorial
  const [memorial, setMemorial] = useState('');
  // Comum
  const [decisao, setDecisao] = useState<DecisaoDeFechamento | null>(null);
  // Editando, a escritura que o lote já tem fica — a não ser que se diga que as medidas digitadas são as dela.
  const [medidasDaEscritura, setMedidasDaEscritura] = useState(!e);
  const [substituir, setSubstituir] = useState(false);
  const [erroDoLancamento, setErroDoLancamento] = useState<string | null>(null);
  const [lancando, setLancando] = useState(false);

  const restituicao = useMemo(() => (memorial.trim() ? restituirMemorial(memorial) : null), [memorial]);

  /**
   * O contorno digitado na aba ativa, os avisos de leitura dela e — editando —
   * a herança de cada lado/vértice do contorno novo.
   */
  type Heranca = { lados: (HerancaDoLado | null | undefined)[]; vertices: (DadosDoVertice | null | undefined)[]; herdarConfrontante?: boolean; herdarNomes?: boolean };
  const { lote, leitura, heranca } = useMemo((): { lote: LoteDigitado | null; leitura: string[]; heranca: Heranca | null } => {
    const leitura: string[] = [];
    const origem = e?.anel[0] ?? null;
    const porLinhas = (ls: Herda[]): Heranca | null => (e ? { lados: ls.map((l) => l.herdaLado), vertices: ls.map((l) => l.herdaVertice) } : null);
    if (aba === 'RETANGULO') {
      const f = lerMedidaEmMetros(frente);
      const p = lerMedidaEmMetros(profundidade);
      if (!frente.trim() && !profundidade.trim()) return { lote: null, leitura, heranca: null };
      let az: number | null = null;
      if (voltadaPara.trim()) {
        const r = lerAzimuteOuRumo(voltadaPara);
        if (r.erro) leitura.push(`Frente voltada para: ${r.erro}.`);
        az = r.azimute;
      }
      return {
        lote: loteRetangular({ frenteMm: f ?? 0, profundidadeMm: p ?? 0, frenteVoltadaPara: az, rotacaoNorteDeg, confrontantes: confrontantesRet, origem: ret?.origem ?? origem }),
        leitura,
        // Retângulo editado herda por PAPEL; os nomes dos vértices pelos cantos (a aba não tem coluna de nome).
        heranca: ret
          ? { lados: (['FRENTE', 'LATERAL_DIREITA', 'FUNDOS', 'LATERAL_ESQUERDA'] as const).map((p) => ret.lados[p]), vertices: ret.vertices, herdarNomes: true }
          : null,
      };
    }
    if (aba === 'LADOS') {
      const usadas = lados.filter((l) => l.medida.trim() || l.angulo.trim());
      if (usadas.length === 0) return { lote: null, leitura, heranca: null };
      let az: number | null = null;
      if (azPrimeiro.trim()) {
        const r = lerAzimuteOuRumo(azPrimeiro);
        if (r.erro) leitura.push(`Azimute do 1º lado: ${r.erro}.`);
        az = r.azimute;
      }
      return {
        lote: lotePorLadosEAngulos(
          usadas.map((l) => ({ distanciaMm: lerMedidaEmMetros(l.medida) ?? 0, anguloInternoGraus: lerAnguloDigitado(l.angulo), confrontante: l.confrontante, verticeNome: l.vertice })),
          { azimuteDoPrimeiro: az, rotacaoNorteDeg, origem },
        ),
        leitura,
        heranca: porLinhas(usadas),
      };
    }
    if (aba === 'AZIMUTES') {
      const usadas = azimutes.filter((l) => l.azimute.trim() || l.distancia.trim());
      if (usadas.length === 0) return { lote: null, leitura, heranca: null };
      const trechos = usadas.map((l, i) => {
        const r = lerAzimuteOuRumo(l.azimute);
        if (r.erro && l.azimute.trim()) leitura.push(`Trecho ${i + 1}: ${r.erro}.`);
        return { azimute: r.azimute ?? Number.NaN, distanciaMm: lerMedidaEmMetros(l.distancia) ?? 0, confrontante: l.confrontante, verticeNome: l.vertice };
      });
      return { lote: lotePorAzimutes(trechos, { rotacaoNorteDeg, origem }), leitura, heranca: porLinhas(usadas) };
    }
    if (aba === 'COORDENADAS') {
      if (!coordenadas.trim()) return { lote: null, leitura, heranca: null };
      const r = lotePorCoordenadas(coordenadas, { georreferencia }, { ordem, unidade, manterCoordenadas });
      for (const l of r.naoLidas.slice(0, 5)) leitura.push(`Não li: “${l.slice(0, 80)}”.`);
      if (r.unidadeLida) {
        const unidadeTexto = r.unidadeLida === 'MM' ? 'milímetros' : 'metros';
        leitura.push(
          r.unidadeLida === 'UTM'
            ? 'Lidas como UTM: o lote cai no lugar pela georreferência do estudo.'
            : manterCoordenadas
              ? `Lidas em ${unidadeTexto}, como coordenadas do desenho.`
              : `Lidas em ${unidadeTexto}, locais: o 1º vértice vai para a origem do desenho.`,
        );
      }
      const h = e && !r.problema ? herancaPorVertices(r.vertices, e) : null;
      return { lote: r, leitura, heranca: h ? { ...h, herdarConfrontante: true } : null };
    }
    // MEMORIAL
    if (!restituicao || restituicao.trechos.length === 0) {
      if (restituicao) for (const t of restituicao.naoLidos.slice(0, 5)) leitura.push(`Não li: “${t.slice(0, 80)}”.`);
      return { lote: null, leitura, heranca: null };
    }
    for (const t of restituicao.naoLidos.slice(0, 5)) leitura.push(`Não li: “${t.slice(0, 80)}”.`);
    const nomes = [restituicao.verticeInicial, ...restituicao.trechos.slice(0, -1).map((t) => t.ateVertice)];
    const doMemorial = lotePorAzimutes(
      restituicao.trechos.map((t, i) => ({ azimute: t.azimute, distanciaMm: t.distanciaMm, confrontante: t.confrontante, verticeNome: nomes[i] ?? null })),
      { rotacaoNorteDeg, origem },
    );
    // Memorial colado sobre um lote existente: herda só pelo NOME do vértice (sem nomes, não há como casar).
    const h = e ? herancaPorVertices(doMemorial.vertices, e) : null;
    const comNome = h && doMemorial.vertices.some((x) => x);
    return { lote: doMemorial, leitura, heranca: comNome ? { ...h, herdarConfrontante: true } : null };
  }, [aba, frente, profundidade, voltadaPara, confrontantesRet, lados, azPrimeiro, azimutes, coordenadas, ordem, unidade, manterCoordenadas, restituicao, georreferencia, rotacaoNorteDeg, e, ret]);

  const tolerancia = lote ? toleranciaDeFechamentoMm(lote.perimetroMm) : 10;
  const precisaDecidir = !!lote && !lote.problema && lote.erroDeFechamentoMm > tolerancia;
  const fechado = useMemo(() => {
    if (!lote) return null;
    const f = fecharLote(lote, precisaDecidir ? decisao : null);
    return heranca ? aplicarHeranca(f, heranca.lados, heranca.vertices, { herdarConfrontante: heranca.herdarConfrontante, herdarNomes: heranca.herdarNomes }) : f;
  }, [lote, precisaDecidir, decisao, heranca]);
  const editando = !!e;
  const temMedidaDigitada = aba !== 'COORDENADAS';

  const motivoDesligado = !lote
    ? 'Digite as medidas do lote'
    : fechado?.problema
      ? fechado.problema
      : temLote && !editando && !substituir
        ? 'O estudo já tem lote: marque "Substituir o lote atual"'
        : lancando
          ? 'Lançando…'
          : null;

  const lancar = async () => {
    if (!fechado || motivoDesligado) return;
    setLancando(true);
    setErroDoLancamento(null);
    try {
      const erro = await onLancar(fechado, {
        substituir: editando || (temLote && substituir),
        medidasDaEscritura: temMedidaDigitada && medidasDaEscritura,
        editando,
      });
      setErroDoLancamento(erro);
    } finally {
      setLancando(false);
    }
  };

  const levarMemorialParaTabela = () => {
    if (!restituicao) return;
    const nomes = [restituicao.verticeInicial, ...restituicao.trechos.slice(0, -1).map((t) => t.ateVertice)];
    setAzimutes(
      restituicao.trechos.map((t, i) => ({
        vertice: nomes[i] ?? '',
        azimute: azimuteTexto(t.azimute, 2),
        distancia: numeroBr(t.distanciaMm / 1000),
        confrontante: t.confrontante ?? '',
      })),
    );
    setAba('AZIMUTES');
  };

  return (
    <div className="space-y-5 text-sm text-slate-700" data-testid="painel-lote-digitado">
      <TabsBar tabs={ABAS} value={aba} onChange={(a) => { setAba(a); setDecisao(null); setErroDoLancamento(null); }} />

      {e && (
        <p className="flex items-start gap-2 rounded-[6px] bg-blue-50 px-3 py-2 text-xs text-blue-800" data-testid="editando-lote">
          <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Editando o lote atual ({e.anel.length} lados, {numeroBr(e.areaMm2 / 1e6)} m²), carregado em todas as abas, no mesmo lugar do desenho.
            Aplicar substitui o contorno; papel, confrontante, medida da escritura, dados do SIGEF e nomes dos vértices acompanham cada lado.
          </span>
        </p>
      )}

      {aba === 'RETANGULO' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="lote-frente">Frente (m)</label>
              <input id="lote-frente" inputMode="decimal" value={frente} onChange={(e) => setFrente(e.target.value)} placeholder="12,00" className={CAMPO} />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="lote-profundidade">Profundidade (m)</label>
              <input id="lote-profundidade" inputMode="decimal" value={profundidade} onChange={(e) => setProfundidade(e.target.value)} placeholder="30,00" className={CAMPO} />
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="lote-voltada" title="O azimute da direção do lote para a rua. Vazio: a frente fica embaixo, no desenho.">
                Frente voltada para (opcional)
              </label>
              <input id="lote-voltada" value={voltadaPara} onChange={(e) => setVoltadaPara(e.target.value)} placeholder="ex.: 180° ou 30° SE" className={CAMPO} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {([
              ['FRENTE', 'Confrontante da frente'],
              ['LATERAL_DIREITA', 'Lateral direita'],
              ['FUNDOS', 'Fundos'],
              ['LATERAL_ESQUERDA', 'Lateral esquerda'],
            ] as const).map(([papel, rotulo]) => (
              <div key={papel} className="space-y-1.5">
                <label className={ROTULO} htmlFor={`lote-conf-${papel}`}>{rotulo}</label>
                <input
                  id={`lote-conf-${papel}`}
                  value={confrontantesRet[papel]}
                  onChange={(e) => setConfrontantesRet((c) => ({ ...c, [papel]: e.target.value }))}
                  placeholder={papel === 'FRENTE' ? 'Rua, avenida…' : 'Lote, córrego…'}
                  className={CAMPO}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Direita e esquerda de quem está na rua, olhando para o lote — a convenção da matrícula.</p>
        </div>
      )}

      {aba === 'LADOS' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            No sentido horário (o interior à direita). O ângulo é o INTERNO no vértice onde o lado começa; o do 1º vértice é opcional e só confere o fechamento.
            Dá para colar do Excel.
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  <th className={`${TH} w-9 text-center`}>#</th>
                  <th className={`${TH} w-24`}>Vértice</th>
                  <th className={`${TH} w-28`}>Medida (m)</th>
                  <th className={`${TH} w-32`}>Ângulo interno</th>
                  <th className="px-4 py-2 border-r border-gray-100">Confrontante</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lados.map((l, i) => {
                  const colunas: ColunaDeLado[] = ['vertice', 'medida', 'angulo', 'confrontante'];
                  const campo = (c: ColunaDeLado, rotulo: string, placeholder: string, decimal = false) => (
                    <input
                      value={l[c]}
                      inputMode={decimal ? 'decimal' : undefined}
                      onChange={(e) => setLados((ls) => ls.map((x, k) => (k === i ? { ...x, [c]: e.target.value } : x)))}
                      onPaste={(e) => {
                        const novo = colarNaTabela(e.clipboardData.getData('text'), lados, i, colunas, colunas.indexOf(c), ladoVazio);
                        if (novo) {
                          e.preventDefault();
                          setLados(novo);
                        }
                      }}
                      placeholder={placeholder}
                      aria-label={`${rotulo} do lado ${i + 1}`}
                      className={CELULA}
                    />
                  );
                  return (
                    <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                      <td className={`${TD} text-center text-sm font-normal text-gray-600`}>{i + 1}</td>
                      <td className={TD}>{campo('vertice', 'Vértice', `P${i + 1}`)}</td>
                      <td className={TD}>{campo('medida', 'Medida', '0,00', true)}</td>
                      <td className={TD}>{campo('angulo', 'Ângulo interno', i === 0 ? 'opcional' : "90°00'00\"")}</td>
                      <td className="px-4 py-2.5 border-r border-gray-100">{campo('confrontante', 'Confrontante', 'Rua, lote…')}</td>
                      <td className="px-3 py-2.5 text-center">
                        <ActionIconButton kind="delete" title={lados.length <= 3 ? 'O lote precisa de pelo menos três lados' : `Tirar o lado ${i + 1}`} disabled={lados.length <= 3} onClick={() => setLados((ls) => ls.filter((_, k) => k !== i))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <button type="button" onClick={() => setLados((ls) => [...ls, ladoVazio()])} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
              <Plus className="h-[15px] w-[15px]" /> Adicionar lado
            </button>
            <div className="space-y-1.5 w-64">
              <label className={ROTULO} htmlFor="lote-az-primeiro" title="Vazio: o 1º lado corre para a direita no desenho.">Azimute do 1º lado (opcional)</label>
              <input id="lote-az-primeiro" value={azPrimeiro} onChange={(e) => setAzPrimeiro(e.target.value)} placeholder="ex.: 90° ou 45°30' NE" className={CAMPO} />
            </div>
          </div>
        </div>
      )}

      {aba === 'AZIMUTES' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Azimute (0° a 360°) ou rumo (“45°30' SE”, “S 45°30' E”), verdadeiros, como na escritura
            {rotacaoNorteDeg ? <> — o desenho tem o norte girado {numeroBr(rotacaoNorteDeg, 1)}°, e o lote gira junto</> : null}. Dá para colar do Excel.
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-gray-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                  <th className={`${TH} w-9 text-center`}>#</th>
                  <th className={`${TH} w-24`}>Vértice</th>
                  <th className={`${TH} w-36`}>Azimute ou rumo</th>
                  <th className={`${TH} w-28`}>Distância (m)</th>
                  <th className="px-4 py-2 border-r border-gray-100">Confrontante</th>
                  <th className="px-3 py-2 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {azimutes.map((l, i) => {
                  const colunas: ColunaDeAzimute[] = ['vertice', 'azimute', 'distancia', 'confrontante'];
                  const campo = (c: ColunaDeAzimute, rotulo: string, placeholder: string, decimal = false) => (
                    <input
                      value={l[c]}
                      inputMode={decimal ? 'decimal' : undefined}
                      onChange={(e) => setAzimutes((ls) => ls.map((x, k) => (k === i ? { ...x, [c]: e.target.value } : x)))}
                      onPaste={(e) => {
                        const novo = colarNaTabela(e.clipboardData.getData('text'), azimutes, i, colunas, colunas.indexOf(c), azimuteVazio);
                        if (novo) {
                          e.preventDefault();
                          setAzimutes(novo);
                        }
                      }}
                      placeholder={placeholder}
                      aria-label={`${rotulo} do trecho ${i + 1}`}
                      className={CELULA}
                    />
                  );
                  return (
                    <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                      <td className={`${TD} text-center text-sm font-normal text-gray-600`}>{i + 1}</td>
                      <td className={TD}>{campo('vertice', 'Vértice', `P${i + 1}`)}</td>
                      <td className={TD}>{campo('azimute', 'Azimute ou rumo', "90°00'00\"")}</td>
                      <td className={TD}>{campo('distancia', 'Distância', '0,00', true)}</td>
                      <td className="px-4 py-2.5 border-r border-gray-100">{campo('confrontante', 'Confrontante', 'Rua, lote…')}</td>
                      <td className="px-3 py-2.5 text-center">
                        <ActionIconButton kind="delete" title={azimutes.length <= 3 ? 'O lote precisa de pelo menos três trechos' : `Tirar o trecho ${i + 1}`} disabled={azimutes.length <= 3} onClick={() => setAzimutes((ls) => ls.filter((_, k) => k !== i))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setAzimutes((ls) => [...ls, azimuteVazio()])} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50">
            <Plus className="h-[15px] w-[15px]" /> Adicionar trecho
          </button>
        </div>
      )}

      {aba === 'COORDENADAS' && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={ROTULO} htmlFor="lote-coordenadas">Vértices, um por linha, na ordem do contorno</label>
            <textarea
              id="lote-coordenadas"
              value={coordenadas}
              onChange={(e) => setCoordenadas(e.target.value)}
              rows={7}
              placeholder={'P1  612345,123  7796543,210\nP2  612357,123  7796543,210\n…'}
              className="w-full rounded-[6px] border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-normal text-gray-900"
            />
            <p className="text-xs text-slate-500">Nome opcional e duas coordenadas, separados por espaço, tabulação ou ponto e vírgula. Vírgula decimal vale.</p>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={manterCoordenadas} onChange={(ev) => setManterCoordenadas(ev.target.checked)} className="mt-0.5" />
            <span>São coordenadas do desenho (locais): o lote fica onde elas dizem, sem levar o 1º vértice para a origem</span>
          </label>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="lote-ordem">Ordem das colunas</label>
              <select id="lote-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as 'EN' | 'NE')} className={CAMPO}>
                <option value="EN">E, N (X, Y)</option>
                <option value="NE">N, E (Y, X)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={ROTULO} htmlFor="lote-unidade">Unidade</label>
              <select id="lote-unidade" value={unidade} onChange={(e) => setUnidade(e.target.value as typeof unidade)} className={CAMPO}>
                <option value="AUTO">Detectar</option>
                <option value="M">Metros (locais)</option>
                <option value="MM">Milímetros (locais)</option>
                <option value="UTM">UTM (pela georreferência do estudo)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {aba === 'MEMORIAL' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className={ROTULO} htmlFor="lote-memorial">Texto do memorial</label>
            <textarea
              id="lote-memorial"
              value={memorial}
              onChange={(e) => setMemorial(e.target.value)}
              rows={7}
              placeholder="Inicia-se no vértice P1; daí segue com azimute 90°00'00&quot; e distância de 12,00 m até o vértice P2, confrontando com a Rua A; …"
              className="w-full rounded-[6px] border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-normal text-gray-900"
            />
            <p className="text-xs text-slate-500">
              Lê azimute ou rumo, distância, “até o vértice …” e “confrontando com …”, trecho a trecho. O que não der para ler fica listado, não some.
            </p>
          </div>
          {restituicao && restituicao.trechos.length > 0 && (
            <button type="button" onClick={levarMemorialParaTabela} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50" title="Abre os trechos lidos na aba Azimutes/rumos, para corrigir um a um">
              <ArrowDownToLine className="h-[15px] w-[15px]" /> Corrigir na tabela de azimutes
            </button>
          )}
        </div>
      )}

      {leitura.length > 0 && (
        <ul className="space-y-1">
          {leitura.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded-[6px] bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}

      {lote && <Previa lote={lote} fechado={fechado} />}

      {lote && !lote.problema && (
        <div className="space-y-3" data-testid="resumo-do-lote">
          <p className="text-sm text-slate-700">
            {fechado && !fechado.problema ? (
              <>
                {fechado.anel.length} lados · área <strong className="font-semibold">{numeroBr(fechado.areaMm2 / 1e6)} m²</strong> · perímetro {numeroBr(fechado.perimetroMm / 1000)} m
              </>
            ) : (
              <>Perímetro digitado {numeroBr(lote.perimetroMm / 1000)} m</>
            )}
            {' · '}erro de fechamento {numeroBr(lote.erroDeFechamentoMm / 1000, 3)} m (tolerância {numeroBr(tolerancia / 1000, 3)} m)
            {lote.erroAngularGraus !== null && <> · erro angular {numeroBr(lote.erroAngularGraus, 4)}°</>}
          </p>
          {fechado && !fechado.problema && fechado.compensacao !== 'NENHUMA' && <p className="text-xs text-slate-500">{fechado.descricao}</p>}
          {precisaDecidir && (
            <fieldset className="space-y-1.5 rounded-[10px] border border-amber-200 bg-amber-50/60 px-4 py-3">
              <legend className="px-1 text-xs font-semibold text-amber-800">Não fecha: sobram {numeroBr(lote.erroDeFechamentoMm / 1000, 3)} m. Confira as medidas, ou escolha como fechar:</legend>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="fechamento" checked={decisao === 'DISTRIBUIR'} onChange={() => setDecisao('DISTRIBUIR')} className="mt-0.5" />
                <span>Distribuir o erro pelos lados, na proporção de cada um (as medidas desenhadas mudam um pouco)</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="radio" name="fechamento" checked={decisao === 'DIVISA_DE_AJUSTE'} onChange={() => setDecisao('DIVISA_DE_AJUSTE')} className="mt-0.5" />
                <span>Fechar com uma divisa de ajuste de {numeroBr(lote.erroDeFechamentoMm / 1000, 3)} m (os lados ficam como digitados)</span>
              </label>
            </fieldset>
          )}
        </div>
      )}

      {lote?.problema && (
        <p className="flex items-start gap-2 rounded-[6px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {lote.problema}
        </p>
      )}
      {fechado && !lote?.problema && fechado.problema && !precisaDecidir && (
        <p className="flex items-start gap-2 rounded-[6px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {fechado.problema}
        </p>
      )}

      <div className="space-y-2 border-t border-gray-100 pt-4">
        {temMedidaDigitada && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={medidasDaEscritura} onChange={(e) => setMedidasDaEscritura(e.target.checked)} className="mt-0.5" />
            <span>
              As medidas digitadas são as da escritura (vão para a coluna Escritura do Quadro de divisas)
              {editando && !medidasDaEscritura && <> — desmarcado, as medidas de escritura que o lote já tem ficam como estão</>}
            </span>
          </label>
        )}
        {temLote && !editando && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5" />
            <span>Substituir o lote atual — as divisas dele, as medidas de escritura e os nomes dos vértices saem</span>
          </label>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          {erroDoLancamento && <span className="text-xs text-red-600">{erroDoLancamento}</span>}
          {motivoDesligado && <span className="text-xs text-slate-500">{motivoDesligado}</span>}
          <button
            type="button"
            onClick={() => void lancar()}
            disabled={!!motivoDesligado}
            title={motivoDesligado ?? (editando ? 'Substitui o contorno do lote num passo só, levando o que cada lado e vértice tinham — Ctrl+Z desfaz' : 'Cria as divisas do lote num passo só — Ctrl+Z desfaz')}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
          >
            {editando ? 'Aplicar as alterações' : 'Lançar o lote'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A prévia: o contorno como vai entrar (o fechado, quando fecha) e, quando não
 * fecha, o caminho digitado com o vão em vermelho tracejado.
 */
function Previa({ lote, fechado }: { lote: LoteDigitado; fechado: LoteFechado | null }) {
  const pronto = fechado && !fechado.problema && fechado.anel.length >= 3;
  const pontos = pronto ? fechado.anel : lote.caminho;
  if (pontos.length < 2) return null;
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const L = 320;
  const A = 200;
  const m = 18;
  const escala = Math.min((L - 2 * m) / Math.max(maxX - minX, 1), (A - 2 * m) / Math.max(maxY - minY, 1));
  const ox = (L - (maxX - minX) * escala) / 2;
  const oy = (A - (maxY - minY) * escala) / 2;
  // Y do modelo cresce para CIMA; o do SVG, para baixo.
  const tela = (p: { x: number; y: number }) => ({ x: ox + (p.x - minX) * escala, y: A - (oy + (p.y - minY) * escala) });
  const t = pontos.map(tela);
  const frente = pronto ? fechado.lados.findIndex((l) => l.papel === 'FRENTE') : -1;
  const ajuste = pronto ? fechado.lados.findIndex((l) => l.ajuste) : -1;
  const n = t.length;
  return (
    <div className="rounded-[10px] border border-gray-100 bg-white p-2">
      <svg viewBox={`0 0 ${L} ${A}`} className="mx-auto block h-[200px] w-full max-w-[420px]" role="img" aria-label="Prévia do contorno do lote">
        {pronto ? (
          <polygon points={t.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgb(219 234 254 / 0.5)" stroke="rgb(37 99 235)" strokeWidth={1.5} />
        ) : (
          <>
            <polyline points={t.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgb(37 99 235)" strokeWidth={1.5} />
            <line x1={t[n - 1].x} y1={t[n - 1].y} x2={t[0].x} y2={t[0].y} stroke="rgb(220 38 38)" strokeWidth={1.5} strokeDasharray="4 3" />
          </>
        )}
        {frente >= 0 && <line x1={t[frente].x} y1={t[frente].y} x2={t[(frente + 1) % n].x} y2={t[(frente + 1) % n].y} stroke="rgb(29 78 216)" strokeWidth={4} strokeLinecap="round" />}
        {ajuste >= 0 && <line x1={t[ajuste].x} y1={t[ajuste].y} x2={t[(ajuste + 1) % n].x} y2={t[(ajuste + 1) % n].y} stroke="rgb(217 119 6)" strokeWidth={2.5} strokeDasharray="5 3" />}
        {(pronto ? t : t.slice(0, -1)).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={2.5} fill="rgb(30 41 59)" />
            <text x={p.x + 4} y={p.y - 4} fontSize={9} fill="rgb(71 85 105)">
              {(pronto ? fechado.vertices[i] : lote.vertices[i]) ?? `V${i + 1}`}
            </text>
          </g>
        ))}
      </svg>
      {frente >= 0 && <p className="text-center text-xs text-slate-500">A linha grossa é a frente.</p>}
    </div>
  );
}
