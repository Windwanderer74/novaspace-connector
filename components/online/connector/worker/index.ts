// SPDX-License-Identifier: AGPL-3.0-or-later
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { setDeckRuntimeConfig } from "../lib/runtime-config";
import { ALL_SCOPES, canonicalResource, json, oauthOrigin } from "../lib/oauth";
import { serveFileDownload } from "../lib/files-download";
import { serveFileUpload } from '../lib/files-upload';
import pdfBridgeRepair from '../ops/pdf-bridge-repair-0.1.1.php?raw';
import tablesReadInstall from '../ops/tables-read-bridge-install-0.1.0.php?raw';
import tablesWritePilot from '../ops/tables-write-pilot-0.1.1.php?raw';
import tablesPilotHttpInstall from '../ops/tables-pilot-http-install-0.1.2.php?raw';
import generalTablesInstall from '../ops/general-tables-install-test-0.3.0.php?raw';
import intakeInstall from '../ops/intake-install-test-0.2.1.php?raw';
import registerShareSoul from '../ops/register-share-soul-0.1.0.php?raw';
import pdfWorkbench from '../scripts/pdf-workbench.py?raw';
import pdfAssembler from '../scripts/assemble-pdf-chunk.py?raw';
import tablesHttpTest from '../ops/tables-http-test-0.1.0.php?raw';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  NEXTCLOUD_BASE_URL?: string;
  NEXTCLOUD_LOGIN_NAME?: string;
  NEXTCLOUD_APP_PASSWORD?: string;
  OAUTH_SIGNING_SECRET?: string;
  CONNECTOR_ALLOWED_EMAIL?: string;
  CONNECTOR_PUBLIC_ORIGIN?: string;
  NOVASPACE_ASSERTION_JWK?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setDeckRuntimeConfig(env);
    const url = new URL(request.url);

    if(url.pathname==='/ops/general-tables-install-test-0.3.0.php'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return new Response(generalTablesInstall,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
    }

    if(url.pathname==='/ops/pdf-assemble-1.0.0.py'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return new Response(pdfAssembler,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
    }

    if (url.pathname === '/ops/register-share-soul-0.1.0.php') {
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return new Response(registerShareSoul,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
    }

    if (url.pathname === '/ops/intake-install-test-0.2.0.php') return new Response('Installer 0.2.0 zurueckgezogen: unzureichende Eingangsdiagnose. Bitte 0.2.1 verwenden.', {status:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    if(['/ops/pdf-workbench-1.0.0.py','/ops/pdf-workbench-1.0.1.py'].includes(url.pathname))return new Response('PDF-Arbeitsprozessor 1.0.2 verwenden: authentifiziert uebertragenes Original unterstuetzt.',{status:410,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    if (['/ops/intake-install-test-0.2.1.php','/ops/pdf-workbench-1.0.2.py'].includes(url.pathname)) {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(url.pathname.endsWith('.php') ? intakeInstall : pdfWorkbench, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }

    if (url.pathname === '/ops/tables-http-test-0.1.0.php') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(tablesHttpTest, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="tables-http-test-0.1.0.php"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }

    if (url.pathname === '/ops/tables-pilot-http-install-0.1.1.php') {
      return new Response('Installer 0.1.1 zurueckgezogen: XML-Lader inkompatibel mit Nextcloud. Bitte Installer 0.1.2 verwenden.', {
        status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/ops/tables-pilot-http-install-0.1.2.php') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(tablesPilotHttpInstall, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="tables-pilot-http-install-0.1.2.php"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }

    if (url.pathname === '/ops/tables-write-pilot-0.1.0.php') {
      return new Response('Pilot 0.1.0 zurueckgezogen. Bitte die korrigierte Fassung 0.1.1 verwenden.', {
        status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname === '/ops/tables-write-pilot-0.1.1.php') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(tablesWritePilot, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="tables-write-pilot-0.1.1.php"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }

    if (url.pathname === '/ops/tables-read-bridge-install-0.1.0.php') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(tablesReadInstall, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="tables-read-bridge-install-0.1.0.php"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }

    if (url.pathname === '/ops/pdf-bridge-repair-0.1.1.php') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      return new Response(pdfBridgeRepair, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="pdf-bridge-repair-0.1.1.php"',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      } });
    }
    if (url.pathname === '/files-download') return serveFileDownload(request);
    if (url.pathname === '/files-upload') return serveFileUpload(request);

    if (
      url.pathname === "/.well-known/oauth-protected-resource"
      || url.pathname === "/.well-known/oauth-protected-resource/deck-mcp"
    ) {
      return json({
        resource: canonicalResource(),
        authorization_servers: [oauthOrigin()],
        scopes_supported: [...ALL_SCOPES],
        resource_documentation: oauthOrigin(),
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      const issuer = oauthOrigin();
      return json({
        issuer,
        authorization_response_iss_parameter_supported: true,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        token_endpoint_auth_methods_supported: ["none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: [...ALL_SCOPES],
        grant_types_supported: ["authorization_code"],
        response_types_supported: ["code"],
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
