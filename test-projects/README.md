# Lexicon test projects

## Django Oscar

The canonical project for future Lexicon trials is [Django Oscar](https://github.com/django-oscar/django-oscar), a domain-driven commerce framework for Django. Its Python source fits Lexicon's symbol support, with business behavior across catalogue, basket, checkout, order, payment, shipping, offers, and vouchers. It includes documentation, unit and integration tests, and a sandbox application.

The local checkout is `test-projects/django-oscar/`, pinned to release `4.2`, commit `2b857c504ee04958b20632f703c54137b553d26a`. The checkout is ignored by the parent repository and retains its own Git history and upstream license.

Status: source cloned only. No Lexicon model has been created, no viewer registration added, and no application dependencies installed or tests run.

To recreate it from the Lexicon repository root when the destination is absent:

```sh
git clone --depth 1 --branch 4.2 --single-branch https://github.com/django-oscar/django-oscar.git test-projects/django-oscar
git -C test-projects/django-oscar rev-parse HEAD
# Expected: 2b857c504ee04958b20632f703c54137b553d26a
```

Keep this revision fixed when comparing Lexicon iterations. Record any later revision change here.

When modeling is requested, a useful first question is: how does a basket become an order, and where are pricing and stock rules applied? Start with `src/oscar/apps/`, `tests/`, and `docs/`. This is a suggested trial question; its answer has not been modeled or verified yet.

## Existing examples

- `viewer/examples/dentalml/` contains the existing canal-measurement trial. Its source links require the separate sibling DentalML checkout.
- `viewer/sample-lexicon/` contains historical order-placement prose, without an active model.
- The root `lexicon/docs/` and `viewer/lexicon/docs/` contain historical design notes. There is no active Lexicon self-model or self-registration to remove.
- `quarantine/` preserves the earlier implementation and its fixtures.
