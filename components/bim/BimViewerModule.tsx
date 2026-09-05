import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, FileUp, Loader2, RotateCcw, X } from 'lucide-react';
import type {
  DadosDoElemento,
  ModeloIfcCarregado,
} from '../../services/ifcViewerService';

/**
 * Visualizador de IFC de terceiros — a Fase 0 do BIM LAB.
 *
 * ─── POR QUE MÓDULO PRÓPRIO, E NÃO UMA ABA DA PLANTA INTELIGENTE ────────────
 *
 * O que se abre aqui é o modelo de OUTRA pessoa: o IFC do calculista, do
 * arquiteto, do instalador. Ele não se edita, não vira `BlueprintModel` e não
 * entra em payload canônico nenhum. Pendurá-lo no editor faria o estado dele
 * carregar três exceções dentro de um componente que já tem 4.000 linhas.
 *
 * ─── THREE PURO, E NÃO REACT-THREE-FIBER ────────────────────────────────────
 *
 * Os outros dois visualizadores do app usam R3F e ambos carregam `@ts-nocheck`
 * no topo: os elementos intrínsecos (`<mesh>`, `<group>`) só existem via uma
 * augmentation de JSX que foi tirada do programa TS por quebrar o `className` no
 * resto do codebase. Aqui a cena é imperativa, e o arquivo inteiro é verificado
 * pelo compilador — que é exatamente o que se quer num módulo que manipula
 * buffers de geometria vindos de arquivo alheio.
 *
 * ─── O MODELO NÃO FICA GUARDADO ─────────────────────────────────────────────
 *
 * Fase 1 de propósito: abre do disco, vê, fecha. Persistir traz bucket, RLS,
 * tabela e a decisão de schema do Objeto Digital — outra fase, e melhor decidida
 * depois de ter olhado modelos reais aqui. A tela DIZ isso, em vez de deixar o
 * usuário descobrir ao recarregar.
 */
