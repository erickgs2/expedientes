import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  heading: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  meta: { fontSize: 9, color: '#555555', marginBottom: 8 },
  // A4 is 842pt tall; the page padding (36 top + 36 bottom) and the first page's heading take
  // ~110pt. An uncapped full-width A4 scan is ~770pt tall and would spill onto a second sheet,
  // stranding the heading alone on the first — so the image is bounded to fit under the heading.
  image: { width: '100%', maxHeight: 700, objectFit: 'contain' },
});

export interface ConsentScanPagesProps {
  title: string;
  coversLabel: string;
  signedOnLabel: string;
  signedDate: string;
  treatmentTypeNames: string[];
  /** Already-read page images, in order; an unreadable page is simply absent. */
  images: Array<{ data: Buffer; format: 'jpg' | 'png' }>;
}

/** One A4 sheet per scanned page; the first carries the title and the letters the scan covers. */
export function ConsentScanPages(props: ConsentScanPagesProps) {
  return (
    <>
      {props.images.map((img, i) => (
        <Page key={i} size="A4" style={styles.page}>
          {i === 0 ? (
            <View>
              <Text style={styles.heading}>{props.title}</Text>
              <Text style={styles.meta}>
                {props.signedOnLabel} {props.signedDate} — {props.coversLabel}:{' '}
                {props.treatmentTypeNames.join(', ')}
              </Text>
            </View>
          ) : null}
          <Image style={styles.image} src={{ data: img.data, format: img.format }} />
        </Page>
      ))}
    </>
  );
}
