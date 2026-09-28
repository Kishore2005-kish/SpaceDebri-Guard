import unittest
import pandas as pd
import numpy as np
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from feature_engineering import (
    add_engineered_features,
    build_training_matrix,
    FEATURE_COLUMNS,
    TARGET_COLUMN,
)


def make_base_row(date, proton=100.0, xray=1e-7, kp=2.0, bz=1.0, risk="Low"):
    return {
        "date": pd.Timestamp(date),
        "proton_flux": proton,
        "xray_flux": xray,
        "kp_index": kp,
        "bz": bz,
        "risk_level": risk,
    }


class TestCalendarAwareFeatures(unittest.TestCase):
    def assertIsNaN(self, value, msg=None):
        try:
            self.assertTrue(pd.isna(value), msg or f"Expected NaN, got {value!r}")
        except (TypeError, ValueError):
            self.fail(msg or f"Expected NaN, got non-nullable value {value!r}")

    # ------------------------------------------------------------------
    # TEST A — Completely contiguous daily data
    # ------------------------------------------------------------------
    def test_A_contiguous_data_produces_valid_features(self):
        rows = [make_base_row(f"2004-01-{d:02d}", proton=d * 10.0) for d in range(1, 11)]
        df = pd.DataFrame(rows)

        engineered = add_engineered_features(df)

        self.assertEqual(len(engineered), 10)
        self.assertEqual(engineered["date"].iloc[0], pd.Timestamp("2004-01-01"))
        self.assertEqual(engineered["date"].iloc[-1], pd.Timestamp("2004-01-10"))

        for col in FEATURE_COLUMNS:
            self.assertIn(col, engineered.columns)

        row_idx3 = engineered[engineered["date"] == "2004-01-04"].index[0]
        self.assertEqual(engineered.at[row_idx3, "proton_lag1"], 30.0)
        self.assertEqual(engineered.at[row_idx3, "proton_lag2"], 20.0)
        self.assertAlmostEqual(engineered.at[row_idx3, "proton_roll3"], (20.0 + 30.0 + 40.0) / 3)

        row_idx8 = engineered[engineered["date"] == "2004-01-08"].index[0]
        expected_roll7 = (10.0 * sum(range(2, 9))) / 7
        self.assertAlmostEqual(engineered.at[row_idx8, "proton_roll7"], expected_roll7)

    # ------------------------------------------------------------------
    # TEST B — One missing calendar date
    # ------------------------------------------------------------------
    def test_B_one_missing_date_lag_features_become_nan(self):
        dates = ["2004-01-01", "2004-01-02", "2004-01-04", "2004-01-05"]
        rows = [make_base_row(d, proton=(i + 1) * 10.0) for i, d in enumerate(dates)]
        df = pd.DataFrame(rows)

        engineered = add_engineered_features(df)

        self.assertEqual(len(engineered), 4)

        jan4 = engineered[engineered["date"] == "2004-01-04"].index[0]

        self.assertIsNaN(
            engineered.at[jan4, "proton_lag1"],
            "proton_lag1 on Jan 4 must be NaN because Jan 3 is missing",
        )
        self.assertIsNaN(
            engineered.at[jan4, "xray_lag1"],
            "xray_lag1 on Jan 4 must be NaN because Jan 3 is missing",
        )
        self.assertIsNaN(
            engineered.at[jan4, "bz_lag1"],
            "bz_lag1 on Jan 4 must be NaN because Jan 3 is missing",
        )
        self.assertIsNaN(
            engineered.at[jan4, "proton_roll3"],
            "proton_roll3 on Jan 4 must be NaN because roll spans missing Jan 3",
        )

        jan5 = engineered[engineered["date"] == "2004-01-05"].index[0]
        self.assertIsNaN(
            engineered.at[jan5, "proton_lag2"],
            "proton_lag2 on Jan 5 must be NaN because Jan 3 (2 days prior) is missing",
        )
        self.assertIsNaN(
            engineered.at[jan5, "xray_trend"],
            "xray_trend on Jan 5 must be NaN since it depends on lag1 - lag2 and lag2 is NaN",
        )
        self.assertIsNaN(
            engineered.at[jan5, "proton_roll3"],
            "proton_roll3 on Jan 5 must be NaN (Jan 3 missing in the window)",
        )
        jan5_proton_lag1 = engineered.at[jan5, "proton_lag1"]
        self.assertEqual(
            jan5_proton_lag1, 30.0,
            "proton_lag1 on Jan 5 should still correctly use Jan 4's value (prev calendar day exists)",
        )

    # ------------------------------------------------------------------
    # TEST C — A gap followed by several valid dates
    # ------------------------------------------------------------------
    def test_C_gap_followed_by_valid_dates_recovery(self):
        before = ["2004-01-01", "2004-01-02", "2004-01-03"]
        gap_skip = ["2004-01-04", "2004-01-05"]
        after = [f"2004-01-{d:02d}" for d in range(6, 15)]
        all_dates = before + after
        rows = [make_base_row(d, proton=(i + 1) * 10.0) for i, d in enumerate(all_dates)]
        df = pd.DataFrame(rows)

        engineered = add_engineered_features(df)

        self.assertEqual(len(engineered), len(all_dates))

        jan6 = engineered[engineered["date"] == "2004-01-06"].index[0]
        self.assertIsNaN(engineered.at[jan6, "proton_lag1"], "Jan 6 lag1 must be NaN (Jan 5 missing)")
        self.assertIsNaN(engineered.at[jan6, "proton_lag2"], "Jan 6 lag2 must be NaN (Jan 5 missing)")
        self.assertIsNaN(engineered.at[jan6, "proton_roll3"], "Jan 6 roll3 must be NaN")
        self.assertIsNaN(engineered.at[jan6, "proton_roll7"], "Jan 6 roll7 must be NaN")
        self.assertIsNaN(engineered.at[jan6, "xray_trend"], "Jan 6 xray_trend must be NaN")
        self.assertIsNaN(engineered.at[jan6, "kp_trend"], "Jan 6 kp_trend must be NaN")

        jan7 = engineered[engineered["date"] == "2004-01-07"].index[0]
        self.assertIsNaN(engineered.at[jan7, "proton_lag2"], "Jan 7 lag2 must be NaN (Jan 5 missing)")
        self.assertIsNaN(engineered.at[jan7, "proton_roll3"], "Jan 7 roll3 still NaN (Jan 5 missing in window)")

        jan8 = engineered[engineered["date"] == "2004-01-08"].index[0]
        p6 = engineered.loc[engineered["date"] == "2004-01-06", "proton_flux"].iloc[0]
        p7 = engineered.loc[engineered["date"] == "2004-01-07", "proton_flux"].iloc[0]
        p8 = engineered.loc[engineered["date"] == "2004-01-08", "proton_flux"].iloc[0]
        self.assertAlmostEqual(
            engineered.at[jan8, "proton_roll3"],
            (p6 + p7 + p8) / 3,
            "Jan 8 roll3 should be valid: 3-day calendar window [Jan6,Jan7,Jan8] all exist after the gap",
        )
        self.assertIsNaN(
            engineered.at[jan8, "proton_roll7"],
            "Jan 8 roll7 must still be NaN — the 7-day window includes missing Jan4 and Jan5",
        )

        jan12 = engineered[engineered["date"] == "2004-01-12"].index[0]
        self.assertFalse(
            pd.isna(engineered.at[jan12, "proton_roll3"]),
            "By Jan 12, the 3-day window (Jan 10-12) should be all present",
        )
        p10 = engineered.loc[engineered["date"] == "2004-01-10", "proton_flux"].iloc[0]
        p11 = engineered.loc[engineered["date"] == "2004-01-11", "proton_flux"].iloc[0]
        p12 = engineered.loc[engineered["date"] == "2004-01-12", "proton_flux"].iloc[0]
        self.assertAlmostEqual(
            engineered.at[jan12, "proton_roll3"], (p10 + p11 + p12) / 3,
            "Jan 12 roll3 must equal the true calendar-day mean of Jan 10-12",
        )

        jan14 = engineered[engineered["date"] == "2004-01-14"].index[0]
        self.assertFalse(
            pd.isna(engineered.at[jan14, "proton_roll7"]),
            "By Jan 14, 7-day window should clear the 2-day gap",
        )

    # ------------------------------------------------------------------
    # TEST D — Confirmation that no imputation occurs
    # ------------------------------------------------------------------
    def test_D_no_imputation_no_fillna_no_interpolation(self):
        dates = ["2004-01-01", "2004-01-03", "2004-01-05"]
        rows = [make_base_row(d, proton=(i + 1) * 10.0, xray=(i + 1) * 1e-7)
                for i, d in enumerate(dates)]
        df = pd.DataFrame(rows)

        engineered = add_engineered_features(df)

        self.assertEqual(len(engineered), 3, "Only original 3 dates must be present (no inserted rows)")
        self.assertTrue((engineered["date"] == pd.to_datetime(dates)).all())

        self.assertIsNaN(engineered.loc[engineered["date"] == "2004-01-03", "proton_lag1"].iloc[0])
        self.assertIsNaN(engineered.loc[engineered["date"] == "2004-01-05", "proton_lag1"].iloc[0])

        physical_cols = ["proton_flux", "xray_flux", "kp_index", "bz", "risk_level"]
        for col in physical_cols:
            original_values = df[col].tolist()
            engineered_values = engineered[col].tolist()
            for orig, eng in zip(original_values, engineered_values):
                if isinstance(orig, float) and np.isnan(orig):
                    self.assertTrue(np.isnan(eng), f"{col} value should remain NaN (not filled)")
                else:
                    self.assertEqual(orig, eng, f"Physical column {col} must not be mutated or imputed")

        spike_cols_null_safe = ["proton_spike", "xray_spike"]
        for idx, row in engineered.iterrows():
            for col in ["proton_lag1", "proton_lag2", "xray_lag1", "xray_lag2",
                        "kp_lag1", "kp_lag2", "bz_lag1",
                        "proton_roll3", "proton_roll7", "xray_roll3", "xray_roll7", "kp_roll3",
                        "proton_trend", "xray_trend", "kp_trend"]:
                if pd.isna(row[col]):
                    continue
                self.assertIsInstance(
                    row[col], (int, float, np.integer, np.floating),
                    f"{col} has non-numeric value {row[col]!r} — suspect imputation",
                )

    # ------------------------------------------------------------------
    # TEST E — target_next_day semantics unchanged & calendar-aware
    # ------------------------------------------------------------------
    def test_E_target_next_day_calendar_aware(self):
        dates = ["2004-01-01", "2004-01-02", "2004-01-04", "2004-01-05", "2004-01-06"]
        risks = ["Low", "Medium", "High", "Low", "Medium"]
        rows = [make_base_row(d, risk=r) for d, r in zip(dates, risks)]
        df = pd.DataFrame(rows)

        X, y, full_engineered = build_training_matrix(df)

        self.assertEqual(TARGET_COLUMN, "target_next_day")
        self.assertIn(TARGET_COLUMN, full_engineered.columns)
        self.assertEqual(list(X.columns), list(FEATURE_COLUMNS))

        jan1_mask = full_engineered["date"] == "2004-01-01"
        if jan1_mask.any():
            idx = jan1_mask.idxmax()
            self.assertEqual(
                full_engineered.at[idx, TARGET_COLUMN], "Medium",
                "target_next_day for Jan 1 = Jan 2's risk (Medium)",
            )

        jan2_mask = full_engineered["date"] == "2004-01-02"
        if jan2_mask.any():
            idx = jan2_mask.idxmax()
            self.assertIsNaN(
                full_engineered.at[idx, TARGET_COLUMN],
                "target_next_day for Jan 2 must be NaN (Jan 3 is missing)",
            )

    def test_E_target_next_day_unchanged_on_contiguous_data(self):
        n = 12
        dates = [f"2004-02-{d:02d}" for d in range(1, n + 1)]
        risks = ["Low", "Medium", "High", "Low", "Medium", "High",
                 "Low", "Medium", "High", "Low", "Medium", "High"]
        rows = [make_base_row(d, proton=100 + i, xray=1e-7 + i * 1e-9,
                              kp=2.0 + i * 0.1, bz=1.0 - i * 0.2, risk=r)
                for i, (d, r) in enumerate(zip(dates, risks))]
        df = pd.DataFrame(rows)

        X, y, full_engineered = build_training_matrix(df)

        self.assertGreaterEqual(len(full_engineered), 1, "Some rows should survive dropna")

        for _, row in full_engineered.iterrows():
            date = row["date"]
            expected = risks[dates.index(str(date.date())) + 1]
            self.assertEqual(
                row[TARGET_COLUMN], expected,
                f"target_next_day for {date} must be next day's risk {expected}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