export default function BimViewerModule() {
  const caixaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{
    elementos: number;
    triangulos: number;
    ms: number;
    schema: string;
  } | null>(null);
  const [selecionado, setSelecionado] = useState<DadosDoElemento | null>(null);
  const [arrastando, setArrastando] = useState(false);

  /**
   * Tudo o que é do Three vive em `ref`, não em estado.
   *
   * Cena, câmera e renderer não são dados de tela: mudá-los não deve redesenhar
   * o React, e guardá-los em `useState` faria cada quadro do laço de animação
   * disputar com o reconciliador.
   */
  const cenaRef = useRef<{
    limpar: () => void;
    carregar: (bytes: ArrayBuffer) => Promise<ModeloIfcCarregado>;
    enquadrar: () => void;
  } | null>(null);
  const modeloRef = useRef<ModeloIfcCarregado | null>(null);

  // ── A cena, montada uma vez ───────────────────────────────────────────────
  useEffect(() => {
    const host = caixaRef.current;
    if (!host) return;
    let vivo = true;
    let desmontar: (() => void) | null = null;

    (async () => {
      // Dinâmico: `three` e o `OrbitControls` só chegam quando a tela abre.
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (!vivo) return;

      const cena = new THREE.Scene();
      cena.background = new THREE.Color('#f1f5f9');

      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 5000);
      camera.position.set(25, 20, 25);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      host.appendChild(renderer.domElement);

      const controles = new OrbitControls(camera, renderer.domElement);
      controles.enableDamping = true;

      cena.add(new THREE.AmbientLight(0xffffff, 0.75));
      const sol = new THREE.DirectionalLight(0xffffff, 1.1);
      sol.position.set(1, 2, 1);
      cena.add(sol);
      const contraluz = new THREE.DirectionalLight(0xffffff, 0.35);
      contraluz.position.set(-1, 0.5, -1);
      cena.add(contraluz);
      cena.add(new THREE.GridHelper(200, 40, 0xcbd5e1, 0xe2e8f0));

      const raycaster = new THREE.Raycaster();
      const ponteiro = new THREE.Vector2();
      let destacado: { mesh: import('three').Mesh; corAntes: number } | null = null;

      const ajustar = () => {
        const { clientWidth: w, clientHeight: h } = host;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      ajustar();
      const observador = new ResizeObserver(ajustar);
      observador.observe(host);

      let parado = false;
      const laco = () => {
        if (parado) return;
        controles.update();
        renderer.render(cena, camera);
        requestAnimationFrame(laco);
      };
      laco();

      const enquadrar = () => {
        const m = modeloRef.current;
        if (!m) return;
        const centro = m.caixa.getCenter(new THREE.Vector3());
        const tamanho = m.caixa.getSize(new THREE.Vector3()).length() || 10;
        controles.target.copy(centro);
        camera.position.copy(centro).add(new THREE.Vector3(1, 0.8, 1).multiplyScalar(tamanho * 0.7));
        camera.near = tamanho / 500;
        camera.far = tamanho * 20;
        camera.updateProjectionMatrix();
        controles.update();
      };

      // ── Clique: qual elemento ──────────────────────────────────────────────
      //
      // Só conta como seleção o clique que NÃO arrastou: sem isto, toda órbita
      // terminaria selecionando o que estivesse sob o cursor no fim do gesto.
      let apertouEm: { x: number; y: number } | null = null;
      const aoApertar = (e: PointerEvent) => {
        apertouEm = { x: e.clientX, y: e.clientY };
      };
      const aoSoltar = async (e: PointerEvent) => {
        const de = apertouEm;
        apertouEm = null;
        if (!de || Math.hypot(e.clientX - de.x, e.clientY - de.y) > 4) return;
        const m = modeloRef.current;
        if (!m) return;

        const r = renderer.domElement.getBoundingClientRect();
        ponteiro.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ponteiro.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ponteiro, camera);
        const atingidos = raycaster.intersectObjects(m.grupo.children, false);

        if (destacado) {
          (destacado.mesh.material as import('three').MeshLambertMaterial).color.setHex(destacado.corAntes);
          destacado = null;
        }
        const alvo = atingidos[0]?.object as import('three').Mesh | undefined;
        if (!alvo) {
          setSelecionado(null);
          return;
        }
        const material = alvo.material as import('three').MeshLambertMaterial;
        destacado = { mesh: alvo, corAntes: material.color.getHex() };
        material.color.setHex(0x2563eb);

        const { lerElemento } = await import('../../services/ifcViewerService');
        try {
          setSelecionado(await lerElemento(m.modeloId, alvo.userData.expressID as number));
        } catch {
          setSelecionado(null);
        }
      };
      renderer.domElement.addEventListener('pointerdown', aoApertar);
      renderer.domElement.addEventListener('pointerup', (e) => void aoSoltar(e));

      cenaRef.current = {
        limpar: () => {
          const m = modeloRef.current;
          if (!m) return;
          cena.remove(m.grupo);
          m.liberar();
          modeloRef.current = null;
          destacado = null;
        },
        carregar: async (bytes) => {
          const { carregarIfc } = await import('../../services/ifcViewerService');
          const m = await carregarIfc(bytes, THREE);
          cena.add(m.grupo);
          modeloRef.current = m;
          enquadrar();
          return m;
        },
        enquadrar,
      };

      desmontar = () => {
        parado = true;
        observador.disconnect();
        renderer.domElement.removeEventListener('pointerdown', aoApertar);
        controles.dispose();
        modeloRef.current?.liberar();
        modeloRef.current = null;
        renderer.dispose();
        host.removeChild(renderer.domElement);
        cenaRef.current = null;
      };
    })().catch((e) => {
      if (vivo) setErro(e instanceof Error ? e.message : String(e));
    });

    return () => {
      vivo = false;
      desmontar?.();
    };
  }, []);

  const abrir = useCallback(async (arquivo: File) => {
    if (!/\.ifc$/i.test(arquivo.name)) {
      setErro(`"${arquivo.name}" não é um arquivo IFC.`);
      return;
    }
    setCarregando(true);
    setErro(null);
    setSelecionado(null);
    try {
      // Espera a cena existir: o efeito de montagem é assíncrono (carrega o
      // `three` sob demanda), e soltar um arquivo no primeiro segundo chegaria
      // antes dela.
      for (let i = 0; i < 100 && !cenaRef.current; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const cena = cenaRef.current;
      if (!cena) throw new Error('a cena 3D não iniciou');

      cena.limpar();
      const m = await cena.carregar(await arquivo.arrayBuffer());
      setNome(arquivo.name);
      setResumo({
        elementos: m.elementos.length,
        triangulos: m.triangulos,
        ms: Math.round(m.msAteNavegavel),
        schema: m.schema,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setNome(null);
      setResumo(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Boxes className="h-4 w-4 text-slate-400" aria-hidden />
        <h1 className="text-sm font-semibold text-slate-800">Modelo 3D (IFC)</h1>

        <input
          ref={inputRef}
          type="file"
          accept=".ifc"
          className="hidden"
          aria-label="Arquivo IFC"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void abrir(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95"
        >
          <FileUp className="h-3.5 w-3.5" />
          Abrir IFC…
        </button>

        {resumo && (
          <button
            type="button"
            onClick={() => cenaRef.current?.enquadrar()}
            title="Volta a câmera para enquadrar o modelo inteiro"
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-700 transition-all hover:border-blue-300 hover:text-blue-600 active:scale-95"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Enquadrar
          </button>
        )}

        <span className="ml-auto text-[11px] text-slate-400">
          Referência para consulta — o modelo não é editado nem guardado.
        </span>
      </div>

      {erro && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{erro}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void abrir(f);
          }}
        >
          <div ref={caixaRef} className="h-full w-full" />

          {(!resumo || arrastando) && !carregando && (
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
                arrastando ? 'bg-blue-50/80' : ''
              }`}
            >
              <div className="rounded-lg border-2 border-dashed border-slate-300 bg-white/90 px-6 py-5 text-center">
                <Boxes className="mx-auto h-6 w-6 text-slate-300" aria-hidden />
                <p className="mt-2 text-sm font-medium text-slate-700">
                  Arraste um arquivo .ifc aqui
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  O modelo do calculista, do arquiteto ou do instalador.
                </p>
              </div>
            </div>
          )}

          {carregando && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <p className="inline-flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Abrindo o modelo…
              </p>
            </div>
          )}
        </div>

        {/* Painel lateral: o que o arquivo é, e o que o elemento clicado é. */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          {resumo ? (
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="truncate text-xs font-semibold text-slate-700" title={nome ?? ''}>
                {nome}
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">
                {resumo.schema} · {resumo.elementos.toLocaleString('pt-BR')} elementos ·{' '}
                {resumo.triangulos.toLocaleString('pt-BR')} triângulos
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Aberto em {resumo.ms} ms. Clique numa peça para ver as propriedades dela.
              </p>
            </div>
          ) : (
            <p className="px-4 py-3 text-[11px] text-slate-500">
              Nenhum modelo aberto.
            </p>
          )}

          {selecionado && (
            <div className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-slate-800">
                    {selecionado.nome !== '—' ? selecionado.nome : selecionado.tipo}
                  </h3>
                  <p className="text-[11px] text-slate-500">{selecionado.tipo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelecionado(null)}
                  aria-label="Fechar as propriedades do elemento"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* O GlobalId é o que liga este elemento a qualquer outra coisa —
                  é por ele que uma revisão do calculista se compara com a
                  anterior, e é o `source_ref` do Objeto Digital adiante. */}
              <p className="mt-1 font-mono text-[10px] text-slate-400" title={selecionado.globalId}>
                {selecionado.globalId}
              </p>

              {selecionado.conjuntos.length === 0 ? (
                <p className="mt-3 text-[11px] text-slate-500">
                  Este elemento não tem conjuntos de propriedades no arquivo.
                </p>
              ) : (
                selecionado.conjuntos.map((c) => (
                  <div key={c.nome} className="mt-3">
                    <h4 className="text-[11px] font-semibold text-slate-600">
                      {c.nome}
                      {c.quantidades && (
                        <span className="ml-1 font-normal text-slate-400">· quantidades</span>
                      )}
                    </h4>
                    <dl className="mt-1 space-y-0.5">
                      {c.propriedades.map((p) => (
                        <div key={p.nome} className="flex items-baseline justify-between gap-2">
                          <dt className="truncate text-[11px] text-slate-500" title={p.nome}>
                            {p.nome}
                          </dt>
                          <dd className="shrink-0 text-[11px] font-medium text-slate-800">
                            {p.valor}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
