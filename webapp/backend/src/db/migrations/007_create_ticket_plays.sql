-- One row per scratch ticket opened. A player's score is the sum of their rows:
-- an append-only table needs no read-modify-write, so parallel plays cannot lose points.
CREATE TABLE ticket_plays (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket    text NOT NULL,
  points    integer NOT NULL CHECK (points > 0),
  played_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_plays_user_id_idx ON ticket_plays (user_id);
