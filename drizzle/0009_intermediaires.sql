-- Préparations intermédiaires du laboratoire (pâtes, crèmes, ganaches…) : nature « intermediaire »
-- (colonne texte existante), rangées dans leur propre catégorie.
INSERT INTO "categories" ("nom", "ordre") VALUES ('Préparations intermédiaires', 99) ON CONFLICT ("nom") DO NOTHING;
