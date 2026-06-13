import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Sequence, Tuple


CLAIM_HEADING = re.compile(r"【\s*請求項\s*([0-9０-９]+)\s*】")
PLAIN_CLAIM_HEADING = re.compile(
    r"(?:^|\n)\s*請求項\s*([0-9０-９]+)\s*(?:[:：.]|(?=\n))"
)
DEPENDENCY = re.compile(
    r"請求項\s*([0-9０-９]+)"
    r"(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*"
    r"([0-9０-９]+))?"
)


@dataclass
class Claim:
    number: int
    text: str
    own_text: str
    parents: List[int] = field(default_factory=list)
    target_claims: List[int] = field(default_factory=list)
    requirements: List[str] = field(default_factory=list)
    expanded_requirements: List[str] = field(default_factory=list)
    expanded_text: str = ""

    @property
    def independent(self) -> bool:
        return not self.parents


@dataclass
class PatentDocument:
    patent_number: str
    source_name: str
    claims: Dict[int, Claim]

    @property
    def label(self) -> str:
        return self.patent_number or self.source_name


def to_ascii_digits(value: str) -> str:
    return str(value).translate(str.maketrans("０１２３４５６７８９", "0123456789"))


def parse_claims(text: str) -> Dict[int, Claim]:
    normalized = str(text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    pattern = CLAIM_HEADING if CLAIM_HEADING.search(normalized) else PLAIN_CLAIM_HEADING
    matches = list(pattern.finditer(normalized))

    if not matches:
        return {1: make_claim(1, normalized)} if normalized else {}

    claims = {}
    for index, match in enumerate(matches):
        number = int(to_ascii_digits(match.group(1)))
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        claims[number] = make_claim(number, normalized[start:end].strip())

    expand_claims(claims)
    return claims


def make_claim(number: int, text: str) -> Claim:
    references = extract_dependencies(text, number)
    is_method = bool(re.search(r"方法|工程", text))
    starts_with_claim_reference = bool(re.match(r"^\s*請求項\s*[0-9０-９]+", text))
    product_method_reference = bool(
        re.search(
            r"請求項\s*[0-9０-９]+[^。]*に記載の[^。]*(?:製造|形成|作製)する方法",
            text,
        )
    )
    target_claims = (
        references
        if (
            is_method
            and references
            and (
                product_method_reference
                or (
                    not starts_with_claim_reference
                    and re.search(r"(?:製造|形成|作製)(?:する)?方法", text)
                )
            )
        )
        else []
    )
    parents = [] if target_claims else references
    own_text = strip_dependency_phrase(text)
    requirements = segment_requirements(own_text)
    return Claim(
        number=number,
        text=text,
        own_text=own_text,
        parents=parents,
        target_claims=target_claims,
        requirements=requirements,
    )


def extract_dependencies(text: str, own_number: int) -> List[int]:
    values = set()
    for match in DEPENDENCY.finditer(str(text or "")):
        start = int(to_ascii_digits(match.group(1)))
        end = int(to_ascii_digits(match.group(2))) if match.group(2) else start
        values.update(number for number in range(start, end + 1) if number != own_number)
    return sorted(values)


def strip_dependency_phrase(text: str) -> str:
    value = str(text or "")
    has_dependency_reference = bool(re.search(r"請求項\s*[0-9０-９]+", value))
    value = re.sub(
        r"^\s*請求項\s*[0-9０-９]+"
        r"(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*"
        r"[0-9０-９]+)?"
        r"(?:の(?:いずれか一項|何れか[0-9０-９]+つ))?"
        r"に記載の[^、。]{0,40}において、?",
        "",
        value,
    )
    value = re.sub(
        r"請求項\s*[0-9０-９]+"
        r"(?:\s*(?:又は|または|若しくは|もしくは|ないし|乃至|から|〜|～|-)\s*"
        r"[0-9０-９]+)?"
        r"(?:の(?:いずれか一項|何れか[0-9０-９]+つ))?に記載の",
        "",
        value,
    )
    if has_dependency_reference:
        value = re.sub(
            r"、\s*[^、。]{0,60}(?:装置|方法|システム|貼付体|組成物|プログラム|物)。?$",
            "。",
            value,
        )
    return value.strip(" 、")


def segment_requirements(text: str) -> List[str]:
    normalized = re.sub(r"[ \t\u3000\n]+", "", str(text or "")).strip()
    if not normalized:
        return []

    segments = []
    buffer = ""
    for index, character in enumerate(normalized):
        rest = normalized[index + 1 :]
        if character in "。；;":
            buffer += character
            _push_segment(segments, buffer)
            buffer = ""
            continue

        if character == "、":
            category_boundary = bool(
                re.search(
                    r"(?:装置|システム|プログラム|組成物|貼付体|物|方法|製造方法|工程)"
                    r"(?:であって|であり|において)$",
                    buffer,
                )
            )
            list_boundary = bool(
                re.search(r"と$", buffer)
                and re.match(r"^(?:前記|当該|[一-龠ァ-ンA-Za-z0-9])", rest)
                and not re.search(r"(?:又は|若しくは|もしくは)$", buffer)
                and not re.match(r"^(?:前記|当該)[^、。]{0,45}との比", rest)
            )
            predicate_boundary = bool(
                _has_completed_predicate(buffer)
                and re.match(r"^(?:前記|当該|ここで|ただし|さらに|そして)", rest)
            )
            if category_boundary or list_boundary or predicate_boundary:
                _push_segment(segments, buffer)
                buffer = ""
                continue
        buffer += character

    _push_segment(segments, buffer)
    return _merge_fragments(segments)


def _has_completed_predicate(text: str) -> bool:
    return bool(
        re.search(
            r"(?:を備え|を有し|を含み|とを備え|とを有し|であり|であって|可能とし|"
            r"可能であり|可能になる|構成され|形成され|設けられ|配置され|接続され|"
            r"延在し|位置し|画定され|示され|露出させ)$",
            text,
        )
    )


def _push_segment(segments: List[str], text: str) -> None:
    clean = re.sub(r"^[、と]+|、+$", "", str(text or "")).strip()
    if len(clean) > 2:
        segments.append(clean)


def _merge_fragments(segments: Sequence[str]) -> List[str]:
    merged: List[str] = []
    for segment in segments:
        incomplete = bool(re.match(r"^(?:を|とを|であり|であって)", segment))
        if merged and (incomplete or len(segment) < 6):
            merged[-1] = f"{merged[-1].rstrip('。')}、{segment}"
        else:
            merged.append(segment)
    return merged


def expand_claims(claims: Dict[int, Claim]) -> None:
    memo: Dict[int, List[str]] = {}

    def visit(number: int, visiting: set) -> List[str]:
        if number in memo:
            return memo[number]
        claim = claims[number]
        if number in visiting:
            return list(claim.requirements)

        inherited = []
        next_visiting = visiting | {number}
        for parent in claim.parents:
            if parent in claims:
                inherited.extend(visit(parent, next_visiting))

        expanded = _unique_preserving_order([*inherited, *claim.requirements])
        claim.expanded_requirements = expanded
        claim.expanded_text = "\n".join(expanded)
        memo[number] = expanded
        return expanded

    for claim_number in claims:
        visit(claim_number, set())


def _unique_preserving_order(values: Iterable[str]) -> List[str]:
    result = []
    seen = set()
    for value in values:
        key = normalize_for_vector(value)
        if key and key not in seen:
            seen.add(key)
            result.append(value)
    return result


def normalize_for_vector(text: str) -> str:
    value = to_ascii_digits(str(text or "")).lower()
    return re.sub(r"[\s、。・,:：;；（）()\[\]【】「」『』]+", "", value)


def character_ngrams(text: str, minimum: int = 2, maximum: int = 4) -> Counter:
    normalized = normalize_for_vector(text)
    features = Counter()
    for size in range(minimum, maximum + 1):
        features.update(normalized[index : index + size] for index in range(len(normalized) - size + 1))
    return features


def tfidf_vectors(texts: Sequence[str]) -> List[Dict[str, float]]:
    counts = [character_ngrams(text) for text in texts]
    document_frequency = Counter()
    for count in counts:
        document_frequency.update(count.keys())

    document_count = max(len(counts), 1)
    vectors = []
    for count in counts:
        vector = {}
        total = sum(count.values()) or 1
        for feature, frequency in count.items():
            tf = frequency / total
            inverse_document_frequency = math.log(
                (1 + document_count) / (1 + document_frequency[feature])
            ) + 1
            vector[feature] = tf * inverse_document_frequency
        vectors.append(_normalize_vector(vector))
    return vectors


def _normalize_vector(vector: Dict[str, float]) -> Dict[str, float]:
    norm = math.sqrt(sum(value * value for value in vector.values())) or 1
    return {feature: value / norm for feature, value in vector.items()}


def cosine_similarity(left: Dict[str, float], right: Dict[str, float]) -> float:
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(feature, 0.0) for feature, value in left.items())


