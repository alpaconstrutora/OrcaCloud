import React from 'react';
import { AlertTriangle, LandPlot, MapPin } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import type { Boundary, BoundaryPapel, ObjectId } from '../../utils/blueprintKernel';
import {
  areaEmM2,
  divergente,
  linhasDoQuadro,
  medidasPorPapel,
  PAPEIS_DE_DIVISA,
  ROTULO_DO_PAPEL,
  TOLERANCIA_ESCRITURA_MM,
  type Terreno,
} from '../../utils/blueprintTerreno';
import { CampoDeTexto, CampoEmMetros, metrosDe } from './CamposQueAplicam';

/**
 * O QUADRO DE DIVISAS — o lote desenhado, conferido contra a escritura.
 *
 * ─── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
 *
 * A matrícula determina cada lado: qual é a frente, quanto ele mede e com quem
 * confronta. Até aqui o editor guardava só o papel, e num select por vez, que
 * exigia selecionar cada divisa no canvas — nada garantia que os quatro lados
 * saíssem classificados, e um lado sem papel não recua, produzindo um envelope
 * errado sem nenhum aviso.
 *
 * Este painel é o passo que faltava: abre sozinho quando o contorno fecha, pede
 * a única informação que o desenho não sabe (qual lado dá para a rua) e deriva o
 * resto. As medidas e os confrontantes do título entram aqui do lado das medidas
 * desenhadas, e a diferença entre as duas fica visível.
 *
 * ─── O QUE ELE NÃO FAZ ──────────────────────────────────────────────────────
 *
 * Não "corrige" o desenho para a escritura, e não impede nada. Levantamento e
 * título discordam com frequência; quem decide o que fazer com a diferença é o
 * incorporador. O painel mostra, e não bloqueia.
 *
 * ─── PADRÃO DE UI ───────────────────────────────────────────────────────────
 *
 * `Sheet` e não modal (REGRA #4 / UI_PATTERNS): é trabalho de conferência lado a
 * lado com o desenho, não interrupção crítica — a linha em foco acende o lado no
 * canvas, e isso só funciona com o desenho visível.
 *
 * A tabela usa `px-3`/`px-4`, e não o `px-6` do §6.6 do guia: aquele valor é de
 * tabela de página inteira. Ver §6.9, escrita a partir deste caso, e o precedente
 * de `CentralObra.tsx` (mesma composição: `Sheet size="2xl"` + tabela `px-4
 * py-2.5`). Todo o resto do §6/§7 vale: `py-2.5`, separador `border-r`, `<thead>`
 * em sentence case, `text-sm font-normal` nas células e nos campos editáveis.
 */

const PAPEIS: { valor: BoundaryPapel | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Sem papel' },
  ...PAPEIS_DE_DIVISA.map((p) => ({ valor: p, rotulo: ROTULO_DO_PAPEL[p] })),
];

/** Diferença em texto legível: 200 mm → "+20 cm"; 1500 → "+1,50 m". */
function deltaLegivel(mm: number): string {
  const sinal = mm > 0 ? '+' : '−';
  const abs = Math.abs(mm);
  if (abs < 1000) return `${sinal}${abs} mm`;
  return `${sinal}${metrosDe(abs)} m`;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** O lote medido. O painel só faz sentido com ele. */
  terreno: Terreno | null;
  limites: Boundary[];
  /** Área do lote na escritura, em mm². `null` = não informada. */
  areaEscrituraMm2: number | null;
  onAreaEscritura: (mm2: number | null) => void;
  onPapel: (boundaryId: ObjectId, papel: BoundaryPapel | null) => void;
  /** Aplica a frente apontada e deriva os demais — UM passo de histórico. */
  onApontarFrente: (boundaryId: ObjectId) => void;
  onEscritura: (boundaryId: ObjectId, medidaMm: number | null, confrontante: string | null) => void;
  /** Acende o lado no desenho enquanto a linha está em foco. */
  onDestacar: (boundaryId: ObjectId | null) => void;
}

