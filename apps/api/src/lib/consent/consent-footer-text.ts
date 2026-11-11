export interface ConsentFooterParts {
  patientName: string;
  signedOn: string;
  pageLabel: (n: number, total: number) => string;
}

/** The running footer line; a letter with no date yet (printed for paper signing) skips that segment. */
export function consentFooterText(footer: ConsentFooterParts, n: number, total: number): string {
  return [footer.patientName, footer.signedOn, footer.pageLabel(n, total)]
    .filter((part) => part)
    .join(' — ');
}
