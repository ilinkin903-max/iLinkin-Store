(function (root) {
  'use strict';
  function createRequestCoordinator() {
    const pending = new Map();
    let generation = 0;
    function clear() { generation++; pending.clear(); }
    async function run(path, options, token, request) {
      const method = String(options.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        clear();
        try { return await request(); } finally { clear(); }
      }
      if (options.raw || options.signal || options.dedupe === false || /[?&]force=(?:1|true)(?:&|$)/.test(path)) return request();
      const headers = [...new Headers(options.headers || {}).entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const key = JSON.stringify([generation, method, path, token, headers]);
      let entry = pending.get(key);
      if (!entry) {
        entry = { task: Promise.resolve().then(request), consumers: 0 };
        pending.set(key, entry);
        entry.task.then(() => { if (pending.get(key) === entry) pending.delete(key); }, () => { if (pending.get(key) === entry) pending.delete(key); });
      }
      entry.consumers++;
      // No completed response cache; each consumer owns its mutable data.
      const value = await entry.task;
      if (entry.consumers === 1) return value;
      return typeof structuredClone === 'function' ? structuredClone(value) : value == null ? value : JSON.parse(JSON.stringify(value));
    }
    return { run, clear };
  }
  if (typeof module === 'object' && module.exports) module.exports = { createRequestCoordinator };
  else root.ilinkRequests = createRequestCoordinator();
})(typeof window === 'undefined' ? globalThis : window);
