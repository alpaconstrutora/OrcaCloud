/**
 * HARNESS do corte 3D da unidade gerado pela Planta (Espelho de Vendas 3D, F9 — 10/11/2026). O 3D é WebGL e não sobe
 * em jsdom: aqui o diálogo de verdade (`EnviarCorteDaUnidade`, com o `Blueprint3DViewer`) desenha um pavimento de
 * mentira — a 101 (sala + suíte, portas e janelas, sem móvel) e a 102 vizinha com um sofá que tem de sumir. O envio é
 * trocado por um que só guarda o PNG e o mostra na página: nada vai à rede. Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 *   npx vite --port 3148 → http://localhost:3148/docs/spikes/decorado-da-planta/index.html
 *   node docs/spikes/decorado-da-planta/passeio.mjs http://localhost:3148 [pastaDosPrints]
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfirmProvider } from '../../../components/ui/confirm';
import EnviarCorteDaUnidade from '../../../components/blueprint/EnviarCorteDaUnidade';
import { empreendimentoTipologiaDecoradoService } from '../../../services/empreendimentoTipologiaDecoradoService';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../../../utils/blueprintKernel';

function pavimento(): { m: BlueprintModel; u101: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: '1º pavimento', elevationMm: 3000, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number, e: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 2800 });
  m = applyBatch(m, [
    w(0, 0, 14000, 0, 200),
    w(14000, 0, 14000, 9000, 200),
    w(14000, 9000, 0, 9000, 200),
    w(0, 9000, 0, 0, 200),
    w(0, 7000, 14000, 7000, 150),
    w(7000, 0, 7000, 7000, 150),
    // A suíte da 101: parede do x = 4000, de y = 0 a 7000.
    w(4000, 0, 4000, 7000, 120),
  ]).model;
  // A parede que passa no ponto, e o deslocamento do ponto desde o começo dela.
  const naParede = (p: Point, largura: number) => {
    const wall = m.walls.find((x) => {
      const dx = x.b.x - x.a.x;
      const dy = x.b.y - x.a.y;
      const len = Math.hypot(dx, dy);
      const tt = ((p.x - x.a.x) * dx + (p.y - x.a.y) * dy) / (len * len);
      const px = x.a.x + tt * dx;
      const py = x.a.y + tt * dy;
      return tt > 0 && tt < 1 && Math.hypot(px - p.x, py - p.y) < 1;
    })!;
    return { wallId: wall.id, offsetMm: Math.round(Math.hypot(p.x - wall.a.x, p.y - wall.a.y) - largura / 2) };
  };
  const porta = (p: Point): Command => ({ type: 'AddOpening', ...naParede(p, 800), kind: 'door', widthMm: 800, heightMm: 2100, sillMm: 0 });
  const janela = (p: Point, largura: number): Command => ({ type: 'AddOpening', ...naParede(p, largura), kind: 'window', widthMm: largura, heightMm: 1200, sillMm: 1000 });
  m = applyBatch(m, [porta(point(5500, 7000)), porta(point(4000, 4500)), janela(point(5500, 0), 2000), janela(point(2000, 0), 1500), janela(point(10500, 0), 2000)]).model;
  const ambiente = (x: number, y: number) =>
    m.spaces.find((s) => {
      const xs = s.ring.map((q) => q.x);
      const ys = s.ring.map((q) => q.y);
      return x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
    })!.id;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: ambiente(5500, 3000), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: ambiente(2000, 3000), name: 'Suíte 101' },
    { type: 'NameSpace', spaceId: ambiente(10500, 3000), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: ambiente(7000, 8000), name: 'Hall' },
  ]).model;
  const etiqueta = (nome: string) => m.labels.find((l) => l.name === nome)!.id;
  m = applyCommand(m, { type: 'AddUnidade', numero: '101', tipologia: 'Tipo 1', labelIds: [etiqueta('Sala 101'), etiqueta('Suíte 101')] }).model;
  m = applyCommand(m, { type: 'AddUnidade', numero: '102', tipologia: 'Tipo 1', labelIds: [etiqueta('Sala 102')] }).model;
  // O sofá da VIZINHA: tem de sumir no corte da 101.
  m = applyCommand(m, { type: 'AddComponente', levelId: t, tipoId: 'SOFA', at: point(10500, 2000), larguraMm: 2000, profundidadeMm: 900, rotacaoGraus: 0, rotulo: null }).model;
  return { m, u101: m.unidades.find((u) => u.numero === '101')!.id };
}

const { m, u101 } = pavimento();

function Harness() {
  const [aberto, setAberto] = React.useState(true);
  const [png, setPng] = React.useState<{ url: string; largura: number; altura: number; bytes: number } | null>(null);
  // O envio de verdade grava no Storage e no banco; aqui só guarda a imagem e a mostra.
  empreendimentoTipologiaDecoradoService.gravarCorteDaPlanta = async (e) => {
    const url = URL.createObjectURL(e.png);
    const img = new Image();
    await new Promise((ok) => { img.onload = ok; img.src = url; });
    setPng({ url, largura: img.naturalWidth, altura: img.naturalHeight, bytes: e.png.size });
    (window as unknown as { __envio: unknown }).__envio = { tipologia: e.tipologia, assinatura: e.assinatura, estudoId: e.estudoId, tipo: e.png.type };
    return { tipologia: e.tipologia, tipologia_chave: 'tipo 1', papel: 'CORTE', legenda: null, ordem: 0, imagem_url: url, origem: 'PLANTA' };
  };
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900">Corte 3D da unidade 101 (F9)</h1>
      {!aberto && <button type="button" className="h-9 px-3 rounded-[6px] bg-blue-600 text-white text-sm" onClick={() => setAberto(true)}>Abrir de novo</button>}
      {png && (
        <figure data-testid="png-enviado" data-largura={png.largura} data-altura={png.altura} data-bytes={png.bytes}>
          <img src={png.url} alt="PNG enviado" className="w-full rounded-[6px] border border-gray-200" />
          <figcaption className="text-xs text-gray-500 mt-1">PNG enviado: {png.largura} × {png.altura}, {Math.round(png.bytes / 1024)} KB</figcaption>
        </figure>
      )}
      {aberto && (
        <EnviarCorteDaUnidade
          model={m}
          unidadeId={u101}
          empreendimento={{ id: 'e1', nome: 'Garden (harness)', organizationId: 'o1' }}
          estudoId="estudo-harness"
          corteAtual={null}
          situacao={{ tipo: 'NUNCA_ENVIADO' }}
          onFechar={() => setAberto(false)}
          onEnviado={() => undefined}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <ConfirmProvider>
    <Harness />
  </ConfirmProvider>,
);
