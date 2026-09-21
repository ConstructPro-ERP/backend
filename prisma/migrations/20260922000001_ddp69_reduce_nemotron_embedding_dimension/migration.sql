-- Requesting 1536 dimensions from the Matryoshka embedding model keeps vectors
-- compatible with the existing pgvector storage limit. Existing 2048-dimension
-- embeddings are cleared; reindex projects after this migration.
ALTER TABLE "ai_knowledge_chunks"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING NULL::vector(1536);
