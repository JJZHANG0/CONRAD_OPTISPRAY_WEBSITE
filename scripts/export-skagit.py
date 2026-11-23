"""Export the frozen Skagit run for the website without modifying platform files."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import shutil
from pathlib import Path

RUN = "artifacts/deposition-demo/af5bc6e676d0/run-03"
PLANS = "app/examples/field-route/local/recognition-matrix/skagit"
INPUT_HASH = "af5bc6e676d057c8d1f773dfd9afaf17e736b8edfd6f799a940ced4262f7387b"


def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        yield from csv.DictReader(stream)


def write(path, data):
    encoded = json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    path.write_bytes(gzip.compress(encoded, mtime=0) if path.suffix == ".bin" else encoded + b"\n")


def export(platform, output):
    run = platform / RUN
    source, results = (read(run / filename) for filename in ("input.json", "results.json"))
    display = read(run / "route-visual-display.json")
    sample = read(run / "trajectory-samples.json")
    prediction = "coupled"
    metrics = results["scenarios"][prediction]["metrics"]
    releases = results["release_table_sha256"]
    assert hashlib.sha256(json.dumps(source, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() == INPUT_HASH
    assert results["input_sha256"] == sample["source_input_sha256"] == INPUT_HASH
    assert sample["release_table_sha256"] == releases
    assert results["scenarios"][prediction]["release_table_sha256"] == releases
    assert all(value == 0 for value in sample["maximum_endpoint_absolute_error"].values())

    segments = source["route"]["segments"]
    landings = []
    sampled_ids = set(sample["selected_particle_ids"])
    initial_samples = []
    for row in rows(run / "trajectories.csv"):
        if row["scenario"] != prediction:
            continue
        if int(row["particle_id"]) in sampled_ids:
            initial_samples.append((int(row["particle_id"]), float(row["initial_diameter_um"]),
                                    float(row["release_time_s"]), row["outcome"]))
        if row["outcome"] in ("field_deposition", "off_field_deposition"):
            landings.append([float(row[key]) for key in (
                "landing_time_s", "landing_east_m", "landing_north_m", "water_remaining_kg", "nonvolatile_mass_kg")])
    trace_display = display["trajectory_display"]
    large = {pid for pid, diameter, _, _ in initial_samples
             if diameter >= trace_display["minimum_initial_diameter_um"]}
    assert len(large) == trace_display["sample_count_per_scenario"]
    # Use the same northbound pass for all sizes, with complete landed paths.
    early = [row for row in initial_samples if 31 <= row[2] <= 38 and row[3] == "field_deposition"]
    representatives = [min(early, key=lambda row: (abs(row[1] - target), abs(row[2] - 36)))
                       for target in (150, 230, 340)]
    ids = {row[0] for row in representatives}
    paths = {}
    for row in rows(run / "trajectory-samples.csv"):
        if row["scenario"] != prediction:
            continue
        pid = int(row["particle_id"])
        if pid in large or pid in ids:
            point = [float(row[key]) for key in ("time_s", "east_m", "north_m", "up_m",
                                                     "diameter_um", "water_mass_kg", "nonvolatile_mass_kg")]
            paths.setdefault(pid, []).append(point)

    plans = read(platform / PLANS / "route-comparison.json")
    review = read(platform / PLANS / "confirmed-review.json")
    imagery = source["provenance"]["imagery"]
    image_path = platform / imagery["path"]
    assert hashlib.sha256(image_path.read_bytes()).hexdigest() == imagery["sha256"] == plans["imagery"]["sha256"]
    assert plans["revision"] == review["case_revision"]
    assert review["plan"]["id"] == "A"
    assert review["reviewed_segments"] == [{"number": s["source_segment_number"], "spray": s["spray"]} for s in segments]
    for segment, approved in zip(segments, review["plan"]["segments"], strict=True):
        assert list(approved["a"].values()) == segment["start_enu_m"][:2]
        assert list(approved["b"].values()) == segment["end_enu_m"][:2]
        assert math.isclose(approved["duration"], segment["duration_s"])
    assert source["field_polygon_east_north_m"] == [[p["east"], p["north"]] for p in plans["fieldLocal"]]
    for plan in plans["plans"]:
        del plan["origin"]
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(image_path, output / "naip-skagit.png")
    landings.sort()
    assert len(landings) == metrics["landed_particles"]
    assert ids | large <= paths.keys()
    write(output / "case.json", {
        "id": results["case_id"], "run": "run-03", "model": results["model_version"],
        "inputHash": INPUT_HASH, "releaseHash": releases,
        "environment": source["environment"],
        "display": {key: display[key] for key in ("color_max_gm2", "overview_crop_px", "trajectory_display")},
        "grid": {**source["display"], "east": source["domain"]["east_m"], "north": source["domain"]["north_m"]},
        "affine": imagery["local_to_pixels"], "imageSize": [imagery["width_px"], imagery["height_px"]],
        "field": source["field_polygon_east_north_m"], "segments": segments,
        "routeEnd": segments[-1]["start_time_s"] + segments[-1]["duration_s"],
        "end": landings[-1][0],
        "plans": plans["plans"], "zones": plans["zoneRings"], "reviewed": review["reviewed_segments"],
        "metrics": metrics,
    })
    write(output / "physics.json", {
        "samples": [{"id": pid, "diameter": diameter} for pid, diameter, _, _ in representatives],
        "paths": [paths[pid] for pid, _, _, _ in representatives],
    })
    # The browser bins the original landing positions, times and mass.
    write(output / "landings.bin", landings)
    # Playback needs position, initial diameter and the original sample times.
    tracks = [[paths[pid][0][4], [[p[0], *[round(v, 5) for v in p[1:4]]] for p in paths[pid]]]
              for pid in large]
    write(output / "tracks.bin", sorted(tracks, key=lambda track: track[1][0][0]))
    print("Physics representative particles:", [(pid, round(d, 1)) for pid, d, *_ in representatives])
    print("Landed droplets:", len(landings))
    px, py, ex, _, _, ny = imagery["local_to_pixels"]
    pixels = [(px + ex*row[1], py + ny*row[2]) for row in landings]
    print("Landing pixel extents:", [(min(values), max(values)) for values in zip(*pixels)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/skagit")
    args = parser.parse_args()
    export(args.platform, args.output)
