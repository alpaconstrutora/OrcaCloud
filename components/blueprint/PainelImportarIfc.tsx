import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Boxes, Check, FileUp, Loader2 } from 'lucide-react';
import {
  nomeDoTipoEstrutural,
  type BlueprintModel,
  type Command,
  type Level,
} from '../../utils/blueprintKernel';
import type { PavimentoIfc, RecusaGeometrica } from '../../services/ifcParametricoService';
import {
  caixaDasPecas,
  caixaDoDesenho,
  deslocamentoDaImportacao,
  type AncoragemIfc,
  type PecaTraduzida,
} from '../../utils/ifcParaKernel';
import { listarArquivos, baixarArquivo, type ArquivoDigital } from '../../services/digitalFileService';
import { useOrgContext } from '../../hooks/useOrgContext';

/**
 * Importar a ESTRUTURA de um IFC para o desenho.
 *
 * ─── O QUE ESTA TELA EXISTE PARA IMPEDIR ────────────────────────────────────
 *
 * Que 393 peças entrem um andar fora, em silêncio. O IFC traz os pavimentos
 * DELE ("Fundação", "Térreo", "Superior"); o desenho tem os do usuário. Casar
 * por adivinhação — nome parecido, cota mais próxima — acerta quase sempre e
 * erra calado quando o modelo tem um mezanino ou um nome em outro idioma.
 *
 * Então a tela MOSTRA o par e deixa mudar. A sugestão vem da cota (medida:
 * `IfcBuildingStorey.Elevation` e a geometria estão na mesma referência), mas
 * quem confirma é quem conhece a obra.
 *
 * ─── E QUE UMA PEÇA SUMA SEM AVISO ──────────────────────────────────────────
 *
 * O relatório de recusas aparece ANTES de confirmar, não depois. No modelo real
 * são 46 sapatas em malha: quem importa precisa saber que a fundação não veio
 * inteira, em vez de descobrir no orçamento.
 *
 * ─── E QUE O MODELO CAIA EM LUGAR NENHUM, SEM AVISO ─────────────────────────
 *
 * A tradução é fiel: cada peça entra nas coordenadas do arquivo. Isso é o certo
 * quando o calculista usa a mesma origem do projeto arquitetônico — e é o que
 * continua sendo o padrão. Mas em 06/09/2026 o usuário importou um modelo e
 * encontrou a estrutura longe do desenho de paredes; a tela não dizia onde as
 * peças iriam cair, e não havia como escolher. (Não era a tradução: a
 * `GetCoordinationMatrix` daquele arquivo é a identidade, e o prédio nasce no
 * canto da origem do próprio IFC.)
 *
 * Agora a pegada aparece ANTES de confirmar, com a distância até o desenho, e
 * há três âncoras. Deslocar é uma decisão de quem importa, nunca da tela.
 *
 * ─── UM LOTE, UM PASSO DE DESFAZER ──────────────────────────────────────────
 *
 * `applyBatch` aplica sobre uma cópia e propaga a exceção: ou entram as 393, ou
 * nenhuma. Metade de uma importação seria pior que nenhuma — e desfazer teria de
 * ser 393 vezes.
 */

interface Props {
  model: BlueprintModel;
  /** O pavimento ativo, para onde vai o que não tiver par. */
  levelIdAtivo: string | null;
  /** Executa o lote. O editor decide o histórico. */
  onImportar: (comandos: Command[]) => void;
}

interface Preparado {
  nomeArquivo: string;
  pecas: PecaTraduzida[];
  pavimentos: PavimentoIfc[];
  recusas: RecusaGeometrica[];
}

/** Para onde cada pavimento do IFC vai. `''` = descartar. */
type Casamento = Record<number, string>;

const m2 = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

