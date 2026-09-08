export const MAX_CHOICES = 10;

export type QuestionType = "multiple_choice" | "free_text";

export interface ChoiceSource {
  choice_1: string | null;
  choice_2: string | null;
  choice_3: string | null;
  choice_4: string | null;
  choice_5: string | null;
  choice_6: string | null;
  choice_7: string | null;
  choice_8: string | null;
  choice_9: string | null;
  choice_10: string | null;
}

/** All 10 choice column values in order (null/empty for unused slots). */
export function choiceValues(q: ChoiceSource): (string | null)[] {
  return [
    q.choice_1,
    q.choice_2,
    q.choice_3,
    q.choice_4,
    q.choice_5,
    q.choice_6,
    q.choice_7,
    q.choice_8,
    q.choice_9,
    q.choice_10,
  ];
}

export function choiceCount(q: ChoiceSource): number {
  return choiceValues(q).filter((c) => c !== null && c !== "").length;
}

/** {index, text} pairs for the choices actually in use (1-indexed, skips empty slots). */
export function buildChoices(q: ChoiceSource): { index: number; text: string }[] {
  return choiceValues(q)
    .map((text, i) => ({ index: i + 1, text }))
    .filter((c): c is { index: number; text: string } => c.text !== null && c.text !== "");
}

export const SELECT_QUESTION_COLUMNS =
  "id, test_id, section_number, question_number, points, question_text, question_type, " +
  "choice_1, choice_2, choice_3, choice_4, choice_5, choice_6, choice_7, choice_8, choice_9, choice_10, " +
  "correct_answer, free_text_answer_1, free_text_answer_2, free_text_answer_3, free_text_answer_4, free_text_answer_5";

export interface QuestionRow extends ChoiceSource {
  id: string;
  test_id: string;
  section_number: number;
  question_number: number;
  points: number;
  question_text: string;
  question_type: QuestionType;
  correct_answer: number | null;
  free_text_answer_1: string | null;
  free_text_answer_2: string | null;
  free_text_answer_3: string | null;
  free_text_answer_4: string | null;
  free_text_answer_5: string | null;
}
