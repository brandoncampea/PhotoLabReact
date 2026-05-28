-- Migration: Create error_logs table
CREATE TABLE error_logs (
  id INT IDENTITY(1,1) PRIMARY KEY,
  error_message NVARCHAR(MAX) NOT NULL,
  error_stack NVARCHAR(MAX) NULL,
  request_url NVARCHAR(2048) NULL,
  request_method NVARCHAR(16) NULL,
  request_headers NVARCHAR(MAX) NULL,
  request_body NVARCHAR(MAX) NULL,
  user_agent NVARCHAR(512) NULL,
  customer_id INT NULL,
  customer_email NVARCHAR(255) NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  notified BIT NOT NULL DEFAULT 0
);
CREATE INDEX IX_error_logs_created_at ON error_logs (created_at DESC);
