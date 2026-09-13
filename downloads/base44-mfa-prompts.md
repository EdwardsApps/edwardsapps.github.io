# Base44 admin MFA — Builder prompt pack

Version 1.0 — 13 September 2026

Read https://edwardsapps.co.uk/base44-mfa-guide.html first. This is a Builder implementation specification, not a finished MFA library. Do not paste secrets into chat. Prompts cannot certify the generated result.

## 1. Check the app before changing it

Inspect this app and the current official Base44 docs before editing anything. I want owner-approved TOTP verification for administrative operations while retaining the existing primary sign-in methods and ordinary-user access.
Report: available backend functions; current SDK and function entrypoint convention; who can edit User fields and roles; every admin data read/write and function; existing direct entity rules; public/private visibility; scheduled jobs; current MFA/SSO features that could already meet the requirement.
Identify the owner by the authenticated immutable user ID, never a user-editable flag or an email supplied in a request. Do not output any secret, token or real personal data. Preserve existing working authentication and MFA. Do not change visibility, accounts or access rules yet.
Return a file/entity inventory, a small AdminNote pilot plan and exact capabilities you could not verify. Do not describe an untested assumption as supported.

## 2. Prove the database operation first

In this app, implement and run a temporary authenticated owner-only backend probe using createClientFromRequest and platform-injected service-role access. Verify the caller with auth.me and compare the immutable owner ID configured privately. If MFA already works, also require a fresh MFA proof. For a new setup only, the owner-authenticated probe is not a grant endpoint and must never return credentials.
Use one uniquely named synthetic record with no account entitlement. Target updates by its exact record ID, unique probe marker and revision. Start with two competing conditional updates and repeat a small bounded number of rounds. Exactly one must update the record per round; read back the expected revision. Report the exact updateMany response shape and distinguish rate limits, network uncertainty and genuine conflicting winners. Settle all outstanding operations before cleanup, including failures. Never fall back to unconditional updates or swallow an uncertain result as a pass.
Delete only the record this run created, after verifying its marker; verify deletion. Remove the temporary function afterwards. Keep the encrypted-key and owner records untouched. Provide sanitised pass/fail evidence, deployed version and cleanup result. If tooling is read-only, tell me to switch to edit mode. Do not ask for a local service token.

## 3. Build the security records and shared verifier

Implement the pilot MFA security layer using the app's existing backend conventions. Reuse working MFA if present. Create backend-owned AdminMfaAccount, AdminMfaSession and AdminMfaAudit entities with all direct client CRUD denied. Enforce exactly one account per immutable user ID; duplicates or invalid state fail closed.
Account fields must cover user ID, pending/enrolling/active/revoked state, encrypted TOTP secret, activation hash and expiry, enrolment login binding, factor generation, revision, accepted TOTP counter, attempt count/window, approver and timestamps. Session fields must cover proof hash, user ID, validated login-token binding, generation, issued/expiry times and revoked status. Audit only safe actor/subject/action/time metadata.
Use a maintained RFC 6238 implementation compatible with this runtime, pin its version and test known vectors. Use cryptographic randomness, six digits and a 30-second step, at most one step of clock tolerance. Encrypt the factor with AES-GCM using a dedicated 32-byte secret, fresh nonce and immutable user ID as associated data. Never generate QR images using an external service.
Implement one shared requireAdminMfa helper: validate the caller with SDK auth.me for this request, require an active account and exactly one valid proof, verify its user, login binding, generation and expiry, and optionally require owner/fresh verification. Use a random 32-byte proof, store only its hash, expire after eight hours and require a five-minute-fresh proof for security changes. These timings are design choices.
Reserve attempts and consume activation/counters using the proven conditional-store operation; limit to five credential attempts per account per minute. Prevent code replay. Bound malformed inputs before expensive work. Never use a client-controlled user ID, approved flag, role or mfa_verified field as authority. Do not activate existing production data routes yet. Add unit tests and report what remains unverified on the host.

## 4. Prepare owner setup without a public shortcut

Prepare the first-owner setup for the AdminNote pilot. Confirm the immutable owner ID from the validated account. Use my already-protected workspace as the operator control, preserving any working owner record, enrolled factor and encryption key.
For a new installation, give me a local private setup utility that creates a cryptographically random dedicated encryption key and 15-minute activation credential. Output the key, a pending owner record containing ONLY the activation hash, and the separate activation credential. No network calls, no embedded service token and no secret output in Builder chat. Tell me exactly where to save the key in Dashboard > Secrets and how to create the owner row through the trusted workspace. If I cannot run the utility, explain the secure alternative before changing anything; do not replace it with password-only self-enrolment.
Do not create a public bootstrap or first-user-becomes-owner endpoint. No key or credential goes in the frontend, URL, console, audit log or analytics. Existing installation means a controlled reset, not another owner row or replacement encryption key. Give me a clear completion checklist without showing secret values.

## 5. Build enrolment, verification and recovery

