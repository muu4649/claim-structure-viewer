import unittest

from document_import import (
    detect_patent_number,
    extract_claims_section,
    extract_uploaded_documents,
)


class DocumentImportTest(unittest.TestCase):
    def test_extracts_only_claims_from_spaced_jpo_text(self):
        source = """
        J P   7362171  B1  2023.10.17
        (57)【 特 許 請 求 の 範 囲 】
        【 請 求 項 １ 】
        検 査 装 置 で あ っ て 、 セ ン サ を 備 え る 、 検 査 装 置 。
        10
        20
        (2)
        JP  7362171  B1  2023.10.17
        【 請 求 項 ２ 】
        (2) J P  7362171  B1  2023.10.17
        請 求 項 １ に 記 載 の 検 査 装 置 。
        【 発 明 の 詳 細 な 説 明 】
        【 技 術 分 野 】
        本 文 。
        """

        claims = extract_claims_section(source)

        self.assertIn("【請求項１】", claims)
        self.assertIn("【請求項２】", claims)
        self.assertNotIn("発明の詳細な説明", claims)
        self.assertNotIn("JP7362171B1", claims)
        self.assertNotIn("(2)", claims)

    def test_detects_patent_number_from_spaced_pdf_text(self):
        self.assertEqual(
            detect_patent_number("J P   7362171  B1  2023.10.17"),
            "JP7362171B1",
        )

    def test_groups_claim_rows_in_csv_by_patent_number(self):
        source = (
            "patent_number,claim_number,claim_text\n"
            "JP-A,1,センサを備える検査装置。\n"
            "JP-A,2,請求項1に記載の検査装置。\n"
            "JP-B,1,カメラを備える撮像装置。\n"
        ).encode("utf-8")

        documents = extract_uploaded_documents("claims.csv", source)

        self.assertEqual(len(documents), 2)
        self.assertEqual(documents[0]["patent_number"], "JP-A")
        self.assertIn("【請求項2】", documents[0]["claims_text"])
        self.assertEqual(documents[1]["patent_number"], "JP-B")


if __name__ == "__main__":
    unittest.main()
