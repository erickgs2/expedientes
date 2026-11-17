// Load test for the MedCloud pilot server: how many clinics can work at the same time before the
// app slows down noticeably.
//
// Each virtual user (VU) is one person working in a clinic: they open the day's desk, search a
// patient, open their record, look at photos and treatments, pausing 20–30 s between screens like
// someone with a patient in front of them. An active clinic is counted as 1.5 people working at once.
// A second, slower scenario exports a full record as PDF now and then, the heaviest request the app
// serves.
//
// Run it from another computer (not from the server itself, which would steal its CPU), once per
// level, and compare the results:
//
//   docker run --rm -i -v "$PWD/tools/loadtest:/scripts" \
//     -e BASE_URL=https://medcloud.intech-erp.com -e EMAIL=... -e PASSWORD=... -e CLINICS=5 \
//     grafana/k6 run /scripts/clinic-load.js
//
// Medium slowdown, as defined in the plan: screens slower than 1 s at the 95th percentile, or a
// failure rate above 1%. The thresholds below mark exactly that.
//
// It only reads, except for the PDF exports (which write an audit entry). Run it against fictional
// data (prisma/seed-demo.ts), never against a database with real patients.

import http from 'k6/http';
import { check, sleep, fail } from 'k6';

const BASE = (__ENV.BASE_URL || 'https://medcloud.intech-erp.com').replace(/\/$/, '');
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;
const CLINICS = Number(__ENV.CLINICS || 5);
const PEOPLE = Math.max(1, Math.round(CLINICS * 1.5));
// One export every N minutes across the whole test (default 2).
const EXPORT_EVERY_MIN = Number(__ENV.EXPORT_EVERY_MIN || 2);

export const options = {
  scenarios: {
    consulta: {
      executor: 'ramping-vus',
      exec: 'consulta',
      startVUs: 0,
      stages: [
        { duration: '1m', target: PEOPLE },
        { duration: '6m', target: PEOPLE },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
    exportaciones: {
      executor: 'constant-arrival-rate',
      exec: 'exportPdf',
      rate: 1,
      timeUnit: `${EXPORT_EVERY_MIN}m`,
      startTime: '1m',
      duration: '6m',
      preAllocatedVUs: 2,
    },
  },
  thresholds: {
    'http_req_duration{kind:screen}': ['p(95)<1000'],
    'http_req_failed{kind:screen}': ['rate<0.01'],
    // Reported, not judged: a PDF is expected to take seconds.
    'http_req_duration{kind:export}': ['p(95)<300000'],
  },
  summaryTrendStats: ['med', 'p(90)', 'p(95)', 'max'],
};

function login() {
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { kind: 'login', name: 'login' },
  });
  if (res.status !== 200) fail(`login failed with ${res.status}: check EMAIL and PASSWORD`);
}

export function setup() {
  if (!EMAIL || !PASSWORD) fail('EMAIL and PASSWORD are required');
  login();
  const res = http.get(`${BASE}/api/patients?q=`, { tags: { kind: 'setup', name: 'patients' } });
  const patients = res.status === 200 ? res.json('patients') || [] : [];
  if (!patients.length) fail('no patients found: load fictional data first (prisma/seed-demo.ts)');
  return { patients: patients.map((p) => ({ id: p.id, name: p.fullName })) };
}

let loggedIn = false;

function screen(name, path) {
  const res = http.get(`${BASE}${path}`, { tags: { kind: 'screen', name } });
  check(res, { [`${name} ok`]: (r) => r.status === 200 || r.status === 404 });
  return res;
}

function think() {
  sleep(20 + Math.random() * 10);
}

export function consulta(data) {
  if (!loggedIn) {
    login();
    loggedIn = true;
  }
  const patient = data.patients[Math.floor(Math.random() * data.patients.length)];

  // The day's desk
  screen('today', '/api/today');
  screen('recent', '/api/patients/recent');
  think();

  // Searching a patient by the first letters of their name
  screen('search', `/api/patients?q=${encodeURIComponent((patient.name || 'a').slice(0, 3))}`);
  think();

  // Their record
  screen('summary', `/api/patients/${patient.id}/summary`);
  screen('timeline', `/api/patients/${patient.id}/timeline`);
  think();

  // Photos: the list, then the thumbnails a gallery shows
  const photosRes = screen('photos', `/api/patients/${patient.id}/photos`);
  const photos = photosRes.status === 200 ? photosRes.json('photos') || [] : [];
  for (const photo of photos.slice(0, 8)) {
    screen('thumbnail', `/api/files/${photo.filePath}?thumb=1`);
  }
  think();

  // Clinical sections
  screen('treatments', `/api/patients/${patient.id}/treatments`);
  screen('valoracion', `/api/patients/${patient.id}/valoracion`);
  screen('historia', `/api/patients/${patient.id}/historia-clinica`);
  think();
}

export function exportPdf(data) {
  login();
  const patient = data.patients[Math.floor(Math.random() * data.patients.length)];
  const res = http.post(
    `${BASE}/api/patients/${patient.id}/export`,
    {
      modules: JSON.stringify({ historiaClinica: true, valoracion: true, treatments: true, consents: true }),
      language: 'es',
    },
    { tags: { kind: 'export', name: 'export' }, timeout: '300s' }
  );
  check(res, { 'export ok': (r) => r.status === 200 });
}
