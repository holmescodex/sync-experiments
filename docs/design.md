# P2P Event Store Design

This repository collects experiments around a peer-to-peer event store. The long term goal is a small, local-first system that can sync messages and files without a central server.

## Design Goals

* **Minimal metadata in the clear.** Events are stored and transmitted as opaque blobs.
* **SQLite as the only database.** All data lives in per-user SQLite files that can be queried directly by the client.
* **Opportunistic peer-to-peer sync.** Peers exchange Bloom filters over UDP to find missing events.
* **Simple frontend API.** A thin layer exposes Slack-like calls for sending and retrieving messages.

## Event Sourcing Model

All information is represented as immutable events. An event is a JSON structure that includes:

* `type` – e.g. `message`, `file_chunk`, `invite`.
* `ts` – timestamp when the event was created.
* `author` – device or user ID.
* Type-specific fields (channel ID, message body, file metadata, etc).

The `event_id` is `hash(event_bytes)` where `event_bytes` is the canonical JSON encoding. Devices sign events so that peers can verify authorship.

## Encryption

To keep things straightforward each community shares a single pre‑shared key (PSK). The PSK is distributed out-of-band in an invite link. Events are serialized to JSON and then encrypted using an AEAD algorithm such as XChaCha20‑Poly1305 or AES‑GCM. The entire payload is encrypted so the database only stores an opaque BLOB.

* A random nonce is generated per event.
* `nonce || ciphertext` is stored in the `events` table.
* Decryption uses the same PSK and nonce to recover the original JSON.
* The database never sees unencrypted fields; all metadata is derived after decryption.

This approach hides metadata while allowing the event format to evolve. More sophisticated key rotation or per-member access control can be added later.

## Database Schema

The core table is the raw event log:

```sql
CREATE TABLE events (
  event_id     TEXT PRIMARY KEY,
  account_id   TEXT,
  received_ts  INTEGER,
  encrypted    BLOB
);
```

After validating an event we populate materialized views. Examples include:

```sql
CREATE TABLE auth_graph (
  event_id    TEXT PRIMARY KEY,
  subject     TEXT,
  action      TEXT,
  author_user TEXT,
  ts          INTEGER
);

CREATE TABLE message_index (
  event_id   TEXT PRIMARY KEY,
  channel_id TEXT,
  sender     TEXT,
  ts         INTEGER,
  body_text  TEXT
);
```

Attachments are stored in a `file_chunks` table keyed by a pseudorandom tag derived from the file key.

## Bloom Filter Sync

Every device maintains a rolling Bloom filter summarizing the event IDs it knows about. Peers periodically exchange filters over UDP. When a device sees a peer's filter it computes the set of events that appear to be missing and sends them.

This mechanism lets peers reconcile history without revealing which events they are requesting. Packet loss and latency are tolerated because filters and events can be retransmitted opportunistically.

## Simulation Event Layers

To reason about correctness the simulator models two nested event logs:

1. **Real-world events** form the ground truth of the simulation. They describe user behavior and network conditions in a global timeline: messages sent, devices joining, going offline, or experiencing packet loss. These events are stored in a `sim_events` table for deterministic replay.
2. **Device event logs** are the per-device SQLite databases that hold encrypted events. A device only records a real-world event once it actually receives and validates it, or generates it locally. If a device is offline, its log lags behind until it reconnects and Bloom-syncs missing events.

The simulator drives the system by generating real-world events and routing the resulting encrypted device events through the network model. Comparing each device log to the global `sim_events` table lets us verify convergence.

## Milestones

1. **Two peers can Bloom-sync.** Build a simulator with two devices exchanging filters until they hold the same events.
2. **Gossip over UDP.** Expand to periodic heartbeats and retransmission of missing events.
3. **N-peer convergence.** Simulate several devices and measure convergence time under packet loss.
4. **Frontend API.** Provide `sendMessage`, `getMessages`, and `searchMessages` calls backed by SQLite views.
5. **File transfer.** Support chunked file uploads and downloads as event sequences.

These milestones mirror the sections in the larger design document and will guide development.


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
