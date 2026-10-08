import assert from "node:assert/strict";
import test from "node:test";
import { buildReportRows, reportRequestSchema, rowsToCsv } from "../src/course_report.js";

test("classifies submissions against the course deadline and quotes educator CSV fields", () => {
  const input = reportRequestSchema.parse({
    courseId: "writing-204",
    courseTitle: "Writing 204",
    deadline: "2026-09-20T16:00:00Z",
    learners: [
      { learnerId: "l-1", learnerName: "Ng, Sam", submittedAt: "2026-09-20T16:00:00Z", score: 88 },
      { learnerId: "l-2", learnerName: "Dee", submittedAt: "2026-09-20T16:00:01Z", score: 71 },
      { learnerId: "l-3", learnerName: "Kai", submittedAt: null, score: null },
    ],
  });
  const rows = buildReportRows(input);
  assert.deepEqual(rows.map((row) => row.delivery_status), ["on_time", "overdue", "not_submitted"]);
  assert.match(rowsToCsv(rows), /l-1,"Ng, Sam"/);
});
