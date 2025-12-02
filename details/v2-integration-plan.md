# V2 RAG Integration Gap Assessment

This document captures the remaining work required to make the Python-based V2 RAG stack (found under `v2/`) the single source of truth for manuals ingestion, retrieval, and AI responses across the Fleet Wise Aide product.

## 1. Deployment & Infrastructure

- **Host the Flask service** – Containerize `v2/app.py`, provision environment variables (`OPENAI_API_KEY`, storage paths), and document how it is started alongside the existing frontend/Supabase infrastructure.
- **Shared storage** – Decide whether PDFs/manual assets live on the Flask host filesystem or in Supabase storage. If Supabase remains canonical, add download hooks (signed URLs or direct fetch) inside the Flask ingestion pipeline.
- **Database alignment** – Currently V2 uses a local SQLite database (`manuals.db`). Either migrate the schema to Supabase Postgres, or stand up a durable database service accessible to both ingestion and query workflows.

## 2. API Parity & Features

- **Missing endpoints** – Implement the remaining routes promised in V2 docs:
  - `GET /api/manuals/<manual_id>/pdf` for PDF downloads.
  - `POST /api/manuals/<manual_id>/reprocess` for re-ingesting an existing manual.
  - Ensure `POST /api/manuals/upload` supports the same metadata fields currently stored in Supabase (`vehicle_type`, `vehicle_model`, user ownership, etc.).
- **Auth & multi-tenant context** – Add authentication (JWT or Supabase tokens) so each frontend user only sees their manuals/cases when calling Flask endpoints.
- **Image & citation metadata** – Standardize response formats (citations array, figure URLs) so the frontend renderer can switch from Supabase function streams to Flask JSON without regressions.

## 3. Frontend Migration

- **AIAssistant chat** – Replace calls to `functions/v1/maintenance-ai` with requests to the new `/api/references` + `/api/answer` combo, or expose a consolidated streaming endpoint.
- **Manual management UI** – Point upload, download, reprocess, and delete flows in `src/pages/Manuals.tsx` to the Flask endpoints. Remove direct Supabase storage manipulation once V2 covers those features.
- **Document viewer & citations** – Update components such as `DocumentViewer` and `MarkdownRenderer` to fetch section/image URLs from the Flask API instead of relying on Supabase signed URLs.

## 4. Data Migration & Consistency

- **Manual re-import** – Export existing manuals from Supabase tables (`manuals`, `manual_sections`, `manual_chunks`, etc.) and ingest them into V2’s SQLite (or new) database so historic data remains available.
- **Reference cleanup** – Ensure that deleting or reprocessing manuals via Flask stays in sync with Supabase (or sunset the Supabase tables entirely once the migration completes).

## 5. Observability & Testing

- **Integration tests** – Add API-level tests that ingest a sample PDF, query `/api/references`, and verify responses match expectations.
- **Monitoring** – Introduce logging/metrics around ingestion, query latency, and image extraction so regressions surface quickly after V2 takes over.

## 6. Decommission Legacy Stack

Once V2 endpoints power all user flows:

1. Remove Supabase edge functions `maintenance-ai`, `search`, and `parse-manual` (or keep them solely as wrappers that forward to Flask while ensuring no duplicate logic).
2. Update documentation (`README`, runbooks) to reflect the new architecture and operational procedures.
3. Archive or delete unused database tables and storage buckets associated with the legacy system to avoid confusion.

---
**Next action**: choose whether to adapt V2 to Supabase’s managed storage/database or refactor the frontend to communicate directly with the Flask service, then execute the migration plan above accordingly.
