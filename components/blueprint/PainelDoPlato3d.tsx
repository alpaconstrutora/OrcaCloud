/**
 * O PAINEL DO PLATÔ NO 3D (25/11/2026) — pedido: *"assista o video https://www.instagram.com/reel/DgLvZqTSc-h/ e
 * implemente e ou aprimore o painel de visualizacao lateral como no video. hoje no rodapé ja tenho algumas destas
 * informações. Crie opcao para o usuário escolher como ele quer visualizar, compacto no rodapé ou completo no painel
 * lateral"* (padrão escolhido: COMPLETO).
 *
 * O card à esquerda do 3D, como o "Bulldozed area" do reel: cota (deslizante + campo), talude, área, perímetro e os
 * volumes em barra proporcional. Os números são os MESMOS do selo do rodapé (`saldoDoPlato`) — nunca uma conta à
 * parte. Só apresenta: quem calcula e grava é o editor (prévia enquanto o deslizante anda, grava UMA vez ao soltar).
 */
import React, { useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';
import {
  LARGURA_DO_TALUDE_SUAVE_PADRAO_M,
  type FormaDoTalude,
  type ModoDoBalanco,
  type ParametrosDeTerraplenagem,
} from '../../utils/blueprintTopografiaAnalises';
import { EscolhaDaFormaDoTalude, EscolhaDoBalanco } from './EscolhasDoPlato';

export type BaseDoPlatoNoPainel = 'ENVELOPE' | 'LOTE' | 'CASA' | 'DESENHADO';

export interface DadosDoPainelDoPlato {
  base: BaseDoPlatoNoPainel;
  /** A cota em uso (já com a prévia do 3D, se houver). */
  cotaM: number;
  /** A cota é a de equilíbrio (nenhuma fixada). */
  equilibrio: boolean;
  /** Faixa do deslizante (m). */
  faixaDaCotaM: [number, number];
  areaM2: number | null;
  perimetroM: number;
  corteM3: number;
  aterroM3: number;
  saldoM3: number;
  foraDoRelevo: boolean;
  aviso: string | null;
  taludeCorteH: number;
  taludeAterroH: number;
  /** PR 2 (25/11/2026): balanço de massa e forma do talude (ausentes = nivela, talude reto). */
  modoDoBalanco?: ModoDoBalanco;
  formaDoTalude?: FormaDoTalude;
  larguraDoTaludeSuaveM?: number;
}

/** Os parâmetros que o painel muda (os mesmos de `ParametrosDeTerraplenagem`). */
export type PatchDoPainelDoPlato = Partial<
  Pick<ParametrosDeTerraplenagem, 'taludeCorteH' | 'taludeAterroH' | 'modoDoBalanco' | 'formaDoTalude' | 'larguraDoTaludeSuaveM'>
>;

/** Por que o Equilíbrio não vale fora de "Corte e aterro" (o mesmo texto no selo e no painel). */
export function motivoSemEquilibrio(modo: ModoDoBalanco | undefined): string | null {
  if (!modo || modo === 'CORTE_E_ATERRO') return null;
  return `${modo === 'CORTE' ? 'Só corta' : 'Só aterra'}: corte e aterro não se compensam — não há cota de equilíbrio. Fixe a cota.`;
}

const ROTULO_DA_BASE: Record<BaseDoPlatoNoPainel, string> = {
  DESENHADO: 'Platô desenhado',
  ENVELOPE: 'Platô no envelope',
  LOTE: 'Platô no lote inteiro',
  CASA: 'Platô sob a casa',
};

/** Corte em vermelho e aterro em azul: as cores da hachura da planta (BlueprintCanvas). */
const COR_DO_CORTE = '#ef4444';
const COR_DO_ATERRO = '#3b82f6';

const m3 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³`;
const lerNumero = (s: string) => Number(s.replace(',', '.'));

/** Um parâmetro de talude 1:h, com a inclinação em % (100/h) ao lado. */
function CampoDeTalude({ rotulo, valor, idPct, onMudar }: { rotulo: string; valor: number; idPct: string; onMudar: (v: number) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500">{rotulo}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={valor}
          aria-label={rotulo}
          onChange={(e) => {
            const v = lerNumero(e.target.value);
            if (Number.isFinite(v) && v >= 0.1) onMudar(v);
          }}
          className="h-7 w-16 rounded-[6px] border border-slate-300 px-1.5 text-right text-xs text-slate-800"
        />
        <span className="tabular-nums text-slate-500" data-testid={idPct}>
          ≈ {Math.round(100 / valor)} %
        </span>
      </span>
    </label>
  );
}

export default function PainelDoPlato3d({
  dados,
  onCotaPrevia,
  onCota,
  onEquilibrio,
  onParametros,
  onRecolher,
  onExcluir,
}: {
  dados: DadosDoPainelDoPlato;
  /** O deslizante andando: a conta usa a prévia (grade rala), nada é gravado. */
  onCotaPrevia: (cotaM: number) => void;
  /** Soltou o deslizante ou confirmou o campo: grava uma vez. */
  onCota: (cotaM: number) => void;
  onEquilibrio: () => void;
  onParametros: (patch: PatchDoPainelDoPlato) => void;
  /** Volta ao selo compacto do rodapé (a escolha fica guardada por usuário). */
  onRecolher: () => void;
  /** Só com o platô desenhado (pede confirmação no editor). */
  onExcluir?: () => void;
}) {
  // O que o deslizante/campo mostra enquanto a pessoa mexe; volta à cota em uso quando ela muda por fora.
  const [rascunho, setRascunho] = useState<number | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const quadro = useRef(0);
  const ultimaPrevia = useRef<number | null>(null);
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  const cota = rascunho ?? dados.cotaM;
  const [min, max] = dados.faixaDaCotaM;

  const prever = (v: number) => {
    setRascunho(v);
    ultimaPrevia.current = v;
    // Uma prévia por quadro: o deslizante solta muitos eventos por segundo; vai o último valor.
    if (quadro.current) return;
    quadro.current = requestAnimationFrame(() => {
      quadro.current = 0;
      if (ultimaPrevia.current !== null) onCotaPrevia(ultimaPrevia.current);
    });
  };
  const gravar = () => {
    if (rascunho === null) return;
    cancelAnimationFrame(quadro.current);
    quadro.current = 0;
    onCota(rascunho);
    setRascunho(null);
    ultimaPrevia.current = null;
  };
  const confirmarTexto = () => {
    if (texto === null) return;
    const v = lerNumero(texto);
    setTexto(null);
    if (Number.isFinite(v)) onCota(Math.round(v * 100) / 100);
  };

  // A largura do talude suave: o deslizante mostra ao vivo e grava ao soltar (a conta é cheia — não há prévia).
  const [larguraRascunho, setLarguraRascunho] = useState<number | null>(null);
  const largura = larguraRascunho ?? dados.larguraDoTaludeSuaveM ?? LARGURA_DO_TALUDE_SUAVE_PADRAO_M;
  const gravarLargura = () => {
    if (larguraRascunho === null) return;
    onParametros({ larguraDoTaludeSuaveM: larguraRascunho });
    setLarguraRascunho(null);
  };
  const semEquilibrio = motivoSemEquilibrio(dados.modoDoBalanco);
  const suave = dados.formaDoTalude === 'SUAVE';

  const totalM3 = dados.corteM3 + dados.aterroM3;
  const pctCorte = totalM3 > 0 ? (dados.corteM3 / totalM3) * 100 : 50;

  return (
    <div
      className="pointer-events-auto absolute left-3 top-16 z-10 w-64 max-h-[calc(100%-9rem)] overflow-y-auto rounded-[10px] border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-sm"
      data-testid="painel-do-plato"
      // O card fica FORA do canvas (a roda e o arraste nele não chegam à órbita); o aperto não sobe para o viewer.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-blue-600" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{ROTULO_DA_BASE[dados.base]}</h3>
        {onExcluir && (
          <button
            type="button"
            onClick={onExcluir}
            aria-label="Excluir platô desenhado"
            title="Excluir platô desenhado (pede confirmação)"
            className="rounded-[6px] p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onRecolher}
          aria-label="Recolher para o rodapé"
          title="Recolher para o selo compacto do rodapé (a escolha fica guardada)"
          className="rounded-[6px] p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cota — o "Height over sea level" do reel. */}
      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="painel-plato-cota" className="text-xs font-semibold text-slate-500">
            Cota do platô (m)
          </label>
          <input
            id="painel-plato-cota"
            type="text"
            inputMode="decimal"
            value={texto ?? String(Math.round(cota * 100) / 100)}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmarTexto}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmarTexto();
              if (e.key === 'Escape') setTexto(null);
            }}
            className="h-7 w-20 rounded-[6px] border border-slate-300 px-1.5 text-right text-xs tabular-nums text-slate-800"
          />
        </div>
        <input
          type="range"
          aria-label="Cota do platô — deslizante"
          min={min}
          max={max}
          step={0.05}
          value={Math.min(max, Math.max(min, cota))}
          onChange={(e) => prever(Number(e.target.value))}
          onPointerUp={gravar}
          onKeyUp={gravar}
          onBlur={gravar}
          className="mt-1.5 w-full accent-blue-600"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">{dados.equilibrio ? 'Na cota de equilíbrio' : 'Cota fixada'}</span>
          <button
            type="button"
            onClick={onEquilibrio}
            disabled={dados.equilibrio || !!semEquilibrio}
            title={semEquilibrio ?? (dados.equilibrio ? 'O platô já está na cota de equilíbrio (corte ≈ aterro)' : 'Volta a cota do platô à de equilíbrio (corte ≈ aterro)')}
            className="h-7 rounded-[6px] border border-slate-300 bg-white px-2 text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Equilíbrio
          </button>
        </div>
      </div>

      {/* Talude — o "Side slope" do reel: Suave (largura em planta) ou Reto (1:h). */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] font-medium text-slate-700">Talude</p>
        <div className="mt-1.5">
          <EscolhaDaFormaDoTalude valor={dados.formaDoTalude ?? 'RETO'} onEscolher={(v) => onParametros({ formaDoTalude: v })} />
        </div>
        {suave ? (
          <div className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Largura do talude</span>
              <span className="tabular-nums text-slate-800">{largura.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m</span>
            </div>
            <input
              type="range"
              aria-label="Largura do talude (m)"
              min={1}
              max={30}
              step={0.5}
              value={largura}
              onChange={(e) => setLarguraRascunho(Number(e.target.value))}
              onPointerUp={gravarLargura}
              onKeyUp={gravarLargura}
              onBlur={gravarLargura}
              className="mt-1 w-full accent-blue-600"
            />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <CampoDeTalude rotulo="Talude de corte 1:" valor={dados.taludeCorteH} idPct="painel-plato-talude-corte-pct" onMudar={(v) => onParametros({ taludeCorteH: v })} />
            <CampoDeTalude rotulo="Talude de aterro 1:" valor={dados.taludeAterroH} idPct="painel-plato-talude-aterro-pct" onMudar={(v) => onParametros({ taludeAterroH: v })} />
          </div>
        )}
      </div>

      {/* Balanço de massa — o "Mass balance" do reel. */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] font-medium text-slate-700">Balanço de massa</p>
        <div className="mt-1.5">
          <EscolhaDoBalanco valor={dados.modoDoBalanco ?? 'CORTE_E_ATERRO'} onEscolher={(v) => onParametros({ modoDoBalanco: v })} />
        </div>
      </div>

      {/* Área e perímetro — os dois cartões do reel. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[6px] bg-slate-50 px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Área</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800" data-testid="painel-plato-area">
            {dados.areaM2 === null ? '—' : `${dados.areaM2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`}
          </p>
        </div>
        <div className="rounded-[6px] bg-slate-50 px-2 py-1.5">
          <p className="text-[11px] text-slate-500">Perímetro</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800" data-testid="painel-plato-perimetro">
            {dados.perimetroM.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m
          </p>
        </div>
      </div>

      {/* Volumes — a barra do reel, com os números do selo. */}
      <div className="mt-2 rounded-[6px] bg-slate-50 px-2 py-2">
        <p className="text-[11px] text-slate-500">Volumes</p>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div data-testid="painel-plato-barra-corte" style={{ width: `${pctCorte}%`, backgroundColor: COR_DO_CORTE }} />
          <div style={{ width: `${100 - pctCorte}%`, backgroundColor: COR_DO_ATERRO }} />
        </div>
        <dl className="mt-1.5 space-y-0.5 tabular-nums">
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COR_DO_CORTE }} aria-hidden="true" />
              Corte
            </dt>
            <dd data-testid="painel-plato-corte" className="text-slate-800">{m3(dados.corteM3)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: COR_DO_ATERRO }} aria-hidden="true" />
              Aterro
            </dt>
            <dd data-testid="painel-plato-aterro" className="text-slate-800">{m3(dados.aterroM3)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-0.5 font-semibold">
            <dt className="text-slate-700" title="Aterro − corte, em banco (empolamento e contração já contados)">
              Saldo
            </dt>
            <dd data-testid="painel-plato-saldo" className="text-slate-800">{m3(dados.saldoM3)}</dd>
          </div>
        </dl>
      </div>

      {dados.foraDoRelevo && <p className="mt-2 text-[11px] text-amber-700">Parte do platô fora do relevo — a conta só vale onde há cota.</p>}
      {dados.aviso && <p className="mt-2 text-[11px] text-amber-700">{dados.aviso}</p>}
      <p className="mt-2 text-[11px] leading-snug text-slate-500">Banquetas, via e empolamento: Terreno › Dados do lote › Corte e aterro.</p>
    </div>
  );
}

export type ModoDoPainelDoPlato = 'COMPLETO' | 'COMPACTO';

/** O que o editor entrega ao viewer para o painel: os dados, as ações e o modo escolhido (preferência por usuário). */
export interface PainelDoPlatoNo3d {
  modo: ModoDoPainelDoPlato;
  onModo: (m: ModoDoPainelDoPlato) => void;
  dados: DadosDoPainelDoPlato;
  onCotaPrevia: (cotaM: number) => void;
  onCota: (cotaM: number) => void;
  onEquilibrio: () => void;
  onParametros: (patch: PatchDoPainelDoPlato) => void;
  onExcluir?: () => void;
}

export interface SaldoNoSelo {
  corteM3: number;
  aterroM3: number;
  saldoM3: number;
  equilibrio: boolean;
  foraDoRelevo: boolean;
}

/**
 * O platô no 3D: o painel COMPLETO à esquerda ou o selo COMPACTO do rodapé (o de 25/11, "mass balance" do reel),
 * conforme a escolha do usuário. Sem `painel` (quem monta o viewer sem ele), só o selo, como sempre foi.
 */
export function PlatoNo3d({
  saldo,
  painel,
  onEquilibrio,
  aviso,
  semControles = false,
}: {
  saldo: SaldoNoSelo;
  painel: PainelDoPlatoNo3d | null | undefined;
  onEquilibrio?: () => void;
  aviso: string | null | undefined;
  semControles?: boolean;
}) {
  if (painel && painel.modo === 'COMPLETO') {
    if (semControles) return null;
    return (
      <PainelDoPlato3d
        dados={painel.dados}
        onCotaPrevia={painel.onCotaPrevia}
        onCota={painel.onCota}
        onEquilibrio={painel.onEquilibrio}
        onParametros={painel.onParametros}
        onExcluir={painel.onExcluir}
        onRecolher={() => painel.onModo('COMPACTO')}
      />
    );
  }
  return (
    // O SALDO DO PLATÔ (25/11/2026, "mass balance" do reel): embaixo à direita, acima da linha da dica.
    <div className="absolute bottom-16 right-2 z-10 max-w-[42%] rounded-[6px] border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm" data-testid="saldo-do-plato">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
        <span>Corte {saldo.corteM3.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³</span>
        <span>Aterro {saldo.aterroM3.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³</span>
        <span className="font-medium">Saldo {saldo.saldoM3.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m³</span>
        {onEquilibrio && (
          <button
            type="button"
            onClick={onEquilibrio}
            disabled={saldo.equilibrio || !!motivoSemEquilibrio(painel?.dados.modoDoBalanco)}
            title={
              motivoSemEquilibrio(painel?.dados.modoDoBalanco) ??
              (saldo.equilibrio ? 'O platô já está na cota de equilíbrio (corte ≈ aterro)' : 'Volta a cota do platô à de equilíbrio (corte ≈ aterro)')
            }
            className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Equilíbrio
          </button>
        )}
        {painel && !semControles && (
          <button
            type="button"
            onClick={() => painel.onModo('COMPLETO')}
            aria-label="Abrir painel"
            title="Abrir o painel completo do platô à esquerda (a escolha fica guardada)"
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
          >
            <PanelLeftOpen className="h-3 w-3" />
            Painel
          </button>
        )}
      </div>
      {saldo.foraDoRelevo && <p className="mt-0.5 text-amber-700">Parte do platô fora do relevo — a conta só vale onde há cota.</p>}
      {aviso && <p className="mt-0.5 text-amber-700">{aviso}</p>}
    </div>
  );
}
