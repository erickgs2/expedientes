# Cartas de consentimiento firmadas en papel — diseño

Fecha: 2026-11-11

## Objetivo

Cuando el médico o el paciente no pueden firmar digitalmente, el doctor debe poder (1) imprimir cada carta de consentimiento sin firmas, firmarla a mano, y (2) subir el escaneo de las cartas firmadas para conservar el registro digital. La firma digital actual no cambia.

## Alcance

Incluido:
- Impresión individual (una carta por PDF) sin firmas, solo para cartas aún no firmadas.
- Registro de un escaneo (una o varias páginas, JPG/PNG) que cubre una o varias cartas de la misma visita.
- Anexo de cartas del export del expediente: las cartas en papel muestran las imágenes del escaneo.
- Vista de la carta: muestra el escaneo cuando la firma fue en papel.

Fuera de alcance: subir PDF, OCR, reemplazar o borrar un escaneo registrado, cambios al export del expediente sin firma (el expediente en sí no lleva firmas), impresión agrupada.

## Modelo de datos (migración compatible hacia atrás)

- Nuevo enum `ConsentSignatureMethod { DIGITAL, PAPER }`.
- Nuevo `ConsentScan`: `id`, `patientId`, `signedDate` (string, mismo formato que `signedDateSnapshot`), `createdAt`, `pages`.
- Nuevo `ConsentScanPage`: `id`, `scanId` (cascade), `position`, `filePath`, `@@unique([scanId, position])`.
- `Consent`: `signatureMethod` (default `DIGITAL`), `scanId` opcional (FK a `ConsentScan`), `patientSignatureImagePath` pasa a opcional.
- Invariante con `CHECK` en la migración SQL y validación en código: `DIGITAL` ⇒ `patientSignatureImagePath` no nulo y `scanId` nulo; `PAPER` ⇒ `scanId` no nulo y `patientSignatureImagePath` nulo. Los registros existentes quedan como `DIGITAL`.

## API

### `GET /api/treatment-items/[id]/consent/print`
- Permiso `treatments:view`; escribe auditoría.
- 404 si el ítem no existe; 409 si ya tiene carta firmada o falta la identidad de la clínica (`canSign` falso).
- Renderiza `consentPreview` con `ConsentPage` y todas las firmas vacías (paciente, médico, testigo). Responde `application/pdf` como descarga. No crea registros.
- La fecha impresa se deja en blanco para llenarse a mano; al registrar el escaneo se captura la fecha real.

### `POST /api/treatments/[id]/consent-scan`
- Permiso `treatments:edit`; multipart: `itemIds[]`, `signedDate`, `place`, `patientIdentification`, `witnessName` (opcional), `pages` (imágenes, en orden).
- Validaciones: todos los `itemIds` pertenecen al tratamiento `[id]`; ninguno tiene `Consent`; al menos una página; tope de páginas y de tamaño por imagen (mismo estilo que `MAX_*` de la ruta de firma); JPG/PNG verificados por bytes con `isJpeg`/`isPng`, nunca por content-type; `place` y `patientIdentification` con los mismos límites de longitud que la firma digital.
- Una transacción crea `ConsentScan`, sus páginas y un `Consent` `PAPER` por carta. Los snapshots (clínica, médico, declaraciones interpoladas, secciones del catálogo, lugar, fecha) usan el mismo helper que la firma digital, extraído de `signTreatmentItemConsent` para no duplicar la lógica.
- Doble registro concurrente: `treatmentItemId @unique` lo detiene (409 vía `withApiErrors`). Si la transacción falla, se eliminan los archivos ya guardados.
- Escribe auditoría.
- Riesgo conocido: si el catálogo o los ajustes de la clínica cambian entre la impresión y el registro, el snapshot puede diferir del texto impreso. El escaneo firmado es la evidencia; se acepta.

## Efectos colaterales que la spec original omitía

- **Servido de archivos:** `/api/files/[...path]` solo renderiza JPEG en línea; un PNG se descargaría. Se amplía a JPEG y PNG, siempre decidido por magic bytes (`inlineImageType`), con los mismos headers de aislamiento.
- **Borrado de paciente:** `deletePatient` debe borrar también `ConsentScan` (las páginas caen en cascada) y los archivos de sus páginas, después de borrar los `Consent` que los referencian.
- **Descarga del PDF en web:** `deliverPdf`/`isDesktopBrowser` son privados de `ExportComponent`; se extraen a una util compartida para reutilizarlos al imprimir la carta.
- **Pie de página:** la carta en blanco no tiene fecha de firma; el pie omite ese segmento en vez de dejar un separador vacío.

## Exportación del expediente

- `gather-export-data` expone, para cartas `PAPER`, el `scanId` y las rutas de las páginas.
- `build-pdf` incrusta cada escaneo una sola vez, tras la primera carta que cubre, con el listado de las cartas que ampara. Las cartas `DIGITAL` no cambian. Un archivo ilegible no falla el export: se omite con aviso, como hoy con las firmas.
- `getTreatmentItemDetail` devuelve `signatureMethod` y las páginas del escaneo; los tipos compartidos se actualizan.

## UI (Angular)

- Detalle del tratamiento: junto a "Firmar" en cada ítem pendiente, botón "Imprimir sin firma". Botón "Registrar escaneo firmado" para la visita, que abre un diálogo con las cartas pendientes marcadas por defecto, fecha (hoy), lugar, identificación, testigo opcional y selector de imágenes (con cámara en móvil).
- Pantalla de la carta: botón "Imprimir sin firma" si está pendiente; si es `PAPER`, muestra las páginas del escaneo en lugar de las firmas. La insignia de bloqueo aplica igual.
- Textos nuevos en `es` y `en`.

## Pruebas

- Unitarias: PDF en blanco (sin imágenes de firma), validaciones del escaneo, anexo con escaneo (incrustado una vez), helper de snapshot compartido.
- Ruta de escaneo: carta ya firmada, carta de otro tratamiento, archivo que no es imagen, sin páginas, éxito con varias cartas.
- Regresión: el flujo de firma digital y el export de cartas `DIGITAL` no cambian.
