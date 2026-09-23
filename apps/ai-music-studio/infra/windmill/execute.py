"""Fixed Windmill script: arguments carry no credentials or user executable code."""
import importlib
import sys


def main(job_id: str, attempt: int):
    sys.path.insert(0, "/opt/studio/worker")
    return importlib.import_module("studio_worker.entry").execute(job_id, attempt)
