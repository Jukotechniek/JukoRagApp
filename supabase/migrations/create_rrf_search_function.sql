-- Create RRF (Reciprocal Rank Fusion) hybrid search function
-- This combines semantic search (pgvector) with full-text search (tsvector) at database level
-- Much more efficient than doing separate queries and merging in Python

DROP FUNCTION IF EXISTS match_document_sections_rrf(UUID, vector, TEXT, INT, FLOAT, INT);

CREATE OR REPLACE FUNCTION match_document_sections_rrf(
    p_organization_id UUID,
    p_query_embedding vector(1536),
    p_query_text TEXT,
    p_match_count INT DEFAULT 10,
    p_semantic_threshold FLOAT DEFAULT 0.30,
    p_rrf_k INT DEFAULT 60
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT,
    rrf_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH semantic_ranked AS (
        SELECT 
            ds.id AS section_id,
            ds.document_id AS doc_id,
            ds.content AS section_content,
            ds.metadata AS section_metadata,
            (1 - (ds.embedding <=> p_query_embedding))::FLOAT AS sem_similarity,
            ROW_NUMBER() OVER (ORDER BY ds.embedding <=> p_query_embedding) AS sem_rank
        FROM document_sections ds
        INNER JOIN documents d ON ds.document_id = d.id
        WHERE d.organization_id = p_organization_id
            AND 1 - (ds.embedding <=> p_query_embedding) >= p_semantic_threshold
        ORDER BY ds.embedding <=> p_query_embedding
        LIMIT p_match_count * 2
    ),
    keyword_ranked AS (
        SELECT 
            ds.id AS section_id,
            ds.document_id AS doc_id,
            ds.content AS section_content,
            ds.metadata AS section_metadata,
            ts_rank_cd(
                to_tsvector('english', ds.content),
                plainto_tsquery('english', p_query_text)
            )::FLOAT AS kw_similarity,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', ds.content),
                    plainto_tsquery('english', p_query_text)
                ) DESC
            ) AS kw_rank
        FROM document_sections ds
        INNER JOIN documents d ON ds.document_id = d.id
        WHERE d.organization_id = p_organization_id
            AND to_tsvector('english', ds.content) @@ plainto_tsquery('english', p_query_text)
        ORDER BY kw_similarity DESC
        LIMIT p_match_count * 2
    ),
    rrf_combined AS (
        SELECT 
            (CASE WHEN s.section_id IS NOT NULL THEN s.section_id ELSE k.section_id END)::UUID AS result_id,
            (CASE WHEN s.doc_id IS NOT NULL THEN s.doc_id ELSE k.doc_id END)::UUID AS result_document_id,
            COALESCE(s.section_content, k.section_content)::TEXT AS result_content,
            COALESCE(s.section_metadata, k.section_metadata)::JSONB AS result_metadata,
            COALESCE(s.sem_similarity, 0.0)::FLOAT AS semantic_sim,
            COALESCE(k.kw_similarity, 0.0)::FLOAT AS keyword_sim,
            (COALESCE(1.0 / NULLIF(p_rrf_k::FLOAT + s.sem_rank::FLOAT, 0), 0.0) + 
             COALESCE(1.0 / NULLIF(p_rrf_k::FLOAT + k.kw_rank::FLOAT, 0), 0.0))::FLOAT AS rrf_score
        FROM semantic_ranked s
        FULL OUTER JOIN keyword_ranked k ON s.section_id = k.section_id
    )
    SELECT 
        rrf_combined.result_id,
        rrf_combined.result_document_id,
        rrf_combined.result_content,
        rrf_combined.result_metadata,
        (rrf_combined.semantic_sim * 0.7 + rrf_combined.keyword_sim * 0.3)::FLOAT AS similarity,
        rrf_combined.rrf_score
    FROM rrf_combined
    WHERE rrf_combined.rrf_score > 0
    ORDER BY rrf_combined.rrf_score DESC, (rrf_combined.semantic_sim * 0.7 + rrf_combined.keyword_sim * 0.3) DESC
    LIMIT p_match_count;
END;
$$;

-- Create index for full-text search performance (if not exists)
-- This speeds up the keyword search part of RRF
CREATE INDEX IF NOT EXISTS document_sections_content_fts_idx 
ON document_sections 
USING gin(to_tsvector('english', content));

-- Add comment explaining the function
COMMENT ON FUNCTION match_document_sections_rrf IS 
'Hybrid search using Reciprocal Rank Fusion (RRF) to combine semantic similarity (pgvector) with full-text search (tsvector). More efficient than separate queries merged in application code.';
