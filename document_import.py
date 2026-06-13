import csv
import io
import re
from pathlib import Path
from typing import Dict, List


CLAIMS_START_MARKERS = (
    "【特許請求の範囲】",
    "[特許請求の範囲]",
)

CLAIMS_END_MARKERS = (
    "【発明の詳細な説明】",
    "【技術分野】",
    "【背景技術】",
    "【要約】",
    "[発明の詳細な説明]",
)


def extract_uploaded_document(file_name: str, content: bytes) -> Dict[str, str]:
    suffix = Path(file_name or "").suffix.lower()
    if suffix == ".pdf":
        raw_text = extract_pdf_text(content)
    else:
        raw_text = decode_text(content)

    claims_text = extract_claims_section(raw_text)
    return {
        "claims_text": claims_text,
        "patent_number": detect_patent_number(raw_text, file_name),
        "source_name": file_name,
    }


def extract_uploaded_documents(file_name: str, content: bytes) -> List[Dict[str, str]]:
    suffix = Path(file_name or "").suffix.lower()
    if suffix != ".csv":
        return [extract_uploaded_document(file_name, content)]

    text = decode_text(content)
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return [extract_uploaded_document(file_name, content)]

    patent_keys = ("patent_number", "publication_number", "特許番号", "公開番号", "文献番号")
    claim_number_keys = ("claim_number", "請求項番号", "claim")
    claim_text_keys = ("claim_text", "claims_text", "請求項", "請求項本文", "text")
    grouped = {}

    for row_index, row in enumerate(rows, start=1):
        patent_number = _first_value(row, patent_keys) or f"{Path(file_name).stem}-{row_index}"
        claim_text = _first_value(row, claim_text_keys)
        if not claim_text:
            continue
        claim_number = _first_value(row, claim_number_keys)
        if claim_number and not re.search(r"【\s*請求項", claim_text):
            claim_text = f"【請求項{claim_number}】\n{claim_text}"
        grouped.setdefault(patent_number, []).append(claim_text)

    if not grouped:
        return [extract_uploaded_document(file_name, content)]

    return [
        {
            "claims_text": "\n".join(claims),
            "patent_number": patent_number,
            "source_name": file_name,
        }
        for patent_number, claims in grouped.items()
    ]


def extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except (ImportError, RuntimeError):
        try:
            import fitz
        except ImportError as exc:
            raise RuntimeError(
                "PDF読込にはpypdfが必要です。requirements.txtを再インストールしてください。"
            ) from exc

        document = fitz.open(stream=content, filetype="pdf")
        try:
            return "\n".join(page.get_text() for page in document)
        finally:
            document.close()


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "cp932", "shift_jis"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def extract_claims_section(raw_text: str) -> str:
    compact_lines = []
    for raw_line in str(raw_text or "").replace("\r", "\n").splitlines():
        line = re.sub(r"[ \t\u3000]+", "", raw_line)
        if not line:
            continue
        if re.fullmatch(r"\(\d+\)", line):
            continue
        if re.fullmatch(
            r"(?:\(\d+\))?JP\d{6,9}[A-Z]\d.*",
            line,
            flags=re.IGNORECASE,
        ):
            continue
        if re.fullmatch(r"(?:10|20|30|40|50)", line):
            continue
        compact_lines.append(line)

    compact = "".join(compact_lines)
    start = _first_marker_index(compact, CLAIMS_START_MARKERS)
    if start >= 0:
        heading_end = compact.find("】", start)
        start = heading_end + 1 if heading_end >= 0 else start
    else:
        claim_match = re.search(r"【請求項[0-9０-９]+】", compact)
        start = claim_match.start() if claim_match else 0

    end_candidates = [
        compact.find(marker, start)
        for marker in CLAIMS_END_MARKERS
        if compact.find(marker, start) >= 0
    ]
    end = min(end_candidates) if end_candidates else len(compact)
    claims = compact[start:end].strip()

    claims = re.sub(r"(?=【請求項[0-9０-９]+】)", "\n", claims)
    claims = re.sub(r"(【請求項[0-9０-９]+】)", r"\1\n", claims)
    claims = re.sub(r"\n{2,}", "\n", claims).strip()
    return claims


def detect_patent_number(raw_text: str, file_name: str = "") -> str:
    compact = re.sub(r"\s+", "", str(raw_text or ""))
    match = re.search(r"JP(\d{7})((?:B|A|U)\d)", compact, flags=re.IGNORECASE)
    if match:
        return f"JP{match.group(1)}{match.group(2).upper()}"

    file_digits = re.search(r"(?:JPB?|JPA?)?[\s_-]*0*(\d{7})", file_name or "", flags=re.IGNORECASE)
    if file_digits:
        return f"JP{file_digits.group(1)}"
    return ""


def _first_marker_index(text: str, markers) -> int:
    positions = [text.find(marker) for marker in markers if text.find(marker) >= 0]
    return min(positions) if positions else -1


def _first_value(row: Dict[str, str], keys) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""
