CREATE TABLE IF NOT EXISTS cub_parametric_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL,
    social_charges TEXT NOT NULL,
    reference_date TEXT NOT NULL,
    nature TEXT NOT NULL,
    r1_b NUMERIC(15,2),
    pp_4_b NUMERIC(15,2),
    r8_b NUMERIC(15,2),
    pis NUMERIC(15,2),
    r1_n NUMERIC(15,2),
    pp_4_n NUMERIC(15,2),
    r8_n NUMERIC(15,2),
    r16_n NUMERIC(15,2),
    r1_a NUMERIC(15,2),
    r8_a NUMERIC(15,2),
    r16_a NUMERIC(15,2),
    cal_8_n NUMERIC(15,2),
    csl_8_n NUMERIC(15,2),
    csl_16_n NUMERIC(15,2),
    cal_8_a NUMERIC(15,2),
    csl_8_a NUMERIC(15,2),
    csl_16_a NUMERIC(15,2),
    rp1q NUMERIC(15,2),
    gi NUMERIC(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_cub_parametric_lookup 
ON cub_parametric_data(state, reference_date, social_charges);
