-- Routine employee pin (T032): the employee a routine executes as.
-- Additive only; existing routines keep NULL (no pin — their runs fail
-- honestly at provider resolution, exactly like unpinned sessions).
ALTER TABLE "routine" ADD COLUMN "employee_id" text;
