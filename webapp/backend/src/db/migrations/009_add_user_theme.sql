-- Color theme of the front chosen by the user ("auto" follows the system light/dark setting).
-- The value is an id from the front's theme list: the front falls back to its default theme
-- for an id it does not know, so adding a theme needs no migration.
ALTER TABLE users ADD COLUMN theme text NOT NULL DEFAULT 'auto';
