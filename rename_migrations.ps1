$dir = "d:\ORÇACLOUD\orçacloud-saas\supabase\migrations"
Rename-Item "$dir\20240219_commercial_module.sql" "20240219000000_commercial_module.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240219_add_client_to_properties.sql" "20240219010000_add_client_to_properties.sql" -ErrorAction SilentlyContinue

Rename-Item "$dir\20240220_add_technical_specs_to_properties.sql" "20240220000000_add_technical_specs_to_properties.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240221_create_parametric_scenarios.sql" "20240221000000_create_parametric_scenarios.sql" -ErrorAction SilentlyContinue

Rename-Item "$dir\20240224_add_budget_id_to_contracts.sql" "20240224000000_add_budget_id_to_contracts.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240224_add_payment_fields_to_contracts.sql" "20240224010000_add_payment_fields_to_contracts.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240224_contract_ged.sql" "20240224020000_contract_ged.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240224_fix_contract_status_check.sql" "20240224030000_fix_contract_status_check.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20240224_measurement_multi_upload.sql" "20240224040000_measurement_multi_upload.sql" -ErrorAction SilentlyContinue

Rename-Item "$dir\20260126_add_prices_column.sql" "20260126000000_add_prices_column.sql" -ErrorAction SilentlyContinue
Rename-Item "$dir\20260210_create_investors_table.sql" "20260210000000_create_investors_table.sql" -ErrorAction SilentlyContinue

Write-Host "Renames completed."