export default function QuadroDeDivisas({
  aberto,
  onFechar,
  terreno,
  limites,
  areaEscrituraMm2,
  onAreaEscritura,
  onPapel,
  onApontarFrente,
  onEscritura,
  onDestacar,
}: Props) {
  if (!terreno) return null;

  const linhas = linhasDoQuadro(terreno, limites);
  const porId = new Map(limites.map((b) => [b.id, b]));
  const medidas = medidasPorPapel(terreno, limites);
  const semPapel = linhas.filter((l) => l.papel === null).length;
  const divergencias = linhas.filter(divergente).length;

  const areaDesenhadaMm2 = terreno.areaMm2;
  const deltaAreaMm2 = areaEscrituraMm2 === null ? null : areaDesenhadaMm2 - areaEscrituraMm2;

  return (
    <Sheet open={aberto} onClose={onFechar} size="2xl">
      <SheetHeader onClose={onFechar}>
        <SheetTitle>
          <span className="flex items-center gap-2">
            <LandPlot className="h-5 w-5 text-emerald-700" />
            Divisas do lote
          </span>
        </SheetTitle>
        <SheetDescription>
          Como a escritura descreve cada lado: qual é a frente, quanto mede e com quem confronta.
        </SheetDescription>
      </SheetHeader>

      <SheetPanel className="px-6 py-5 space-y-5">
        {/* ── Área: desenhada × escriturada ────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">Área desenhada</p>
            <p className="mt-1 text-sm font-normal text-slate-800">
              {areaEmM2(terreno).toFixed(2).replace('.', ',')} m²
              <span className="text-slate-500">
                {' '}
                · perímetro {metrosDe(terreno.perimetroMm)} m · {linhas.length} lado
                {linhas.length === 1 ? '' : 's'}
              </span>
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">Área da escritura (m²)</span>
            {/* Em m², não em metros — por isso não usa `CampoEmMetros`. A conversão
                para mm² é exata: 0,01 m² são 10.000 mm². */}
            <CampoAreaEmM2
              valorMm2={areaEscrituraMm2}
              aoAplicar={onAreaEscritura}
              chave={String(areaEscrituraMm2)}
            />
          </label>

          {deltaAreaMm2 !== null && deltaAreaMm2 !== 0 && (
            <p
              className={`text-sm font-normal ${
                Math.abs(deltaAreaMm2) > 10_000 ? 'text-amber-700' : 'text-slate-500'
              }`}
            >
              {deltaAreaMm2 > 0 ? '+' : '−'}
              {(Math.abs(deltaAreaMm2) / 1_000_000).toFixed(2).replace('.', ',')} m² em relação à
              escritura
            </p>
          )}
        </div>

        {!terreno.fechado && (
          // Mesmo aviso do painel: erro de fechamento é informação de
          // levantamento, não erro de software.
          <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-normal text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Contorno aberto</strong> — erro de fechamento de{' '}
              {terreno.erroFechamentoMm} mm. Enquanto ele não fechar, a área é uma estimativa e não
              dá para derivar os papéis a partir da frente.
            </span>
          </p>
        )}

        {/* ── A chamada de criação ──────────────────────────────────────── */}
        {semPapel === linhas.length && terreno.fechado && (
          <p className="flex items-start gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-normal text-blue-800">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Aponte a frente</strong> — marque na coluna{' '}
              <em>Frente</em> o lado que dá para a rua. Fundos e laterais saem dele: direita e
              esquerda são as de quem está na rua olhando para o lote, como na matrícula.
            </span>
          </p>
        )}

        {/* ── O quadro ──────────────────────────────────────────────────── */}
        <div className="overflow-x-auto rounded-[10px] border border-gray-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                {/* Larguras explícitas: sem elas o navegador espremia a coluna de
                    Papel e o select cortava "Lateral esquerda" no meio — o rótulo
                    que o usuário precisa ler para conferir contra a matrícula. */}
                <th className="px-2 py-2 border-r border-gray-100 w-9 text-center">#</th>
                <th className="px-2 py-2 border-r border-gray-100 w-14 text-center">Frente</th>
                <th className="px-3 py-2 border-r border-gray-100 w-[11.5rem]">Papel</th>
                <th className="px-3 py-2 border-r border-gray-100 w-[5.5rem] text-right">
                  Desenhado
                </th>
                <th className="px-3 py-2 border-r border-gray-100 w-24">Escritura</th>
                <th className="px-4 py-2 min-w-[9rem]">Confrontante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {linhas.map((linha) => {
                const divisa = porId.get(linha.id);
                return (
                  <tr
                    key={linha.id}
                    className="hover:bg-blue-50/50 transition-colors"
                    onMouseEnter={() => onDestacar(linha.id)}
                    onMouseLeave={() => onDestacar(null)}
                    onFocus={() => onDestacar(linha.id)}
                  >
                    <td className="px-2 py-2.5 border-r border-gray-100 text-center text-sm font-normal text-gray-600">
                      {linha.ordem}
                    </td>

                    <td className="px-2 py-2.5 border-r border-gray-100 text-center">
                      {/* Radio, e não um segundo select: apontar a frente é UMA
                          escolha para o lote inteiro, e é ela que dispara a
                          derivação. O select ao lado continua sendo o ajuste
                          manual, que nunca rededuz nada. */}
                      <input
                        type="radio"
                        name="frente-do-lote"
                        checked={linha.papel === 'FRENTE'}
                        disabled={!terreno.fechado}
                        onChange={() => onApontarFrente(linha.id)}
                        aria-label={`Lado ${linha.ordem} é a frente do lote`}
                        title="Esta é a frente — os demais lados saem dela"
                        className="h-4 w-4 cursor-pointer text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>

                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <select
                        value={linha.papel ?? ''}
                        onChange={(e) =>
                          onPapel(linha.id, (e.target.value || null) as BoundaryPapel | null)
                        }
                        aria-label={`Papel do lado ${linha.ordem}`}
                        className={`w-full rounded-md border px-2 py-1 text-sm font-normal transition-all ${
                          linha.papel
                            ? 'border-gray-100 bg-gray-50 text-gray-900'
                            : 'border-dashed border-gray-200 bg-white text-gray-400'
                        }`}
                      >
                        {PAPEIS.map((p) => (
                          <option key={p.valor} value={p.valor}>
                            {p.rotulo}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-2.5 border-r border-gray-100 text-right text-sm font-normal text-gray-700">
                      {metrosDe(linha.desenhadoMm)} m
                    </td>

                    <td className="px-3 py-2.5 border-r border-gray-100">
                      <CampoEmMetros
                        valorMm={linha.escrituraMm}
                        chave={`${linha.id}-${linha.escrituraMm}`}
                        permitirVazio
                        placeholder="—"
                        ariaLabel={`Medida do lado ${linha.ordem} na escritura, em metros`}
                        className="w-20"
                        aoAplicar={(mm) => onEscritura(linha.id, mm, divisa?.confrontante ?? null)}
                      />
                      {/* A diferença mora COLADA na medida digitada, não numa
                          coluna à parte: é ali que o olho está quando confere. */}
                      {linha.divergenciaMm !== null && linha.divergenciaMm !== 0 && (
                        <p
                          className={`mt-0.5 text-xs font-normal ${
                            divergente(linha) ? 'text-amber-700' : 'text-gray-400'
                          }`}
                        >
                          {deltaLegivel(linha.divergenciaMm)}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-2.5">
                      <CampoDeTexto
                        valor={linha.confrontante}
                        chave={`${linha.id}-${linha.confrontante ?? ''}`}
                        placeholder="Rua, lote, córrego…"
                        ariaLabel={`Confrontante do lado ${linha.ordem}`}
                        aoAplicar={(texto) => onEscritura(linha.id, linha.escrituraMm, texto)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totais por papel: é o que vai para a ficha ────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500">Medidas por papel</p>
          {/* Rótulo em cima, valor embaixo. Lado a lado numa linha só, "Lateral
              esquerda 30,00 m" quebrava no meio e desalinhava as quatro colunas. */}
          <div className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {PAPEIS_DE_DIVISA.map((papel) => (
              <div key={papel}>
                <p className="text-xs font-normal text-slate-500">{ROTULO_DO_PAPEL[papel]}</p>
                <p className="text-sm font-semibold text-slate-900">
                  {medidas[papel] === undefined ? '—' : `${metrosDe(medidas[papel]!)} m`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-sm font-normal text-slate-500">
            Lados com o mesmo papel entram na mesma soma — é este número que vai para a ficha do
            empreendimento.
          </p>
        </div>

        {/* Resumo do que ainda falta. Aviso, nunca trava. */}
        {(semPapel > 0 || divergencias > 0) && (
          <div className="space-y-1.5">
            {semPapel > 0 && (
              <p className="text-sm font-normal text-amber-700">
                {semPapel} lado{semPapel === 1 ? '' : 's'} sem papel — recuo não se aplica a{' '}
                {semPapel === 1 ? 'ele' : 'eles'}.
              </p>
            )}
            {divergencias > 0 && (
              <p className="text-sm font-normal text-amber-700">
                {divergencias} lado{divergencias === 1 ? '' : 's'} diverge
                {divergencias === 1 ? '' : 'm'} da escritura em mais de{' '}
                {TOLERANCIA_ESCRITURA_MM} mm.
              </p>
            )}
          </div>
        )}
      </SheetPanel>

      <SheetFooter>
        {/* Sem "Salvar": cada campo aplica um comando do kernel na hora, e Ctrl+Z
            desfaz. Um botão de salvar sugeriria que sair perde o que foi
            digitado, o que não é verdade aqui. */}
        <button
          type="button"
          onClick={onFechar}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
        >
          Concluir
        </button>
      </SheetFooter>
    </Sheet>
  );
}

/** Área em m², aplicada no Enter/blur. Guarda mm² inteiro. */
function CampoAreaEmM2({
  valorMm2,
  chave,
  aoAplicar,
}: {
  valorMm2: number | null;
  chave: string;
  aoAplicar: (mm2: number | null) => void;
}) {
  const [rascunho, setRascunho] = React.useState<string | null>(null);
  const cancelando = React.useRef(false);
  const texto = valorMm2 === null ? '' : (valorMm2 / 1_000_000).toFixed(2).replace('.', ',');

  function confirmar(digitado: string) {
    if (cancelando.current) {
      cancelando.current = false;
      setRascunho(null);
      return;
    }
    setRascunho(null);
    const bruto = digitado.trim().replace(',', '.');
    if (bruto === '') {
      aoAplicar(null);
      return;
    }
    const m2 = Number(bruto);
    if (Number.isFinite(m2) && m2 > 0) aoAplicar(Math.round(m2 * 1_000_000));
  }

  return (
    <input
      key={chave}
      type="text"
      inputMode="decimal"
      defaultValue={texto}
      placeholder="—"
      aria-label="Área do lote na escritura, em metros quadrados"
      onChange={(e) => setRascunho(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelando.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      onBlur={(e) => confirmar(rascunho ?? e.target.value)}
      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm font-normal text-slate-800"
    />
  );
}
