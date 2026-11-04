-- Proyectos = empresas: cada una enlazada a un contacto de Marketing (nombre, correo) para enviarle cotizaciones y cuentas de cobro por Mensajes
ALTER TABLE pr_projects ADD COLUMN contact_id INTEGER;
