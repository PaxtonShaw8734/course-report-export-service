import { reportRequestSchema } from "./course_report.js";
import { exportCourseReport } from "./report_exporter.js";

const example = reportRequestSchema.parse({
  courseId: "algebra-101",
  courseTitle: "Algebra 101 delivery report",
  deadline: "2026-09-20T16:00:00+08:00",
  learners: [
    { learnerId: "learner-17", learnerName: "Avery Chen", submittedAt: "2026-09-20T15:42:00+08:00", score: 92 },
    { learnerId: "learner-24", learnerName: "Morgan Li", submittedAt: "2026-09-21T09:10:00+08:00", score: 78 },
    { learnerId: "learner-31", learnerName: "Riley Wu", submittedAt: null, score: null },
  ],
});

console.log(JSON.stringify(await exportCourseReport(example), null, 2));
