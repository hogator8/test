import Papa from "papaparse";
import { MAX_CHOICES } from "@/lib/questions";

export interface RowError {
  row: number;
  message: string;
}

export interface ParsedQuestionRow {
  row: number;
  section_number: number;
  question_number: number;
  question_text: string;
  question_type: "multiple_choice" | "free_text";
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
  correct_answer: number | null;
  free_text_answer_1: string | null;
  free_text_answer_2: string | null;
  free_text_answer_3: string | null;
  free_text_answer_4: string | null;
  free_text_answer_5: string | null;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Column layout (0-indexed), matching the documented CSV format:
 * セクション番号,問題番号,問題文,選択肢1..10,正答,記述正答1..5
 */
export function parseQuestionCsv(rawText: string): {
  errors: RowError[];
  questions: ParsedQuestionRow[];
  parseError?: string;
} {
  const parsed = Papa.parse<string[]>(stripBom(rawText), { skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    return { errors: [], questions: [], parseError: parsed.errors[0].message };
  }

  const allRows = parsed.data;
  if (allRows.length === 0) {
    return { errors: [], questions: [], parseError: "CSVにデータがありません" };
  }

  // The first row is always a header row and is skipped.
  const rows = allRows.slice(1);
  if (rows.length === 0) {
    return { errors: [], questions: [], parseError: "CSVにヘッダー行以外のデータがありません" };
  }

  const errors: RowError[] = [];
  const seenPairs = new Map<string, number>();
  const questions: ParsedQuestionRow[] = [];

  rows.forEach((cols, idx) => {
    const rowNum = idx + 2; // +1 for 1-indexing, +1 more for the skipped header row
    const sectionRaw = (cols[0] ?? "").trim();
    const questionRaw = (cols[1] ?? "").trim();
    const questionText = (cols[2] ?? "").trim();
    const choices = Array.from({ length: MAX_CHOICES }, (_, i) => (cols[3 + i] ?? "").trim());
    const correctRaw = (cols[3 + MAX_CHOICES] ?? "").trim();
    const freeTextAnswers = Array.from({ length: 5 }, (_, i) => (cols[3 + MAX_CHOICES + 1 + i] ?? "").trim());

    const sectionNumber = Number(sectionRaw);
    const questionNumber = Number(questionRaw);

    if (!Number.isInteger(sectionNumber) || sectionNumber <= 0) {
      errors.push({ row: rowNum, message: "セクション番号は正の整数で入力してください" });
      return;
    }
    if (!Number.isInteger(questionNumber) || questionNumber <= 0) {
      errors.push({ row: rowNum, message: "問題番号は正の整数で入力してください" });
      return;
    }
    if (!questionText) {
      errors.push({ row: rowNum, message: "問題文が空です" });
      return;
    }

    const choiceCount = choices.filter((c) => c !== "").length;
    const hasFreeTextAnswer = freeTextAnswers[0] !== "";

    let questionType: "multiple_choice" | "free_text";
    let correctAnswer: number | null = null;

    if (choiceCount === 0 && hasFreeTextAnswer) {
      questionType = "free_text";
    } else if (choiceCount > 0) {
      questionType = "multiple_choice";
      if (choiceCount < 2) {
        errors.push({ row: rowNum, message: "選択肢は最低2つ入力してください" });
        return;
      }
      const correctAnswerNum = Number(correctRaw);
      if (!Number.isInteger(correctAnswerNum) || correctAnswerNum < 1 || correctAnswerNum > choiceCount) {
        errors.push({
          row: rowNum,
          message: `正答は選択肢の範囲内(1〜${choiceCount})で入力してください`,
        });
        return;
      }
      correctAnswer = correctAnswerNum;
    } else {
      errors.push({
        row: rowNum,
        message: "選択肢(最低2つ)または記述正答1のいずれかを入力してください",
      });
      return;
    }

    const pairKey = `${sectionNumber}-${questionNumber}`;
    if (seenPairs.has(pairKey)) {
      errors.push({
        row: rowNum,
        message: `セクション${sectionNumber}・問題${questionNumber}はCSV内の${seenPairs.get(
          pairKey
        )}行目と重複しています`,
      });
      return;
    }
    seenPairs.set(pairKey, rowNum);

    questions.push({
      row: rowNum,
      section_number: sectionNumber,
      question_number: questionNumber,
      question_text: questionText,
      question_type: questionType,
      choice_1: choices[0] || null,
      choice_2: choices[1] || null,
      choice_3: choices[2] || null,
      choice_4: choices[3] || null,
      choice_5: choices[4] || null,
      choice_6: choices[5] || null,
      choice_7: choices[6] || null,
      choice_8: choices[7] || null,
      choice_9: choices[8] || null,
      choice_10: choices[9] || null,
      correct_answer: correctAnswer,
      free_text_answer_1: questionType === "free_text" ? freeTextAnswers[0] || null : null,
      free_text_answer_2: questionType === "free_text" ? freeTextAnswers[1] || null : null,
      free_text_answer_3: questionType === "free_text" ? freeTextAnswers[2] || null : null,
      free_text_answer_4: questionType === "free_text" ? freeTextAnswers[3] || null : null,
      free_text_answer_5: questionType === "free_text" ? freeTextAnswers[4] || null : null,
    });
  });

  return { errors, questions };
}
