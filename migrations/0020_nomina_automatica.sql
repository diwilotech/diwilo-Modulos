-- Nómina automática: las novedades que llegan de una app (honorarios por clase) llevan su origen para refrescarse sin duplicar.
ALTER TABLE nom_novedades ADD COLUMN src TEXT;
CREATE INDEX IF NOT EXISTS nom_novedades_src ON nom_novedades (business_id, src);
