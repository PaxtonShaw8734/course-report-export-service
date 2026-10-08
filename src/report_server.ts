import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai.js";
import { reportRequestSchema } from "./course_report.js";
import { exportCourseReport } from "./report_exporter.js";

const port = Number(process.env.PORT ?? 3000);

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/course-reports") {
    json(response, 404, { error: "Route not found" });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = reportRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    json(response, 201, await exportCourseReport(input));
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "Invalid report request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, detail: error.detail });
      return;
    }
    json(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
}).listen(port, () => console.log(`Course report service listening on http://localhost:${port}`));
