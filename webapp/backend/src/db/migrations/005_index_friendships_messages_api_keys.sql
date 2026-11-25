CREATE INDEX messages_sender_created_idx ON messages (sender_id, created_at);
CREATE INDEX messages_recipient_created_idx ON messages (recipient_id, created_at);
CREATE INDEX friendships_requester_id_idx ON friendships (requester_id);
CREATE INDEX friendships_addressee_id_idx ON friendships (addressee_id);
CREATE INDEX api_keys_user_id_idx ON api_keys (user_id);
