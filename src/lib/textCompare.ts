/** Trim + Unicode NFKC normalize (collapses full-width/half-width variants) + lowercase. */
export function normalizeAnswer(s: string): string {
  return s.trim().normalize("NFKC").toLowerCase();
}

/** True if the student's free-text response exactly matches any of the accepted answers, after normalization. */
export function isFreeTextCorrect(response: string, acceptedAnswers: (string | null)[]): boolean {
  const normalizedResponse = normalizeAnswer(response);
  if (!normalizedResponse) return false;
  return acceptedAnswers.some((a) => a !== null && a !== "" && normalizeAnswer(a) === normalizedResponse);
}
