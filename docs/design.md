# P2P Event Store Design

This repository collects experiments around a peer-to-peer event store.


## Encryption Notes

We want the API to remain simple: the frontend submits events as JSON
structures and the storage layer handles encryption automatically. To
keep the initial design straightforward, each community will share a
single pre‑shared key (PSK). The PSK is distributed out‑of‑band in an
invite link.

### Scheme

* Events are serialized to JSON and then encrypted using an AEAD
  algorithm (e.g. XChaCha20‑Poly1305 or AES‑GCM).
* The entire JSON blob is encrypted so the database only stores an opaque
  ciphertext.
* A random nonce is generated per event. The nonce is stored alongside
  the ciphertext. We can concatenate `nonce || ciphertext` and store it
  as a BLOB.
* Decryption uses the same PSK and nonce to recover the original JSON.

This approach allows us to evolve the event format without exposing
metadata in the clear. Later we can add more sophisticated key rotation
or per‑member access control, but a community‑wide PSK is sufficient for
initial experiments.

