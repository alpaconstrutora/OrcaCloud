/**
 * Spike da F10 (11/10/2026): os MÓVEIS glTF no `Blueprint3DViewer` real, sem banco.
 *
 * Cada peça do catálogo numa fileira, com rotação 0 e uma PAREDE ATRÁS da fileira (no +y do
 * modelo — o "encosto" da ficha: a cabeceira da cama, o encosto do sofá). Se o giro do modelo
 * estiver certo, o fundo de cada móvel encosta na parede. O TANQUE não tem modelo: tem de sair
 * CAIXA (o fallback). `?tipo=SOFA` mostra uma peça só; `?giro=90` gira todas.
 *
 * Abrir em: /docs/spikes/moveis-3d/index.html
 */
import '../blueprint-3d/harness.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import { CATALOGO_DE_COMPONENTES, applyBatch, applyCommand, emptyModel, point, type Command, type TipoDeComponente } from '../../../utils/blueprintKernel';
import { MODELOS_3D } from '../../../utils/blueprintModelos3d';

const params = new URLSearchParams(location.search);
const so = params.get('tipo') as TipoDeComponente | null;
const giro = Number(params.get('giro') ?? 0);
// `?giroModelo=0` sobrescreve o giro de TODOS os modelos — para comparar orientação por imagem.
if (params.get('giroModelo') !== null) for (const m of Object.values(MODELOS_3D)) if (m) m.giroGraus = Number(params.get('giroModelo')) as 0;
const tipos = (so ? [so] : [...(Object.keys(MODELOS_3D) as TipoDeComponente[]), 'TANQUE' as TipoDeComponente]);

let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const t = m.levels[0].id;
const POR_FILA = 5;
const PASSO = 2800;
const cmds: Command[] = [];
tipos.forEach((tipoId, i) => {
  const col = i % POR_FILA;
  const fila = Math.floor(i / POR_FILA);
  const f = CATALOGO_DE_COMPONENTES[tipoId];
  const x = col * PASSO;
  const y = -fila * PASSO * 1.2;
  cmds.push({ type: 'AddComponente', levelId: t, tipoId, at: point(x, y), rotacaoGraus: giro } as Command);
  if (col === 0) {
    // A parede ATRÁS da fileira, encostada no fundo (y + profundidade/2) da peça mais funda.
    const fim = so ? f.larguraMm / 2 + 300 : POR_FILA * PASSO - 1300;
    const ini = so ? -f.larguraMm / 2 - 300 : -1500;
    const atras = so ? f.profundidadeMm / 2 + 75 : 1100;
    cmds.push({ type: 'AddWall', levelId: t, a: point(ini, y + atras), b: point(fim, y + atras), thicknessMm: 150, heightMm: 1200 });
  }
});
m = applyBatch(m, cmds).model;

createRoot(document.getElementById('raiz')!).render(
  <div style={{ position: 'absolute', inset: 0, width: '100vw', height: '100vh' }}>
    <Blueprint3DTab model={m} levelIds={[t]} mostrarArestas nomeDoEstudo="spike moveis" />
  </div>,
);
