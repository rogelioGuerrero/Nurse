# Supabase RAG Toolkit

Abstract RAG (Retrieval Augmented Generation) toolkit for Supabase Edge Functions using NVIDIA NIM free embeddings.

## Features

- **Abstract**: Works with any Supabase project. No hardcoded knowledge base.
- **Dynamic ingestion**: Pass URLs, the toolkit extracts text, chunks it, generates embeddings, and stores in pgvector.
- **Vector search**: Cosine similarity search via PostgreSQL RPC.
- **Reranking**: Optional NVIDIA NIM reranking for improved relevance.
- **Multi-project**: `project` field isolates different knowledge bases in the same table.
- **Configurable**: All settings via environment variables.

## Architecture

```
URLs/PDFs → [rag-ingest] → NVIDIA NIM embeddings → Supabase pgvector
                                                          ↓
User query → [rag-query] → NVIDIA NIM query embedding → vector search → rerank → results
                                                          ↓
                                              [ai-agent] rag_knowledge_search tool
```

## Setup

### 1. Enable pgvector + create table

Run the SQL migration in your Supabase SQL editor:

```sql
\i supabase/migrations/rag_pgvector.sql
```

Or copy-paste the contents of `rag_pgvector.sql`.

### 2. Set environment variables (Supabase secrets)

```bash
supabase secrets set NVIDIA_NIM_API_KEY=your_nvidia_nim_api_key
# Optional overrides:
supabase secrets set RAG_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-1b-v2
supabase secrets set RAG_EMBEDDING_DIMENSIONS=2048
supabase secrets set RAG_CHUNK_SIZE=800
supabase secrets set RAG_CHUNK_OVERLAP=100
supabase secrets set RAG_RERANK_MODEL=nvidia/llama-nemotron-rerank-1b-v2
supabase secrets set RAG_RERANK_ENABLED=true
```

Get your free NVIDIA NIM API key at [build.nvidia.com](https://build.nvidia.com).

### 3. Deploy Edge Functions

```bash
supabase functions deploy rag-ingest
supabase functions deploy rag-query
```

## Usage

### Ingest knowledge

```bash
curl -X POST https://your-project.supabase.co/functions/v1/rag-ingest \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://cssp.gob.sv/...",
      "https://www.asamblea.gob.sv/leyes/codigo-de-salud",
      "https://example.com/nursing-protocols.pdf"
    ],
    "project": "biencuidar",
    "metadata": { "category": "legal", "country": "El Salvador" }
  }'
```

### Query knowledge

```bash
curl -X POST https://your-project.supabase.co/functions/v1/rag-query \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "¿Cuáles son los requisitos para el registro CSSP?",
    "project": "biencuidar",
    "top_k": 5,
    "rerank": true
  }'
```

### As a tool in ai-agent

The `rag_knowledge_search` tool is automatically available to all roles (nurse, family, admin, visitor). The LLM decides when to use it based on the user's question.

## NVIDIA NIM Models (all free)

| Model | Type | Dimensions | Languages |
|---|---|---|---|
| `nvidia/llama-nemotron-embed-1b-v2` | Embedding | 2048 | 26 (incl. Spanish) |
| `nvidia/llama-3.2-nemoretriever-300m-embed-v2` | Embedding (light) | configurable | 26 |
| `nvidia/llama-nemotron-rerank-1b-v2` | Reranking | — | multilingual |
| `nvidia/llama-3.2-nemoretriever-500m-rerank-v2` | Reranking (light) | — | multilingual |

## Files

```
supabase/
  migrations/
    rag_pgvector.sql          -- pgvector extension + table + RPC
  functions/
    rag-ingest/
      index.ts                -- ETL: URLs → embeddings → pgvector
    rag-query/
      index.ts                -- Vector search + optional reranking
    ai-agent/
      index.ts                -- (modified) rag_knowledge_search tool added
```

## License

MIT — use freely in any project.
