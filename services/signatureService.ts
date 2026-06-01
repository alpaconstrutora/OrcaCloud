import { supabase } from '../lib/supabase';

export interface SignatureSigner {
    name: string;
    email: string;
    phone?: string;
}

export interface SignatureResult {
    success: boolean;
    token?: string;
    sign_url?: string;
    signers?: { name: string; email: string; sign_url: string; status: string }[];
    error?: string;
}

export interface SignatureStatus {
    status: 'pending' | 'finished' | 'refused';
    signers: { name: string; email: string; status: string }[];
    signed_file?: string;
}

const callEdge = async (body: object): Promise<Response> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Usuário não autenticado');

    const url = `${(supabase as any).supabaseUrl}/functions/v1/sign-contract`;
    return fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'apikey': (supabase as any).supabaseKey,
        },
        body: JSON.stringify(body),
    });
};

export const signatureService = {
    async sendForSignature(params: {
        dealId: string;
        organizationId: string;
        documentBase64: string;
        documentName: string;
        signers: SignatureSigner[];
    }): Promise<SignatureResult> {
        const resp = await callEdge({ action: 'send', ...params });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }));
            return { success: false, error: err.error };
        }
        return resp.json();
    },

    async getStatus(signatureToken: string, dealId: string, organizationId: string): Promise<SignatureStatus> {
        const resp = await callEdge({ action: 'status', signatureToken, dealId, organizationId });
        if (!resp.ok) throw new Error('Falha ao consultar status da assinatura');
        return resp.json();
    },

    async pdfToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
};
