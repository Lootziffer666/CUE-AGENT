"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { createHttpProbe, detectHttpProbe } = require("../src/probe/client");
const { startProbeStub } = require("./fixtures/probe-stub");

test("probe-client: HTTP-Probe erkennt ready/state/params/events/screenshot", async () => {
  const { server, port } = await startProbeStub();
  try {
    const detected = await detectHttpProbe({ port, timeoutMs: 500 });
    assert.ok(detected);
    const probe = createHttpProbe({ port, timeoutMs: 500 });
    assert.equal(await probe.ready(), true);
    assert.equal((await probe.state()).scene, "stub");
    assert.deepEqual(await probe.setParams({ rain: 1 }), { ok: true });
    assert.deepEqual(await probe.input({ type: "jump" }), { ok: true });
    assert.ok(Array.isArray(await probe.events()));
    assert.ok(Buffer.isBuffer(await probe.screenshot()));
  } finally {
    server.close();
  }
});
