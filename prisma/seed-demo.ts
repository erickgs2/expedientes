/* Fictional demo data for tests and promo footage. Resumable: reuses rows already inserted.
 * Run: npx tsx prisma/seed-demo.ts */
import { PrismaClient } from '@prisma/client';
import { deflateSync } from 'zlib';
import { resolve } from 'path';
import { saveFile } from '../apps/api/src/lib/storage/file-storage';
import {
  DEFAULT_DECLARATION_BEFORE,
  DEFAULT_DECLARATION_AFTER,
} from '../libs/shared/types/src/lib/consent-boilerplate';

const prisma = new PrismaClient();
const day = (offset: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
};

const TYPES = [
  ['Toxina botulínica', 'Aplicación de toxina botulínica tipo A para suavizar arrugas de expresión.', 'Hematomas, cefalea, asimetría transitoria, ptosis palpebral.', 'Rellenos, láser fraccionado, peelings.', 'Evitar ejercicio intenso y masajes en la zona durante 24 h.', 'Embarazo, lactancia, enfermedades neuromusculares.'],
  ['Ácido hialurónico (labios)', 'Aplicación de ácido hialurónico para dar volumen e hidratación a los labios.', 'Inflamación, hematomas, nódulos, reacción alérgica.', 'Hidratación labial, lipotransferencia.', 'No aplicar calor ni maquillaje 24 h; evitar besos y ejercicio 48 h.', 'Herpes activo, embarazo, alergia al producto.'],
  ['Bioestimulación con hilos', 'Colocación de hilos de PDO para tensar y estimular colágeno.', 'Edema, hematomas, asimetría, extrusión del hilo.', 'Radiofrecuencia, ultrasonido focalizado.', 'Dormir boca arriba 2 semanas; evitar gestos amplios.', 'Infección activa, enfermedades autoinmunes.'],
  ['Peeling químico', 'Aplicación de agentes exfoliantes para renovar la piel.', 'Enrojecimiento, descamación, hiperpigmentación.', 'Microdermoabrasión, láser.', 'Fotoprotección estricta y no manipular la piel.', 'Isotretinoína reciente, piel lesionada, embarazo.'],
  ['Plasma rico en plaquetas', 'Infiltración de plasma autólogo para rejuvenecimiento facial.', 'Dolor leve, equimosis, edema transitorio.', 'Mesoterapia, bioestimuladores.', 'Evitar sol y maquillaje por 12 h.', 'Trastornos de coagulación, anticoagulantes.'],
];
/** Transparent PNG with a hand-drawn-looking scribble, standing in for a patient's signature. */
function signaturePng(): Buffer {
  const w = 300, h = 100;
  const px = Buffer.alloc(h * (w * 4 + 1));
  for (let x = 20; x < 280; x++) {
    const y = Math.round(50 + 22 * Math.sin(x / 11) * Math.cos(x / 53));
    for (let dy = -1; dy <= 1; dy++) {
      const o = (y + dy) * (w * 4 + 1) + 1 + x * 4;
      px[o] = 20; px[o + 1] = 30; px[o + 2] = 120; px[o + 3] = 255;
    }
  }
  const crc = (b: Buffer) => { let c, t = ~0; for (const v of b) { c = (t ^ v) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return ~t >>> 0; };
  const chunk = (type: string, data: Buffer) => { const b = Buffer.concat([Buffer.from(type), data]); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b)); return Buffer.concat([l, b, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}

const ALLERGIES = ['Penicilina', 'Látex', 'Lidocaína', 'Ácido hialurónico', 'Yodo'];

const P = [
  ['Valeria Montoya Ríos', '5512345001', 'F', '1988-03-14', 'Arquitecta', 'Rejuvenecer la frente sin perder expresión', ['Penicilina']],
  ['Daniela Fuentes Herrera', '5512345002', 'F', '1992-07-02', 'Abogada', 'Dar volumen a los labios', []],
  ['Mariana Quintero Salas', '5512345003', 'F', '1979-11-23', 'Empresaria', 'Tensar el óvalo facial', ['Látex']],
  ['Sofía Beltrán Cruz', '5512345004', 'F', '1995-01-30', 'Diseñadora', 'Mejorar manchas y textura', []],
  ['Camila Ortega Vidal', '5512345005', 'F', '1984-09-09', 'Médica', 'Suavizar líneas de expresión', ['Lidocaína']],
  ['Renata Aguilar Pons', '5512345006', 'F', '1990-05-18', 'Maestra', 'Hidratación y luminosidad', []],
  ['Isabela Cordero Luna', '', 'F', '2001-12-05', 'Estudiante', 'Perfilar labios (acompañada de su mamá)', []],
  ['Lucía Paredes Ibarra', '5512345008', 'F', '1975-04-27', 'Contadora', 'Rejuvenecimiento global', ['Yodo', 'Ácido hialurónico']],
  ['Andrea Salgado Reyes', '5512345009', 'F', '1987-08-11', 'Chef', 'Reducir ojeras', []],
  ['Fernanda Lozano Mejía', '5512345010', 'F', '1993-02-20', 'Periodista', 'Corregir asimetría suave', []],
] as const;

async function main() {
  process.env.STORAGE_ROOT = resolve(__dirname, '../apps/api/storage');
  await prisma.clinicSettings.upsert({
    where: { id: 'singleton' },
    update: { clinicName: 'Clínica Demo Estética', defaultPlace: 'Ciudad de México', doctorTitle: 'Dra.', doctorName: 'Ana Demo Ficticia', doctorLicense: '00000000' },
    create: { clinicName: 'Clínica Demo Estética', defaultPlace: 'Ciudad de México', doctorTitle: 'Dra.', doctorName: 'Ana Demo Ficticia', doctorLicense: '00000000', declarationBefore: DEFAULT_DECLARATION_BEFORE, declarationAfter: DEFAULT_DECLARATION_AFTER },
  });
  const settings = await prisma.clinicSettings.findUniqueOrThrow({ where: { id: 'singleton' } });

  const types = [];
  for (const [name, consentDescription, consentRisks, consentAlternatives, consentAftercare, consentContraindications] of TYPES) {
    types.push((await prisma.treatmentType.findFirst({ where: { name } })) ?? await prisma.treatmentType.create({ data: { name, consentDescription, consentRisks, consentAlternatives, consentAftercare, consentContraindications } }));
  }
  const allergies: Record<string, string> = {};
  for (const name of ALLERGIES) allergies[name] = (await prisma.allergy.upsert({ where: { name }, update: {}, create: { name } })).id;

  const patients: string[] = [];
  for (const [i, [fullName, phone, sexo, born, ocupacion, quiere, alg]] of P.entries()) {
    const existing = await prisma.patient.findFirst({ where: { documentId: `DEMO-${1000 + i}` } });
    if (existing) { patients.push(existing.id); continue; }
    const p = await prisma.patient.create({
      data: {
        fullName, phone, documentId: `DEMO-${1000 + i}`,
        historiaClinica: {
          create: {
            ocupacion, sexo, fechaNacimiento: new Date(born), queQuiereElPaciente: quiere,
            queNecesitaElPaciente: 'Plan gradual y natural, con seguimiento',
            atributosEmocionales: 'Motivada, busca verse descansada',
            enfermedadesActuales: i % 4 === 0 ? 'Hipotiroidismo controlado' : 'Ninguna',
            medicamentosAcne3Meses: 'No', cirugiasEsteticasAnteriores: i === 7 ? 'Blefaroplastia (2019)' : 'Ninguna',
            rutinaCuidadoFacial: 'Limpieza, hidratante y protector solar',
            consumoAlcohol: 'Social', consumoTabaco: 'No', consumoDrogas: 'No',
            tipoFrecuenciaEjercicio: '3 veces por semana', vacunas: 'Esquema completo',
            posibilidadEmbarazo: 'No', antecedentesHeredofamiliares: 'Diabetes (abuela materna)',
            allergies: { create: alg.map((n) => ({ allergyId: allergies[n] })) },
          },
        },
      },
    });
    patients.push(p.id);
  }
  // Isabela (index 6) is a companion patient: notices go to Lucía's number... use Daniela (index 1).
  await prisma.patient.update({ where: { id: patients[6] }, data: { contactPatientId: patients[1] } });

  // Valoraciones for the first 8 patients.
  for (let i = 0; i < 8; i++) {
    if (await prisma.valoracion.count({ where: { patientId: patients[i] } })) continue;
    await prisma.valoracion.create({
      data: { patientId: patients[i], fecha: day(-30 - i, 11), queQuiereElPaciente: P[i][5], queNecesitaElPaciente: 'Tratamiento escalonado', notas: 'Piel con buena respuesta; se explican alcances y expectativas.' },
    });
  }

  // Treatments with product traceability and signed consents for the first 6 patients.
  const brands = [['Botox', 'A1234B'], ['Juvéderm Volbella', 'HV5521'], ['Silhouette Soft', 'SS9087'], ['Neostrata', 'PQ3310'], ['Regenlab PRP', 'RL7712'], ['Dysport', 'DY2204']];
  for (let i = 0; i < 6; i++) {
    const type = types[i % types.length];
    let t = await prisma.treatment.findFirst({ where: { patientId: patients[i] }, include: { items: true } });
    t ??= await prisma.treatment.create({
      data: {
        patientId: patients[i], fecha: day(-14 - i, 12),
        items: {
          create: {
            treatmentTypeId: type.id, notes: 'Procedimiento sin incidentes. Se indican cuidados posteriores.',
            products: { create: { patientId: patients[i], brand: brands[i][0], lotNumber: brands[i][1], expiryDate: new Date(Date.UTC(2027, 5 + (i % 6), 30)) } },
          },
        },
      },
      include: { items: true },
    });
    if (await prisma.consent.count({ where: { treatmentItemId: t.items[0].id } })) continue;
    const sig = await saveFile(signaturePng(), 'signatures', patients[i], 'firma.png');
    await prisma.consent.create({
      data: {
        patientSignatureImagePath: sig, treatmentItemId: t.items[0].id, place: settings.defaultPlace, signedDateSnapshot: day(-14 - i, 12).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
        patientNameSnapshot: P[i][0], patientIdentification: `DEMO-${1000 + i}`, clinicNameSnapshot: settings.clinicName,
        doctorTitleSnapshot: settings.doctorTitle, doctorNameSnapshot: settings.doctorName, doctorLicenseSnapshot: settings.doctorLicense,
        declarationBeforeSnapshot: settings.declarationBefore, declarationAfterSnapshot: settings.declarationAfter,
        sections: [
          { key: 'description', body: type.consentDescription }, { key: 'risks', body: type.consentRisks },
          { key: 'alternatives', body: type.consentAlternatives }, { key: 'aftercare', body: type.consentAftercare },
          { key: 'contraindications', body: type.consentContraindications },
        ],
        signedAt: day(-14 - i, 12),
      },
    });
  }

  // Today's agenda (+ a few upcoming), mixed statuses.
  const slots: Array<[number, number, number, number, 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED', number, boolean]> = [
    [0, 9, 0, 30, 'COMPLETED', 0, true], [0, 10, 30, 45, 'CONFIRMED', 1, true], [0, 12, 0, 60, 'CONFIRMED', 2, true],
    [0, 13, 30, 30, 'SCHEDULED', 6, false], [0, 16, 0, 45, 'SCHEDULED', 4, false], [0, 17, 30, 30, 'CONFIRMED', 7, true],
    [1, 10, 0, 60, 'SCHEDULED', 3, false], [2, 11, 0, 45, 'CONFIRMED', 5, true], [3, 15, 0, 30, 'SCHEDULED', 8, false], [4, 12, 0, 45, 'SCHEDULED', 9, false],
  ];
  if (await prisma.appointment.count({ where: { patientId: { in: patients } } })) { console.log('Appointments already present.'); return; }
  for (const [off, h, m, dur, status, pi, conf] of slots) {
    await prisma.appointment.create({
      data: {
        patientId: patients[pi], startTime: day(off, h, m), durationMinutes: dur, status,
        confirmationSentAt: conf ? day(-1, 9) : null, arrivedAt: status === 'COMPLETED' ? day(off, h, m) : null,
        treatmentTypes: { create: { treatmentTypeId: types[pi % types.length].id } },
      },
    });
  }
  console.log('Demo data inserted: 10 patients, 5 treatment types, 6 consents, 10 appointments.');
}
main().finally(() => prisma.$disconnect());
