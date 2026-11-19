ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN fortytwo_id integer CONSTRAINT users_fortytwo_id_key UNIQUE;

CREATE TABLE badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uid_hash    bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT badges_user_id_key UNIQUE (user_id),
  CONSTRAINT badges_uid_hash_key UNIQUE (uid_hash)
);
