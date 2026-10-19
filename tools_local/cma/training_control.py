"""Pure helpers for safe, block-wise CMA training and performance-gated curricula."""

def block_indices(block, full_dim, appended_dim, reflex_enabled):
    """Return the parameter indices optimized by a training block.

    Parameter layout: 320 readout weights, then synaptic gains, then 7 reflex
    parameters when REFLEX=1. appended_dim is NGAINS (gains + reflex params).
    """
    block = (block or "all").lower()
    if full_dim < 320 or appended_dim != full_dim - 320:
        raise ValueError("full_dim must equal 320 + NGAINS")
    reflex_n = 7 if reflex_enabled else 0
    if reflex_n > appended_dim:
        raise ValueError("REFLEX=1 requires NGAINS to include the 7 reflex parameters")
    readout = list(range(320))
    reflex = list(range(full_dim - 7, full_dim)) if reflex_enabled else []
    gains_end = full_dim - reflex_n
    gains = list(range(320, gains_end))

    if block == "all":
        return list(range(full_dim))
    if block == "readout":
        return readout
    if block == "reflex":
        if not reflex_enabled:
            raise ValueError("BLOCK=reflex requires REFLEX=1")
        return reflex
    if block == "readout_reflex":
        if not reflex_enabled:
            raise ValueError("BLOCK=readout_reflex requires REFLEX=1")
        return readout + reflex
    if block == "gains":
        if not gains:
            raise ValueError("BLOCK=gains requested, but there are no synaptic-gain parameters")
        return gains
    raise ValueError("Unknown BLOCK %r; use all, readout, reflex, readout_reflex, or gains" % block)


def select_candidate(results, imitation=False):
    """Choose mean vs. generation-best using the actual objective, not boss kills."""
    if len(results) != 2:
        raise ValueError("expected [mean_result, best_result]")
    if imitation:
        return 0 if float(results[0].get("imse", float("inf"))) <= float(
            results[1].get("imse", float("inf"))
        ) else 1
    return 0 if float(results[0].get("fit", float("-inf"))) >= float(
        results[1].get("fit", float("-inf"))
    ) else 1


def gate_failures(metrics, min_no_hit_rate=None, max_edge_fraction=None):
    """Return reasons a stage must not advance; thresholds are inclusive at the boundary."""
    failures = []
    if min_no_hit_rate is not None:
        if "noHitRate" not in metrics:
            failures.append("no-hit rate missing from evaluator")
        elif float(metrics["noHitRate"]) + 1e-12 < float(min_no_hit_rate):
            failures.append("no-hit %.1f%% < %.1f%%" % (
                100 * float(metrics["noHitRate"]), 100 * float(min_no_hit_rate)
            ))
    if max_edge_fraction is not None:
        if "edgeFrac" not in metrics:
            failures.append("edge fraction missing from evaluator")
        elif float(metrics["edgeFrac"]) - 1e-12 > float(max_edge_fraction):
            failures.append("edge %.1f%% > %.1f%%" % (
                100 * float(metrics["edgeFrac"]), 100 * float(max_edge_fraction)
            ))
    return failures
