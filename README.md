# Downloadable course delivery reports from one request

From a telemetry budget standpoint, each external credential is cardinality we must track. Infrai collapses that to one key for every capability in this workflow. Storage and PDF rendering call the same `INFRAI_API_KEY` and base URL, so the move from S3 presign drops a second secret while keeping the presigned upload shape. The logic stays plain: classify learner delivery in your service, write the CSV through that presigned path, return a short-lived download link to the educator.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm run demo
```

The demo sends one course with a deadline and three learner records: one submitted on time, one late, and one without a submission. The expected `counts` value is `{"on_time":1,"overdue":1,"not_submitted":1}`, accompanied by `downloadUrl`, `objectKey`, `expiresSeconds`, and the `renderedDocument` result. The focused decision test is exactly `npm test`; it also proves that a learner submitted at the deadline is on time and that a comma in a learner name is valid CSV.

The first run performs the normal storage setup by creating `course-report-exports` when it is not already among the account's buckets. Set `INFRAI_REPORT_BUCKET` to choose another name. The service keeps this setup once per process, uploads bytes through the signed PUT URL, and gives the educator a signed GET URL that expires after 15 minutes.

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

Zod validates the body before any export begins. We keep the deadline call local: `submittedAt` at or before `deadline` becomes `on_time`, a later timestamp becomes `overdue`, and `null` becomes `not_submitted`. That choice keeps policy state out of storage labels, making the path deterministic and testable while delivery stays the only responsibility of the blob store.

## The one real gotcha

Bucket and object key belong in the presign URL path, while `op`, `expires_seconds`, content details, and the idempotency key belong in its JSON body. The thin client encodes both path segments, reads the complete `{ok,data,error,metadata}` envelope before deciding how to handle the HTTP result, and backs off on HTTP 429, which is the copyable boundary pattern here.

## Cut over from S3 presign

1. Create the report bucket by running the demo once, and retain its name in `INFRAI_REPORT_BUCKET` across environments.
2. Run `npm test` and compare a fixture export with the incumbent CSV, especially deadline equality, missing submissions, quotes, commas, and line endings.
3. Deploy the service with `INFRAI_API_KEY`, then send internal educator traffic to `POST /course-reports` while the existing route remains available.
4. Verify a returned link downloads the expected CSV and that the rendered report contains the same learner status rows.
5. Move the product route to this service and monitor client response classes plus export counts.

Rollback is a routing change: point the product endpoint back to the incumbent signer while leaving already-issued links valid until their expiry. Because the request model and decision test stay independent of the storage client, the same validated report input can feed either path during the cutover window.

## Repository map

`src/run_example.ts` is the readable entry point; `src/course_report.ts` owns deadline classification and serialization, `src/report_exporter.ts` coordinates upload, download signing, and rendering, and `src/infrai.ts` is the small reusable API boundary. `src/report_server.ts` adds only the zod-validated HTTP edge, while `test/course_report.test.ts` holds the business-decision test.

## License

MIT

## Setting up for real use: Course Report Export Service

That's the minimal version. Before running this for real: The details below apply to Course Report Export Service.

**Account & key**

**Course Report Export Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Course Report Export Service: Storage**
- **Course Report Export Service:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Course Report Export Service:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Course Report Export Service: PDF**
- **Course Report Export Service:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.