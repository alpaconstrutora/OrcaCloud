/**
 * ENVIAR O CORTE 3D DA UNIDADE AO ESPELHO (Espelho de Vendas 3D, F9 — 10/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * A prévia é o próprio 3D da Planta (`Blueprint3DViewer`) mostrando só a unidade — sem as paredes e os móveis de
 * fora, recortada na caixa em volta dela, vista de cima e de lado (`cenaDoDecorado`). O que se vê é o que vai: o
 * "Enviar" captura a cena num PNG de 1600 × 1000 e grava no lugar do corte da tipologia, no decorado do
 * Empreendimento (F8), com a origem PLANTA e a assinatura do desenho. Diálogo central, nunca tela cheia.
 */
import React from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { Modal } from '../ui/modal';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import type { BlueprintModel } from '../../utils/blueprintKernel';
import {
  cenaDoDecorado,
  ROTULO_DO_LADO,
  TAMANHO_DA_IMAGEM_DO_CORTE,
  textoDaSituacao,
  type CorteGravado,
  type LadoDaVista,
  type SituacaoDoCorte,
} from '../../utils/espelhoDecoradoDaPlanta';
import type { ImagemDoDecorado } from '../../utils/espelhoDecoradoDaTipologia';
import { empreendimentoTipologiaDecoradoService } from '../../services/empreendimentoTipologiaDecoradoService';
import { webglDisponivel } from '../espelho3d/webglDisponivel';

const Blueprint3DViewer = React.lazy(() => import('./Blueprint3DViewer'));

type Captura = (largura: number, altura: number, focalMm?: number) => Promise<Blob>;

const ALTURAS: { valor: string; rotulo: string; mm: number | null }[] = [
  { valor: '1200', rotulo: 'Baixas (1,20 m)', mm: 1200 },
  { valor: '2200', rotulo: 'Quase inteiras (2,20 m)', mm: 2200 },
  { valor: 'inteiras', rotulo: 'Inteiras', mm: null },
];
const LADOS: LadoDaVista[] = ['SUDESTE', 'SUDOESTE', 'NOROESTE', 'NORDESTE'];
const selectCls = 'h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const rotuloCls = 'text-xs font-semibold text-slate-500';

export interface Props {
  model: BlueprintModel;
  unidadeId: string;
  /** O Empreendimento ligado ao estudo — para onde o corte vai. */
  empreendimento: { id: string; nome: string; organizationId: string };
  estudoId: string | null;
  /** O corte que a tipologia tem hoje (de qualquer origem), para trocar no lugar dele. */
  corteAtual: (ImagemDoDecorado & CorteGravado) | null;
  situacao: SituacaoDoCorte;
  onFechar: () => void;
  /** Depois de gravado: quem chamou relê os cortes do banco. */
  onEnviado: () => void;
}

