from __future__ import annotations

import threading
import traceback
import uuid
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from app.config import get_config


@dataclass
class Job:
    job_id: str
    kind: str
    status: str = "queued"
    progress: float = 0.0
    message: str = "Queued"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    result: dict[str, Any] | None = None
    error: str | None = None

    def public(self) -> dict[str, Any]:
        return asdict(self)


class JobManager:
    """Single-worker queue keeps model loading and GPU execution process-wide and serial."""

    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="equisumm-ml")
        self._jobs_dir = get_config().cache_root / "jobs"
        self._jobs_dir.mkdir(parents=True, exist_ok=True)
        self._restore_interrupted_jobs()

    def _path(self, job_id: str):
        return self._jobs_dir / f"{job_id}.json"

    def _save(self, job: Job) -> None:
        """Persist a small status record so a process restart is explainable to clients."""
        self._path(job.job_id).write_text(json.dumps(job.public()), encoding="utf-8")

    def _restore_interrupted_jobs(self) -> None:
        """Jobs cannot resume inference after a process exit; mark them terminal instead of orphaning them."""
        for path in self._jobs_dir.glob("*.json"):
            try:
                job = Job(**json.loads(path.read_text(encoding="utf-8")))
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                continue
            if job.status in {"queued", "running"}:
                job.status = "failed"
                job.message = "Interrupted by API restart"
                job.error = "The API restarted before this job completed. Submit the document again."
                job.updated_at = datetime.now(timezone.utc).isoformat()
                self._save(job)
            self._jobs[job.job_id] = job

    def submit(self, kind: str, work: Callable[[Callable[[str, float], None]], dict[str, Any]]) -> Job:
        job = Job(job_id=uuid.uuid4().hex[:12], kind=kind)
        with self._lock:
            self._jobs[job.job_id] = job
            self._save(job)

        def update(message: str, progress: float) -> None:
            with self._lock:
                job.message = message
                job.progress = max(0.0, min(1.0, progress))
                job.updated_at = datetime.now(timezone.utc).isoformat()
                self._save(job)

        def runner() -> None:
            with self._lock:
                job.status = "running"
                job.message = "Starting"
                job.updated_at = datetime.now(timezone.utc).isoformat()
                self._save(job)
            try:
                result = work(update)
                with self._lock:
                    job.result = result
                    job.status = "completed"
                    job.progress = 1.0
                    job.message = "Complete"
                    job.updated_at = datetime.now(timezone.utc).isoformat()
                    self._save(job)
            except Exception as exc:
                with self._lock:
                    job.status = "failed"
                    job.error = str(exc)
                    job.message = "Failed"
                    job.updated_at = datetime.now(timezone.utc).isoformat()
                    self._save(job)
                traceback.print_exc()

        self._executor.submit(runner)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                return job
            try:
                job = Job(**json.loads(self._path(job_id).read_text(encoding="utf-8")))
            except (OSError, TypeError, ValueError, json.JSONDecodeError):
                return None
            self._jobs[job_id] = job
            return job

    def counts(self) -> dict[str, int]:
        with self._lock:
            return {"queued": sum(j.status == "queued" for j in self._jobs.values()), "running": sum(j.status == "running" for j in self._jobs.values())}


jobs = JobManager()
