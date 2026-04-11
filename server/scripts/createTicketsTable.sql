-- Create the tickets table for the Photo Lab app (MSSQL)
CREATE TABLE tickets (
    id INT PRIMARY KEY IDENTITY(1,1),
    subject NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NOT NULL,
    created_by INT NOT NULL, -- user id
    created_for_studio INT NULL, -- studio id (nullable)
    assigned_to INT NULL, -- admin id (nullable)
    status NVARCHAR(32) NOT NULL DEFAULT 'open',
    escalated BIT NOT NULL DEFAULT 0,
    comments NVARCHAR(MAX) NULL, -- JSON array
    history NVARCHAR(MAX) NULL, -- JSON array
    meta NVARCHAR(MAX) NULL, -- JSON object
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Optional: Add indexes for performance
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_created_for_studio ON tickets(created_for_studio);
CREATE INDEX idx_tickets_status ON tickets(status);
