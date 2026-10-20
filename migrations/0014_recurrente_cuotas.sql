-- Finanzas 1.11.0: un gasto recurrente tiene un valor total y en cuántas partes se paga (1 = de una vez, 2 quincenas, 4 semanas, 12 meses).
ALTER TABLE fin_recurring ADD COLUMN partes INTEGER DEFAULT 1;
