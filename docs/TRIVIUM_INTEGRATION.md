# CUE-AGENT ↔ TRIVIUM Integration Contract

## Role

TRIVIUM states what must be preserved or achieved. CUE-AGENT proves whether a realization actually satisfies that contract.

Compilation, successful import and a plausible screenshot are not sufficient. Completion requires evidence of equivalent function, permitted approximation or explicit loss.

## Verification targets

CUE should verify, where applicable:

- identical or equivalent state transitions for the same scenario
- collision, navigation and interaction obligations
- timing and lifecycle behavior
- asset structure, animation count and material bindings
- visual, audio or haptic projection requirements
- engine-handoff input/output contracts
- declared losses and gains

## Contract-derived scenarios

```yaml
contract: door.passability
scenario:
  given: player_has_key == false
  when: interact_with_door
  expect:
    - door_state == closed
    - passage == blocked
    - no_inventory_change
```

The same semantic scenario may run against Unity, Unreal, Godot or a nonvisual realization. Evidence differs by target; obligations do not.

## Evidence bundle

A verified route should emit:

- machine-readable assertion results
- runtime traces and state snapshots
- screenshots, video or audio captures where meaningful
- source/output hashes and toolchain identity
- comparison against the original or reference fixture
- confidence and unresolved review items

## Comparison modes

- `exact`: deterministic state/output equality is expected.
- `equivalent`: implementation differs but obligations match.
- `approximate`: documented loss is accepted by the contract.
- `human_review`: meaning cannot be established automatically.
- `failed`: a required obligation is violated.

Hardcoded success checks and “did not crash” assertions do not qualify as evidence for semantic completion.

## Engine federation

At engine boundaries, verify both sides of the handoff:

1. outgoing runtime emits only declared state;
2. shared state is persisted intact;
3. incoming runtime realizes the expected entry state;
4. no native object identity is falsely assumed across runtimes.

## Boundaries

CUE does not:

- decide what losses are acceptable
- rewrite contracts to fit broken output
- mark unknown behavior as success
- infer license permissions

## Canonical references

- Realization contracts: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/realization-contracts.md
- Loss taxonomy: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/loss-taxonomy.md
- Architecture: https://github.com/Lootziffer666/TRIVIUM/blob/docs/semantic-realization-direction/docs/architecture-v1.1.md
