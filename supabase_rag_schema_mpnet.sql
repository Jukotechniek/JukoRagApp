-- ============================================
-- RAG Schema voor sentence-transformers/all-mpnet-base-v2
-- ============================================
-- Dit schema gebruikt 768 dimensions voor all-mpnet-base-v2
-- ============================================

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- DOCUMENT_SECTIONS TABLE (768 dimensions)
-- ============================================
-- Als je al een document_sections tabel hebt, moet je deze eerst droppen:
-- DROP TABLE IF EXISTS document_sections CASCADE;

CREATE TABLE IF NOT EXISTS document_sections (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768), -- 768 dimensions for sentence-transformers/all-mpnet-base-v2
  metadata JSONB, -- Store additional metadata like page number, section title, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE document_sections ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR DOCUMENT_SECTIONS
-- ============================================

-- Users can view document sections in their organization
CREATE POLICY "Users can view document sections in their organization"
  ON document_sections FOR SELECT
  USING (
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Managers can insert document sections for documents in their organization
CREATE POLICY "Managers can insert document sections"
  ON document_sections FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

-- Managers can update document sections in their organization
CREATE POLICY "Managers can update document sections"
  ON document_sections FOR UPDATE
  USING (
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Managers can delete document sections in their organization
CREATE POLICY "Managers can delete document sections"
  ON document_sections FOR DELETE
  USING (
    document_id IN (
      SELECT d.id FROM documents d
      WHERE d.organization_id IN (
        SELECT organization_id FROM user_organizations 
        WHERE user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'manager')
    )
  );

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Index on document_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_sections_document_id ON document_sections(document_id);

-- Vector similarity index using HNSW (Hierarchical Navigable Small World)
-- This enables fast similarity search on embeddings
CREATE INDEX IF NOT EXISTS idx_document_sections_embedding ON document_sections 
USING hnsw (embedding vector_cosine_ops);

-- Index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_document_sections_created_at ON document_sections(created_at DESC);

-- ============================================
-- FUNCTIONS FOR RAG
-- ============================================

-- Function to search for similar document sections using vector similarity
-- Returns sections ordered by similarity (cosine distance)
-- Usage: SELECT * FROM match_document_sections('organization_id', query_embedding, 5, 0.7);
CREATE OR REPLACE FUNCTION match_document_sections(
  p_organization_id UUID,
  query_embedding vector(768),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id BIGINT,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT,
  document_name TEXT,
  document_file_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce that caller belongs to organization
  IF NOT EXISTS (
    SELECT 1
    FROM user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    ds.id,
    ds.document_id,
    ds.content,
    ds.metadata,
    1 - (ds.embedding <=> query_embedding) AS similarity, -- cosine distance to similarity
    d.name AS document_name,
    d.file_url AS document_file_url
  FROM document_sections ds
  INNER JOIN documents d ON ds.document_id = d.id
  WHERE d.organization_id = p_organization_id
    AND ds.embedding IS NOT NULL
    AND 1 - (ds.embedding <=> query_embedding) >= match_threshold
  ORDER BY ds.embedding <=> query_embedding -- Order by cosine distance (ascending = most similar)
  LIMIT match_count;
END;
$$;

-- Function to get document sections for a specific document
CREATE OR REPLACE FUNCTION get_document_sections(p_document_id UUID)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce that caller has access to the document's organization
  IF NOT EXISTS (
    SELECT 1
    FROM documents d
    INNER JOIN user_organizations uo ON d.organization_id = uo.organization_id
    WHERE d.id = p_document_id
      AND uo.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT 
    ds.id,
    ds.content,
    ds.metadata,
    ds.created_at
  FROM document_sections ds
  WHERE ds.document_id = p_document_id
  ORDER BY ds.created_at ASC;
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_document_sections_updated_at
  BEFORE UPDATE ON document_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE document_sections IS 'Document secties met embeddings voor RAG functionaliteit per organisatie';
COMMENT ON COLUMN document_sections.embedding IS 'Vector embedding (768 dimensions) voor sentence-transformers/all-mpnet-base-v2';
COMMENT ON COLUMN document_sections.metadata IS 'Extra metadata zoals pagina nummer, sectie titel, etc.';
COMMENT ON FUNCTION match_document_sections IS 'Zoekt naar vergelijkbare document secties binnen een organisatie op basis van vector similarity. Vereist dat gebruiker tot de organisatie behoort.';
COMMENT ON FUNCTION get_document_sections IS 'Haalt alle secties van een document op. Vereist dat gebruiker toegang heeft tot de organisatie van het document.';