Build the AdminNote pilot verification UI and backend actions. Pending users must present the separate activation credential. Atomically consume it before returning the locally rendered QR/manual key, and bind enrolment to the current validated login. Only a valid initial TOTP can transition enrolling to active. Interrupted setup requires owner-controlled reset; a password cannot restart it.
After verification, pass the random proof through a request header or JSON/multipart field without putting it in URLs. Read/clone the request body before consuming it, or pass the already-parsed proof explicitly. Preserve the proof across nested calls. Use tab-scoped session storage and never log secrets or proofs; exclude these screens and payloads from session replay.
Expose only sanitised self-status before verification. Keep private data queries disabled until verified. On expiry or rejection clear cached private data and return to verification, with useful retry errors. A failed operation stays failed even if a separate status check still confirms the session.
Fresh owner verification is required to approve/reset/revoke another admin; ordinary admins cannot grant admin authority. Demote old direct privileges before beginning replacement enrolment. Reset, revocation and logout rotate the generation to invalidate existing admin proofs; report failed logout honestly. Provide an operator-only owner recovery procedure that updates the existing row, preserves the encryption key and creates a new activation/generation. Never automatically disable enforcement to recover access.
Show synthetic UI previews, unit-test results and the remaining hosted tests. Do not change the app's global visibility.

## 6. Protect the complete AdminNote pilot

Implement one end-to-end AdminNote feature using the security layer. Its title is at most 120 characters and body at most 2000; use synthetic notes only. Deny all direct client create/read/update/delete on this entity.
Implement a backend adminNotes function with only list and create actions, bounded input, sanitised errors and Cache-Control: no-store. Authenticate the request, require a valid MFA proof, then use service-role access for this explicit entity only. Reject all other actions. Do not accept arbitrary entity names, record filters or method names. Mount a small frontend page that invokes this function with the proof and renders text safely; never use entities.AdminNote directly for its normal data access.
Test owner without proof, unapproved user with proof, wrong-login proof, expired proof, valid proof and revoked proof. Seed a harmless canary note through the backend so an empty direct list cannot be mistaken for missing test data. Verify direct SDK and function bypass attempts do not reveal or mutate it. Capture expected status and actual result. Do not call the whole app protected because this one feature passes.

## 7. Connect the rest of the admin work

Using the inventory from step 1 and the tested AdminNote pattern, produce and implement an explicit migration for every privileged read/write. Include direct list/filter/get/create/update/delete, bulk/import/export, subscriptions, files and signed links, reports, invoices, company settings, invitations, role changes, nested functions, API keys/MCP and scheduled jobs. Flag platform-managed User APIs separately where custom RLS cannot prove their behaviour.
Each human backend entry must independently verify identity, current MFA and operation-specific scope. Gate service-role access; no generic unrestricted browser proxy. Preserve guard/customer ownership and assignment rules. A denied raw subscription must be replaced by data-free refresh signals and authorised reads where needed. Keep explicitly secret-authenticated scheduled jobs separate from human requests.
Coordinate matching frontend, functions and entity rules. Verify the actual published assets and hosted configuration. Do not rely on a frontend build flag. Missing security configuration must deny privileged operations; no invisible legacy fallback for new protected routes. Do not blanket-disable every entity before replacements exist.
Show the complete path matrix, changed files, unresolved routes and account migration. Do not silently approve native admins or existing default users. Preserve the owner's working recovery access. No blanket security or compliance claim.

## 8. Run and record the acceptance checks

Run the supplied acceptance checklist on this app with synthetic records and separate test identities. Keep the owner's account and workspace available. Distinguish source tests, hosted API checks, browser checks and untested paths.
For every row record expected result, actual result, date, app/deployment version and a sanitised evidence reference. Do not include access tokens, seeds, QR contents, passwords or personal data. A 200 response is not automatically success or failure: inspect whether forbidden data or mutation occurred. Rate-limited and inconclusive checks must be rerun in a bounded way, not marked passed.
Confirm every privileged entry rejects missing/invalid/revoked proof and ordinary guard/client workflows still work. Check a valid proof with the wrong operation scope is denied. Test enrolment/reset/revoke/logout races, clock tolerance, code replay, missing key, duplicate rows, audit failures, session binding and network failures. Test owner recovery deliberately only with a controlled plan and existing workspace access.
Remove only the test records and temporary functions created for this run. Report cleanup and any remaining blockers. Do not say production-ready or independently certified simply because generated tests pass.

## 9. Prepare the release and operating notes

Prepare a release checklist and owner runbook for this implementation: how to approve an admin, privately deliver activation, enrol, verify, reset/revoke, recover the owner and handle lost MFA-store data. State what logout invalidates and that downloaded data or unexpired signed links cannot be recalled.
Record app version, settings names without values, validated provider configuration, actual test results, remaining limitations and maintenance responsibility. Back up code/configuration and define secret recovery separately; never restore old proof records as active. Remove temporary probe/bootstrap functions. Recheck configuration and direct-access denial after SDK changes, domain changes or backend edits.
Keep normal users' sign-in methods unchanged. Do not call this enforced Microsoft SSO, phishing-resistant authentication or a complete new-user approval process. Give me the exact remaining human actions, in plain language. Do not change visibility or publish until the requested release scope is clear.