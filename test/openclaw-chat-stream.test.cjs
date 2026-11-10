'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OpenClawChat } = require('../src/core/openclaw-chat');

function streamResponse(parts) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    headers: { get: () => 'text/event-stream; charset=utf-8' },
    body: new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(typeof part === 'string' ? encoder.encode(part) : part);
        }
        controller.close();
      }
    })
  };
}

test('streams local gateway deltas in order and reports elapsed time', async () => {
  let request;
  const received = [];
  const adapter = new OpenClawChat({
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return streamResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ARTA"}}]}\n\ndata: [DONE]\n\n'
      ]);
    }
  });

  const result = await adapter.ask({
    message: 'Hello',
    model: 'openclaw-default',
    onToken: token => received.push(token)
  });

  assert.equal(request.url, 'http://127.0.0.1:8000/v1/chat/completions');
  assert.equal(request.body.stream, true);
  assert.deepEqual(received, ['Hello ', 'ARTA']);
  assert.equal(result.reply, 'Hello ARTA');
  assert.equal(result.provider, 'local-gateway');
  assert.equal(Number.isFinite(result.latencyMs), true);
});

test('parses split server-sent events without losing UTF-8 output', async () => {
  const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"سلام"}}]}\n\ndata: [DONE]\n\n');
  const split = 35;
  const received = [];
  const adapter = new OpenClawChat({
    fetchImpl: async () => streamResponse([
      bytes.slice(0, split),
      bytes.slice(split)
    ])
  });

  const result = await adapter.ask({ message: 'سلام', onToken: token => received.push(token) });
  assert.equal(result.reply, 'سلام');
  assert.deepEqual(received, ['سلام']);
});

test('accepts a JSON completion response from a compatible local gateway', async () => {
  const received = [];
  const adapter = new OpenClawChat({
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        model: 'test-model',
        choices: [{ message: { content: 'Ready' } }]
      })
    })
  });

  const result = await adapter.ask({ message: 'Ping', onToken: token => received.push(token) });
  assert.equal(result.reply, 'Ready');
  assert.deepEqual(received, ['Ready']);
});

test('rejects malformed streamed JSON rather than fabricating a response', async () => {
  const adapter = new OpenClawChat({
    fetchImpl: async () => streamResponse(['data: not-json\n\n'])
  });

  await assert.rejects(adapter.ask({ message: 'Hello' }), /invalid event stream/i);
});
