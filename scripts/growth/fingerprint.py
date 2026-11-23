"""Working-tree source identity, not a signature/attestation.
Hashes Git-tracked + nonignored files, except documentation (.md/docs) and env secrets.
Includes public assets, workflows and all test scripts; ignores generated/cache files via Git.
"""
from pathlib import Path
import hashlib,subprocess
ROOT = Path(__file__).resolve().parents[2]
def fingerprint():
    raw=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=ROOT)
    files=set()
    for name in raw.decode().split('\0'):
        if not name:continue
        path=Path(name)
        if path.parts[0]=='docs' or path.suffix.lower()=='.md' or (path.name.startswith('.env') and path.name!='.env.example'):continue
        if '__pycache__' in path.parts:continue
        if (ROOT/path).is_file():files.add(name)
    digest=hashlib.sha256()
    for name in sorted(files):
        digest.update(name.encode()+b'\0'+hashlib.sha256((ROOT/name).read_bytes()).digest())
    return digest.hexdigest()
if __name__ == '__main__':print(fingerprint())
