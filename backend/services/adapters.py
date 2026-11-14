from __future__ import annotations

import io
from dataclasses import asdict
from pathlib import Path
from typing import Any

import torch
import yaml
from pypdf import PdfReader

from app.config import PROJECT_ROOT, assert_not_c_drive, get_config
from app.services.evaluate import Evaluator
from app.services.pipeline import get_pipeline
from app.services.store import RunResult
from equisumm_mvp.fact_verifier import FactExtractor, _match


def parse_upload(filename: str, content: bytes, allowed: set[str]) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in allowed:
        raise ValueError(f"Unsupported file type '{suffix}'. Allowed: {', '.join(sorted(allowed))}.")
    if not content:
        raise ValueError("Uploaded file is empty.")
    if len(content) > 20 * 1024 * 1024:
        raise ValueError("Uploaded file exceeds the 20 MB limit.")
    if suffix == ".pdf":
        return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages).strip()
    return content.decode("utf-8", errors="replace").strip()


def run_pipeline(text: str, domain: str, n_candidates: int | None, progress) -> dict[str, Any]:
    config = get_config()
    run = get_pipeline().run(text, domain=domain, n_candidates=n_candidates or config.n_candidates, progress_cb=progress)
    return {"run_id": run.run_id, "run": run.to_dict()}


def run_evaluation(dataset_path: Path, max_samples: int, run_name: str, progress) -> dict[str, Any]:
    report = Evaluator().run_benchmark(dataset_path=dataset_path, max_samples=max_samples, run_name=run_name,
        progress_cb=lambda done, total, message: progress(message, done / max(1, total)))
    return asdict(report)


def fact_audit(run: RunResult) -> list[dict[str, Any]]:
    """Exact audit-table derivation from the original Fact Check Streamlit page."""
    active_id = run.chosen_cand_id if run.chosen_cand_id is not None else 0
    report = run.reports[active_id] if active_id < len(run.reports) else None
    extractor = FactExtractor()
    source_text = " ".join(run.source_sentences)
    source_numbers = [number for number in extractor.extract(source_text).numbers if not number.year]
    rows: list[dict[str, Any]] = []
    for sent_idx, sentence in enumerate(run.chosen_sentences):
        facts = extractor.extract(sentence)
        for number in (item for item in facts.numbers if not item.year):
            hit = next((source for source in source_numbers if _match(number, source)), None)
            issue = next((item.kind for item in (report.facts.issues if report else []) if item.summary_sent_idx == sent_idx and number.raw in item.detail), None)
            status = "Verified"
            if hit is None:
                status = "Scale Mismatch" if issue == "scale_mismatch" else "Numeric Unsupported"
            elif number.cur and hit.cur and number.cur != hit.cur:
                status = "Currency Mismatch"
            elif number.pct != hit.pct:
                status = "Percent Mismatch"
            elif issue == "direction_conflict":
                status = "Direction Conflict"
            rows.append({"sentence": sent_idx + 1, "type": "Number", "summary_token": number.raw, "value": f"{number.value:,.2f}",
                         "scale": f"{number.scale:,.0f}" if number.scale != 1 else "1x", "currency": number.cur or "-", "percent": "Yes" if number.pct else "No",
                         "source_match": hit.raw if hit else "None", "status": status})
        for entity in facts.entities:
            issue = next((item.kind for item in (report.facts.issues if report else []) if item.summary_sent_idx == sent_idx and entity in item.detail), None)
            matched = entity.lower() in source_text.lower()
            rows.append({"sentence": sent_idx + 1, "type": "Entity", "summary_token": entity, "value": "-", "scale": "-", "currency": "-", "percent": "-",
                         "source_match": entity if matched else "None", "status": "Verified" if matched and not issue else "Entity Unsupported"})
    return rows


def projection(run: RunResult) -> dict[str, Any]:
    """Return deterministic t-SNE coordinates using the original projection algorithm."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.manifold import TSNE
    active_id = run.chosen_cand_id if run.chosen_cand_id is not None else 0
    report = run.reports[active_id] if active_id < len(run.reports) else None
    flagged = set(report.flagged_sentences(get_config().entailment_threshold) if report else [])
    source = run.source_sentences[:300 - len(run.chosen_sentences)]
    sentences = source + run.chosen_sentences
    if len(sentences) < 4:
        return {"points": [], "message": "Too few sentences for t-SNE projection (need >= 4)."}
    try:
        matrix = TfidfVectorizer(max_features=128, stop_words="english").fit_transform(sentences).toarray()
    except ValueError:
        matrix = TfidfVectorizer(max_features=64, analyzer="char", ngram_range=(2, 4)).fit_transform(sentences).toarray()
    coords = TSNE(n_components=2, perplexity=min(30, max(2, (len(sentences) - 1) // 3)), random_state=42, init="pca", learning_rate="auto").fit_transform(matrix)
    points = []
    for index, (x, y) in enumerate(coords):
        is_source = index < len(source)
        summary_index = index - len(source)
        points.append({"x": float(x), "y": float(y), "text": sentences[index], "index": index + 1 if is_source else summary_index + 1,
                       "kind": "source" if is_source else ("flagged" if summary_index in flagged else "supported")})
    return {"points": points, "message": None}


def system_info() -> dict[str, Any]:
    cfg = get_config()
    cuda = torch.cuda.is_available()
    result = {"cuda_available": cuda, "device": cfg.device, "precision": "float16" if cfg.fp16 else "float32"}
    if cuda:
        result.update({"gpu_name": torch.cuda.get_device_name(0), "allocated_mb": round(torch.cuda.memory_allocated(0) / 2**20, 1), "reserved_mb": round(torch.cuda.memory_reserved(0) / 2**20, 1), "total_mb": round(torch.cuda.get_device_properties(0).total_memory / 2**20, 1)})
    return result


def settings() -> dict[str, Any]:
    cfg = get_config()
    return {"n_candidates": cfg.n_candidates, "entailment_threshold": cfg.entailment_threshold, "top_k_premise": cfg.top_k_premise,
            "device": cfg.device if cfg.device in {"cuda", "cpu"} else "auto", "fp16": cfg.fp16, "cache_root": str(cfg.cache_root)}


def save_settings(values: dict[str, Any]) -> dict[str, Any]:
    assert_not_c_drive(values["cache_root"], "cache_root")
    path = PROJECT_ROOT / "config.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    data.setdefault("model", {}).update({key: values[key] for key in ("n_candidates", "entailment_threshold", "top_k_premise", "device", "fp16")})
    data.setdefault("cache", {})["root"] = values["cache_root"]
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")
    return {"message": "Saved to config.yaml. Restart the API to apply model and cache changes.", **values}


def self_test() -> dict[str, str]:
    from equisumm_mvp.fact_verifier import FactVerifier
    verifier = FactVerifier()
    source = ["Acme Corp reported revenue of $1.2 billion for the quarter.", "Net income fell 8% to $90 million, driven by higher costs.", "CEO Jane Roe said the board approved a dividend."]
    kinds = lambda text: {issue.kind for issue in verifier.verify([text], source).issues}
    assert "scale_mismatch" in kinds("Acme Corp reported revenue of $1.2 million.")
    assert "direction_conflict" in kinds("Net income rose 8% to $90 million.")
    assert "entity_unsupported" in kinds("Globex Holdings approved a dividend.")
    assert not kinds("Acme Corp revenue was about $1.2 billion and net income fell 8%.")
    return {"message": "All offline fact check assertions passed successfully."}
