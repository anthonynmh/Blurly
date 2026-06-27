-- Store the signing identity (CDHash + Authority) that was active when the
-- BYOK key was last saved. Used to diagnose Keychain ACL drift across builds.
ALTER TABLE ai_settings ADD COLUMN key_signing_cdhash TEXT;
ALTER TABLE ai_settings ADD COLUMN key_signing_authority TEXT;
