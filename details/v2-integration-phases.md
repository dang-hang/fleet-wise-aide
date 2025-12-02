# V2 RAG Integration Phased Rollout Plan

This document outlines the phased approach to integrating the Python-based V2 RAG stack into Fleet Wise Aide, transforming the gap assessment into actionable execution stages.

## Phase 1: Infrastructure & Database Foundation
**Goal:** Establish a production-ready backend environment and unify the data layer.

### 1.1 Containerization & Hosting
- [x] **Dockerize V2 App:** Create a `Dockerfile` for `v2/app.py` including all Python dependencies (Flask, PyMuPDF, OpenAI, etc.).
- [x] **Environment Configuration:** Define production environment variables (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `STORAGE_PATH`).
- [x] **Service Deployment:** Deploy the Flask container to a hosting provider (e.g., Railway, Fly.io, or AWS) accessible by the frontend.

### 1.2 Database Strategy
- [x] **Schema Migration:** Port the `manuals.db` (SQLite) schema to the primary Supabase Postgres database.
  - Create tables for `v2_manuals`, `v2_chunks`, `v2_citations` in Postgres.
- [x] **Database Connector:** Update `v2/database_access.py` and `v2/manuals_db.py` to use `psycopg2` or `sqlalchemy` to connect to Supabase Postgres instead of local SQLite.

### 1.3 Storage Alignment
- [ ] **Storage Decision:** Finalize decision to use Supabase Storage as the source of truth for PDFs.
- [ ] **Download Hooks:** Implement logic in `v2/processor.py` to fetch PDFs directly from Supabase Storage using signed URLs or service key access during ingestion.

---

## Phase 2: API Feature Parity & Security
**Goal:** Ensure the V2 API supports all required operations securely and matches frontend expectations.

### 2.1 Authentication & Security
- [ ] **Auth Middleware:** Implement a middleware in Flask to verify Supabase JWT tokens sent in the `Authorization` header.
- [ ] **Multi-tenancy:** Ensure all database queries filter by `user_id` extracted from the JWT to prevent data leaks between users.

### 2.2 Endpoint Implementation
- [ ] **PDF Retrieval:** Implement `GET /api/manuals/<manual_id>/pdf` to proxy or redirect to the file.
- [ ] **Reprocessing:** Implement `POST /api/manuals/<manual_id>/reprocess` to trigger re-ingestion of an existing manual.
- [ ] **Enhanced Upload:** Update `POST /api/manuals/upload` to accept metadata (`vehicle_type`, `vehicle_model`, `year`) and store it in the new Postgres schema.

### 2.3 Response Standardization
- [ ] **Citation Format:** Ensure `/api/answer` returns citations in a format compatible with the frontend `CitationChip` component.
- [ ] **Image URLs:** Ensure image references in RAG responses point to accessible public URLs or signed URLs served by the Flask app.

---

## Phase 3: Frontend Integration
**Goal:** Switch the React frontend to communicate exclusively with the V2 Python backend.

### 3.1 AI Assistant Integration
- [ ] **Client Update:** Modify `src/pages/AIAssistant.tsx` to call the Flask `/api/answer` endpoint instead of the Supabase Edge Function.
- [ ] **Streaming Support:** Ensure the frontend handles the streaming response format from the Flask app correctly.

### 3.2 Manual Management
- [ ] **Upload Flow:** Update `src/pages/Manuals.tsx` upload logic to post to the Flask API.
- [ ] **List & Delete:** Update the manuals list to fetch from the Flask API (or directly from Supabase if sharing the DB) and route delete actions through the API to ensure vector cleanup.

### 3.3 Document Viewing
- [ ] **Viewer Update:** Update `src/components/DocumentViewer.tsx` and `PdfViewer.tsx` to consume the new asset URLs.
- [ ] **Markdown Rendering:** Update `src/components/MarkdownRenderer.tsx` to correctly render the specific citation syntax returned by V2.

---

## Phase 4: Data Migration & Cleanup
**Goal:** Migrate legacy data and decommission the old system components.

### 4.1 Data Migration
- [ ] **ETL Script:** Write a script to read existing manuals from the legacy Supabase tables and re-ingest them through the V2 pipeline to populate the new vector store/database.
- [ ] **Verification:** Verify that old manuals are searchable and return accurate citations in the new system.

### 4.2 Decommissioning
- [ ] **Edge Functions:** Deprecate and remove `maintenance-ai`, `search`, and `parse-manual` functions from Supabase.
- [ ] **Legacy Tables:** Archive and drop the old `manuals`, `manual_sections`, and `manual_chunks` tables once migration is confirmed.
- [ ] **Cleanup:** Remove unused code in `src/integrations/supabase` related to the old pipeline.

---

## Phase 5: Reliability & Launch
**Goal:** Harden the system for production use.

### 5.1 Testing
- [ ] **Integration Tests:** Create a test suite that uploads a PDF and asserts that a specific question returns the expected answer.
- [ ] **Load Testing:** Test concurrent requests to ensure the Flask app and database connection pool handle load gracefully.

### 5.2 Observability
- [ ] **Logging:** Implement structured logging in the Flask app (e.g., using Sentry or simple stdout logging for container capture).
- [ ] **Documentation:** Update `README.md` with new architecture diagrams and setup instructions for the Python backend.
