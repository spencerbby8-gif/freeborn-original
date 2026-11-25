"""Policy/parser negative controls; offline and no private member records."""
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('bing_metadata', Path(__file__).with_name('bing-metadata-audit.py'))
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class BingMetadataTests(unittest.TestCase):
    def test_original_free_dating_description_reproduces_warning(self):
        text = 'See what is included on Freeborn without a paid plan: profiles, discovery, likes, matching and chat. Understand mutual interest, privacy and messaging limits before joining.'
        self.assertEqual(len(text), 173)
        self.assertIn('description outside Bing tool range 25–160', AUDIT.description_issues([text]))

    def test_missing_description_is_an_error(self):
        self.assertTrue(AUDIT.description_issues([]))

    def test_duplicate_description_is_an_error(self):
        self.assertTrue(AUDIT.description_issues(['a' * 100, 'b' * 100]))

    def test_empty_description_is_an_error(self):
        self.assertIn('empty description', AUDIT.description_issues(['']))

    def test_lower_boundary_25_is_valid(self):
        self.assertEqual(AUDIT.description_issues(['a' * 25]), [])

    def test_24_characters_rejected(self):
        self.assertTrue(AUDIT.description_issues(['a' * 24]))

    def test_upper_boundary_160_is_valid(self):
        self.assertEqual(AUDIT.description_issues(['a' * 160]), [])

    def test_161_characters_rejected(self):
        self.assertTrue(AUDIT.description_issues(['a' * 161]))

    def test_unicode_is_counted_as_characters_not_utf8_bytes(self):
        self.assertEqual(AUDIT.description_issues(['🌍' * 160]), [])

    def test_edge_whitespace_is_rejected(self):
        self.assertIn('description has edge whitespace', AUDIT.description_issues([' ' + 'a' * 50]))

    def test_mojibake_is_rejected(self):
        self.assertIn('possible encoding or double-escaping artifact', AUDIT.description_issues(['Freeborn Â· ' + 'a' * 50]))

    def test_html_entities_are_decoded_once(self):
        page = AUDIT.DEEP.Page()
        page.feed('<meta property="og:title" content="Freeborn · Intentional Dating &amp; Shared Values">')
        self.assertEqual(page.metas['og:title'], ['Freeborn · Intentional Dating & Shared Values'])

    def test_double_escaped_entities_remain_detectable(self):
        page = AUDIT.DEEP.Page()
        page.feed('<meta name="description" content="Learn about Freeborn dating &amp;amp; shared values in your browser.">')
        self.assertIn('possible encoding or double-escaping artifact', AUDIT.description_issues(page.metas['description']))


if __name__ == '__main__':
    unittest.main()
