import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recoverStaleActiveSession,
  type RecoverStaleActiveSessionClient,
} from '../lib/qr/recoverStaleActiveSession';

// ── Fake Supabase client builders ─────────────────────────────────────────────
//
// We never load `@/lib/supabase` from a Node test (that module pulls in
// `react-native-url-polyfill`, `expo-constants`, `react-native-mmkv`, and
// would crash the runner). The helper accepts an injected client; these
// builders shape just enough of the supabase-js fluent API to satisfy the
// query/RPC paths the helper actually calls.

interface QueryRecorder {
  table?: string;
  selected?: string;
  eqs: [string, unknown][];
  ordered: boolean;
  limited?: number;
  ranSingle: boolean;
  update?: Record<string, unknown>;
  rpcCalled: { fn: string; args?: Record<string, unknown> }[];
}

function makeFakeClient(opts: {
  staleSession?: { id: string } | null;
  queryError?: { message: string } | null;
  rpcReturn?: { data?: unknown; error?: { message: string } | null };
  updateError?: { message: string } | null;
}): { client: RecoverStaleActiveSessionClient; recorder: QueryRecorder } {
  const recorder: QueryRecorder = { eqs: [], ordered: false, ranSingle: false, rpcCalled: [] };

  function makeQueryBuilder(intent: 'select' | 'update'): unknown {
    const chain: Record<string, unknown> = {};
    chain.eq = (col: string, val: unknown) => {
      recorder.eqs.push([col, val]);
      return chain;
    };
    chain.order = () => {
      recorder.ordered = true;
      return chain;
    };
    chain.limit = (n: number) => {
      recorder.limited = n;
      return chain;
    };
    chain.maybeSingle = async () => {
      recorder.ranSingle = true;
      if (opts.queryError) return { data: null, error: opts.queryError };
      return { data: opts.staleSession ?? null, error: null };
    };
    if (intent === 'update') {
      // Promise-returning thenable (like the supabase update query)
      chain.then = (resolve: (value: { error: { message: string } | null }) => void) => {
        resolve({ error: opts.updateError ?? null });
      };
    }
    return chain;
  }

  const client: RecoverStaleActiveSessionClient = {
    from: (table: string) => {
      recorder.table = table;
      return {
        select: (cols: string) => {
          recorder.selected = cols;
          return makeQueryBuilder('select');
        },
        update: (patch: Record<string, unknown>) => {
          recorder.update = patch;
          return makeQueryBuilder('update');
        },
      };
    },
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      recorder.rpcCalled.push({ fn, args });
      const r = opts.rpcReturn ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };

  return { client, recorder };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns no_active_session when caller has no userId', async () => {
  const { client } = makeFakeClient({});
  const result = await recoverStaleActiveSession('', client);

  assert.equal(result.closed, false);
  assert.equal(result.reason, 'no_active_session');
  assert.equal(result.sessionId, null);
  assert.equal(result.dropsRecovered, 0);
});

test('returns no_active_session when no stale session exists', async () => {
  const { client, recorder } = makeFakeClient({ staleSession: null });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, false);
  assert.equal(result.reason, 'no_active_session');
  assert.equal(recorder.table, 'sessions');
  assert.equal(recorder.ranSingle, true);
  assert.equal(recorder.rpcCalled.length, 0); // No RPC fired when nothing to close
});

test('returns failed when stale-session query errors', async () => {
  const { client } = makeFakeClient({ queryError: { message: 'network down' } });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, false);
  assert.equal(result.reason, 'failed');
  assert.equal(result.error, 'network down');
});

test('returns rpc_finalized with drops when finalize_inactive_session succeeds', async () => {
  const { client, recorder } = makeFakeClient({
    staleSession: { id: 'sess-abc' },
    rpcReturn: {
      data: [{ success: true, already_finalized: false, drops_earned: 7 }],
      error: null,
    },
  });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, true);
  assert.equal(result.sessionId, 'sess-abc');
  assert.equal(result.dropsRecovered, 7);
  assert.equal(result.reason, 'rpc_finalized');
  assert.equal(recorder.rpcCalled.length, 1);
  assert.equal(recorder.rpcCalled[0].fn, 'finalize_inactive_session');
  assert.deepEqual(recorder.rpcCalled[0].args, {
    p_session_id: 'sess-abc',
    p_reason: 'user_initiated_recovery',
  });
});

test('handles RPC returning a single object (not array)', async () => {
  const { client } = makeFakeClient({
    staleSession: { id: 'sess-abc' },
    rpcReturn: {
      data: { drops_earned: 4 },
      error: null,
    },
  });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, true);
  assert.equal(result.dropsRecovered, 4);
  assert.equal(result.reason, 'rpc_finalized');
});

test('falls back to direct UPDATE when finalize RPC fails', async () => {
  const { client, recorder } = makeFakeClient({
    staleSession: { id: 'sess-abc' },
    rpcReturn: { error: { message: 'rpc unavailable' } },
    updateError: null,
  });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, true);
  assert.equal(result.sessionId, 'sess-abc');
  // Cron sweep credits drops on the fallback path; helper reports 0 here.
  assert.equal(result.dropsRecovered, 0);
  assert.equal(result.reason, 'fallback_update');
  assert.deepEqual(recorder.update, {
    is_active: false,
    ended_at: recorder.update?.ended_at,
    updated_at: recorder.update?.updated_at,
  });
});

test('returns failed when both RPC and fallback UPDATE fail', async () => {
  const { client } = makeFakeClient({
    staleSession: { id: 'sess-abc' },
    rpcReturn: { error: { message: 'rpc gone' } },
    updateError: { message: 'update blocked' },
  });
  const result = await recoverStaleActiveSession('user-123', client);

  assert.equal(result.closed, false);
  assert.equal(result.reason, 'failed');
  assert.equal(result.error, 'update blocked');
});
