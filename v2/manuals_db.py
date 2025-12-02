try:
    from database_access import DataBase
except ModuleNotFoundError:
    from v2.database_access import DataBase
from enum import Enum

class ManualsDB(DataBase):
    class Commands(Enum):
        AddManual = 0
        RemoveManual = 1
        AddSection = 2
        AddImage = 3
        GetSections = 4
        GetImage = 5
    

    def __init__(self, name: str):
        tables = {
            "v2_manuals": """
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER,
                make TEXT,
                model TEXT,
                uplifted INTEGER,
                active INTEGER
            """,
            "v2_sections": """
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                manual_id INTEGER,
                section_name TEXT,
                first_page INTEGER,
                length INTEGER,
                h_level INTEGER
            """,
            "v2_images": """
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                manual_id INTEGER,
                page INTEGER,
                x INTEGER,
                y INTEGER,
                w INTEGER,
                h INTEGER
            """
        }

        commands = {
            self.Commands.AddManual: "INSERT INTO v2_manuals (year, make, model, uplifted, active) VALUES (?, ?, ?, ?, ?) RETURNING id",
            self.Commands.RemoveManual: "UPDATE v2_manuals SET active = 0 WHERE id = ?",
            self.Commands.AddSection: "INSERT INTO v2_sections (manual_id, section_name, first_page, length, h_level) VALUES (?, ?, ?, ?, ?)",
            self.Commands.AddImage: "INSERT INTO v2_images (manual_id, page, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?)",
            self.Commands.GetSections: """
                SELECT 
                    v2_manuals.id,
                    v2_sections.section_name, 
                    v2_sections.first_page, 
                    v2_sections.length
                FROM
                    v2_sections
                INNER JOIN
                    v2_manuals ON v2_sections.manual_id = v2_manuals.id
                WHERE
                    v2_manuals.make = ? AND
                    v2_manuals.model = ? AND
                    v2_manuals.year = ? AND
                    v2_manuals.active = 1
            """,
            self.Commands.GetImage: "SELECT * FROM v2_images WHERE manual_id = ? AND page >= ? AND page <= ?"
        }

        super().__init__(name, tables, commands)