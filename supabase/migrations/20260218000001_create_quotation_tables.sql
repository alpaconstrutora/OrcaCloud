-- Create quotation_requests table
CREATE TABLE IF NOT EXISTS quotation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT NOT NULL UNIQUE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    deadline DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Aberta', 'Em AnÃ¡lise', 'ConcluÃ­da', 'Cancelada')),
    items JSONB NOT NULL DEFAULT '[]',
    invited_supplier_ids UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create quotation_responses table
CREATE TABLE IF NOT EXISTS quotation_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID REFERENCES quotation_requests(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    items JSONB NOT NULL DEFAULT '[]', -- Array of ResponseItem
    delivery_date DATE,
    payment_method TEXT,
    payment_term_type TEXT CHECK (payment_term_type IN ('Vista', 'Parcelado')),
    payment_days INTEGER,
    payment_installments INTEGER,
    status TEXT NOT NULL CHECK (status IN ('Pendente', 'Enviada', 'Selecionada', 'Recusada')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS quotation_requests_project_id_idx ON quotation_requests(project_id);
CREATE INDEX IF NOT EXISTS quotation_responses_request_id_idx ON quotation_responses(request_id);
CREATE INDEX IF NOT EXISTS quotation_responses_supplier_id_idx ON quotation_responses(supplier_id);

-- Enable RLS
ALTER TABLE quotation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_responses ENABLE ROW LEVEL SECURITY;

-- Standard policies (allowing all for now as per project's current simplified state, or matching projects)
CREATE POLICY "Allow all access to quotation_requests" ON quotation_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to quotation_responses" ON quotation_responses FOR ALL USING (true) WITH CHECK (true);
