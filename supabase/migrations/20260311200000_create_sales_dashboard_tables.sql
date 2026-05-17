-- Migration to create and expand tables for Sales Dashboard KPIs (Phase 2)
-- 1. Expand commercial_properties
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS typology TEXT;
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS private_area NUMERIC(10, 2);
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS initial_price NUMERIC(12, 2);
ALTER TABLE commercial_properties ADD COLUMN IF NOT EXISTS table_price NUMERIC(12, 2);

-- 2. Expand commercial_deals
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS down_payment NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS financing_value NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS own_resources NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS bank_id TEXT;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS credit_status TEXT;
ALTER TABLE commercial_deals ADD COLUMN IF NOT EXISTS origin_channel TEXT;

-- 3. Create commercial_leads
CREATE TABLE IF NOT EXISTS commercial_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    city TEXT,
    origin_channel TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_leads_org ON commercial_leads(organization_id);

-- 4. Create commercial_interactions
CREATE TABLE IF NOT EXISTS commercial_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    lead_id UUID REFERENCES commercial_leads(id),
    type TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    broker_id TEXT,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_interactions_lead ON commercial_interactions(lead_id);

-- 5. Create commercial_proposals
CREATE TABLE IF NOT EXISTS commercial_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    property_id UUID REFERENCES commercial_properties(id),
    lead_id UUID REFERENCES commercial_leads(id),
    broker_id TEXT,
    offered_value NUMERIC(12, 2),
    discount NUMERIC(12, 2),
    payment_method TEXT,
    status TEXT,
    date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_prop ON commercial_proposals(property_id);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_lead ON commercial_proposals(lead_id);

-- 6. Create commercial_campaigns
CREATE TABLE IF NOT EXISTS commercial_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    channel TEXT NOT NULL,
    campaign TEXT NOT NULL,
    investment NUMERIC(12, 2),
    period_start DATE,
    period_end DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_campaigns_org ON commercial_campaigns(organization_id);

-- 7. Create commercial_post_sales
CREATE TABLE IF NOT EXISTS commercial_post_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    deal_id UUID REFERENCES commercial_deals(id),
    type TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    financial_impact NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commercial_post_sales_deal ON commercial_post_sales(deal_id);

-- RLS Policies
ALTER TABLE commercial_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_post_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable ALL for organization members" ON commercial_leads
    FOR ALL USING (true);

CREATE POLICY "Enable ALL for organization members" ON commercial_interactions
    FOR ALL USING (true);

CREATE POLICY "Enable ALL for organization members" ON commercial_proposals
    FOR ALL USING (true);

CREATE POLICY "Enable ALL for organization members" ON commercial_campaigns
    FOR ALL USING (true);

CREATE POLICY "Enable ALL for organization members" ON commercial_post_sales
    FOR ALL USING (true);
