"""
One-time migration: ChromaDB → Qdrant Cloud

Usage:
    pip install qdrant-client chromadb
    QDRANT_URL="https://xxxx.aws.cloud.qdrant.io" \
    QDRANT_API_KEY="your-api-key" \
    python scripts/migrate_to_qdrant.py

Takes ~10-20 minutes for 42k chunks (limited by read speed, not network).
"""
import os
import sys
import uuid

import chromadb
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, PayloadSchemaType

CHROMA_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "chroma_db")
COLLECTION_NAME = "south_asian_health"
QDRANT_BATCH_SIZE = 200
CHROMA_BATCH_SIZE = 500
EMBEDDING_DIM = 1024


def md5_to_uuid(md5_hex: str) -> str:
    """Convert a 32-char MD5 hex string into a UUID string for Qdrant."""
    padded = md5_hex.ljust(32, "0")[:32]
    return str(uuid.UUID(padded))


def main() -> None:
    qdrant_url = os.environ.get("QDRANT_URL", "").rstrip("/")
    qdrant_api_key = os.environ.get("QDRANT_API_KEY", "")
    if not qdrant_url or not qdrant_api_key:
        print("ERROR: Set QDRANT_URL and QDRANT_API_KEY environment variables.")
        sys.exit(1)

    print(f"Connecting to Qdrant at {qdrant_url} ...")
    qc = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=60)

    # Create collection if it doesn't exist
    existing = [c.name for c in qc.get_collections().collections]
    if COLLECTION_NAME not in existing:
        print(f"Creating Qdrant collection '{COLLECTION_NAME}' (cosine, dim={EMBEDDING_DIM}) ...")
        qc.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        # Create payload indexes for filtering
        qc.create_payload_index(COLLECTION_NAME, "evidence_level", PayloadSchemaType.KEYWORD)
        qc.create_payload_index(COLLECTION_NAME, "doi", PayloadSchemaType.KEYWORD)
        print("  Collection created.")
    else:
        existing_count = qc.count(COLLECTION_NAME).count
        print(f"  Collection already exists with {existing_count} points.")
        if existing_count > 0:
            ans = input("  Overwrite? (y/N): ").strip().lower()
            if ans != "y":
                print("Aborted.")
                return
            qc.delete_collection(COLLECTION_NAME)
            qc.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
            )
            qc.create_payload_index(COLLECTION_NAME, "evidence_level", PayloadSchemaType.KEYWORD)
            qc.create_payload_index(COLLECTION_NAME, "doi", PayloadSchemaType.KEYWORD)

    # Connect to ChromaDB
    print(f"\nOpening ChromaDB at {CHROMA_DB_PATH} ...")
    cc = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    coll = cc.get_collection(COLLECTION_NAME)
    total = coll.count()
    print(f"  {total} chunks to migrate.\n")

    # Get all IDs first, then batch-fetch with embeddings
    all_ids_result = coll.get(include=[])
    all_ids = all_ids_result["ids"]

    uploaded = 0
    failed = 0

    for batch_start in range(0, len(all_ids), CHROMA_BATCH_SIZE):
        batch_ids = all_ids[batch_start : batch_start + CHROMA_BATCH_SIZE]
        result = coll.get(
            ids=batch_ids,
            include=["embeddings", "documents", "metadatas"],
        )

        points: list[PointStruct] = []
        for doc_id, embedding, document, metadata in zip(
            result["ids"],
            result["embeddings"],
            result["documents"],
            result["metadatas"],
        ):
            if embedding is None:
                failed += 1
                continue

            # Qdrant needs UUID or uint64 IDs
            point_id = md5_to_uuid(doc_id)

            # Flatten metadata + add document text into payload
            payload = {
                "text": document,
                "title": metadata.get("title", ""),
                "authors": metadata.get("authors", ""),
                "year": metadata.get("year", ""),
                "source": metadata.get("source", ""),
                "doi": metadata.get("doi", ""),
                "pmid": metadata.get("pmid", ""),
                "evidence_level": metadata.get("evidence_level", "primary"),
                "pub_types": metadata.get("pub_types", ""),
                "chunk_index": metadata.get("chunk_index", 0),
                "has_figures": bool(metadata.get("has_figures", False)),
                "figures_dir": metadata.get("figures_dir", ""),
            }
            points.append(PointStruct(id=point_id, vector=list(embedding), payload=payload))

        # Upload in sub-batches to Qdrant
        for sub_start in range(0, len(points), QDRANT_BATCH_SIZE):
            sub_batch = points[sub_start : sub_start + QDRANT_BATCH_SIZE]
            qc.upsert(collection_name=COLLECTION_NAME, points=sub_batch)

        uploaded += len(points)
        pct = uploaded / total * 100
        print(f"  Progress: {uploaded}/{total} ({pct:.1f}%) uploaded, {failed} skipped")

    final_count = qc.count(COLLECTION_NAME).count
    print(f"\n✓ Migration complete! Qdrant has {final_count} points ({failed} skipped).")
    print("Next steps:")
    print("  1. Add QDRANT_URL, QDRANT_API_KEY, VOYAGE_API_KEY to Vercel env vars")
    print("  2. cd .. && vercel --prod")


if __name__ == "__main__":
    main()
