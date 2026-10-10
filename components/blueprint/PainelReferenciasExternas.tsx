/**
 * REFERÊNCIAS EXTERNAS (E10.4b do roadmap de climatização, 08/10/2026).
 *
 * Os modelos IFC de outras disciplinas — escolhidos na biblioteca de IFC da
 * organização — desenhados no 3D da Planta só para OLHAR e coordenar: com olho
 * próprio, opacidade e posição (deslocamento, cota, giro). Não viram desenho,
 * não entram na versão (a regra mora em `utils/blueprintReferenciaExterna.ts`).
 *
 * O painel só edita a lista; quem baixa o arquivo e quem desenha é o editor e o
 * viewer. A lista fica guardada neste navegador, por estudo.
 */
import { useEffect, useState } from 'react';
import { Boxes, Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { listarArquivos, type ArquivoDigital } from '../../services/digitalFileService';
import { useOrgContext } from '../../hooks/useOrgContext';
import { referenciaNova, type ReferenciaExterna } from '../../utils/blueprintReferenciaExterna';

interface Props {
  referencias: ReferenciaExterna[];
  onMudar: (referencias: ReferenciaExterna[]) => void;
  /** Ids dos arquivos que estão baixando/lendo agora. */
  carregando: ReadonlySet<string>;
  /** Erro de download/leitura por arquivo. */
  erros: Readonly<Record<string, string>>;
}

export default function PainelReferenciasExternas({ referencias, onMudar, carregando, erros }: Props) {
  const { orgId } = useOrgContext();
  const [biblioteca, setBiblioteca] = useState<ArquivoDigital[] | null>(null);

  useEffect(() => {
    listarArquivos(orgId)
      .then(setBiblioteca)
      .catch(() => setBiblioteca([]));
  }, [orgId]);

  const jaNaLista = new Set(referencias.map((r) => r.arquivoId));
  const mudar = (arquivoId: string, parcial: Partial<ReferenciaExterna>) =>
    onMudar(referencias.map((r) => (r.arquivoId === arquivoId ? { ...r, ...parcial } : r)));

  const campo = (r: ReferenciaExterna, rotulo: string, chave: 'deslocamentoXMm' | 'deslocamentoYMm' | 'cotaMm' | 'rotacaoDeg', unidade: string) => (
    <label key={chave} className="flex items-center justify-between gap-2 text-xs text-slate-600">
      {rotulo}
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={r[chave]}
          step={chave === 'rotacaoDeg' ? 1 : 100}
          aria-label={`${rotulo} — ${r.nome}`}
          onChange={(e) => mudar(r.arquivoId, { [chave]: Number(e.target.value) || 0 })}
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-xs text-slate-800"
        />
        <span className="w-6 text-slate-400">{unidade}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-3 px-4 py-3" data-testid="painel-referencias-externas">
      <p className="text-xs text-slate-500">
        Modelos IFC de outras disciplinas, só para olhar no 3D e coordenar. Não viram desenho e não entram na
        versão. A lista fica guardada neste navegador, para este estudo.
      </p>

      {referencias.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum modelo de referência ainda. Escolha um da biblioteca abaixo.</p>
      ) : (
        <ul className="space-y-2">
          {referencias.map((r) => (
            <li key={r.arquivoId} className="rounded-md border border-slate-200 p-2" data-testid="referencia-externa">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => mudar(r.arquivoId, { visivel: !r.visivel })}
                  aria-pressed={r.visivel}
                  title={r.visivel ? `Ocultar ${r.nome} no 3D` : `Mostrar ${r.nome} no 3D`}
                  aria-label={r.visivel ? `Ocultar ${r.nome} no 3D` : `Mostrar ${r.nome} no 3D`}
                  className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100"
                >
                  {r.visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <span className={`min-w-0 flex-1 truncate text-xs font-medium ${r.visivel ? 'text-slate-800' : 'text-slate-400'}`} title={r.nome}>
                  {r.nome}
                </span>
                {carregando.has(r.arquivoId) && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Carregando o modelo" />}
                <button
                  type="button"
                  onClick={() => onMudar(referencias.filter((x) => x.arquivoId !== r.arquivoId))}
                  title={`Tirar ${r.nome} das referências (o arquivo continua na biblioteca)`}
                  aria-label={`Tirar ${r.nome} das referências`}
                  className="rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {erros[r.arquivoId] && <p className="mt-1 text-[11px] text-red-600">{erros[r.arquivoId]}</p>}
              <div className="mt-2 space-y-1">
                {campo(r, 'Deslocamento em x', 'deslocamentoXMm', 'mm')}
                {campo(r, 'Deslocamento em y', 'deslocamentoYMm', 'mm')}
                {campo(r, 'Cota', 'cotaMm', 'mm')}
                {campo(r, 'Giro (anti-horário)', 'rotacaoDeg', '°')}
                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                  Opacidade
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={r.opacidade}
                    aria-label={`Opacidade — ${r.nome}`}
                    onChange={(e) => mudar(r.arquivoId, { opacidade: Number(e.target.value) })}
                    className="w-32"
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <h4 className="text-[11px] font-semibold text-slate-500">Da biblioteca de IFC</h4>
        {biblioteca === null ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Lendo a biblioteca…
          </p>
        ) : biblioteca.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">A biblioteca de IFC desta organização está vazia — envie o arquivo em Modelo 3D (IFC).</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {biblioteca.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={jaNaLista.has(a.id)}
                  onClick={() =>
                    onMudar([...referencias, referenciaNova({ id: a.id, nome: `${a.nome} rev. ${a.revisao}`, storagePath: a.storagePath })])
                  }
                  title={jaNaLista.has(a.id) ? 'Já está nas referências' : `Usar ${a.nome} como referência no 3D`}
                  className="flex w-full items-center gap-1 truncate rounded-[6px] px-1.5 py-1 text-left text-[12px] text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-default disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  {jaNaLista.has(a.id) ? <Boxes className="h-3 w-3 shrink-0 text-slate-300" aria-hidden /> : <Plus className="h-3 w-3 shrink-0 text-blue-600" aria-hidden />}
                  <span className="truncate">
                    {a.nome} <span className="text-slate-400">rev. {a.revisao}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
