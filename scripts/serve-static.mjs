import { createReadStream, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../server/application.mjs';
import { BolClient } from '../server/bol-client.mjs';
import { loadConfig } from '../server/config.mjs';
import { createDatabaseClient } from '../server/database.mjs';
import { ScannerRepository } from '../server/repository.mjs';
import { hashPassword } from '../server/security.mjs';
import { applyMigration } from './migrate.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 4188);
const host = '127.0.0.1';
const origin = `http://${host}:${port}`;
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);
const staticHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

const syntheticOrder = {
  orderId: 'ORDER-REAL-1',
  orderPlacedDateTime: '2026-08-05T08:00:00Z',
  orderItems: [{
    orderItemId: 'ORDER-REAL-1-ITEM-1',
    ean: '8710000000001',
    productTitle: 'Standalone handler fixture',
    quantity: 1,
    quantityShipped: 0,
    quantityCancelled: 0,
    cancellationRequest: false,
    fulfilmentStatus: 'OPEN',
    exactDeliveryDate: '2026-08-06',
  }],
};
const syntheticShipment = {
  shipmentId: 'SHIPMENT-REAL-1',
  shipmentDateTime: '2026-08-05T09:00:00Z',
  order: { orderId: syntheticOrder.orderId, orderPlacedDateTime: syntheticOrder.orderPlacedDateTime },
  shipmentItems: [{
    orderItemId: 'ORDER-REAL-1-ITEM-1',
    ean: '8710000000001',
    productTitle: 'Standalone handler fixture',
    quantity: 1,
  }],
  transport: { trackAndTrace: 'TRACK-REAL-1', transporterCode: 'FIXTURE' },
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const candidate = resolve(root, `.${decoded}`);
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

function json(response, status, payload) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function validSyntheticBearer(request) {
  return request.headers.authorization === 'Bearer synthetic-access-token'
    && request.headers.accept === 'application/vnd.retailer.v10+json';
}

function handleSyntheticBol(request, response, url) {
  if (url.pathname === '/__bol/token' && request.method === 'POST') {
    if (!String(request.headers.authorization || '').startsWith('Basic ')) return json(response, 401, {});
    return json(response, 200, { access_token: 'synthetic-access-token', expires_in: 299 });
  }
  if (!url.pathname.startsWith('/__bol/api/') || request.method !== 'GET' || !validSyntheticBearer(request)) {
    return json(response, 404, { error: 'not_found' });
  }
  const path = url.pathname.slice('/__bol/api'.length);
  if (path === '/orders') {
    const page = Number(url.searchParams.get('page') || 1);
    return json(response, 200, { orders: page === 1 ? [{ orderId: syntheticOrder.orderId, orderPlacedDateTime: syntheticOrder.orderPlacedDateTime }] : [], totalPages: 1, totalElements: 1 });
  }
  if (path === '/shipments') {
    const page = Number(url.searchParams.get('page') || 1);
    return json(response, 200, { shipments: page === 1 ? [{ ...syntheticShipment, transport: undefined }] : [], totalPages: 1, totalElements: 1 });
  }
  if (path === `/orders/${syntheticOrder.orderId}`) return json(response, 200, syntheticOrder);
  if (path === `/shipments/${syntheticShipment.shipmentId}`) return json(response, 200, syntheticShipment);
  return json(response, 404, { error: 'not_found' });
}

const temporaryDatabaseDirectory = await mkdtemp(join(tmpdir(), 'ampere-scanner-test-'));
const databaseUrl = `file:${join(temporaryDatabaseDirectory, 'ampere.db')}`;
const passwordHash = await hashPassword('warehouse password fixture');
const config = loadConfig({
  NODE_ENV: 'test',
  TURSO_DATABASE_URL: databaseUrl,
  BOL_CLIENT_ID: 'synthetic-client',
  BOL_CLIENT_SECRET: 'synthetic-secret',
  WAREHOUSE_PASSWORD_HASH: passwordHash,
  SESSION_SECRET: 'synthetic-session-secret-with-at-least-32-bytes',
});
const databaseClient = createDatabaseClient({ url: config.databaseUrl, authToken: config.databaseToken });
const migrationSource = await readFile(join(root, 'migrations', '001_ampere_scanner.sql'), 'utf8');
await applyMigration({ client: databaseClient, source: migrationSource });
const application = createApplication({
  config,
  repository: new ScannerRepository(databaseClient),
  bolClient: new BolClient({
    clientId: config.bolClientId,
    clientSecret: config.bolClientSecret,
    nodeEnv: 'test',
    tokenUrl: `${origin}/__bol/token`,
    apiBaseUrl: `${origin}/__bol/api`,
  }),
  now: () => new Date('2026-08-05T10:00:00Z'),
});

const server = createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url || '/', origin);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  if (url.pathname.startsWith('/__bol/')) {
    handleSyntheticBol(request, response, url);
    return;
  }

  const apiName = url.pathname.match(/^\/api\/(session|state|retailer|scan)$/)?.[1];
  if (apiName) {
    await application[apiName](request, response);
    return;
  }

  const filePath = safePath(url.pathname);
  try {
    if (!filePath || !statSync(filePath).isFile()) throw new Error('not found');
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }

  response.writeHead(200, { ...staticHeaders, 'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream' });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Standalone scanner test server listening on ${origin}\n`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    databaseClient.close();
    await rm(temporaryDatabaseDirectory, { recursive: true, force: true });
    process.exit(0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown());
