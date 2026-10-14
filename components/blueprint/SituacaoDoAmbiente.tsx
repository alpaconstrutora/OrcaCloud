/**
 * As linhas de DISCIPLINA no cartão do ambiente (14/10/2026): uma por
 * disciplina, com a situação resumida, e o clique abre a gaveta dela.
 *
 * O cartão do ambiente diz o que o ambiente É; o que cada disciplina FAZ nele
 * mora na gaveta da disciplina. Ver `utils/blueprintSituacaoDoAmbiente.ts`.
 */
import { ChevronRight, Droplets, Thermometer, Zap } from 'lucide-react';
import {
  ROTULO_DA_DISCIPLINA_DO_AMBIENTE,
  type DisciplinaDoAmbiente,
  type EstadoDaDisciplina,
  type SituacaoDaDisciplina,
} from '../../utils/blueprintSituacaoDoAmbiente';

const ICONE: Record<DisciplinaDoAmbiente, typeof Zap> = {
  ELETRICA: Zap,
  HIDRAULICA: Droplets,
  CLIMATIZACAO: Thermometer,
};

const COR_DO_TEXTO: Record<EstadoDaDisciplina, string> = {
  ok: 'text-emerald-700',
  falta: 'text-amber-700',
  neutro: 'text-slate-500',
};

export function SituacaoDoAmbiente({
  nomeDoAmbiente,
  situacoes,
  onAbrir,
}: {
  nomeDoAmbiente: string;
  situacoes: readonly SituacaoDaDisciplina[];
  onAbrir: (disciplina: DisciplinaDoAmbiente) => void;
}) {
  return (
    <ul className="mt-1.5 space-y-0.5" aria-label={`Disciplinas de ${nomeDoAmbiente}`}>
      {situacoes.map((s) => {
        const Icone = ICONE[s.disciplina];
        const rotulo = ROTULO_DA_DISCIPLINA_DO_AMBIENTE[s.disciplina];
        return (
          <li key={s.disciplina}>
            <button
              type="button"
              onClick={() => onAbrir(s.disciplina)}
              title={`Abrir ${rotulo.toLowerCase()} na gaveta`}
              aria-label={`${rotulo} de ${nomeDoAmbiente}: ${s.texto}`}
              data-testid={`situacao-${s.disciplina.toLowerCase()}`}
              data-estado={s.estado}
              className="group flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Icone className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span className="w-[72px] shrink-0 font-medium text-slate-600">{rotulo}</span>
              {/* Quebra em vez de cortar: o painel é estreito e o que falta é a informação útil
                  (o print de 14/10 mostrou "kit banheiro: 0 de 8 pontos · f…"). */}
              <span className={`min-w-0 flex-1 ${COR_DO_TEXTO[s.estado]}`}>{s.texto}</span>
              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
