"""Package unchanged T3 sources for Lexicon's adapter.

Usage: python3 scripts/package-t3.py /path/to/t3code <commit>
       python3 scripts/package-t3.py /path/to/t3code --working-tree
Working-tree snapshots include their base commit, source digest, and scoped patch.
No T3 web components or application code are included.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import shutil
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("root", type=Path)
parser.add_argument("revision", nargs="?")
parser.add_argument("--working-tree", action="store_true")
args = parser.parse_args()
if not args.revision and not args.working_tree:
    parser.error("provide a committed revision or --working-tree")
root = args.root.resolve()

def git(*args):
    return subprocess.check_output(["git", "-C", root, *args])

commit = git("rev-parse", "--verify", (args.revision or "HEAD") + "^{commit}").decode().strip()
destination = Path(__file__).resolve().parents[1] / "vendor" / "t3"
destination.mkdir(parents=True, exist_ok=True)
names = ("contracts", "shared", "client-runtime")
paths = ["LICENSE", "pnpm-workspace.yaml", "patches", *(f"packages/{name}" for name in names)]

def included(path):
    if path in ("LICENSE", "pnpm-workspace.yaml") or re.fullmatch(r"patches/effect@[^/]+\.patch", path):
        return True
    for name in names:
        prefix = f"packages/{name}/"
        if path.startswith(prefix):
            relative = path[len(prefix):]
            return relative == "package.json" or (relative.startswith("src/") and not re.search(r"\.(test|spec)\.", relative))
    return False

def catalog_for(files):
    workspace = files["pnpm-workspace.yaml"].decode()
    catalog_text = workspace.split("\ncatalog:\n", 1)[1].split("\n\n", 1)[0]
    return dict(re.findall(r'^  "?([^"\s]+)"?: (.+)$', catalog_text, re.M))

def inputs_only(files):
    effect = catalog_for(files)["effect"]
    return {path: data for path, data in files.items()
            if not path.startswith("patches/") or path == f"patches/effect@{effect}.patch"}

with tarfile.open(fileobj=io.BytesIO(git("archive", commit, *paths))) as source:
    baseline = inputs_only({member.name: source.extractfile(member).read() for member in source
                            if member.isfile() and included(member.name)})
files = baseline
if args.working_tree:
    files = {}
    for path in sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", *paths).decode().split("\0"))):
        if not included(path):
            continue
        target = root / path
        if target.is_symlink():
            raise RuntimeError(f"Source input must be a regular file: {path}")
        if target.is_file():
            files[path] = target.read_bytes()
    files = inputs_only(files)

# Hash only the exact inputs used by the package operation, with unambiguous
# names and lengths. Unrelated application edits and source tests stay outside.
digest = hashlib.sha256()
for path, data in sorted(files.items()):
    digest.update(path.encode() + b"\0" + str(len(data)).encode() + b"\0" + data)
fingerprint = digest.hexdigest()
catalog = catalog_for(files)
version = "0.0.0-lexicon." + commit[:12]
if args.working_tree:
    version += ".local." + fingerprint[:16]

archives = {}
for name in names:
    prefix = f"packages/{name}/"
    manifest = json.loads(files[prefix + "package.json"])
    manifest.update(version=version, files=["src", "LICENSE"], scripts={})
    manifest.pop("devDependencies", None)
    for dependency, value in manifest.get("dependencies", {}).items():
        if value.startswith("workspace:"):
            manifest["dependencies"][dependency] = version
        elif value == "catalog:":
            manifest["dependencies"][dependency] = catalog[dependency].strip('"')
    archives[name] = f"{name}-{version}.tgz"
    with (destination / archives[name]).open("wb") as output:
        with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w") as package:
                def add(path, data):
                    info = tarfile.TarInfo("package/" + path)
                    info.size, info.mode = len(data), 0o644
                    package.addfile(info, io.BytesIO(data))
                add("package.json", json.dumps(manifest, indent=2).encode() + b"\n")
                add("LICENSE", files["LICENSE"])
                for path, data in sorted(files.items()):
                    if path.startswith(prefix + "src/"):
                        add(path[len(prefix):], data)
effect = catalog["effect"]
upstream_patch = files[f"patches/effect@{effect}.patch"]
# Some upstream hunks have stale line offsets. Bun 1.2 applies those literally;
# normalize the diff with Git so Bun and pnpm produce identical patched files.
with tempfile.TemporaryDirectory() as temporary:
    scratch = Path(temporary)
    archive = urllib.request.urlopen(f"https://registry.npmjs.org/effect/-/effect-{effect}.tgz").read()
    source = tarfile.open(fileobj=io.BytesIO(archive))
    for member in source:
        if member.isfile() and member.name.startswith("package/") and ".." not in member.name.split("/"):
            target = scratch / "before" / member.name[len("package/"):]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.extractfile(member).read())
    shutil.copytree(scratch / "before", scratch / "after")
    subprocess.run(["git", "apply", "--recount", "--unsafe-paths", "-"], input=upstream_patch, cwd=scratch / "after", check=True)
    diff = subprocess.run(["git", "diff", "--no-index", "--", "before", "after"], cwd=scratch, capture_output=True)
    if diff.returncode != 1:
        raise RuntimeError("Could not normalize the upstream Effect patch")
    (destination / "effect.patch").write_bytes(diff.stdout.replace(b"a/before/", b"a/").replace(b"b/after/", b"b/"))
provenance = {"version": version, "effect": effect, "sourceSha256": fingerprint, "archives": archives}
snapshot_patch = destination / "working-tree.patch"
if args.working_tree:
    with tempfile.TemporaryDirectory() as temporary:
        scratch = Path(temporary)
        for label, contents in (("before", baseline), ("after", files)):
            for path, data in contents.items():
                target = scratch / label / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        diff = subprocess.run(["git", "diff", "--no-index", "--binary", "--no-renames", "--", "before", "after"], cwd=scratch, capture_output=True)
        if diff.returncode not in (0, 1):
            raise RuntimeError(f"Could not capture working-tree snapshot: {diff.stderr.decode()}")
        patch = diff.stdout
        for side in (b"a", b"b"):
            for label in (b"before", b"after"):
                patch = patch.replace(side + b"/" + label + b"/", side + b"/")
        snapshot_patch.write_bytes(patch)
    provenance.update(source="working-tree", baseCommit=commit, patch="working-tree.patch",
                      patchSha256=hashlib.sha256(patch).hexdigest())
else:
    provenance.update(source="commit", commit=commit)
    snapshot_patch.unlink(missing_ok=True)
(destination / "revision.json").write_text(json.dumps(provenance, indent=2) + "\n")
# Bun caches file archives by path. A new source version must use new paths in
# both dependencies and overrides so a frozen install cannot reuse stale code.
manifest_path = destination.parents[1] / "package.json"
manifest = json.loads(manifest_path.read_text())
for section in ("dependencies", "overrides"):
    for name, archive in archives.items():
        manifest[section][f"@t3tools/{name}"] = f"file:vendor/t3/{archive}"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
for archive in destination.glob("*.tgz"):
    if archive.name not in archives.values():
        archive.unlink()
print(f"Packaged T3 {version}")