def text_similarity(left: str, right: str) -> float:
    vectors = tfidf_vectors([left, right])
    return cosine_similarity(vectors[0], vectors[1])


def independent_claims(document: PatentDocument) -> List[Claim]:
    claims = [claim for claim in document.claims.values() if claim.independent]
    return claims or list(document.claims.values())


def patent_similarity(left: PatentDocument, right: PatentDocument) -> float:
    left_claims = independent_claims(left)
    right_claims = independent_claims(right)
    texts = [claim.expanded_text or claim.text for claim in [*left_claims, *right_claims]]
    vectors = tfidf_vectors(texts)
    left_vectors = vectors[: len(left_claims)]
    right_vectors = vectors[len(left_claims) :]
    left_best = [max(cosine_similarity(vector, other) for other in right_vectors) for vector in left_vectors]
    right_best = [max(cosine_similarity(vector, other) for other in left_vectors) for vector in right_vectors]
    return (sum(left_best) / len(left_best) + sum(right_best) / len(right_best)) / 2


def corpus_similarity_values(documents: Sequence[PatentDocument]) -> List[List[float]]:
    claim_groups = [independent_claims(document) for document in documents]
    flattened_claims = [claim for group in claim_groups for claim in group]
    vectors = tfidf_vectors(
        [claim.expanded_text or claim.text for claim in flattened_claims]
    )
    vector_groups = []
    offset = 0
    for group in claim_groups:
        vector_groups.append(vectors[offset : offset + len(group)])
        offset += len(group)

    matrix = []
    for left_index, left_vectors in enumerate(vector_groups):
        row = []
        for right_index, right_vectors in enumerate(vector_groups):
            if left_index == right_index:
                row.append(1.0)
                continue
            left_best = [
                max(cosine_similarity(vector, other) for other in right_vectors)
                for vector in left_vectors
            ]
            right_best = [
                max(cosine_similarity(vector, other) for other in left_vectors)
                for vector in right_vectors
            ]
            row.append(
                (
                    sum(left_best) / len(left_best)
                    + sum(right_best) / len(right_best)
                )
                / 2
            )
        matrix.append(row)
    return matrix


