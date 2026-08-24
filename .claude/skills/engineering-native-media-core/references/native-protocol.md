# Native Protocol Skeleton

```json
{
  "protocolVersion": 1,
  "type": "startJob",
  "jobId": "uuid",
  "operation": "transcribe",
  "payload": {
    "inputPath": "...",
    "modelPath": "...",
    "language": "auto"
  }
}
```

Events:

```text
hello · capabilities · accepted · progress · warning · result · error · cancelled · goodbye
```

Required invariants:

- one terminal event per accepted job;
- bounded message size;
- no arbitrary executable command;
- local authenticated peer;
- cancellation idempotent;
- protocol mismatch fails before work;
- all paths canonicalized and authorized;
- logs exclude media content and secrets.
