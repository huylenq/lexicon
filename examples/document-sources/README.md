# Document source example

Open this folder as a Lexicon project. Its model links the same idea to a written specification and a TypeScript representation. The specification describes a policy; the code defines data, without enforcing approval.

## Approval policy

An order above the agreed review limit requires a human decision before submission.

| Decision | Meaning |
| --- | --- |
| Approve | Permit submission |
| Reject | Keep the order unsubmitted |

The reviewer records **who decided** and the reason. See [Audit details](#audit-details).

### Audit details

- Record the reviewer identity.
- Preserve the decision and its explanation.
- Keep the original order available for review.

```ts
// A representation alone does not enforce policy.
type Decision = "approve" | "reject";
```

## Review limits

The limit is agreed for the deployment. This example specifies no monetary amount.
