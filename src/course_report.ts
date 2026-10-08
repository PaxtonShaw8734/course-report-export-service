import { z } from "zod";

export const reportRequestSchema = z.object({
  courseId: z.string().min(1),
  courseTitle: z.string().min(1),
  deadline: z.string().datetime({ offset: true }),
  learners: z.array(z.object({
    learnerId: z.string().min(1),
    learnerName: z.string().min(1),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    score: z.number().min(0).max(100).nullable(),
  })).min(1),
});

export type ReportRequest = z.infer<typeof reportRequestSchema>;
export type DeliveryStatus = "on_time" | "overdue" | "not_submitted";

export type ReportRow = {
  course_id: string;
  learner_id: string;
  learner_name: string;
  deadline: string;
  submitted_at: string;
  delivery_status: DeliveryStatus;
  score: string;
};

export function deliveryStatus(deadline: string, submittedAt: string | null): DeliveryStatus {
  if (submittedAt === null) return "not_submitted";
  return Date.parse(submittedAt) <= Date.parse(deadline) ? "on_time" : "overdue";
}

export function buildReportRows(input: ReportRequest): ReportRow[] {
  return input.learners.map((learner) => ({
    course_id: input.courseId,
    learner_id: learner.learnerId,
    learner_name: learner.learnerName,
    deadline: input.deadline,
    submitted_at: learner.submittedAt ?? "",
    delivery_status: deliveryStatus(input.deadline, learner.submittedAt),
    score: learner.score === null ? "" : String(learner.score),
  }));
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function rowsToCsv(rows: ReportRow[]): string {
  const columns: Array<keyof ReportRow> = [
    "course_id", "learner_id", "learner_name", "deadline", "submitted_at", "delivery_status", "score",
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
}

export function rowsToMarkdown(courseTitle: string, rows: ReportRow[]): string {
  const lines = rows.map((row) =>
    `| ${row.learner_name.replaceAll("|", "\\|")} | ${row.delivery_status} | ${row.score || "-"} |`,
  );
  return [`# ${courseTitle}`, "", "| Learner | Delivery | Score |", "| --- | --- | ---: |", ...lines].join("\n");
}
