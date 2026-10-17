import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { clientChargeService } from '../../services/clientChargeService';

interface Props {
    chargeId: string;
    /** Já em mãos (resposta do `emit`) — evita a leitura. */
    imagem?: string | null;
}

/**
 * Imagem do QR Code PIX de uma cobrança Asaas. Antes só existia o botão de
 * copia-e-cola — quem paga pelo celular, na frente do vendedor ou da
 * administradora, precisa APONTAR a câmera. A imagem (PNG base64) é guardada
 * em `client_charges.pix_qr_image` na emissão e lida aqui sob demanda, porque
 * pesa demais para ir na listagem.
 */
export default function QrPixCobranca({ chargeId, imagem }: Props) {
    const [img, setImg] = useState<string | null>(imagem ?? null);
    const [carregando, setCarregando] = useState(!imagem);
    const [expira, setExpira] = useState<string | null>(null);

    useEffect(() => {
        if (imagem) return;
        let ativo = true;
        clientChargeService.qrDaCobranca(chargeId)
            .then(r => { if (ativo) { setImg(r.pix_qr_image); setExpira(r.pix_expiration); } })
            .catch(() => { /* sem imagem: o copia-e-cola ao lado continua servindo */ })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [chargeId, imagem]);

    if (carregando) {
        return (
            <div className="flex items-center justify-center h-40 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
            </div>
        );
    }
    if (!img) {
        // Cobrança emitida antes de a imagem ser guardada (ou PIX que a Asaas
        // não devolveu): diz o porquê em vez de sumir com o espaço.
        return (
            <p className="text-xs text-gray-500 text-center py-2">
                QR Code indisponível para esta cobrança — use o copia-e-cola.
            </p>
        );
    }
    return (
        <div className="flex flex-col items-center gap-1">
            <img
                src={`data:image/png;base64,${img}`}
                alt="QR Code PIX da cobrança"
                className="w-44 h-44 border border-gray-200 rounded-lg"
            />
            {expira && (
                <span className="text-xs text-gray-500">
                    Válido até {new Date(expira.replace(' ', 'T')).toLocaleDateString('pt-BR')}
                </span>
            )}
        </div>
    );
}
