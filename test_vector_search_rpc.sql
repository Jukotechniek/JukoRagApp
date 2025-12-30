-- ============================================
-- Test SQL voor match_document_sections RPC
-- ============================================
-- Dit bestand bevat SQL queries om de vector search RPC functie te testen
-- Gebruik dit in de Supabase SQL Editor of via psql

-- ============================================
-- 1. Check functie definitie
-- ============================================
-- Er zijn twee versies van de functie, check beide:
SELECT 
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'match_document_sections'
ORDER BY pg_get_function_arguments(p.oid);

-- De versie met p_organization_id wordt gebruikt in de code:
SELECT pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'match_document_sections'
  AND pg_get_function_arguments(p.oid) LIKE '%p_organization_id%';

-- ============================================
-- 2. Check beschikbare data
-- ============================================
-- Aantal document_sections met embeddings
SELECT 
  COUNT(*) as total_sections,
  COUNT(embedding) as sections_with_embeddings,
  COUNT(DISTINCT document_id) as unique_documents
FROM document_sections;

-- Documenten met hun secties
SELECT 
  d.id,
  d.name,
  d.organization_id,
  COUNT(ds.id) as section_count,
  COUNT(ds.embedding) as sections_with_embeddings
FROM documents d
LEFT JOIN document_sections ds ON ds.document_id = d.id
GROUP BY d.id, d.name, d.organization_id
ORDER BY section_count DESC;

-- ============================================
-- 3. Haal een bestaande embedding op voor testen
-- ============================================
-- Gebruik deze embedding om de RPC functie te testen
SELECT 
  ds.id,
  ds.content,
  ds.embedding,
  d.name as document_name,
  d.organization_id
FROM document_sections ds
JOIN documents d ON ds.document_id = d.id
WHERE ds.embedding IS NOT NULL
  AND d.organization_id = '00000000-0000-0000-0000-000000000001'
LIMIT 1;

-- ============================================
-- 4. Test RPC functie met bestaande embedding
-- ============================================
-- De functie signature: match_document_sections(query_embedding, filter, p_organization_id)
-- De functie retourneert: id, document_id, content, metadata, similarity

-- Test 1: Basis test zonder filter, met organization_id
WITH test_embedding AS (
  SELECT embedding 
  FROM document_sections 
  WHERE id = (
    SELECT id FROM document_sections 
    WHERE embedding IS NOT NULL 
    LIMIT 1
  )
)
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name,
  d.organization_id
