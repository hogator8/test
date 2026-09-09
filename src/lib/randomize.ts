import { buildChoices, type ChoiceSource, type QuestionType } from "@/lib/questions";

/** Fisher-Yates shuffle - returns a new array, does not mutate the input. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface QuestionForOrder {
  id: string;
  section_number: number;
  question_number: number;
}

/**
 * Builds the flat display order (question ids) for a session: sections
 * always ascend by section_number, and questions within each section are
 * either shuffled (randomize=true) or left in question_number order. Since
 * every section's questions are placed contiguously either way, a consumer
 * can reconstruct correct section grouping just by walking this array in
 * order.
 */
export function generateQuestionOrder(questions: QuestionForOrder[], randomize: boolean): string[] {
  const bySection = new Map<number, QuestionForOrder[]>();
  for (const q of questions) {
    if (!bySection.has(q.section_number)) bySection.set(q.section_number, []);
    bySection.get(q.section_number)!.push(q);
  }
  const sectionNumbers = Array.from(bySection.keys()).sort((a, b) => a - b);
  const order: string[] = [];
  for (const sectionNumber of sectionNumbers) {
    const qs = [...bySection.get(sectionNumber)!].sort((a, b) => a.question_number - b.question_number);
    const ordered = randomize ? shuffle(qs) : qs;
    order.push(...ordered.map((q) => q.id));
  }
  return order;
}

/**
 * Builds per-question choice display orders: question id -> the original
 * (1-based) choice indices in display order. Free-text questions are
 * skipped entirely (choice order is meaningless for them).
 */
export function generateChoiceOrders(
  questions: (ChoiceSource & { id: string; question_type: QuestionType })[],
  randomize: boolean
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const q of questions) {
    if (q.question_type !== "multiple_choice") continue;
    const indices = buildChoices(q).map((c) => c.index);
    result[q.id] = randomize ? shuffle(indices) : indices;
  }
  return result;
}

/**
 * Reorders `questions` per a stored question_order (question ids in display
 * order). Falls back to natural section/question_number order when no
 * stored order exists, and appends any question missing from the stored
 * order (e.g. added to the test after this session's order was generated)
 * at the end so nothing silently disappears.
 */
export function applyQuestionOrder<T extends { id: string; section_number: number; question_number: number }>(
  questions: T[],
  orderIds: string[] | null | undefined
): T[] {
  const naturalOrder = (a: T, b: T) => a.section_number - b.section_number || a.question_number - b.question_number;
  if (!orderIds || orderIds.length === 0) {
    return [...questions].sort(naturalOrder);
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered: T[] = [];
  for (const id of orderIds) {
    const q = byId.get(id);
    if (q) {
      ordered.push(q);
      byId.delete(id);
    }
  }
  const remaining = Array.from(byId.values()).sort(naturalOrder);
  return [...ordered, ...remaining];
}

/**
 * Reorders a question's already-built {index, text} choices per a stored
 * choice order (original 1-based indices in display order). Falls back to
 * the given order when no stored order exists for this question, and
 * appends any choice missing from the stored order (e.g. a choice added via
 * CSV re-upload after this session's order was generated) at the end.
 */
export function applyChoiceOrder(
  choices: { index: number; text: string }[],
  order: number[] | null | undefined
): { index: number; text: string }[] {
  if (!order || order.length === 0) return choices;
  const byIndex = new Map(choices.map((c) => [c.index, c]));
  const ordered: { index: number; text: string }[] = [];
  for (const index of order) {
    const c = byIndex.get(index);
    if (c) {
      ordered.push(c);
      byIndex.delete(index);
    }
  }
  return [...ordered, ...Array.from(byIndex.values())];
}