def best_claim_pair(
    left: PatentDocument, right: PatentDocument
) -> Tuple[Claim, Claim, float]:
    left_claims = independent_claims(left)
    right_claims = independent_claims(right)
    texts = [claim.expanded_text or claim.text for claim in [*left_claims, *right_claims]]
    vectors = tfidf_vectors(texts)
    left_vectors = vectors[: len(left_claims)]
    right_vectors = vectors[len(left_claims) :]

    candidates = [
        (left_claims[left_index], right_claims[right_index], cosine_similarity(left_vector, right_vector))
        for left_index, left_vector in enumerate(left_vectors)
        for right_index, right_vector in enumerate(right_vectors)
    ]
    return max(candidates, key=lambda item: item[2])


def requirement_matches(source: Claim, target: Claim) -> List[Dict[str, object]]:
    source_requirements = source.expanded_requirements or source.requirements
    target_requirements = target.expanded_requirements or target.requirements
    if not source_requirements:
        return []
    if not target_requirements:
        return [
            {
                "source": requirement,
                "target": "",
                "score": 0.0,
                "status": "未対応",
            }
            for requirement in source_requirements
        ]

    texts = [*source_requirements, *target_requirements]
    vectors = tfidf_vectors(texts)
    source_vectors = vectors[: len(source_requirements)]
    target_vectors = vectors[len(source_requirements) :]
    candidates = sorted(
        (
            (cosine_similarity(source_vector, target_vector), source_index, target_index)
            for source_index, source_vector in enumerate(source_vectors)
            for target_index, target_vector in enumerate(target_vectors)
        ),
        reverse=True,
    )
    assigned_sources = set()
    assigned_targets = set()
    assignments = {}
    for score, source_index, target_index in candidates:
        if source_index in assigned_sources or target_index in assigned_targets:
            continue
        assignments[source_index] = (target_index, score)
        assigned_sources.add(source_index)
        assigned_targets.add(target_index)

    matches = []
    for source_index, requirement in enumerate(source_requirements):
        target_index, score = assignments.get(source_index, (None, 0.0))
        if score >= 0.72:
            status = "高一致"
        elif score >= 0.42:
            status = "類似"
        elif score >= 0.22:
            status = "部分一致"
        else:
            status = "未対応"
        matches.append(
            {
                "source": requirement,
                "target": (
                    target_requirements[target_index]
                    if target_index is not None and score >= 0.22
                    else ""
                ),
                "score": score,
                "status": status,
            }
        )
    return matches


def requirement_coverage(source: Claim, target: Claim) -> float:
    matches = requirement_matches(source, target)
    if not matches:
        return 0.0
    return sum(float(match["score"]) for match in matches) / len(matches)


def dependency_depth(claim: Claim, claims: Dict[int, Claim], visiting=None) -> int:
    visiting = visiting or set()
    if claim.number in visiting or not claim.parents:
        return 0
    parent_depths = [
        dependency_depth(claims[parent], claims, visiting | {claim.number})
        for parent in claim.parents
        if parent in claims
    ]
    return 1 + max(parent_depths, default=0)
