# Phase 0 schema audit

`hospital_db.sql` is not compatible with the current Node API and must not be treated as the production schema.

## Missing from the checked-in schema but required by application code

- `email` on patient, doctor, and staff
- `appointment_time`, `symptoms_raw`, and `symptoms_medical` on appointment
- `appointment_id`, `description`, `issued_date`, `paid_date`, and pending/cancelled states on bill
- `record_id` and `quantity` on prescription
- `passwordreset` and `auditlog` tables
- audit timestamps, active flags, medicine stock thresholds, and the expanded status values

## Data integrity requirements for the PostgreSQL/Django schema

- Unique appointment constraint: `(doctor_id, appointment_date, appointment_time)`.
- Database transactions for prescription, stock movement, and bill creation.
- A stock movement ledger; do not rely solely on a mutable stock counter.
- Foreign keys should be non-null where a relationship is mandatory.
- Passwords must remain hashed; do not import sample/shared passwords into a deployed environment.

## Migration decision

The Django/PostgreSQL models and migrations will become the single source of truth. Existing MySQL/TiDB records should be profiled and imported only after their required fields are mapped and validated.