FROM test_embedding te,
LATERAL match_document_sections(
  te.embedding, 
  '{}'::jsonb, 
  '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;

-- Test 2: Test met match_count filter (zoals in de code)
WITH test_embedding AS (
  SELECT embedding 
  FROM document_sections 
  WHERE id = (
    SELECT id FROM document_sections 
    WHERE embedding IS NOT NULL 
    LIMIT 1
  )
)
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name
FROM test_embedding te,
LATERAL match_document_sections(
  te.embedding, 
  '{"match_count": 10}'::jsonb,
  '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;

-- ============================================
-- 5. Test met specifieke document secties
-- ============================================
-- Test met embedding van VM04 document
WITH vm04_embedding AS (
  SELECT ds.embedding
  FROM document_sections ds
  JOIN documents d ON ds.document_id = d.id
  WHERE d.name LIKE '%VM04%'
    AND ds.embedding IS NOT NULL
    AND d.organization_id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1
)
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name,
  d.organization_id
FROM vm04_embedding ve,
LATERAL match_document_sections(
  ve.embedding, 
  '{"match_count": 10}'::jsonb,
  '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;

-- Test met embedding van Valo Biomedia document
WITH valo_embedding AS (
  SELECT ds.embedding
  FROM document_sections ds
  JOIN documents d ON ds.document_id = d.id
  WHERE d.name LIKE '%Valo%'
    AND ds.embedding IS NOT NULL
    AND d.organization_id = '00000000-0000-0000-0000-000000000001'
  LIMIT 1
)
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name,
  d.organization_id
FROM valo_embedding ve,
LATERAL match_document_sections(
  ve.embedding, 
  '{"match_count": 10}'::jsonb,
  '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;

-- ============================================
-- 6. Test met specifieke queries uit de logs
-- ============================================
-- Test queries: "VM04" en "Valo Biomedia"
-- Om deze te testen, moet je eerst embeddings genereren via OpenAI API

-- STAP 1: Genereer embedding voor "VM04" via OpenAI API
-- Gebruik curl of Postman:
/*
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "VM04",
    "model": "text-embedding-3-small"
  }'
*/

-- STAP 2: Gebruik de embedding array in deze query (vervang de array):
/*
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name
FROM match_document_sections(
  query_embedding := ARRAY[
    -- Plak hier de embedding array van OpenAI voor "VM04"
    -- Dit is een array van 1536 floating point getallen
  ]::vector,
  filter := '{"match_count": 10}'::jsonb,
  p_organization_id := '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;
*/

-- STAP 3: Test met "Valo Biomedia" embedding:
/*
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.metadata,
  m.similarity,
  d.name as document_name
FROM match_document_sections(
  query_embedding := ARRAY[
    -- Plak hier de embedding array van OpenAI voor "Valo Biomedia"
  ]::vector,
  filter := '{"match_count": 10}'::jsonb,
  p_organization_id := '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
ORDER BY m.similarity DESC;
*/

-- ============================================
-- 7. Directe RPC call (zoals in de code)
-- ============================================
-- Dit is hoe de functie wordt aangeroepen vanuit de applicatie
-- Let op: je moet een echte embedding array hebben (1536 dimensies voor text-embedding-3-small)

-- Voorbeeld met een bestaande embedding uit de database
SELECT * FROM match_document_sections(
  query_embedding := (
    SELECT embedding FROM document_sections 
    WHERE embedding IS NOT NULL 
    LIMIT 1
  ),
  filter := '{"match_count": 10}'::jsonb,
  p_organization_id := '00000000-0000-0000-0000-000000000001'::uuid
)
ORDER BY similarity DESC;

-- Om een embedding te genereren voor "VM04" of "Valo Biomedia":
-- 1. Gebruik de OpenAI API: POST https://api.openai.com/v1/embeddings
-- 2. Model: text-embedding-3-small
-- 3. Input: "VM04" of "Valo Biomedia"
-- 4. Gebruik de returned embedding array in de query hieronder

-- Voorbeeld syntax (vervang met echte embedding):
/*
SELECT * FROM match_document_sections(
  query_embedding := ARRAY[
    -- Plak hier de 1536-dimensionale embedding array van OpenAI
    -- Bijvoorbeeld: [-0.045790263, 0.006616375, ...] (1536 getallen)
  ]::vector,
  filter := '{"match_count": 10}'::jsonb,
  p_organization_id := '00000000-0000-0000-0000-000000000001'::uuid
)
ORDER BY similarity DESC;
*/

-- ============================================
-- 7. Check of embeddings correct zijn opgeslagen
-- ============================================
-- Controleer embedding dimensies (moet 1536 zijn voor text-embedding-3-small)
SELECT 
  id,
  document_id,
  array_length(embedding::float[], 1) as embedding_dimensions,
  LEFT(content, 100) as content_preview
FROM document_sections
WHERE embedding IS NOT NULL
LIMIT 5;

-- ============================================
-- 8. Test similarity search direct op tabel
-- ============================================
-- Dit is een alternatieve manier om similarity search te doen zonder RPC
WITH test_embedding AS (
  SELECT embedding 
  FROM document_sections 
  WHERE id = (
    SELECT id FROM document_sections 
    WHERE embedding IS NOT NULL 
    LIMIT 1
  )
)
SELECT 
  ds.id,
  LEFT(ds.content, 200) as content_preview,
  ds.metadata,
  1 - (ds.embedding <=> te.embedding) as similarity,
  d.name as document_name,
  d.organization_id
FROM document_sections ds
JOIN documents d ON ds.document_id = d.id
CROSS JOIN test_embedding te
WHERE ds.embedding IS NOT NULL
  AND d.organization_id = '00000000-0000-0000-0000-000000000001'
ORDER BY ds.embedding <=> te.embedding
LIMIT 10;

-- ============================================
-- 9. Debug: Check waarom er geen matches zijn
-- ============================================
-- Als de RPC 0 matches teruggeeft, check dan:

-- A. Zijn er document_sections met embeddings voor deze organization?
SELECT 
  COUNT(*) as sections_with_embeddings
FROM document_sections ds
JOIN documents d ON ds.document_id = d.id
WHERE ds.embedding IS NOT NULL
  AND d.organization_id = '00000000-0000-0000-0000-000000000001';

-- B. Hebben de embeddings de juiste dimensies?
SELECT 
  array_length(embedding::float[], 1) as dimensions,
  COUNT(*) as count
FROM document_sections ds
JOIN documents d ON ds.document_id = d.id
WHERE ds.embedding IS NOT NULL
  AND d.organization_id = '00000000-0000-0000-0000-000000000001'
GROUP BY dimensions;

-- C. Test of de RPC functie überhaupt werkt
SELECT COUNT(*) as result_count
FROM match_document_sections(
  (SELECT embedding FROM document_sections WHERE embedding IS NOT NULL LIMIT 1),
  '{"match_count": 10}'::jsonb,
  '00000000-0000-0000-0000-000000000001'::uuid
);

-- ============================================
-- 10. Test met verschillende threshold waarden
-- ============================================
-- De functie heeft geen threshold parameter, maar je kunt filteren op similarity
WITH test_embedding AS (
  SELECT embedding 
  FROM document_sections 
  WHERE id = (
    SELECT id FROM document_sections 
    WHERE embedding IS NOT NULL 
    LIMIT 1
  )
)
SELECT 
  m.id,
  m.document_id,
  LEFT(m.content, 200) as content_preview,
  m.similarity,
  d.name as document_name
FROM test_embedding te,
LATERAL match_document_sections(
  te.embedding, 
  '{"match_count": 10}'::jsonb,
  '00000000-0000-0000-0000-000000000001'::uuid
) m
JOIN documents d ON m.document_id = d.id
WHERE m.similarity >= 0.30  -- Threshold filter (zoals in de code)
ORDER BY m.similarity DESC;

