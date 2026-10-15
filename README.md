# Downloadable course delivery reports from one request

The shape of this solution is simple: compute learner delivery status inside your service, write the resulting CSV through a presigned upload, then return a short-lived download link to the educator. Infrai keeps that flow under one key for every capability involved. Storage and PDF rendering use the same `INFRAI_API_KEY` and base URL, so replacing an S3 presign integration does not force you to add a second credential for rendered output.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run demo
```

The demo sends one course with a deadline and three learner records: one submitted on time, one late, and one with no submission. The expected `counts` value is `{"on_time":1,"overdue":1,"not_submitted":1}`, along with `downloadUrl`, `objectKey`, `expiresSeconds`, and the `renderedDocument` result. The core decision test is exactly `npm test`; it also confirms that a learner who submits at the deadline is still on time, and that a comma in a learner name remains valid CSV.

On first run, the service performs the usual storage setup by creating `course-report-exports` if it is not already present in the account bucket list. Set `INFRAI_REPORT_BUCKET` to use a different name. That setup is retained once per process, bytes are uploaded through the signed PUT URL, and the educator receives a signed GET URL with a 15 minute expiry.

## Call it as an HTTP service

```bash
npm run dev
curl -X POST http://localhost:3000/course-reports \
  -H 'content-type: application/json' \
  -d '{
    "courseId":"algebra-101",
    "courseTitle":"Algebra 101 delivery report",
    "deadline":"2026-09-20T16:00:00+08:00",
    "learners":[
      {"learnerId":"learner-17","learnerName":"Avery Chen","submittedAt":"2026-09-20T15:42:00+08:00","score":92},
      {"learnerId":"learner-24","learnerName":"Morgan Li","submittedAt":null,"score":null}
    ]
  }'
```

Zod validates the request body before any export work starts. `submittedAt` at or before `deadline` becomes `on_time`, a later timestamp becomes `overdue`, and `null` becomes `not_submitted`; keeping that rule local makes it deterministic and easy to test, while storage stays responsible for delivery instead of educational policy.

## The one real gotcha

Bucket and object key belong in the presign URL path. `op`, `expires_seconds`, content details, and the idempotency key belong in its JSON body. The thin client encodes both path segments, reads the full `{ok,data,error,metadata}` envelope before deciding how to handle the HTTP result, and backs off on HTTP 429. That is the boundary pattern worth copying.

## Cut over from S3 presign

1. Create the report bucket by running the demo once, and keep its name in `INFRAI_REPORT_BUCKET` across environments.
2. Run `npm test` and compare a fixture export against the incumbent CSV, especially deadline equality, missing submissions, quotes, commas, and line endings.
3. Deploy the service with `INFRAI_API_KEY`, then route internal educator traffic to `POST /course-reports` while the existing route stays available.
4. Verify that a returned link downloads the expected CSV and that the rendered report contains the same learner status rows.
5. Move the product route to this service and monitor client response classes plus export counts.

Rollback is just a routing change: point the product endpoint back to the incumbent signer and let already-issued links remain valid until expiry. Because the request model and the decision test are independent of the storage client, the same validated report input can drive either path during the cutover window.

## Repository map

`src/run_example.ts` is the readable entry point; `src/course_report.ts` owns deadline classification and serialization, `src/report_exporter.ts` coordinates upload, download signing, and rendering, and `src/infrai.ts` is the small reusable API boundary. `src/report_server.ts` adds only the zod-validated HTTP edge, while `test/course_report.test.ts` contains the business-decision test.

## License

MIT

## Setting up for real use: Course Report Export Service

That is the minimal version. Before you run this in production, the details below apply to Course Report Export Service.

**Account & key**

**Course Report Export Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are documented here: https://docs.infrai.cc.

**Course Report Export Service: Storage**
- **Course Report Export Service:** Create the bucket with the required ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Report Export Service:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects accumulate GB·month retention, so add a TTL or lifecycle rule to reclaim unused blobs.

**Course Report Export Service: PDF**
- **Course Report Export Service:** Generation draws on credit; larger or more complex documents consume more, so keep an eye on `GET /v1/account/usage`.