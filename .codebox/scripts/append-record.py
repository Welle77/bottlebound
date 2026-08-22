#!/usr/bin/env python3
"""Validate and append report.jsonl / learnings.jsonl records.

Subcommands:
  report <path>   Validate a report.jsonl record from stdin and append it.
  learning        Validate a learnings.jsonl record from stdin and append it
                   to <repo-root>/.codebox/learnings.jsonl.
  check <file>    Validate an entire existing JSONL file line by line.

Exit codes:
  0  success
  1  schema validation failure
  2  usage error
  3  environment error (not a git worktree, unreadable/unwritable file)
"""

import json
import os
import re
import subprocess
import sys

EXIT_OK = 0
EXIT_VALIDATION = 1
EXIT_USAGE = 2
EXIT_ENV = 3

REPORT_KEYS = (
    "phase",
    "type",
    "ticket",
    "date",
    "outcome",
    "summary",
    "rationale",
    "verification",
    "findings",
    "blockers",
)
VERIFICATION_KEYS = ("command", "outcome", "reason")
FINDING_KEYS = (
    "severity",
    "axis",
    "location",
    "evidence",
    "violated",
    "issue",
    "remediation",
)
LEARNING_KEYS = ("timestamp", "agent", "workflow", "failure", "adaptation", "rule")

PHASES = {"Planning", "Code", "Test", "Review", "Ship"}
TYPES = {"primary", "remediation", "follow-up"}
OUTCOMES = {"done", "blocked", "skipped", "approved"}
VERIFICATION_OUTCOMES = {"passed", "failed", "not run"}
SEVERITIES = {"critical", "high", "medium", "low"}
AXES = {"Standards", "Spec", "Security"}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$"
)


class ValidationError(Exception):
    pass


def _require_object(value, what):
    if not isinstance(value, dict):
        raise ValidationError(f"{what} must be a JSON object")


def _require_exact_keys(obj, keys, what):
    obj_keys = set(obj.keys())
    expected_keys = set(keys)
    unknown = obj_keys - expected_keys
    if unknown:
        raise ValidationError(
            f"{what} has unknown key(s): {', '.join(sorted(unknown))}"
        )
    missing = expected_keys - obj_keys
    if missing:
        raise ValidationError(
            f"{what} is missing required key(s): {', '.join(sorted(missing))}"
        )


def _require_nonempty_str(value, what):
    if not isinstance(value, str) or value == "":
        raise ValidationError(f"{what} must be a non-empty string")
    return value


def _require_str_enum(value, allowed, what):
    _require_nonempty_str(value, what)
    if value not in allowed:
        raise ValidationError(
            f"{what} must be one of {sorted(allowed)}, got {value!r}"
        )
    return value


def _require_list(value, what):
    if not isinstance(value, list):
        raise ValidationError(f"{what} must be an array (use [] when empty)")
    return value


def _require_str_list(value, what, allow_empty):
    _require_list(value, what)
    if not allow_empty and len(value) == 0:
        raise ValidationError(f"{what} must not be empty")
    for i, item in enumerate(value):
        _require_nonempty_str(item, f"{what}[{i}]")
    return value


def canonicalize_report(obj):
    _require_object(obj, "record")
    _require_exact_keys(obj, REPORT_KEYS, "record")

    phase = _require_str_enum(obj["phase"], PHASES, "phase")
    type_ = _require_str_enum(obj["type"], TYPES, "type")

    ticket = obj["ticket"]
    if ticket is not None:
        _require_nonempty_str(ticket, "ticket")

    date = obj["date"]
    _require_nonempty_str(date, "date")
    if not DATE_RE.match(date):
        raise ValidationError("date must match YYYY-MM-DD")

    outcome = _require_str_enum(obj["outcome"], OUTCOMES, "outcome")

    summary = _require_str_list(obj["summary"], "summary", allow_empty=False)
    rationale = _require_str_list(obj["rationale"], "rationale", allow_empty=False)

    verification_in = _require_list(obj["verification"], "verification")
    verification = []
    for i, entry in enumerate(verification_in):
        what = f"verification[{i}]"
        _require_object(entry, what)
        _require_exact_keys(entry, VERIFICATION_KEYS, what)
        command = _require_nonempty_str(entry["command"], f"{what}.command")
        v_outcome = _require_str_enum(
            entry["outcome"], VERIFICATION_OUTCOMES, f"{what}.outcome"
        )
        reason = entry["reason"]
        if not isinstance(reason, str):
            raise ValidationError(f"{what}.reason must be a string")
        if v_outcome != "passed" and reason == "":
            raise ValidationError(
                f"{what}.reason is required when outcome is not 'passed'"
            )
        verification.append(
            {"command": command, "outcome": v_outcome, "reason": reason}
        )

    findings_in = _require_list(obj["findings"], "findings")
    findings = []
    for i, entry in enumerate(findings_in):
        what = f"findings[{i}]"
        _require_object(entry, what)
        _require_exact_keys(entry, FINDING_KEYS, what)
        severity = _require_str_enum(
            entry["severity"], SEVERITIES, f"{what}.severity"
        )
        axis = _require_str_enum(entry["axis"], AXES, f"{what}.axis")
        location = _require_nonempty_str(entry["location"], f"{what}.location")
        evidence = _require_nonempty_str(entry["evidence"], f"{what}.evidence")
        violated = _require_nonempty_str(entry["violated"], f"{what}.violated")
        issue = _require_nonempty_str(entry["issue"], f"{what}.issue")
        remediation = _require_nonempty_str(
            entry["remediation"], f"{what}.remediation"
        )
        findings.append(
            {
                "severity": severity,
                "axis": axis,
                "location": location,
                "evidence": evidence,
                "violated": violated,
                "issue": issue,
                "remediation": remediation,
            }
        )

    blockers = _require_str_list(obj["blockers"], "blockers", allow_empty=True)

    return {
        "phase": phase,
        "type": type_,
        "ticket": ticket,
        "date": date,
        "outcome": outcome,
        "summary": summary,
        "rationale": rationale,
        "verification": verification,
        "findings": findings,
        "blockers": blockers,
    }


