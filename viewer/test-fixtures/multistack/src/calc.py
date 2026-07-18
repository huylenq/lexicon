# Fixture for the code lens. total() calls add_all() (call-flow: calls).
# Stdlib-only so pyright resolves with any interpreter (health-gate stays green).


def add_all(items: list[int]) -> int:
    return sum(items)


def total(items: list[int]) -> int:
    return add_all(items)
