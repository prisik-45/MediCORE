from functools import lru_cache

from sentence_transformers import SentenceTransformer

from backend.app.config import get_settings


@lru_cache
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(get_settings().embedding_model)


def embed_catalog_item_text(text: str) -> list[float]:
    model = get_embedding_model()
    return model.encode(text, normalize_embeddings=True).tolist()
