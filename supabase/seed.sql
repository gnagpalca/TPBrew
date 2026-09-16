-- Starter source list (PRD section 9). Run after schema.sql.
-- Verify/replace feed URLs at build time — availability changes.
-- google_alert sources: create the alert at https://www.google.com/alerts,
-- set delivery to "RSS feed", then paste the generated feed URL here.

insert into sources (name, url, type, active) values
  ('OECD Tax News', 'https://www.oecd.org/tax/rss.xml', 'rss', true),
  ('Tax Foundation', 'https://taxfoundation.org/feed/', 'rss', true),
  ('ITR - International Tax Review', 'https://www.internationaltaxreview.com/rss/latest', 'rss', true),
  ('LHDN Malaysia', 'https://www.hasil.gov.my', 'firecrawl', true),
  ('IRAS Singapore', 'https://www.iras.gov.sg', 'firecrawl', true),
  ('ATO Australia', 'https://www.ato.gov.au', 'firecrawl', true),
  ('HMRC UK', 'https://www.gov.uk/government/organisations/hm-revenue-customs', 'firecrawl', true)
on conflict do nothing;

-- Add your Google Alerts RSS feed URLs once created:
-- insert into sources (name, url, type, active) values
--   ('Google Alert: transfer pricing Malaysia', '<paste RSS feed URL>', 'google_alert', true),
--   ('Google Alert: APA Southeast Asia', '<paste RSS feed URL>', 'google_alert', true),
--   ('Google Alert: BEPS Pillar Two ASEAN', '<paste RSS feed URL>', 'google_alert', true);
