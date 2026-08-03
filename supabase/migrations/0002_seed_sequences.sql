-- ============================================================
-- STARTER SEQUENCES
-- These are DRAFT templates, not approved marketing copy. Every
-- step defaults to requires_compliance_review = true and has no
-- approved_template_version, so processDueSends() will block
-- them until you (or MM Private's compliance function) review
-- and log an approval in template_approvals.
--
-- Replace the placeholder license_id below with the real ids
-- from your licenses table before running.
-- ============================================================

-- Sequence 1: warm referral follow-up (lower compliance risk —
-- relationship-building, no product mention)
insert into sequences (id, name, license_id, description) values
  ('11111111-0000-0000-0000-000000000001', 'Referral Follow-Up', null,
   'For leads sourced via warm referral. Light touch, no product mention in step 1.');

insert into sequence_steps (sequence_id, step_order, channel, delay_days, subject_template, body_template, requires_compliance_review) values
  ('11111111-0000-0000-0000-000000000001', 1, 'email', 0,
   'Following up via {{referred_by}}',
   'Hi {{first_name}},

[Name] mentioned we should connect. I work with founders and executives on [wealth planning / portfolio structuring] and would enjoy a short call whenever convenient — no agenda beyond an introduction.

Best,
[Your name]',
   true),
  ('11111111-0000-0000-0000-000000000001', 2, 'linkedin_manual', 3,
   null,
   'Connect on LinkedIn, reference the mutual contact by name, keep it to one line.',
   false);

-- Sequence 2: cold outreach following a liquidity event signal
-- (higher compliance risk — likely to reference services, needs
-- explicit sign-off before use)
insert into sequences (id, name, license_id, description) values
  ('22222222-0000-0000-0000-000000000001', 'Post-Exit Cold Outreach', null,
   'Cold outreach triggered by a detected liquidity event (exit, IPO, inheritance). Needs compliance review before first send.');

insert into sequence_steps (sequence_id, step_order, channel, delay_days, subject_template, body_template, requires_compliance_review) values
  ('22222222-0000-0000-0000-000000000001', 1, 'email', 0,
   'Congratulations on {{company}}',
   'Hi {{first_name}},

Congratulations on the {{company}} exit — well earned. I work with founders navigating the period after a liquidity event, from structuring through to long-term planning.

Would a short call make sense in the next couple of weeks?

Best,
[Your name]',
   true),
  ('22222222-0000-0000-0000-000000000001', 2, 'email', 5,
   'Re: {{company}}',
   'Hi {{first_name}}, just floating this back up in case it got buried — happy to keep it brief if useful.',
   true);

-- Example of logging a compliance approval once you've reviewed
-- a template (run manually after review, not part of the seed):
--
-- update sequence_steps set approved_template_version = 1
--   where id = '<step-id>';
-- insert into template_approvals (step_id, template_version, approved_by, notes)
--   values ('<step-id>', 1, 'Angela Duarte Henriques', 'Reviewed against MiFID II marketing comms standard, cleared.');
