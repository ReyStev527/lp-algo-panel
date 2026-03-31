// LP Algo Remote Control API — Netlify Functions
// Storage: Netlify Blobs (built-in, gratis)
import { getStore } from "@netlify/blobs";

// ======================== KONFIGURASI ========================
const API_SECRET = "LP_ALGO_2025_SECRET_KEY";  // GANTI! Harus sama di EA & Panel

// Daftar Account ID yang diizinkan (SAMA dengan di EA)
const ALLOWED_ACCOUNTS = [
  159956643,  // Account #1
  0,          // Account #2
  0,          // Account #3
  0,          // Account #4
  0,          // Account #5
];

// ======================== HELPER ========================
function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key, X-Account-ID",
    },
  });
}

function isAllowed(accountId) {
  const num = parseInt(accountId);
  if (!num || num <= 0) return false;
  return ALLOWED_ACCOUNTS.some(a => a > 0 && a === num);
}

// ======================== MAIN HANDLER ========================
export default async (request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return respond({ ok: true });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const accountId = url.searchParams.get("account_id") || "";
  const apiKey = url.searchParams.get("api_key") ||
    request.headers.get("x-api-key") || "";

  // Validate API key
  if (apiKey !== API_SECRET) {
    return respond({ error: "Invalid API key" }, 403);
  }

  // Get Netlify Blobs store
  const store = getStore("ea-data");

  // ======================== ROUTING ========================
  try {
    switch (action) {

      // === LOGIN ===
      case "login": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        if (!isAllowed(accountId)) {
          return respond({ error: "Account not authorized", account_id: accountId }, 403);
        }
        // Simpan session
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await store.set(`session_${accountId}`, JSON.stringify({
          account_id: accountId,
          token,
          login_time: new Date().toISOString(),
        }));
        return respond({ success: true, account_id: accountId, token, message: "Login berhasil" });
      }

      // === STATUS (EA → Server → Web Panel) ===
      case "status": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (request.method === "POST") {
          // EA mengirim status
          let body;
          try { body = await request.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          await store.set(`status_${accountId}`, JSON.stringify({
            account_id: accountId,
            ea_online: true,
            data: body,
            updated_at: new Date().toISOString(),
          }));
          return respond({ success: true });
        } else {
          // Web panel mengambil status
          const raw = await store.get(`status_${accountId}`);
          if (!raw) {
            return respond({ account_id: accountId, ea_online: false, data: null });
          }
          const data = JSON.parse(raw);
          // Cek online (timeout 30 detik)
          const age = (Date.now() - new Date(data.updated_at).getTime()) / 1000;
          data.ea_online = age < 30;
          return respond(data);
        }
      }

      // === COMMAND (Web Panel → Server → EA) ===
      case "command": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (request.method === "POST") {
          // Web panel mengirim command
          let body;
          try { body = await request.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          if (!body.cmd) return respond({ error: "cmd required" }, 400);
          await store.set(`command_${accountId}`, JSON.stringify({
            account_id: accountId,
            cmd: body.cmd,
            params: body.params || {},
            executed: false,
            sent_at: new Date().toISOString(),
          }));
          return respond({ success: true, cmd: body.cmd });
        } else {
          // EA mengambil command
          const raw = await store.get(`command_${accountId}`);
          if (!raw) return respond({ cmd: "NONE" });
          const data = JSON.parse(raw);
          if (data.executed) return respond({ cmd: "NONE" });
          return respond(data);
        }
      }

      // === ACK (EA konfirmasi command) ===
      case "ack": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        const raw = await store.get(`command_${accountId}`);
        if (raw) {
          const data = JSON.parse(raw);
          data.executed = true;
          data.executed_at = new Date().toISOString();
          await store.set(`command_${accountId}`, JSON.stringify(data));
        }
        return respond({ success: true });
      }

      // === SETTINGS (Web Panel → Server → EA) ===
      case "settings": {
        if (!accountId) return respond({ error: "account_id required" }, 400);

        if (request.method === "POST") {
          let body;
          try { body = await request.json(); } catch { return respond({ error: "Invalid JSON" }, 400); }
          await store.set(`settings_${accountId}`, JSON.stringify({
            account_id: accountId,
            settings: body,
            applied: false,
            updated_at: new Date().toISOString(),
          }));
          return respond({ success: true });
        } else {
          const raw = await store.get(`settings_${accountId}`);
          if (!raw) return respond({ settings: null });
          return respond(JSON.parse(raw));
        }
      }

      // === SETTINGS ACK ===
      case "settings_ack": {
        if (!accountId) return respond({ error: "account_id required" }, 400);
        const raw = await store.get(`settings_${accountId}`);
        if (raw) {
          const data = JSON.parse(raw);
          data.applied = true;
          data.applied_at = new Date().toISOString();
          await store.set(`settings_${accountId}`, JSON.stringify(data));
        }
        return respond({ success: true });
      }

      // === DEFAULT ===
      default:
        return respond({
          name: "LP Algo Remote Control API",
          version: "1.0",
          status: "running",
          time: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.error("API Error:", err);
    return respond({ error: "Internal server error" }, 500);
  }
};

export const config = {
  path: "/.netlify/functions/api",
};
