ALTER TABLE populations ADD CONSTRAINT populations_remainder_nano_check CHECK (remainder_nano < 1000000000);
