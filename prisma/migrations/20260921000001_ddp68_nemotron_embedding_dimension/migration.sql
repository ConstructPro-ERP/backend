-- NVIDIA Llama Nemotron Embed VL 1B v2 emits up to 2048-dimensional vectors.
-- Existing 1536-dimensional vectors cannot be cast safely, so retain chunk text
-- and metadata while clearing embeddings for reindexing with the new model.
ALTER TABLE "ai_knowledge_chunks"
  ALTER COLUMN "embedding" TYPE vector(2048)
  USING NULL::vector(2048);
