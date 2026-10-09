CREATE TABLE IF NOT EXISTS emergency_alert_status_report (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES emergency_alert(id),
    reporter_id INTEGER NOT NULL REFERENCES "user"(id),
    reporter_name VARCHAR(255) NOT NULL,
    report_type VARCHAR(32) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    additional_notes VARCHAR(2000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_emergency_alert_status_report_alert_id
    ON emergency_alert_status_report (alert_id);

CREATE INDEX IF NOT EXISTS ix_emergency_alert_status_report_reporter_id
    ON emergency_alert_status_report (reporter_id);