def canonicalize_learning(obj):
    _require_object(obj, "record")
    _require_exact_keys(obj, LEARNING_KEYS, "record")

    timestamp = _require_nonempty_str(obj["timestamp"], "timestamp")
    if not TIMESTAMP_RE.match(timestamp):
        raise ValidationError(
            "timestamp must be RFC 3339 UTC, e.g. 2026-08-13T10:30:00Z"
        )
    agent = _require_nonempty_str(obj["agent"], "agent")
    workflow = _require_nonempty_str(obj["workflow"], "workflow")
    failure = _require_nonempty_str(obj["failure"], "failure")
    adaptation = _require_nonempty_str(obj["adaptation"], "adaptation")
    rule = _require_nonempty_str(obj["rule"], "rule")

    return {
        "timestamp": timestamp,
        "agent": agent,
        "workflow": workflow,
        "failure": failure,
        "adaptation": adaptation,
        "rule": rule,
    }


def parse_record(raw_text):
    try:
        obj = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"malformed JSON: {exc}") from exc
    return obj


def canonical_line(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n"


def append_atomic(path, line):
    try:
        fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o644)
    except OSError as exc:
        raise EnvironmentError(f"cannot open {path} for append: {exc}") from exc
    try:
        os.write(fd, line.encode("utf-8"))
    finally:
        os.close(fd)


def git_root():
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise EnvironmentError(f"cannot run git: {exc}") from exc
    if result.returncode != 0:
        raise EnvironmentError("not inside a Git worktree")
    return result.stdout.strip()


def cmd_report(path):
    raw_text = sys.stdin.read()
    try:
        obj = parse_record(raw_text)
        canonical = canonicalize_report(obj)
    except ValidationError as exc:
        print(f"append-record report: {exc}", file=sys.stderr)
        return EXIT_VALIDATION
    line = canonical_line(canonical)
    try:
        append_atomic(path, line)
    except EnvironmentError as exc:
        print(f"append-record report: {exc}", file=sys.stderr)
        return EXIT_ENV
    return EXIT_OK


def cmd_learning():
    raw_text = sys.stdin.read()
    try:
        root = git_root()
    except EnvironmentError as exc:
        print(f"append-record learning: {exc}", file=sys.stderr)
        return EXIT_ENV
    try:
        obj = parse_record(raw_text)
        canonical = canonicalize_learning(obj)
    except ValidationError as exc:
        print(f"append-record learning: {exc}", file=sys.stderr)
        return EXIT_VALIDATION
    line = canonical_line(canonical)
    path = os.path.join(root, ".codebox", "learnings.jsonl")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        append_atomic(path, line)
    except EnvironmentError as exc:
        print(f"append-record learning: {exc}", file=sys.stderr)
        return EXIT_ENV
    return EXIT_OK


def cmd_check(path):
    basename = os.path.basename(path)
    canonicalize = canonicalize_learning if basename == "learnings.jsonl" else canonicalize_report

    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError as exc:
        print(f"append-record check: cannot read {path}: {exc}", file=sys.stderr)
        return EXIT_ENV

    for lineno, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if stripped == "":
            continue
        try:
            obj = parse_record(stripped)
            canonicalize(obj)
        except ValidationError as exc:
            print(f"append-record check: line {lineno}: {exc}", file=sys.stderr)
            return EXIT_VALIDATION

    return EXIT_OK


def usage():
    print(__doc__, file=sys.stderr)
    return EXIT_USAGE


def main(argv):
    if not argv:
        return usage()

    subcommand = argv[0]
    rest = argv[1:]

    if subcommand == "report":
        if len(rest) != 1:
            return usage()
        return cmd_report(rest[0])

    if subcommand == "learning":
        if len(rest) != 0:
            return usage()
        return cmd_learning()

    if subcommand == "check":
        if len(rest) != 1:
            return usage()
        return cmd_check(rest[0])

    return usage()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
