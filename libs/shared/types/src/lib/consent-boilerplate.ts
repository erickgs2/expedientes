/**
 * The reference wording for a consent's fixed legal text, taken from the clinic's paper
 * `CONSENTIMIENTO INFORMADO` form and extended with the revocation and clinical-photography
 * clauses the paper version lacks.
 *
 * Single source of truth on purpose: the database seed writes these as the initial values, and the
 * clinic settings screen shows them as field placeholders and offers to restore them. Keeping one
 * copy means the "suggested text" a user is shown can never drift from what a fresh install gets.
 *
 * Spanish only, with no `es`/`en` pair: a consent is always signed and printed in Spanish here
 * regardless of the interface language, so a translated variant would be text that never reaches
 * a document. These deliberately live outside the Transloco catalogs for a second reason — the
 * `{{...}}` markers below are consent placeholders resolved at signing time, and Transloco would
 * try to interpolate them out of any translation string it loaded.
 */

/** Resolved when a consent is signed. `{{clinicName}}` is also available in either declaration. */
export const CONSENT_PLACEHOLDER_KEYS = [
  'patientName',
  'doctorTitle',
  'doctorName',
  'doctorLicense',
  'clinicName',
] as const;

export const DEFAULT_DECLARATION_BEFORE = `YO {{patientName}}, EN MI CALIDAD DE PACIENTE, DECLARO SER MAYOR DE EDAD Y ENCONTRARME EN PLENO USO DE MIS FACULTADES MENTALES, POR LO QUE ES MI DESEO AUTORIZAR A {{doctorTitle}} {{doctorName}} CED {{doctorLicense}} A FIN DE QUE ME REALICE LOS SIGUIENTES PROCEDIMIENTOS:`;

export const DEFAULT_DECLARATION_AFTER = `MANIFIESTO QUE HE SIDO INFORMADO DEBIDAMENTE POR PARTE DE {{doctorTitle}} {{doctorName}} DE TODOS Y CADA UNO DE LOS POSIBLES RIESGOS Y COMPLICACIONES QUE IMPLICAN DICHO TRATAMIENTO Y PROCEDIMIENTOS A LOS CUALES AUTORIZO SOMETERME.

QUEDANDO ENTERADO DE DICHOS RIESGOS Y COMPLICACIONES, DECLARO ASIMISMO QUE SE ME HAN RESPONDIDO TODAS Y CADA UNA DE LAS DUDAS Y PREGUNTAS ACERCA DEL TRATAMIENTO Y PROCEDIMIENTOS A EFECTUARSE POR PARTE DE MI MEDICO TRATANTE.

ENTIENDO QUE PUEDO REVOCAR ESTE CONSENTIMIENTO EN CUALQUIER MOMENTO ANTES DE LA REALIZACION DEL PROCEDIMIENTO, SIN NECESIDAD DE EXPRESAR CAUSA Y SIN QUE ELLO AFECTE LA ATENCION QUE SE ME BRINDE.

AUTORIZO LA TOMA DE FOTOGRAFIAS CLINICAS ANTES, DURANTE Y DESPUES DEL PROCEDIMIENTO, PARA SU RESGUARDO EN MI EXPEDIENTE Y PARA EL SEGUIMIENTO DE MI TRATAMIENTO. ESTAS IMAGENES NO SERAN DIVULGADAS NI UTILIZADAS CON FINES DISTINTOS SIN MI AUTORIZACION EXPRESA Y POR ESCRITO.

TRAS CONSIDERAR TODAS Y CADA UNA DE LAS MANIFESTACIONES MENCIONADAS, ENTIENDO Y ACEPTO QUE ES MI DESEO, POR ASI CONVENIR A MIS INTERESES LEGALES Y SIN COACCION ALGUNA, RENUNCIAR A CUALQUIER ACCION JURIDICA CONTRA EL MEDICO TRATANTE.`;

/**
 * Shown as field placeholders on the treatment-type form. These are worked examples rather than
 * defaults — nothing writes them to the database, because the content is specific to each
 * procedure. They exist so the person filling the form can see the depth of detail each section
 * is meant to carry; a consent's legal weight rests mainly on the risks and alternatives being
 * concrete rather than generic.
 */
export const CONSENT_SECTION_EXAMPLES = {
  description: `Describa el procedimiento en los términos en que se le explicará al paciente: en qué consiste, qué producto o técnica se emplea, zonas a tratar, número de sesiones previstas y duración aproximada.

Ejemplo: Aplicación de toxina botulínica tipo A mediante microinyecciones en el tercio superior del rostro (entrecejo, frente y área periocular), en una sesión de aproximadamente 30 minutos. El efecto es visible entre el tercer y séptimo día y su duración estimada es de 4 a 6 meses.`,

  risks: `Enumere los riesgos y complicaciones posibles, incluidos los poco frecuentes pero graves. Sea concreto: un listado genérico debilita el valor legal del consentimiento.

Ejemplo: Dolor, enrojecimiento, inflamación o hematoma en los sitios de punción. Cefalea transitoria. Asimetría facial o ptosis (caída) temporal de la ceja o el párpado. Reacción alérgica al producto. De forma infrecuente, difusión del producto a músculos vecinos con debilidad muscular pasajera.`,

  alternatives: `Indique qué otras opciones existen, incluida la de no realizar ningún tratamiento, para que la decisión del paciente sea informada.

Ejemplo: No realizar tratamiento alguno. Manejo con cosmecéuticos tópicos. Rellenos de ácido hialurónico. Procedimientos con láser o radiofrecuencia. Cirugía estética. Cada alternativa tiene resultados, riesgos y costos distintos.`,

  aftercare: `Describa las indicaciones posteriores que el paciente debe seguir y las señales de alarma por las que debe comunicarse con la clínica.

Ejemplo: No frotar ni masajear la zona tratada durante 24 horas. Permanecer en posición vertical las primeras 4 horas. Evitar ejercicio intenso, sauna y exposición solar directa por 48 horas. Acudir de inmediato ante dificultad para tragar o respirar, o visión doble.`,

  contraindications: `Señale en qué casos el procedimiento no debe realizarse, y lo que el paciente debe declarar antes de la aplicación.

Ejemplo: Embarazo o lactancia. Enfermedades neuromusculares (miastenia gravis, síndrome de Eaton-Lambert). Infección activa en la zona a tratar. Alergia conocida a la toxina botulínica o a la albúmina. Tratamiento con aminoglucósidos.`,
} as const;
