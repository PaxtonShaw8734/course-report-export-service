import { createHash } from "node:crypto";
import { infrai } from "./infrai.js";
import { buildReportRows, rowsToCsv, rowsToMarkdown, type ReportRequest } from "./course_report.js";

const BUCKET = process.env.INFRAI_REPORT_BUCKET ?? "course-report-exports";
let bucketReady: Promise<void> | undefined;

async function ensureReportBucket(): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await infrai.storage.bucket.list(cursor);
    if (page.items.some((bucket) => bucket.name === BUCKET)) return;
    cursor = page.next_cursor;
  } while (cursor);
  await infrai.storage.bucket.create(BUCKET);
}

function prepareBucket(): Promise<void> {
  bucketReady ??= ensureReportBucket();
  return bucketReady;
}

export type ExportResult = {
  objectKey: string;
  downloadUrl: string;
  expiresSeconds: number;
  renderedDocument: unknown;
  counts: Record<"on_time" | "overdue" | "not_submitted", number>;
};

export async function exportCourseReport(input: ReportRequest): Promise<ExportResult> {
  await prepareBucket();
  const rows = buildReportRows(input);
  const csv = rowsToCsv(rows);
  const identity = createHash("sha256").update(`${input.courseId}:${input.deadline}:${csv}`).digest("hex");
  const objectKey = `courses/${encodeURIComponent(input.courseId)}/reports/${identity}.csv`;
  const upload = await infrai.storage.object.presign(BUCKET, objectKey, {
    op: "put",
    expires_seconds: 300,
    content_type: "text/csv; charset=utf-8",
    idempotency_key: `course-report-${identity}`,
  });
  const uploadResponse = await fetch(upload.url, {
    method: "PUT",
    headers: { "Content-Type": "text/csv; charset=utf-8" },
    body: csv,
  });
  if (!uploadResponse.ok) throw new Error(`Signed upload returned HTTP ${uploadResponse.status}`);

  const expiresSeconds = 900;
  const [download, renderedDocument] = await Promise.all([
    infrai.storage.object.presign(BUCKET, objectKey, {
      op: "get",
      expires_seconds: expiresSeconds,
      response_disposition: `attachment; filename="${input.courseId}-delivery-report.csv"`,
    }),
    infrai.pdf.generate({
      markdown: rowsToMarkdown(input.courseTitle, rows),
      page_size: "A4",
      orientation: "portrait",
      store: false,
    }),
  ]);

  const counts = { on_time: 0, overdue: 0, not_submitted: 0 };
  for (const row of rows) counts[row.delivery_status] += 1;
  return { objectKey, downloadUrl: download.url, expiresSeconds, renderedDocument, counts };
}
