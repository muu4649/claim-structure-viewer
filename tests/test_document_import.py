import unittest

from document_import import detect_patent_number, extract_claims_section


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

    def test_detects_patent_number_from_spaced_pdf_text(self):
        self.assertEqual(
            detect_patent_number("J P   7362171  B1  2023.10.17"),
            "JP7362171B1",
        )


if __name__ == "__main__":
    unittest.main()