export default function PainelImportarIfc({ model, levelIdAtivo, onImportar }: Props) {
  const { orgId } = useOrgContext();
  const [biblioteca, setBiblioteca] = useState<ArquivoDigital[]>([]);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [casamento, setCasamento] = useState<Casamento>({});
  const [ancoragem, setAncoragem] = useState<AncoragemIfc>('ARQUIVO');

  useEffect(() => {
    listarArquivos(orgId)
      .then(setBiblioteca)
      .catch(() => setBiblioteca([]));
  }, [orgId]);

  /**
   * Sugere o par pela COTA, e não pelo nome.
   *
   * Nome parecido é armadilha: "Térreo" do calculista e "Térreo" do desenho
   * podem estar em cotas diferentes, e aí o acerto aparente esconde meio metro.
   * A cota é medida; o nome é convenção de quem exportou.
   */
  const sugerir = useCallback(
    (pavimentos: PavimentoIfc[]): Casamento => {
      const c: Casamento = {};
      for (const p of pavimentos) {
        // A cota já vem em mm do serviço, medida pela mesma matriz que a
        // geometria usa. Converter aqui foi o defeito de 06/09/2026.
        const cotaMm = p.elevacaoMm;
        if (cotaMm === null) {
          c[p.expressID] = levelIdAtivo ?? '';
          continue;
        }
        let melhor: Level | null = null;
        let menor = Infinity;
        for (const l of model.levels) {
          const d = Math.abs(l.elevationMm - cotaMm);
          if (d < menor) {
            menor = d;
            melhor = l;
          }
        }
        // Tolerância de meio metro: acima disso não é "o mesmo pavimento com
        // arredondamento", é outro pavimento — e aí a tela pergunta em vez de
        // escolher.
        c[p.expressID] = melhor && menor <= 500 ? melhor.id : (levelIdAtivo ?? '');
      }
      return c;
    },
    [model.levels, levelIdAtivo],
  );

  const preparar = useCallback(
    async (bytes: ArrayBuffer, nomeArquivo: string) => {
      setLendo(true);
      setErro(null);
      setPreparado(null);
      try {
        const { obterApi } = await import('../../services/ifcViewerService');
        const { lerPecasParametricas } = await import('../../services/ifcParametricoService');
        const { traduzirPecas } = await import('../../utils/ifcParaKernel');

        const api = await obterApi();
        const id = api.OpenModel(new Uint8Array(bytes));
        try {
          const leitura = await lerPecasParametricas(id);
          const traduzido = traduzirPecas(leitura.pecas);
          const p: Preparado = {
            nomeArquivo,
            pecas: traduzido.pecas,
            pavimentos: leitura.pavimentos,
            recusas: [...leitura.recusas, ...traduzido.recusas],
          };
          setPreparado(p);
          setCasamento(sugerir(leitura.pavimentos));
        } finally {
          api.CloseModel(id);
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setLendo(false);
      }
    },
    [sugerir],
  );


  const porTipo = (pecas: PecaTraduzida[]) => {
    const c = new Map<string, number>();
    for (const p of pecas) c.set(p.kind, (c.get(p.kind) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  };

  /** As que de fato entram: as de pavimento com par escolhido. */
  const aImportar = preparado
    ? preparado.pecas.filter((p) => p.pavimento !== null && casamento[p.pavimento])
    : [];

  // A pegada é a do que VAI entrar, não a do arquivo inteiro: descartar um
  // pavimento muda onde o resto cai, e a tela tem de contar a mesma história
  // que o botão vai executar.
  const pegada = caixaDasPecas(aImportar);
  const doDesenho = caixaDoDesenho(model);
  const { dx, dy } = deslocamentoDaImportacao(ancoragem, pegada, doDesenho);
  const distanciaMm =
    pegada && doDesenho
      ? Math.hypot(
          (doDesenho.minX + doDesenho.maxX) / 2 - (pegada.minX + pegada.maxX) / 2,
          (doDesenho.minY + doDesenho.maxY) / 2 - (pegada.minY + pegada.maxY) / 2,
        )
      : null;

  function importar() {
    if (!preparado) return;
    const porPavimento = new Map(model.levels.map((l) => [l.id, l]));
    const comandos: Command[] = [];

    for (const p of aImportar) {
      const levelId = casamento[p.pavimento!];
      const nivel = porPavimento.get(levelId);
      if (!nivel) continue;
      comandos.push({
        type: 'AddStructural',
        levelId,
        kind: p.kind,
        // O deslocamento é aplicado AQUI, no ponto, e não numa transformação
        // guardada: o kernel não tem noção de "modelo importado" — o que entra
        // é peça, igual à desenhada à mão, e tem de poder ser movida depois.
        pontos: p.pontos.map((q) => ({ x: q.x + dx, y: q.y + dy })),
        larguraMm: Math.max(1, p.larguraMm),
        profundidadeMm: Math.max(1, p.profundidadeMm),
        alturaMm: Math.max(1, p.alturaMm),
        // A cota da peça é ABSOLUTA; o kernel guarda relativa ao pavimento.
        baseMm: p.cotaBaseMm - nivel.elevationMm,
        circular: p.circular,
        rotacaoDeg: p.rotacaoDeg,
        rotulo: p.nome || null,
      });
    }

    if (comandos.length > 0) onImportar(comandos);
    setPreparado(null);
  }

  return (
    <div className="px-4 py-3">
      {!preparado && (
        <>
          <p className="text-[11px] text-slate-500">
            Traz pilares, vigas, estacas e lajes do modelo do calculista para este desenho.
            O que não for extrusão de um perfil é recusado e listado — nada entra estimado.
          </p>

          <label className="mt-2 block">
            <span className="sr-only">Arquivo IFC</span>
            <input
              type="file"
              accept=".ifc"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void f.arrayBuffer().then((b) => preparar(b, f.name));
                e.target.value = '';
              }}
              id="importar-ifc-arquivo"
            />
            <span
              role="button"
              tabIndex={0}
              onClick={() => document.getElementById('importar-ifc-arquivo')?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  document.getElementById('importar-ifc-arquivo')?.click();
                }
              }}
              className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600"
            >
              <FileUp className="h-3.5 w-3.5" />
              Escolher arquivo…
            </span>
          </label>

          {biblioteca.length > 0 && (
            <div className="mt-2">
              <h4 className="text-[11px] font-semibold text-slate-500">Ou da biblioteca</h4>
              <ul className="mt-1 space-y-0.5">
                {biblioteca.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void baixarArquivo(a.storagePath)
                          .then((b) => preparar(b, `${a.nome} rev. ${a.revisao}`))
                          .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
                      }
                      className="w-full truncate rounded-[6px] px-1.5 py-1 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Boxes className="mr-1 inline h-3 w-3 text-slate-400" aria-hidden />
                      {a.nome} <span className="text-slate-400">rev. {a.revisao}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {lendo && (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Lendo o modelo…
        </p>
      )}
      {erro && <p className="mt-2 text-[11px] text-red-700">{erro}</p>}

      {preparado && (
        <>
          <h4 className="truncate text-xs font-semibold text-slate-700" title={preparado.nomeArquivo}>
            {preparado.nomeArquivo}
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {porTipo(preparado.pecas)
              .map(([k, n]) => `${n} ${nomeDoTipoEstrutural(k as never).toLowerCase()}${n > 1 ? 's' : ''}`)
              .join(' · ') || 'nenhuma peça legível'}
          </p>

          {/* ── O casamento de pavimentos ─────────────────────────────────── */}
          <h5 className="mt-3 text-[11px] font-semibold text-slate-600">Pavimentos</h5>
          <p className="text-[10px] text-slate-400">
            Sugerido pela cota. Confira: é aqui que 393 peças entrariam um andar fora.
          </p>
          <div className="mt-1 space-y-1">
            {preparado.pavimentos.map((pav) => {
              const quantas = preparado.pecas.filter((x) => x.pavimento === pav.expressID).length;
              return (
                <label key={pav.expressID} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={pav.nome}>
                    {pav.nome}
                    {/* A COTA na tela não é enfeite: é o que deixa "um andar
                        fora" visível. Sem ela, um fator de unidade errado
                        sugere o par errado e nada na tela desmente. */}
                    {pav.elevacaoMm !== null && (
                      <span className="ml-1 text-slate-400">{m2(pav.elevacaoMm)} m</span>
                    )}
                    <span className="ml-1 text-slate-400">{quantas}</span>
                  </span>
                  <select
                    value={casamento[pav.expressID] ?? ''}
                    onChange={(e) =>
                      setCasamento((c) => ({ ...c, [pav.expressID]: e.target.value }))
                    }
                    aria-label={`Para qual pavimento do desenho vai "${pav.nome}"`}
                    className="h-7 max-w-36 rounded-[6px] border border-slate-200 px-1.5 text-[11px] text-slate-800"
                  >
                    <option value="">Não importar</option>
                    {model.levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({m2(l.elevationMm)} m)
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          {/* ── ONDE O MODELO CAI ──────────────────────────────────────────── */}
          {pegada && (
            <>
              <h5 className="mt-3 text-[11px] font-semibold text-slate-600">Posição</h5>
              <p className="text-[10px] text-slate-400">
                O modelo ocupa {m2(pegada.maxX - pegada.minX)} × {m2(pegada.maxY - pegada.minY)} m
                {distanciaMm !== null && distanciaMm > 1000 && (
                  <>
                    , a <strong>{m2(distanciaMm)} m</strong> do centro do que já está desenhado
                  </>
                )}
                .
              </p>
              <select
                value={ancoragem}
                onChange={(e) => setAncoragem(e.target.value as AncoragemIfc)}
                aria-label="Onde ancorar o modelo importado"
                className="mt-1 h-7 w-full rounded-[6px] border border-slate-200 px-1.5 text-[11px] text-slate-800"
              >
                <option value="ARQUIVO">Manter as coordenadas do arquivo</option>
                <option value="ORIGEM">Encostar na origem do desenho</option>
                <option value="DESENHO" disabled={!doDesenho}>
                  Centralizar no que já está desenhado
                  {!doDesenho && ' (nada desenhado ainda)'}
                </option>
              </select>
              {(dx !== 0 || dy !== 0) && (
                <p className="mt-1 text-[10px] text-slate-400">
                  Desloca {m2(dx)} m em X e {m2(dy)} m em Y.
                </p>
              )}
            </>
          )}

          {/* ── As recusas, ANTES de confirmar ────────────────────────────── */}
          {preparado.recusas.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
              <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {preparado.recusas.length} peças não entram
              </p>
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
                {[...new Set(preparado.recusas.map((r) => `${r.classe}|${r.motivo}`))].map((chave) => {
                  const [classe, motivo] = chave.split('|');
                  const n = preparado.recusas.filter(
                    (r) => r.classe === classe && r.motivo === motivo,
                  ).length;
                  return (
                    <li key={chave} className="text-[10px] text-amber-800">
                      <strong>{n}</strong> de {classe.replace('IFC', '')}: {motivo}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={importar}
              disabled={aImportar.length === 0}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[6px] bg-blue-600 px-2.5 text-[13px] font-medium text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              Importar {aImportar.length}
            </button>
            <button
              type="button"
              onClick={() => setPreparado(null)}
              className="h-8 rounded-[6px] px-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
