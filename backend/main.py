from __future__ import annotations

import csv
import io
import os
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.config import PROJECT_ROOT, get_config
from app.services.store import RunStore
from backend.schemas import EvaluationSubmission, RunSubmission, SettingsUpdate
from backend.services.adapters import fact_audit, parse_upload, projection, run_evaluation, run_pipeline, save_settings, self_test, settings, system_info
from backend.services.jobs import jobs


app = FastAPI(title="EquiSumm API", version="1.0.0")
origins = [item.strip() for item in os.getenv("EQUISUMM_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_run_or_404(run_id: str):
    run = RunStore().load_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' was not found.")
    return run


def get_job_or_404(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' was not found.")
    return job.public()


@app.get("/api/health")
def health():
    return {"status": "ok", "jobs": jobs.counts()}


_SAMPLES = {
    "earnings": ("01_earnings_report.txt", "financial", "Earnings Report"),
    "agreement": ("02_contract_services_agreement.txt", "legal", "Services Agreement"),
    "bill": ("03_legislative_bill_billsum.txt", "general", "Legislative Bill"),
    "memo": ("04_fiduciary_investment_memo.txt", "financial", "Investment Memo"),
}


@app.get("/api/samples")
def list_samples():
    return [{"id": key, "domain": domain, "name": name} for key, (_, domain, name) in _SAMPLES.items()]


@app.get("/api/samples/{sample_id}")
def get_sample(sample_id: str):
    entry = _SAMPLES.get(sample_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Sample was not found.")
    filename, domain, name = entry
    return {"id": sample_id, "name": name, "domain": domain, "text": (PROJECT_ROOT / "samples" / filename).read_text(encoding="utf-8")}


@app.post("/api/jobs", status_code=202)
def create_run_job(payload: RunSubmission):
    job = jobs.submit("verification", lambda progress: run_pipeline(payload.text, payload.domain, payload.n_candidates, progress))
    return job.public()


@app.post("/api/jobs/upload", status_code=202)
async def create_upload_run_job(file: UploadFile = File(...), domain: str = Form("general"), n_candidates: int | None = Form(None)):
    if domain not in {"financial", "legal", "general"}:
        raise HTTPException(status_code=422, detail="domain must be financial, legal, or general.")
    if n_candidates is not None and not 1 <= n_candidates <= 8:
        raise HTTPException(status_code=422, detail="n_candidates must be between 1 and 8.")
    try:
        text = parse_upload(file.filename or "upload", await file.read(), {".txt", ".pdf"})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not text:
        raise HTTPException(status_code=422, detail="No extractable text was found in the upload.")
    job = jobs.submit("verification", lambda progress: run_pipeline(text, domain, n_candidates, progress))
    return {**job.public(), "extracted_characters": len(text)}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    return get_job_or_404(job_id)


@app.get("/api/runs")
def list_runs():
    return RunStore().list_runs()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    return get_run_or_404(run_id).to_dict()


@app.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: str):
    if not RunStore().delete_run(run_id):
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' was not found.")


@app.get("/api/runs/{run_id}/fact-audit")
def run_fact_audit(run_id: str):
    return {"rows": fact_audit(get_run_or_404(run_id))}


@app.get("/api/runs/{run_id}/embeddings")
def run_embeddings(run_id: str):
    return projection(get_run_or_404(run_id))


@app.get("/api/runs/{run_id}/exports/{format}")
def export_run(run_id: str, format: str):
    run = get_run_or_404(run_id)
    store = RunStore()
    if format == "json":
        from fastapi.responses import JSONResponse
        return JSONResponse(run.to_dict(), headers={"Content-Disposition": f'attachment; filename="equisumm_run_{run_id}.json"'})
    if format == "markdown":
        return PlainTextResponse(store.export_markdown(run), media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="equisumm_run_{run_id}.md"'})
    if format == "csv":
        return PlainTextResponse(store.export_csv(run), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="equisumm_run_{run_id}.csv"'})
    raise HTTPException(status_code=404, detail="format must be json, markdown, or csv.")


@app.post("/api/evaluations", status_code=202)
def create_evaluation(payload: EvaluationSubmission):
    dataset = PROJECT_ROOT / "samples" / "05_researcher_benchmark_sample.jsonl"
    job = jobs.submit("evaluation", lambda progress: run_evaluation(dataset, payload.max_samples, payload.run_name, progress))
    return job.public()


@app.post("/api/evaluations/upload", status_code=202)
async def create_upload_evaluation(file: UploadFile = File(...), max_samples: int = Form(5), run_name: str = Form("interactive_eval")):
    if not 1 <= max_samples <= 100:
        raise HTTPException(status_code=422, detail="max_samples must be between 1 and 100.")
    try:
        content = parse_upload(file.filename or "dataset.jsonl", await file.read(), {".jsonl"})
        # Validate line structure before committing the upload to the evaluation cache.
        for line in content.splitlines():
            if line.strip():
                import json
                record = json.loads(line)
                if not isinstance(record, dict) or "text" not in record or "summary" not in record:
                    raise ValueError("Each JSONL record must contain 'text' and 'summary'.")
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid JSONL dataset: {exc}") from exc
    safe_name = "".join(char for char in run_name if char.isalnum() or char in "-_ ").strip().replace(" ", "_") or "interactive_eval"
    path = get_config().eval_dir / f"upload_{safe_name}.jsonl"
    path.write_text(content, encoding="utf-8")
    job = jobs.submit("evaluation", lambda progress: run_evaluation(path, max_samples, safe_name, progress))
    return job.public()


@app.get("/api/system")
def get_system():
    return system_info()


@app.post("/api/system/flush-cache")
def flush_cache():
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return {"message": "CUDA memory cache flushed." if torch.cuda.is_available() else "CPU mode is active; no CUDA cache to flush."}


@app.post("/api/system/self-test")
def run_self_test():
    try:
        return self_test()
    except AssertionError as exc:
        raise HTTPException(status_code=500, detail="Offline fact-verification self-test failed.") from exc


@app.get("/api/settings")
def get_settings():
    return settings()


@app.put("/api/settings")
def update_settings(payload: SettingsUpdate):
    try:
        return save_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
