-- Phase 11: retention settings + operational health seed for release hardening.

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('ops.audit_retention_days', '365', 'Audit log retention target (days)'),
  ('ops.backup_retention_count', '14', 'Number of logical backups to retain'),
  ('ops.health_probe_enabled', 'true', 'Expose /api/health for smoke checks')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.feature_flags (key, description, enabled, payload)
VALUES (
  'ops.pwa_install',
  'Enable PWA install prompt surfaces after responsive QA',
  true,
  '{}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Baseline info event so dashboards have a health row in fresh environments.
INSERT INTO public.operational_health_events (source, severity, code, message, details)
SELECT
  'release',
  'info',
  'phase11.ready',
  'Phase 11 security/performance/QA hardening applied',
  jsonb_build_object('demo_credits_only', true)
WHERE NOT EXISTS (
  SELECT 1 FROM public.operational_health_events WHERE code = 'phase11.ready'
);
