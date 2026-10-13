// components/AssetQrLabelModal.tsx — etiqueta patrimonial com QR Code DE VERDADE
//
// Até 13/10/2026 o "QR" era um desenho SVG fixo que não codificava nada. Agora
// codifica o link que abre a ficha do bem no app (utils/assetQrLink.ts) e é
// gerado no navegador (pacote `qrcode`): sem serviço externo, sem mandar o link
// para terceiros, e funciona na impressão mesmo sem internet. A imagem é PNG
// (data URL) num <img> e a janela de impressão é montada com elementos do DOM —
// nenhum HTML cru entra na página (scripts/check-xss-sinks.sh).
import React from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/modal';
import { linkDoAtivo } from '../utils/assetQrLink';
import type { OpuraAsset } from '../types/assets';

interface Props {
    asset: OpuraAsset;
    organizationName?: string;
    onClose: () => void;
}

/** Abre uma janela só com a etiqueta (80 × 50 mm) e manda imprimir. */
function imprimirEtiqueta(qr: string, asset: OpuraAsset, organizationName?: string) {
    const janela = window.open('', '_blank', 'width=480,height=420');
    if (!janela) return false;
    const doc = janela.document;
    doc.title = `Etiqueta ${asset.code}`;
    const estilo = doc.createElement('style');
    estilo.textContent = `
        @page { size: 80mm 50mm; margin: 0; }
        body { margin: 0; font-family: system-ui, sans-serif; }
        .etiqueta { width: 80mm; height: 50mm; box-sizing: border-box; padding: 3mm; display: flex; gap: 3mm; align-items: center; }
        .etiqueta img { width: 40mm; height: 40mm; }
        .texto { display: flex; flex-direction: column; gap: 1.5mm; min-width: 0; }
        .rotulo { font-size: 7pt; color: #555; text-transform: uppercase; letter-spacing: .08em; }
        .codigo { font-size: 13pt; font-weight: 700; font-family: ui-monospace, monospace; }
        .nome { font-size: 8pt; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .org { font-size: 6.5pt; color: #555; }`;
    doc.head.appendChild(estilo);

    const etiqueta = doc.createElement('div');
    etiqueta.className = 'etiqueta';
    const img = doc.createElement('img');
    img.src = qr;
    img.alt = `QR Code do ativo ${asset.code}`;
    const texto = doc.createElement('div');
    texto.className = 'texto';
    const linha = (classe: string, valor: string) => {
        const el = doc.createElement('div');
        el.className = classe;
        el.textContent = valor;
        texto.appendChild(el);
    };
    linha('rotulo', 'Patrimônio');
    linha('codigo', asset.code);
    linha('nome', asset.name);
    if (organizationName) linha('org', organizationName);
    etiqueta.append(img, texto);
    doc.body.appendChild(etiqueta);

    // Espera a imagem (data URL decodifica quase na hora) antes de imprimir.
    const disparar = () => { janela.focus(); janela.print(); };
    if (img.complete) setTimeout(disparar, 50);
    else img.onload = disparar;
    return true;
}

export const AssetQrLabelModal: React.FC<Props> = ({ asset, organizationName, onClose }) => {
    const link = React.useMemo(() => linkDoAtivo(window.location.href, asset.id), [asset.id]);
    const [qr, setQr] = React.useState<string | null>(null);
    const [erro, setErro] = React.useState('');

    React.useEffect(() => {
        let vivo = true;
        setQr(null);
        setErro('');
        // Correção M (~15%): aguenta etiqueta riscada sem inflar o desenho.
        QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 480 })
            .then(url => { if (vivo) setQr(url); })
            .catch((e: unknown) => { if (vivo) setErro(`Não foi possível gerar o QR Code: ${(e as Error).message}`); });
        return () => { vivo = false; };
    }, [link]);

    const imprimir = () => {
        if (!qr) return;
        if (!imprimirEtiqueta(qr, asset, organizationName)) {
            setErro('O navegador bloqueou a janela de impressão — libere pop-ups para este site e tente de novo.');
        }
    };

    return (
        <Modal open onClose={onClose} size="sm">
            <ModalHeader title="Etiqueta patrimonial" description="Ao escanear, abre a ficha deste bem no Òpura (pede login)." onClose={onClose} />
            <ModalBody className="space-y-4">
                <div className="flex items-center gap-4 border border-dashed border-gray-300 rounded-[10px] p-4">
                    <div className="w-36 h-36 shrink-0 flex items-center justify-center bg-white">
                        {qr
                            ? <img src={qr} alt={`QR Code do ativo ${asset.code}`} className="w-36 h-36" data-testid="qr-ativo" />
                            : !erro && <Loader2 className="w-6 h-6 animate-spin text-gray-400" />}
                    </div>
                    <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold text-slate-500">Patrimônio</p>
                        <p className="text-lg font-semibold text-gray-900 tracking-wide whitespace-nowrap">{asset.code}</p>
                        <p className="text-sm text-gray-700 line-clamp-3" title={asset.name}>{asset.name}</p>
                        {organizationName && <p className="text-xs text-gray-400 truncate" title={organizationName}>{organizationName}</p>}
                    </div>
                </div>
                <p className="text-xs text-gray-400 break-all" title={link}>{link}</p>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
            </ModalBody>
            <ModalFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-[6px] transition-all">
                    Fechar
                </button>
                <button
                    type="button"
                    onClick={imprimir}
                    disabled={!qr}
                    title={!qr ? (erro || 'Gerando o QR Code…') : 'Abre a etiqueta 80 × 50 mm para imprimir'}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Printer className="w-[15px] h-[15px]" />
                    Imprimir etiqueta
                </button>
            </ModalFooter>
        </Modal>
    );
};

export default AssetQrLabelModal;
