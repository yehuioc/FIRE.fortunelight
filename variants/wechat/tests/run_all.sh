#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node tests/model.test.js
node tests/adversarial_regression.test.js
node tests/bar_regression.test.js
node tests/config_atomicity.test.js
node tests/fried_noodle_runtime.test.js
node tests/storage.test.js
node tests/backup.test.js
node tests/settings_backup_ui.test.js
node tests/onboarding_restore.test.js
node tests/adversarial_v051_complete.test.js
node tests/fried_noodle_v051_complete.test.js
node tests/lifecycle_race_v051.test.js
node tests/long_ledger_v051.test.js
node tests/submit_truth_v051.test.js
node tests/page_flow.test.js
node tests/calibration_page.test.js
node tests/grid_render.test.js
node tests/secondary_pages.test.js
node tests/ritual_core.test.js
node tests/ritual_fault_regression.test.js
node tests/ritual_page_integration.test.js
node tests/ritual_audio.test.js
node tests/core_semantics.test.js
node tests/v052_true_device_regression.test.js
node tests/manual_cost_truth_v052.test.js
node tests/v060_analytics.test.js
node tests/v060_storage_buckets.test.js
node tests/v060_presets_backup.test.js
node tests/v061_habit_loop.test.js
node tests/v061_settings_backup.test.js
node tests/v062_ui_settings.test.js
python3 tests/static_check.py
python3 tests/ritual_visual_acceptance.py
echo "ALL AUTOMATED CHECKS PASSED"
