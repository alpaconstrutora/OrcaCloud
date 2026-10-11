/**
 * FOLHAS DA ESQUADRIA (11/10/2026, kernel 0.98.0 — F8 do plano
 * `2026-10-11-planta-recursos-video-synaps.md`): quantas folhas, o mecanismo e a
 * largura de cada uma, e a bandeira — o editor de janela do vídeo.
 *
 * Sem configuração, a abertura segue com o desenho de sempre e o painel só
 * oferece "Configurar folhas". As regras de edição (a vizinha cede a diferença,
 * a soma fica 100 %) moram em `utils/blueprintFolhas.ts`; botão sem efeito diz
 * por quê.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  MAX_FOLHAS_DA_ESQUADRIA,
  MECANISMOS_DA_BANDEIRA,
  MECANISMOS_DE_FOLHA,
  ROTULO_DO_MECANISMO,
  descricaoDaConfiguracao,
  folhasIguais,
  type BandeiraDaEsquadria,
  type ConfiguracaoDaEsquadria,
  type MecanismoDeFolha,
  type Opening,
} from '../../utils/blueprintKernel';
import { acrescentarFolha, bandeiraPadrao, configuracaoPadrao, faixaDaBandeira, mudarLarguraDaFolha, removerFolha } from '../../utils/blueprintFolhas';

interface Props {
  abertura: Pick<Opening, 'id' | 'kind' | 'heightMm' | 'configuracao'>;
  onConfiguracao: (c: ConfiguracaoDaEsquadria | null) => void;
}

const campo = 'h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-sm font-normal text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

export default function PainelFolhas({ abertura: a, onConfiguracao: gravarConfiguracao }: Props) {
  // O motivo, quando o valor digitado não cabe: o painel não grava e DIZ (some no próximo gesto).
  const [aviso, setAviso] = useState<string | null>(null);
  const onAviso = setAviso;
  const onConfiguracao = (x: ConfiguracaoDaEsquadria | null) => {
    setAviso(null);
    gravarConfiguracao(x);
  };
  if (a.kind !== 'door' && a.kind !== 'window') return null;
  const c = a.configuracao;
  const faixa = faixaDaBandeira(a.heightMm);

  if (!c) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3" data-testid="folhas-da-esquadria">
        <h4 className="text-xs font-semibold text-slate-700">Folhas</h4>
        <p className="mt-1 text-[11px] text-slate-500">Desenho padrão ({a.kind === 'door' ? '1 folha de abrir' : 'linha no eixo'}).</p>
        <button
          type="button"
          onClick={() => onConfiguracao(configuracaoPadrao(a.kind))}
          className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50"
        >
          Configurar folhas
        </button>
      </div>
    );
  }

  const gravar = (parte: Partial<ConfiguracaoDaEsquadria>) => onConfiguracao({ ...c, ...parte });
  const mais = acrescentarFolha(c.folhas);
  const chave = `${a.id}-${JSON.stringify(c)}`;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-testid="folhas-da-esquadria">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700">Folhas</h4>
        <button type="button" onClick={() => onConfiguracao(null)} className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
          Desenho padrão
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{descricaoDaConfiguracao(c)}</p>

      <ol className="mt-2 flex flex-col gap-1.5">
        {c.folhas.map((f, i) => (
          <li key={`${chave}-${i}`} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-4 text-right tabular-nums text-slate-400">{i + 1}</span>
            <select
              value={f.mecanismo}
              onChange={(e) => gravar({ folhas: c.folhas.map((g, k) => (k === i ? { ...g, mecanismo: e.target.value as MecanismoDeFolha } : g)) })}
              aria-label={`Mecanismo da folha ${i + 1}`}
              className={`${campo} min-w-0 flex-1`}
            >
              {MECANISMOS_DE_FOLHA.map((m) => (
                <option key={m} value={m}>{ROTULO_DO_MECANISMO[m]}</option>
              ))}
            </select>
            <input
              type="number"
              min={5}
              max={100}
              step={5}
              defaultValue={f.larguraPct}
              disabled={c.folhas.length < 2}
              title={c.folhas.length < 2 ? 'Com uma folha só, ela ocupa o vão inteiro (100 %)' : 'Largura da folha em % do vão; a vizinha cede a diferença'}
              aria-label={`Largura da folha ${i + 1} (%)`}
              onBlur={(e) => {
                const pct = Math.round(Number(e.target.value));
                if (pct === f.larguraPct) return;
                const r = mudarLarguraDaFolha(c.folhas, i, pct);
                if (typeof r === 'string') {
                  e.target.value = String(f.larguraPct);
                  onAviso(r);
                  return;
                }
                gravar({ folhas: r });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className={`${campo} w-16 disabled:cursor-not-allowed disabled:opacity-50`}
            />
            <span className="text-slate-400">%</span>
            <button
              type="button"
              disabled={c.folhas.length < 2}
              onClick={() => {
                const r = removerFolha(c.folhas, i);
                if (r) gravar({ folhas: r });
              }}
              title={c.folhas.length < 2 ? 'É a única folha — use "Desenho padrão" para tirar a configuração' : `Tirar a folha ${i + 1} (a vizinha fica com a largura dela)`}
              aria-label={`Tirar a folha ${i + 1}`}
              className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!mais}
          onClick={() => mais && gravar({ folhas: mais })}
          title={mais ? 'Mais uma folha; todas redivididas por igual' : `No máximo ${MAX_FOLHAS_DA_ESQUADRIA} folhas`}
          className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Folha
        </button>
        <button
          type="button"
          disabled={c.folhas.length < 2}
          onClick={() => gravar({ folhas: folhasIguais(c.folhas.length, 'FIXA').map((g, k) => ({ ...g, mecanismo: c.folhas[k].mecanismo })) })}
          title={c.folhas.length < 2 ? 'Com uma folha só não há o que dividir' : 'Todas as folhas com a mesma largura'}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Dividir por igual
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {c.bandeira ? (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Bandeira
              <select
                value={c.bandeira.mecanismo}
                onChange={(e) => gravar({ bandeira: { ...(c.bandeira as BandeiraDaEsquadria), mecanismo: e.target.value as BandeiraDaEsquadria['mecanismo'] } })}
                aria-label="Mecanismo da bandeira"
                className={campo}
              >
                {MECANISMOS_DA_BANDEIRA.map((m) => (
                  <option key={m} value={m}>{ROTULO_DO_MECANISMO[m]}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Altura
              <input
                key={`${chave}-bandeira`}
                type="number"
                min={faixa?.min}
                max={faixa?.max}
                step={50}
                defaultValue={c.bandeira.alturaMm}
                aria-label="Altura da bandeira (mm)"
                onBlur={(e) => {
                  const mm = Math.round(Number(e.target.value));
                  if (mm === c.bandeira?.alturaMm) return;
                  if (!faixa || !(mm >= faixa.min && mm <= faixa.max)) {
                    e.target.value = String(c.bandeira?.alturaMm ?? '');
                    onAviso(faixa ? `A bandeira cabe de ${faixa.min} a ${faixa.max} mm neste vão` : 'O vão é baixo demais para ter bandeira');
                    return;
                  }
                  gravar({ bandeira: { ...(c.bandeira as BandeiraDaEsquadria), alturaMm: mm } });
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className={`${campo} w-20`}
              />
              mm
            </label>
            <button
              type="button"
              onClick={() => onConfiguracao({ folhas: c.folhas })}
              className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              sem bandeira
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!faixa}
            onClick={() => {
              const b = bandeiraPadrao(a.heightMm);
              if (b) gravar({ bandeira: b });
            }}
            title={faixa ? 'Bandeira basculante de 40 cm em cima das folhas; altura e mecanismo se trocam depois' : 'O vão é baixo demais para ter bandeira (fica menos de 30 cm de folha embaixo)'}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Pôr bandeira
          </button>
        )}
      </div>
      {aviso && <p className="mt-1.5 text-[11px] text-amber-700">{aviso}</p>}
    </div>
  );
}
