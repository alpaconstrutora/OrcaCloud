/**
 * HARNESS VISUAL do Espelho de Vendas 3D (F2, 09/11/2026): o desenho é WebGL e não sobe em jsdom. Isto monta o
 * `<Espelho3D>` com uma cena de mentira — uma torre com o contorno da Planta (em L) e outra esquemática — e o CSS do
 * app, para olhar e tocar. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 *   npx vite --port 3147 → http://localhost:3147/docs/spikes/espelho-vendas-3d/index.html
 *   ?torres=1 mostra só a torre esquemática; ?sem3d=1 força a tela sem WebGL;
 *   ?corretor=1 monta o Estoque do Portal do Corretor (seletor 2D | 3D + desenho pelo estoque, F3).
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Espelho3D from '../../../components/espelho3d/Espelho3D';
import type { DadosDaUnidade } from '../../../components/espelho3d/FichaDaUnidade';
import { montarCenaDoEspelho, type TorreDoEspelho } from '../../../utils/espelhoDeVendas3d';
import { EstoqueEm3D, SeletorDaVisaoDoEstoque, type EstoqueEm3DState } from '../../../components/broker/EstoqueEm3D';
import { montarEspelhoDoEstoque, type ImovelDoEstoque } from '../../../utils/espelhoDoEstoque';

const q = new URLSearchParams(location.search);
if (q.get('sem3d')) HTMLCanvasElement.prototype.getContext = (() => null) as never;

const STATUS = ['DISPONIVEL', 'DISPONIVEL', 'VENDIDO', 'RESERVADO', 'VENDIDO', 'DISPONIVEL', 'PERMUTADO', 'VENDIDO'];
const dados = new Map<string, DadosDaUnidade>();

function torre(id: string, nome: string, andares: number, porAndar: number, areas: number[], extra: Partial<TorreDoEspelho> = {}): TorreDoEspelho {
  const units = [];
  for (let n = 1; n <= andares; n++) {
    for (let k = 0; k < porAndar; k++) {
      const uid = `${id}-${n}-${k + 1}`;
      const area = areas[k % areas.length];
      units.push({ id: uid, name: `${n}0${k + 1}`, floor: n, floor_tipo: 'TIPO' as const, private_area: area, status: STATUS[(n * 3 + k * 5) % STATUS.length] as never, sort_order: k });
      dados.set(uid, { tipologia: area > 100 ? '3 quartos' : '2 quartos', areaPrivativaM2: area, dormitorios: area > 100 ? 3 : 2, banheiros: 2, vagas: area > 100 ? 2 : 1, preco: Math.round(area * (9000 + n * 120)) });
    }
  }
  return { id, name: nome, sort_order: 0, pe_direito_padrao_m: 3, units: units as never, ...extra };
}

const EM_L = [{ x: 0, y: 0 }, { x: 26000, y: 0 }, { x: 26000, y: 12000 }, { x: 14000, y: 12000 }, { x: 14000, y: 22000 }, { x: 0, y: 22000 }];
const A = torre('A', 'Torre A', 18, 4, [127.4, 127.4, 81.2, 81.2], { contorno: { anel: EM_L, frenteParaFora: { x: 0, y: -1 }, rotacaoNorteDeg: 0 } });
const B = torre('B', 'Torre B', 12, 6, [64, 64, 72, 72, 58, 58], { sort_order: 1 });
// Uma garagem em cada torre: o andar 0 fica sem unidade (o térreo de lazer, volume neutro) e o -1 só na lista.
const comTerreo = (t: TorreDoEspelho): TorreDoEspelho => ({ ...t, units: [...(t.units ?? []), { id: `${t.id}-g`, name: 'Garagem', floor: -1, floor_tipo: 'GARAGEM' as never, status: 'DISPONIVEL' as never }] });

const torres = q.get('torres') === '1' ? [comTerreo(B)] : [comTerreo(A), comTerreo(B)];
const cena = montarCenaDoEspelho({ torres, distancias: [{ torre_a: 'A', torre_b: 'B', distancia_m: 18 }] });

function Harness() {
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Espelho de Vendas 3D</h1>
        <p className="text-sm text-gray-500 mt-1.5">Harness: Torre A com contorno da Planta (em L), Torre B esquemática.</p>
      </div>
      <Espelho3D
        cena={cena}
        dados={dados}
        mostrarPreco
        acoesDaFicha={(p) => (
          <button type="button" className="h-9 px-4 rounded-[8px] bg-blue-600 text-white text-sm font-medium hover:bg-blue-700" onClick={() => console.log('proposta', p.unitId)}>
            Fazer proposta
          </button>
        )}
      />
      {cena.avisos.length > 0 && <pre className="text-xs text-gray-500 whitespace-pre-wrap">{cena.avisos.join('\n')}</pre>}
    </div>
  );
}

/** O Estoque do corretor (F3): dois blocos tirados do próprio estoque, com negócios, sem andar em 3 imóveis. */
function HarnessDoCorretor() {
  const imoveis = React.useMemo<ImovelDoEstoque[]>(() => {
    const out: ImovelDoEstoque[] = [];
    for (const [bloco, andares, porAndar] of [['A', 14, 4], ['B', 9, 3]] as const) {
      for (let n = 1; n <= andares; n++) {
        for (let k = 1; k <= porAndar; k++) {
          const id = `${bloco}${n}0${k}`;
          out.push({ id, name: `Apto ${n}0${k}`, number: `${n}0${k}`, type: 'APARTMENT', parent_id: 'predio', block: bloco, floor: n, private_area: k % 2 ? 92.4 : 68, typology: k % 2 ? '3 quartos' : '2 quartos', bedrooms: k % 2 ? 3 : 2, bathrooms: 2, parking_spaces: 1, price: 380_000 + n * 9_000 + k * 14_000, status: STATUS[(n * 3 + k * 5) % STATUS.length] === 'VENDIDO' ? 'SOLD' : STATUS[(n * 3 + k * 5) % STATUS.length] === 'PERMUTADO' ? 'EXCHANGED' : 'AVAILABLE' } as never);
        }
      }
    }
    for (const id of ['Box 1', 'Box 2', 'Loja']) out.push({ id, name: id, type: 'COMMERCIAL', parent_id: 'predio', status: 'AVAILABLE' } as never);
    return out;
  }, []);
  const negocios = [{ property_id: 'A302', status: 'PENDING' }, { property_id: 'A502', status: 'IN_NEGOTIATION' }, { property_id: 'B402', status: 'COMPLETED' }];
  const [visao, setVisao] = React.useState<'2D' | '3D'>('3D');
  const [cesta, setCesta] = React.useState<ImovelDoEstoque[]>([]);
  const [aviso, setAviso] = React.useState('');
  const h: EstoqueEm3DState = {
    visaoDoEstoque: visao,
    setVisaoDoEstoque: setVisao as never,
    motivoSem3d: null,
    estoqueEm3d: visao === '3D',
    espelhoDoEstoque: React.useMemo(() => montarEspelhoDoEstoque({ imoveis, negocios }), [imoveis]),
    visibleUnits: imoveis as never,
    cart: cesta as never,
    handleMakeProposal: (u) => setAviso(`proposta: ${u.id}`),
    handleReserve: async (u) => setAviso(`reserva: ${u.id}`),
    handleToggleCart: (u) => setCesta((c) => (c.some((x) => x.id === u.id) ? c.filter((x) => x.id !== u.id) : [...c, u as never])),
  };
  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Estoque do corretor em 3D</h1>
        <p className="text-sm text-gray-500 mt-1.5">Harness: dois blocos tirados do estoque; 3 imóveis sem andar. <span data-testid="aviso">{aviso}</span></p>
      </div>
      <SeletorDaVisaoDoEstoque h={h} />
      {h.estoqueEm3d ? <EstoqueEm3D h={h} /> : <p className="text-sm text-gray-600">(aqui entra o espelho 2D)</p>}
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(q.get('corretor') ? <HarnessDoCorretor /> : <Harness />);
