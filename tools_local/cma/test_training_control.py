import unittest

try:
    from .training_control import block_indices, gate_failures, select_candidate
except ImportError:
    from training_control import block_indices, gate_failures, select_candidate


class TrainingControlTests(unittest.TestCase):
    def test_readout_reflex_block_keeps_connectome_gains_frozen(self):
        idx = block_indices("readout_reflex", 9179, 8859, True)
        self.assertEqual(len(idx), 327)
        self.assertEqual(idx[:3], [0, 1, 2])
        self.assertEqual(idx[319], 319)
        self.assertEqual(idx[320:], list(range(9172, 9179)))

    def test_gain_block_excludes_reflex_tail(self):
        idx = block_indices("gains", 9179, 8859, True)
        self.assertEqual(len(idx), 8852)
        self.assertEqual(idx[0], 320)
        self.assertEqual(idx[-1], 9171)

    def test_reflex_block_requires_reflex_mode(self):
        with self.assertRaises(ValueError):
            block_indices("reflex", 320, 0, False)

    def test_selects_by_survival_fitness_not_boss_kills(self):
        results = [
            {"fit": 10, "bossKills": 30, "noHitRate": 0.1},
            {"fit": 20, "bossKills": 2, "noHitRate": 0.3},
        ]
        self.assertEqual(select_candidate(results), 1)

    def test_imitation_selects_lower_error(self):
        self.assertEqual(select_candidate([{"imse": 0.2}, {"imse": 0.1}], imitation=True), 1)

    def test_gate_accepts_exact_thresholds(self):
        self.assertEqual(
            gate_failures({"noHitRate": 0.30, "edgeFrac": 0.15}, 0.30, 0.15),
            [],
        )

    def test_gate_reports_both_failures(self):
        failures = gate_failures({"noHitRate": 0.16, "edgeFrac": 0.19}, 0.30, 0.15)
        self.assertEqual(len(failures), 2)


if __name__ == "__main__":
    unittest.main()
