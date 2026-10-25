CREATE UNIQUE INDEX IF NOT EXISTS "ai_knowledge_chunks_projectId_sourceType_sourceId_key"
  ON "ai_knowledge_chunks"("projectId", "sourceType", "sourceId");
