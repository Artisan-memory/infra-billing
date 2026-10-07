-- "Bump + payment" used to save the renewal as a `charge`. Analytics skips charges for any provider
-- that has a top-up, so those renewals never reached the spend totals. New ones are saved as
-- `topup`; this moves the old rows over. Only manual rows (no external_id) tied to a service and
-- carrying the dialog's fixed description qualify, so imported charges stay untouched.
UPDATE "payments"
SET "type" = 'topup'
WHERE "type" = 'charge'
  AND "external_id" IS NULL
  AND "service_uuid" IS NOT NULL
  AND "description" IN ('Продлено вручную', 'Renewed manually');
