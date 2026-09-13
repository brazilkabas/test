export interface Env {
  DEPLOYMENTS: {
    get(key: string, options: { type: "json" }): Promise<DeploymentRecord | null>;
  };
}

export type DeploymentRecord = {
  status: "ACTIVE" | "DISABLED";
  html?: string;
  css?: string;
  policy?: "PUBLIC" | "ACCESS_CODE";
  accessCodeHash?: string;
  expiresAt?: string;
};

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": "private, no-store",
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const hostname = new URL(request.url).hostname.toLowerCase();
    const deployment = await env.DEPLOYMENTS.get(hostname, { type: "json" });
    if (!deployment) return page(404, "Page not found", "This deployment does not exist.");
    if (deployment.status !== "ACTIVE") return page(410, "Page unavailable", "This deployment has been disabled.");
    if (deployment.expiresAt && new Date(deployment.expiresAt) <= new Date()) return page(410, "Page expired", "This deployment is no longer available.");

    if (deployment.policy === "ACCESS_CODE") {
      if (request.method !== "POST") return accessForm();
      const form = await request.formData();
      const code = String(form.get("code") ?? "").toUpperCase();
      if (!/^[A-Z0-9]{15}$/.test(code) || (await sha256(code)) !== deployment.accessCodeHash) {
        return accessForm("The access code is invalid or expired.", 401);
      }
    }

    const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${deployment.css ?? ""}</style></head><body>${deployment.html ?? ""}</body></html>`;
    return new Response(document, { status: 200, headers });
  },
};

export default worker;

function page(status: number, title: string, message: string) {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${title}</title><style>${baseCss}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`, { status, headers });
}

function accessForm(error = "", status = 200) {
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Protected company page</title><style>${baseCss}</style></head><body><main><p class="eyebrow">Protected company page</p><h1>Enter your access code</h1><p>This code grants access only to this internal page. It is not a Microsoft or third-party password.</p>${error ? `<p class="error">${error}</p>` : ""}<form method="post"><label>15-character access code<input name="code" minlength="15" maxlength="15" pattern="[A-Za-z0-9]{15}" required autocomplete="one-time-code"></label><button>Continue</button></form></main></body></html>`, { status, headers });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const baseCss = `:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f4f7fb}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem}main{width:min(480px,100%);background:white;border:1px solid #dce3ef;border-radius:18px;padding:2rem;box-shadow:0 20px 60px #17203316}h1{letter-spacing:-.04em}p{color:#667087;line-height:1.6}.eyebrow{color:#3157d5;font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.error{color:#b4233f}label{display:grid;gap:.5rem;font-weight:700}input{padding:.8rem;border:1px solid #ccd5e4;border-radius:9px;font:inherit;text-transform:uppercase;letter-spacing:.12em}button{margin-top:1rem;border:0;border-radius:9px;padding:.8rem 1rem;background:#3157d5;color:white;font:inherit;font-weight:700}`;
