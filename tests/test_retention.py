import unittest
import urllib.error
from unittest import mock

from pipeline import retention


def _http(code):
    return urllib.error.HTTPError("u", code, "x", {}, None)


class ExtraMetricsTest(unittest.TestCase):
    def test_all_metrics(self):
        def fake(tok, **q):
            if q.get("dimensions") == "insightTrafficSourceType":
                return [["SHORTS", 900], ["EXT_URL", 100]]
            return [[600.0, 12.0, 3.0]]
        with mock.patch.object(retention, "_report", fake):
            o = retention.extra_metrics("t", "v", "a", "b", 1000)
        self.assertEqual(o["stayed_pct"], 60.0)
        self.assertEqual(o["shares"], 12)
        self.assertEqual(o["traffic"]["SHORTS"], 900)

    def test_unsupported_metrics_do_not_raise(self):
        def fake(tok, **q):
            if q["metrics"] == "shares":
                return [[5.0]]
            raise _http(400)
        with mock.patch.object(retention, "_report", fake):
            o = retention.extra_metrics("t", "v", "a", "b", 1000)
        self.assertEqual(o, {"shares": 5})


if __name__ == "__main__":
    unittest.main()
