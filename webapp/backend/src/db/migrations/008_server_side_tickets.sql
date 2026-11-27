-- A ticket is now created by the server (with its key sequence and its points) and only
-- counts once it is revealed. The plays recorded before this migration were already revealed.
ALTER TABLE ticket_plays RENAME COLUMN played_at TO created_at;

ALTER TABLE ticket_plays ADD COLUMN sequence text;

ALTER TABLE ticket_plays ADD COLUMN revealed_at timestamptz;

UPDATE ticket_plays SET revealed_at = created_at;

-- At most one ticket in progress per player: buying a new one replaces it (upsert on this index)
CREATE UNIQUE INDEX ticket_plays_one_pending_idx ON ticket_plays (user_id) WHERE revealed_at IS NULL;
