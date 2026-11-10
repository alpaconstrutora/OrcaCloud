// components/empreendimento/VistasDaTorreSecao.tsx
//
// VISTA DA JANELA (Espelho de Vendas 3D, F6 — 10/11/2026). Plano:
// docs/planos/2026-11-09-espelho-de-vendas-3d.md.
//
// A foto do que se vê da janela, por faixa de andares da torre e, se quiser, por
// face. A ficha da unidade, no Espelho de Vendas 3D dos portais do Corretor e do
// Investidor, abre a vista da faixa que contém o andar dela.
import React from 'react';
import { Loader2, Mountain, Plus } from 'lucide-react';
import SecaoTitulo from '../ui/SecaoTitulo';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import ImageDropzone from '../ui/ImageDropzone';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { empreendimentoTowerVistasService } from '../../services/empreendimentoTowerVistasService';
import { problemaDaVista, rotuloDaVista, type VistaDaTorre } from '../../utils/espelhoVistaDaJanela';
import type { UnitSunOrientation } from '../../types/empreendimento';

interface Props {
  towerId: string;
  towerName: string;
  empreendimentoId: string;
  organizationId: string;
  /** Motivo do modo só leitura (o mesmo do TowerEditor). */
  somenteLeitura?: string;
}

const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
const rotuloCls = 'text-xs font-semibold text-slate-500';
const FACES: { valor: UnitSunOrientation | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Qualquer face' },
  { valor: 'NORTE', rotulo: 'Norte' },
  { valor: 'SUL', rotulo: 'Sul' },
  { valor: 'LESTE', rotulo: 'Leste' },
  { valor: 'OESTE', rotulo: 'Oeste' },
];

const vazio = () => ({ de: '', ate: '', face: '' as UnitSunOrientation | '', legenda: '' });
/** "3", "-1" → número inteiro; vazio = null; outra coisa = NaN (o `problemaDaVista` recusa). */
const andar = (texto: string): number | null => (texto.trim() === '' ? null : /^-?\d+$/.test(texto.trim()) ? Number(texto.trim()) : NaN);

export const VistasDaTorreSecao: React.FC<Props> = ({ towerId, towerName, empreendimentoId, organizationId, somenteLeitura }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [vistas, setVistas] = React.useState<VistaDaTorre[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(vazio);
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  // A prévia do arquivo escolhido (ainda não enviado).
  const previa = React.useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  React.useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);

  React.useEffect(() => {
    let vivo = true;
    setErro(null);
    empreendimentoTowerVistasService
      .listar(towerId)
      .then((lista) => { if (vivo) setVistas(lista); })
      .catch((e: unknown) => {
        if (!vivo) return;
        setVistas([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as vistas da janela.');
      });
    return () => { vivo = false; };
  }, [towerId]);

  const faixa = { andar_de: andar(form.de), andar_ate: andar(form.ate) };
  const motivo = !arquivo ? 'Escolha a foto da vista.' : problemaDaVista(faixa);

  const adicionar = async () => {
    if (motivo || !arquivo) return;
    setSalvando(true);
    try {
      const nova = await empreendimentoTowerVistasService.adicionar({
        organizationId, empreendimentoId, towerId,
        andar_de: faixa.andar_de!, andar_ate: faixa.andar_ate!,
        orientacao: form.face || null,
        legenda: form.legenda.trim() || null,
        arquivo,
      });
      setVistas((atual) => [...(atual ?? []), nova].sort((a, b) => a.andar_de - b.andar_de || a.andar_ate - b.andar_ate));
      setForm(vazio());
      setArquivo(null);
      showToast(`Vista da ${towerName} gravada: ${rotuloDaVista(nova)}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível gravar a vista.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (v: VistaDaTorre) => {
    const ok = await confirm({
      title: 'Remover esta vista?',
      message: `${rotuloDaVista(v)}. A ficha das unidades dessa faixa deixa de abrir a vista da janela nos portais do Corretor e do Investidor.`,
      confirmLabel: 'Remover vista',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoTowerVistasService.remover(v);
      setVistas((atual) => (atual ?? []).filter((x) => x.id !== v.id));
      showToast('Vista removida.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível remover a vista.', 'error');
    }
  };

  const id = (campo: string) => `vista-${towerId}-${campo}`;

  return (
    <div className="space-y-3" data-testid={`vistas-da-torre-${towerId}`}>
      <SecaoTitulo icon={Mountain} titulo="Vista da janela" resumo={vistas && vistas.length > 0 ? `${vistas.length} foto(s)` : undefined} />
      <p className="text-xs text-gray-500">
        A foto do que se vê da janela, por faixa de andares. A ficha da unidade abre a vista da faixa do andar dela no Espelho de Vendas 3D dos portais do Corretor e do Investidor. Se duas faixas servem, vale a da mesma face e, depois, a mais estreita.
      </p>

      {vistas === null && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando vistas…</p>}
      {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

      {vistas && vistas.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-200">
          {vistas.map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-2" data-testid="vista-gravada">
              <img src={v.imagem_url} alt={`Vista: ${rotuloDaVista(v)}`} className="w-24 h-16 object-cover rounded-[6px] border border-gray-100 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">{rotuloDaVista(v)}</p>
                {v.legenda && <p className="text-xs text-gray-500 truncate" title={v.legenda}>{v.legenda}</p>}
              </div>
              {!somenteLeitura && <ActionIconButton kind="delete" title="Remover vista" onClick={() => remover(v)} />}
            </li>
          ))}
        </ul>
      )}
      {vistas && vistas.length === 0 && !erro && <p className="text-sm text-gray-500">Nenhuma vista cadastrada nesta torre.</p>}

      {!somenteLeitura && !erro && vistas && (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-4 rounded-[6px] border border-gray-100 bg-gray-50/40 p-3" data-testid="nova-vista">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 content-start">
            <div className="space-y-1.5">
              <label htmlFor={id('de')} className={rotuloCls}>Do andar</label>
              <input id={id('de')} className={inputCls} inputMode="numeric" placeholder="ex: 0 (térreo)" value={form.de} onChange={(e) => setForm((f) => ({ ...f, de: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id('ate')} className={rotuloCls}>Até o andar</label>
              <input id={id('ate')} className={inputCls} inputMode="numeric" placeholder="ex: 3" value={form.ate} onChange={(e) => setForm((f) => ({ ...f, ate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id('face')} className={rotuloCls}>Face da torre</label>
              <select id={id('face')} className={inputCls} value={form.face} onChange={(e) => setForm((f) => ({ ...f, face: e.target.value as UnitSunOrientation | '' }))}>
                {FACES.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id('legenda')} className={rotuloCls}>Legenda (opcional)</label>
              <input id={id('legenda')} className={inputCls} placeholder="ex: Vista para a praça" maxLength={120} value={form.legenda} onChange={(e) => setForm((f) => ({ ...f, legenda: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-center justify-end gap-3">
              {motivo && <p className="text-xs text-gray-500" data-testid="nova-vista-motivo">{motivo}</p>}
              <span title={motivo ?? undefined}>
                <Button type="button" variant="secondary" disabled={!!motivo || salvando} onClick={adicionar}>
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
                  Adicionar vista
                </Button>
              </span>
            </div>
          </div>
          <ImageDropzone
            value={previa}
            onSelect={(f) => setArquivo(f)}
            onRemove={() => setArquivo(null)}
            uploading={salvando}
            hint="Arraste a foto da vista aqui ou clique para selecionar"
          />
        </div>
      )}
    </div>
  );
};

export default VistasDaTorreSecao;
