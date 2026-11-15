import React from 'react';
import QRCode from 'qrcode';
import { ArrowRight, Check, CheckCheck, FileText } from 'lucide-react';
import MoneyCentsInput from '../ui/MoneyCentsInput';

/**
 * Página de apresentação do ÒPURA Pro público (`/pro` sem sessão) — 14/11/2026,
 * docs/planos/2026-11-14-opura-pro-publico.md (P4). Estrutura escolhida pelo usuário:
 * "Monte o seu orçamento agora" — a primeira tela já é o produto.
 *
 * Tudo aqui é EXEMPLO e fica no aparelho: nada é enviado, nenhuma conta é criada.
 * Sem números, clientes ou depoimentos inventados (PRODUCT.md › Evidence on Hand).
 */

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
// "Limpeza de split 12.000 BTUs" → "limpeza de split 12.000 BTUs": só a inicial de palavra comum
// desce no meio da frase; sigla e nome próprio em caixa alta ficam como foram escritos.
const noMeioDaFrase = (t: string) => (/^[A-ZÀ-Ú][a-zà-ú]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const CAMPO = 'w-full h-11 scroll-mt-36 bg-white border border-slate-300 rounded-[6px] px-3 text-base text-slate-900 placeholder:text-slate-400 caret-blue-600 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50';

// QR de demonstração que NÃO é pagável: aponta para esta página. Um Pix de verdade aqui levaria
// quem escaneasse a uma tela real de pagamento (revisão final de 14/11/2026).
const ENDERECO_QR_EXEMPLO = 'https://orcacloud.vercel.app/pro';

export const ProApresentacao: React.FC<{ onCriarConta: () => void; onEntrar: () => void }> = ({ onCriarConta, onEntrar }) => {
  const [servico, setServico] = React.useState('Limpeza de split 12.000 BTUs');
  const [cliente, setCliente] = React.useState('Dona Marta');
  const [valor, setValor] = React.useState('180.00');
  const [entregue, setEntregue] = React.useState(true);
  const [hora, setHora] = React.useState(horaAgora);
  const [qr, setQr] = React.useState('');
  // Com o teclado do celular aberto, o balão abaixo dos campos some atrás dele: enquanto um
  // campo estiver em foco, a prévia da mensagem fica presa no topo e a barra de ação sai.
  const [editando, setEditando] = React.useState(false);
  const idServico = React.useId();
  const idCliente = React.useId();
  const idValor = React.useId();

  // A cada tecla o balão se recompõe; o ✓✓ volta depois de uma pausa — como uma mensagem que acabou de sair.
  React.useEffect(() => {
    setEntregue(false);
    const t = setTimeout(() => { setEntregue(true); setHora(horaAgora()); }, 700);
    return () => clearTimeout(t);
  }, [servico, cliente, valor]);

  React.useEffect(() => {
    QRCode.toDataURL(ENDERECO_QR_EXEMPLO, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(''));
  }, []);

  const nomeCliente = cliente.trim() || 'cliente';
  const textoServico = servico.trim() || 'o serviço';
  const valorNum = Number(valor) || 0;

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-xl px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold">ÒPURA Pro</span>
          <button type="button" onClick={onEntrar} className={`min-h-11 px-2 -mr-2 rounded-[6px] text-base font-medium text-blue-700 hover:text-blue-800 ${FOCO}`}>
            Entrar
          </button>
        </div>
      </header>

      {editando && (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-10 bg-[#EFE7DE] border-b border-slate-200 shadow-[0_2px_6px_rgba(15,23,42,0.08)]" aria-hidden>
          <div className="mx-auto max-w-xl px-4 py-2">
            <div className="ml-8 bg-[#DCF8C6] rounded-[8px] rounded-tr-none px-2.5 py-1.5 text-sm leading-snug text-slate-900">
              Olá, {nomeCliente}! Segue o orçamento de {noMeioDaFrase(textoServico)}: <b className="tabular-nums">{brl(valorNum)}</b>.
              <span className="ml-1 inline-flex align-middle text-slate-500">{entregue ? <CheckCheck className="w-4 h-4" /> : <Check className="w-4 h-4" />}</span>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {/* Primeira tela: a demonstração É a página */}
        <section aria-labelledby="titulo-pro" className="pt-6">
          <h1 id="titulo-pro" className="text-[30px] md:text-[44px] leading-[1.12] font-bold tracking-[-0.02em] [text-wrap:balance]">
            Seu orçamento no WhatsApp do cliente em 1 minuto.
          </h1>
          <p className="mt-2.5 text-base text-slate-700">Experimente aqui: escreva o serviço e o valor.</p>

          <div
            className="mt-5 bg-white border border-slate-200 rounded-[10px] p-4 space-y-3"
            onFocus={() => setEditando(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditando(false); }}
          >
            <div className="space-y-1.5">
              <label htmlFor={idServico} className="block text-xs font-semibold text-slate-500">Serviço</label>
              <input id={idServico} value={servico} onChange={(e) => setServico(e.target.value)} placeholder="Ex.: Instalação de tomada" className={CAMPO} />
            </div>
            <div className="grid grid-cols-[1fr_8.5rem] gap-3">
              <div className="space-y-1.5 min-w-0">
                <label htmlFor={idCliente} className="block text-xs font-semibold text-slate-500">Cliente</label>
                <input id={idCliente} value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente" className={CAMPO} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={idValor} className="block text-xs font-semibold text-slate-500">Valor (R$)</label>
                <MoneyCentsInput id={idValor} value={valor} onChange={setValor} inputMode="numeric" className={`${CAMPO} tabular-nums`} />
              </div>
            </div>
          </div>

          {/* O objeto demonstrado: a conversa do WhatsApp */}
          <figure className="mt-4 rounded-[10px] overflow-hidden border border-slate-200" aria-label={`Prévia da mensagem para ${nomeCliente}`}>
            <div className="bg-[#008069] text-white px-3 h-12 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold" aria-hidden>
                {nomeCliente.charAt(0).toUpperCase()}
              </span>
              <span className="text-base font-medium truncate">{nomeCliente}</span>
            </div>
            <div className="bg-[#EFE7DE] px-3 py-4" aria-live="polite">
              <div className="ml-10 bg-[#DCF8C6] rounded-[8px] rounded-tr-none p-2 shadow-[0_1px_1px_rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-2.5 bg-white rounded-[6px] p-2">
                  <span className="w-9 h-11 rounded-[4px] bg-red-600 text-white flex items-center justify-center shrink-0" aria-hidden>
                    <FileText className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">Orçamento — Seu nome</span>
                    <span className="block text-xs text-slate-600 truncate tabular-nums">{brl(valorNum)} · garantia 90 dias</span>
                  </span>
                </div>
                <p className="mt-1.5 px-0.5 text-base leading-snug text-slate-900">
                  Olá, {nomeCliente}! Segue o orçamento de {noMeioDaFrase(textoServico)}: <b className="tabular-nums">{brl(valorNum)}</b>. Qualquer dúvida, me chama.
                </p>
                <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-700 tabular-nums">
                  {hora}
                  {entregue
                    ? <CheckCheck className="w-4 h-4 text-slate-500" aria-label="entregue" />
                    : <Check className="w-4 h-4 text-slate-500" aria-label="enviando" />}
                </p>
              </div>
            </div>
            <figcaption className="bg-white px-3 py-2 text-xs text-slate-600 border-t border-slate-200">
              Exemplo — nada é enviado daqui. Com a conta, o PDF sai com o seu nome e vai pelo seu WhatsApp.
            </figcaption>
          </figure>
        </section>

        {/* O resto do dia, mostrado com pedaços do próprio Pro */}
        <section aria-labelledby="titulo-dia" className="mt-14">
          <h2 id="titulo-dia" className="text-2xl font-bold tracking-[-0.01em]">Depois do orçamento, o resto do dia.</h2>

          <div className="mt-6 space-y-10">
            <div className="grid grid-cols-[1fr_7.5rem] gap-4 items-center">
              <div>
                <h3 className="text-base font-semibold">Pix na hora</h3>
                <p className="mt-1 text-base text-slate-700">Terminou o serviço, o cliente aponta o celular para o QR e paga. Você marca "Recebi".</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-[10px] p-2">
                {qr
                  ? <img src={qr} alt="QR Code de exemplo (não é um Pix)" className="w-full aspect-square" />
                  : <div className="w-full aspect-square bg-slate-100 rounded-[6px]" aria-hidden />}
                <p className="mt-1 text-center text-xs text-slate-600">QR de exemplo</p>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_7.5rem] gap-4 items-center">
              <div>
                <h3 className="text-base font-semibold">Assinatura do cliente</h3>
                <p className="mt-1 text-base text-slate-700">O cliente assina com o dedo na tela. Vai no comprovante em PDF, com fotos de antes e depois.</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-[10px] p-2">
                <svg viewBox="0 0 120 60" className="w-full h-auto" aria-label="Assinatura de exemplo" role="img">
                  <path d="M6 42 C 14 18, 22 18, 24 40 S 34 52, 40 30 S 52 12, 56 38 S 66 50, 74 28 C 80 16, 88 22, 86 34 S 98 46, 112 22" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
                </svg>
                <p className="text-center text-xs text-slate-600 truncate">{nomeCliente}</p>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_7.5rem] gap-4 items-center">
              <div>
                <h3 className="text-base font-semibold">Quem ainda te deve</h3>
                <p className="mt-1 text-base text-slate-700">Uma lista com quem não pagou, há quantos dias, e um toque para cobrar no WhatsApp.</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-[10px] p-2.5 space-y-2 text-xs">
                <div>
                  <p className="font-semibold truncate">{nomeCliente}</p>
                  <p className="text-amber-700">há 3 dias</p>
                  <p className="font-semibold tabular-nums">{brl(valorNum)}</p>
                </div>
                <div className="border-t border-slate-100 pt-2">
                  <p className="font-semibold">Seu Paulo</p>
                  <p className="text-amber-700">há 8 dias</p>
                  <p className="font-semibold tabular-nums">{brl(480)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="titulo-gratis" className="mt-14 bg-white border border-slate-200 rounded-[10px] p-5">
          <h2 id="titulo-gratis" className="text-2xl font-bold">Grátis.</h2>
          <p className="mt-2 text-base text-slate-700">
            Sem cartão e sem senha: você entra com o Google ou com um código que chega no seu e-mail.
            Funciona no navegador do celular e dá para instalar na tela de início, como um aplicativo.
          </p>
          <button type="button" onClick={onCriarConta} className={`mt-4 inline-flex items-center gap-1.5 min-h-11 rounded-[6px] text-base font-semibold text-blue-700 hover:text-blue-800 ${FOCO}`}>
            Criar minha conta
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </section>

        <footer className="mt-12 text-sm text-slate-600">
          <p>Feito por uma construtora, para quem faz o serviço na ponta.</p>
          <p className="mt-1">ÒPURA Pro</p>
        </footer>
      </main>

      {/* A ação fica sempre à mão do polegar */}
      <div className={`fixed inset-x-0 bottom-0 z-20 bg-slate-50 border-t border-slate-200 pb-[env(safe-area-inset-bottom)] ${editando ? 'hidden' : ''}`}>
        <div className="mx-auto max-w-xl px-4 py-3">
          <button
            type="button"
            onClick={onCriarConta}
            className={`w-full min-h-[52px] flex items-center justify-center text-center bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-semibold text-base transition-colors active:scale-[0.99] ${FOCO}`}
          >
            Mandar de verdade — conta grátis
          </button>
          <p className="mt-1.5 text-center text-sm text-slate-700">Grátis. Sem cartão, sem senha.</p>
        </div>
      </div>
    </div>
  );
};

export default ProApresentacao;
