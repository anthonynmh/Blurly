-- Records which model produced an assistant message. NULL for historical rows.
ALTER TABLE analyst_messages ADD COLUMN response_model TEXT;
