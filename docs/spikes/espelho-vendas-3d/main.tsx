/**
 * HARNESS VISUAL do Espelho de Vendas 3D (F2, 09/11/2026): o desenho é WebGL e não sobe em jsdom. Isto monta o
 * `<Espelho3D>` com uma cena de mentira — uma torre com o contorno da Planta (em L) e outra esquemática — e o CSS do
 * app, para olhar e tocar. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 *   npx vite --port 3147 → http://localhost:3147/docs/spikes/espelho-vendas-3d/index.html
 *   ?torres=1 mostra só a torre esquemática; ?sem3d=1 força a tela sem WebGL.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import Espelho3D from '../../../components/espelho3d/Espelho3D';
import type { DadosDaUnidade } from '../../../components/espelho3d/FichaDaUnidade';
import { montarCenaDoEspelho, type TorreDoEspelho } from '../../../utils/espelhoDeVendas3d';

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

createRoot(document.getElementById('raiz')!).render(<Harness />);
