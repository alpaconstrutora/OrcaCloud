/**
 * CÂMERA SELECIONADA (12/10/2026, F12 do plano `2026-10-11-planta-recursos-video-synaps.md`): o nome, a
 * altura do olho, a lente — com o ângulo de visão que ela dá, que é o que se decide olhando o cone — e
 * "Ver no 3D", que abre a vista 3D daquele ponto. Mover posição e alvo é na planta (Mover, ou o 3D).
 */
import { Box, Trash2 } from 'lucide-react';
import {
  ALTURA_DO_OLHO_MAX_MM,
  ALTURA_DO_OLHO_MIN_MM,
  FOCAL_MAX_MM,
  FOCAL_MIN_MM,
  MAX_NOME_DE_CAMERA,
  type Camera,
} from '../../utils/blueprintKernel';
import { fovHorizontalGraus } from '../../utils/blueprintCamera';

interface Props {
  camera: Camera | null;
  onProps: (campos: { nome?: string; alturaOlhoMm?: number; focalMm?: number }) => void;
  onVerNo3d: () => void;
  onExcluir: () => void;
}

const campo = 'h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const LENTES = [16, 24, 35, 50] as const;

export default function PainelCameraSelecionada({ camera: c, onProps, onVerNo3d, onExcluir }: Props) {
  if (!c) return null;
  const distancia = Math.hypot(c.alvo.x - c.posicao.x, c.alvo.y - c.posicao.y);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600" data-testid="painel-camera">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Câmera</h3>
        <button type="button" onClick={onExcluir} title="Excluir a câmera" aria-label="Excluir a câmera" className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1">
          Nome
          <input
            key={`${c.id}-nome-${c.nome}`}
            defaultValue={c.nome}
            maxLength={MAX_NOME_DE_CAMERA}
            aria-label="Nome da câmera"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) e.target.value = c.nome;
              else if (v !== c.nome) onProps({ nome: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          Altura do olho (m)
          <input
            key={`${c.id}-olho-${c.alturaOlhoMm}`}
            type="number"
            step={0.05}
            min={ALTURA_DO_OLHO_MIN_MM / 1000}
            max={ALTURA_DO_OLHO_MAX_MM / 1000}
            defaultValue={c.alturaOlhoMm / 1000}
            aria-label="Altura do olho (m)"
            onBlur={(e) => {
              const mm = Math.round(Number(e.target.value) * 1000);
              if (!(mm >= ALTURA_DO_OLHO_MIN_MM && mm <= ALTURA_DO_OLHO_MAX_MM)) {
                e.target.value = String(c.alturaOlhoMm / 1000);
                return;
              }
              if (mm !== c.alturaOlhoMm) onProps({ alturaOlhoMm: mm });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
        <label className="flex flex-col gap-1">
          Lente (mm)
          <input
            key={`${c.id}-focal-${c.focalMm}`}
            type="number"
            step={1}
            min={FOCAL_MIN_MM}
            max={FOCAL_MAX_MM}
            defaultValue={c.focalMm}
            aria-label="Lente (mm, equivalente a 35 mm)"
            onBlur={(e) => {
              const f = Math.round(Number(e.target.value));
              if (!(f >= FOCAL_MIN_MM && f <= FOCAL_MAX_MM)) {
                e.target.value = String(c.focalMm);
                return;
              }
              if (f !== c.focalMm) onProps({ focalMm: f });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={campo}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {LENTES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => f !== c.focalMm && onProps({ focalMm: f })}
            aria-pressed={c.focalMm === f}
            title={`${f} mm — ${fovHorizontalGraus(f).toFixed(0)}° na horizontal`}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${c.focalMm === f ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {f} mm
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Ângulo de visão {fovHorizontalGraus(c.focalMm).toFixed(0).replace('.', ',')}° na horizontal · alvo a {(distancia / 1000).toFixed(2).replace('.', ',')} m. Mova a câmera com Mover, como as outras peças.
      </p>
      <button
        type="button"
        onClick={onVerNo3d}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100"
      >
        <Box className="h-3.5 w-3.5" /> Ver no 3D
      </button>
    </div>
  );
}
