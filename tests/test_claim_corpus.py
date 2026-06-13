import unittest
from pathlib import Path

from claim_corpus import (
    PatentDocument,
    corpus_similarity_values,
    parse_claims,
    patent_similarity,
    requirement_coverage,
    requirement_matches,
    text_similarity,
)


FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "jp7362171_claims.txt"
).read_text(encoding="utf-8")


class ClaimCorpusTest(unittest.TestCase):
    def test_parses_dependencies_and_product_method_reference(self):
        claims = parse_claims(FIXTURE)

        self.assertEqual(len(claims), 8)
        self.assertEqual(claims[4].parents, [1])
        self.assertEqual(claims[5].parents, [4])
        self.assertEqual(claims[8].parents, [])
        self.assertEqual(claims[8].target_claims, [1, 2, 3, 4, 5, 6, 7])

    def test_expands_dependent_claim_with_ancestor_requirements(self):
        claims = parse_claims(FIXTURE)

        self.assertGreater(
            len(claims[5].expanded_requirements),
            len(claims[5].requirements),
        )
        self.assertIn("境界線", claims[5].expanded_text)
        self.assertIn("１／６以上１／３以下", claims[5].expanded_text)

    def test_text_similarity_is_higher_for_related_claims(self):
        related = text_similarity(
            "センサと演算部とを備える検査装置。",
            "センサ及び演算部を有する検査装置。",
        )
        unrelated = text_similarity(
            "センサと演算部とを備える検査装置。",
            "樹脂組成物を加熱してフィルムを形成する方法。",
        )

        self.assertGreater(related, unrelated)

    def test_directional_coverage_penalizes_added_requirement(self):
        broad = parse_claims("【請求項1】センサを備える検査装置。")[1]
        narrow = parse_claims(
            "【請求項1】センサと、表示部とを備える検査装置。"
        )[1]

        self.assertGreater(
            requirement_coverage(broad, narrow),
            requirement_coverage(narrow, broad),
        )

    def test_requirement_matching_does_not_reuse_target_requirement(self):
        source = parse_claims(
            "【請求項1】温度センサと、圧力センサとを備える検査装置。"
        )[1]
        target = parse_claims(
            "【請求項1】センサを備える検査装置。"
        )[1]

        matched_targets = [
            match["target"]
            for match in requirement_matches(source, target)
            if match["target"]
        ]
        self.assertEqual(len(matched_targets), len(set(matched_targets)))

    def test_patent_similarity_uses_independent_claims(self):
        left = PatentDocument("A", "a.txt", parse_claims(
            "【請求項1】センサを備える検査装置。"
        ))
        related = PatentDocument("B", "b.txt", parse_claims(
            "【請求項1】センサを有する検査装置。"
        ))
        unrelated = PatentDocument("C", "c.txt", parse_claims(
            "【請求項1】樹脂を加熱するフィルム製造方法。"
        ))

        self.assertGreater(
            patent_similarity(left, related),
            patent_similarity(left, unrelated),
        )

    def test_corpus_similarity_matrix_is_symmetric(self):
        documents = [
            PatentDocument("A", "a.txt", parse_claims(
                "【請求項1】センサを備える検査装置。"
            )),
            PatentDocument("B", "b.txt", parse_claims(
                "【請求項1】センサを有する検査装置。"
            )),
            PatentDocument("C", "c.txt", parse_claims(
                "【請求項1】樹脂を加熱するフィルム製造方法。"
            )),
        ]

        matrix = corpus_similarity_values(documents)

        self.assertEqual(len(matrix), 3)
        self.assertEqual(matrix[0][0], 1.0)
        self.assertAlmostEqual(matrix[0][1], matrix[1][0])
        self.assertGreater(matrix[0][1], matrix[0][2])


if __name__ == "__main__":
    unittest.main()