export const EnviarCorteDaUnidade: React.FC<Props> = ({ model, unidadeId, empreendimento, estudoId, corteAtual, situacao, onFechar, onEnviado }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const capturaRef = React.useRef<Captura | null>(null);
  const [lado, setLado] = React.useState<LadoDaVista>('SUDESTE');
  const [altura, setAltura] = React.useState('2200');
  const [mobiliar, setMobiliar] = React.useState<boolean | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const comWebgl = React.useMemo(() => webglDisponivel(), []);

  const alturaMm = ALTURAS.find((a) => a.valor === altura)?.mm ?? null;
  const resultado = React.useMemo(
    () => cenaDoDecorado(model, unidadeId, { lado, alturaDoCorteMm: alturaMm }, mobiliar === null ? {} : { mobiliarSugerido: mobiliar }),
    [model, unidadeId, lado, alturaMm, mobiliar],
  );
  const cena = resultado.ok ? resultado.cena : null;
  // O kit sugerido nasce ligado só na unidade sem móvel; o que a pessoa marcou vale daí em diante.
  const mobiliado = mobiliar ?? (cena ? cena.moveisDoEstudo === 0 : false);

  const motivo = !resultado.ok
    ? resultado.motivo
    : situacao.tipo === 'SEM_EMPREENDIMENTO' || situacao.tipo === 'TIPOLOGIA_FORA'
      ? textoDaSituacao(situacao)
      : !comWebgl
        ? 'Este navegador não desenha 3D (WebGL desligado): sem o desenho não há o que capturar.'
        : null;

  const enviar = async () => {
    if (!cena || motivo) return;
    if (!capturaRef.current) {
      showToast('O 3D ainda está carregando — tente de novo em instantes.', 'error');
      return;
    }
    // Trocar um corte de outra origem (imagem enviada, ou de outra unidade) pede confirmação.
    if (situacao.tipo === 'IMAGEM_ENVIADA' || situacao.tipo === 'DE_OUTRA_UNIDADE') {
      const ok = await confirm({
        title: `Substituir o corte da tipologia ${cena.tipologia}?`,
        message: `${textoDaSituacao(situacao)} O corte desta unidade (${cena.numero}) passa a ser o da tipologia nos portais do Corretor e do Investidor.`,
        confirmLabel: 'Substituir corte',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setEnviando(true);
    try {
      const png = await capturaRef.current(TAMANHO_DA_IMAGEM_DO_CORTE.largura, TAMANHO_DA_IMAGEM_DO_CORTE.altura, cena.pontoDeVista.focalMm);
      await empreendimentoTipologiaDecoradoService.gravarCorteDaPlanta({
        organizationId: empreendimento.organizationId,
        empreendimentoId: empreendimento.id,
        tipologia: cena.tipologia,
        png,
        assinatura: cena.assinatura,
        estudoId,
        anterior: corteAtual,
      });
      showToast(`Corte da unidade ${cena.numero} enviado: é o corte da tipologia ${cena.tipologia} no Espelho de Vendas 3D de "${empreendimento.nome}".`);
      onEnviado();
      onFechar();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Não foi possível enviar o corte.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} size="2xl" className="!rounded-[10px]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">Corte 3D da unidade {cena?.numero ?? ''} para o Espelho de Vendas</p>
          <p className="text-[13px] text-gray-500 truncate">
            {cena ? `Tipologia ${cena.tipologia} · ${empreendimento.nome}` : empreendimento.nome}
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          title="Fechar"
          className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3 overflow-auto bg-white">
        <p className="text-[13px] text-gray-600" data-testid="corte-situacao">Situação nos portais: {textoDaSituacao(situacao)}</p>

        {cena && comWebgl && (
          // O formato da prévia é o da imagem (1600 × 1000): o que se vê é o que vai.
          <div className="relative w-full aspect-[1.6] rounded-[6px] border border-gray-200 bg-slate-50 overflow-hidden" data-testid="corte-previa">
            <React.Suspense fallback={<p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando o 3D…</p>}>
              <Blueprint3DViewer
                // A caixa de corte só é lida ao montar: outra altura remonta o desenho.
                key={`${cena.levelId}:${altura}`}
                model={cena.modelo}
                levelIds={[cena.levelId]}
                mostrarLaje
                mostrarArestas
                mostrarTerreno={false}
                ocultos={cena.ocultos}
                caixaDeCorteInicial={cena.caixa}
                pontoDeVista={cena.pontoDeVista}
                capturaRef={capturaRef}
                semControles
              />
            </React.Suspense>
          </div>
        )}

        {cena && (
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1.5">
              <span className={`block ${rotuloCls}`}>Olhar de</span>
              <select className={selectCls} value={lado} onChange={(e) => setLado(e.target.value as LadoDaVista)} aria-label="Olhar de">
                {LADOS.map((l) => <option key={l} value={l}>{ROTULO_DO_LADO[l]}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className={`block ${rotuloCls}`}>Paredes</span>
              <select className={selectCls} value={altura} onChange={(e) => setAltura(e.target.value)} aria-label="Paredes">
                {ALTURAS.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 h-9 text-sm text-gray-700">
              <input type="checkbox" checked={mobiliado} onChange={(e) => setMobiliar(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
              Mobiliar com o kit sugerido
            </label>
          </div>
        )}
        {cena && (
          <p className="text-xs text-gray-500" data-testid="corte-moveis">
            {cena.moveisDoEstudo > 0 ? `${cena.moveisDoEstudo} móvel(is) do estudo` : 'Nenhum móvel no estudo'}
            {cena.moveisSugeridos > 0 ? ` + ${cena.moveisSugeridos} do kit sugerido (só na imagem; o estudo não muda)` : ''}.
            {' '}Nos portais, o corte aparece com o selo "Gerado do projeto · mobiliário ilustrativo".
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
          {motivo && <p className="text-xs text-gray-600" data-testid="corte-motivo">{motivo}</p>}
          <Button type="button" variant="secondary" onClick={onFechar}>Cancelar</Button>
          <span title={motivo ?? undefined}>
            <Button type="button" disabled={!!motivo || enviando} onClick={enviar}>
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-[15px] h-[15px]" />}
              Enviar ao Espelho 3D
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
};

export default EnviarCorteDaUnidade;
