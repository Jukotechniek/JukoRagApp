-- Create RRF (Reciprocal Rank Fusion) hybrid search function
-- This combines semantic search (pgvector) with full-text search (tsvector) at database level
-- Much more efficient than doing separate queries and merging in Python

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
DECLARE
    semantic_results RECORD;
    keyword_results RECORD;
    combined_results RECORD;
BEGIN
    -- Semantic search using pgvector (cosine similarity)
    -- Get semantic matches with their ranks
    WITH semantic_ranked AS (
        SELECT 
            ds.id,
            ds.document_id,
            ds.content,
            ds.metadata,
            1 - (ds.embedding <=> p_query_embedding) AS similarity,
            ROW_NUMBER() OVER (ORDER BY ds.embedding <=> p_query_embedding) AS rank
        FROM document_sections ds
        INNER JOIN documents d ON ds.document_id = d.id
        WHERE d.organization_id = p_organization_id
            AND 1 - (ds.embedding <=> p_query_embedding) >= p_semantic_threshold
        ORDER BY ds.embedding <=> p_query_embedding
        LIMIT p_match_count * 2  -- Get more results for better fusion
    ),
    -- Full-text search using tsvector (PostgreSQL full-text search)
    keyword_ranked AS (
        SELECT 
            ds.id,
            ds.document_id,
            ds.content,
            ds.metadata,
            ts_rank_cd(
                to_tsvector('english', ds.content),
                plainto_tsquery('english', p_query_text)
            ) AS similarity,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank_cd(
                    to_tsvector('english', ds.content),
                    plainto_tsquery('english', p_query_text)
                ) DESC
            ) AS rank
        FROM document_sections ds
        INNER JOIN documents d ON ds.document_id = d.id
        WHERE d.organization_id = p_organization_id
            AND to_tsvector('english', ds.content) @@ plainto_tsquery('english', p_query_text)
        ORDER BY similarity DESC
        LIMIT p_match_count * 2  -- Get more results for better fusion
    ),
    -- Combine results using Reciprocal Rank Fusion (RRF)
    -- RRF score = sum(1 / (k + rank)) for each result set
    rrf_combined AS (
        SELECT 
            COALESCE(s.id, k.id) AS id,
            COALESCE(s.document_id, k.document_id) AS document_id,
            COALESCE(s.content, k.content) AS content,
            COALESCE(s.metadata, k.metadata) AS metadata,
            COALESCE(s.similarity, 0.0) AS semantic_similarity,
            COALESCE(k.similarity, 0.0) AS keyword_similarity,
            -- RRF formula: 1 / (k + rank_semantic) + 1 / (k + rank_keyword)
            (COALESCE(1.0 / (p_rrf_k + s.rank), 0.0) + 
             COALESCE(1.0 / (p_rrf_k + k.rank), 0.0)) AS rrf_score,
            s.rank AS semantic_rank,
            k.rank AS keyword_rank
        FROM semantic_ranked s
        FULL OUTER JOIN keyword_ranked k ON s.id = k.id
    )
    SELECT 
        id,
        document_id,
        content,
        metadata,
        -- Use weighted combination of semantic and keyword similarity
        (semantic_similarity * 0.7 + keyword_similarity * 0.3) AS similarity,
        rrf_score
    FROM rrf_combined
    WHERE rrf_score > 0  -- Only return results that appear in at least one result set
    ORDER BY rrf_score DESC, similarity DESC
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

