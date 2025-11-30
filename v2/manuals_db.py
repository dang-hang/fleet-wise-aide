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
            "Manuals": """
                manual_id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER,
                make TEXT,
                model TEXT,
                uplifted INTEGER,
                active INTEGER
            """,
            "Sections": """
                manual_id INTEGER,
                section_name TEXT,
                first_page INTEGER,
                length INTEGER,
                h_level INTEGER
            """,
            "Images": """
                manual_id INTEGER,
                page INTEGER,
                x INTEGER,
                y INTEGER,
                w INTEGER,
                h INTEGER
            """
        }

        commands = {
            self.Commands.AddManual: "INSERT INTO Manuals (year, make, model, uplifted, active) VALUES (?, ?, ?, ?, ?)",
            self.Commands.RemoveManual: "UPDATE Manuals SET active = 0 WHERE manual_id = ?",
            self.Commands.AddSection: "INSERT INTO Sections VALUES (?, ?, ?, ?, ?)",
            self.Commands.AddImage: "INSERT INTO Images VALUES (?, ?, ?, ?, ?, ?)",
            self.Commands.GetSections: """
                SELECT 
                    Manuals.manual_id,
                    Sections.section_name, 
                    Sections.first_page, 
                    Sections.length
                FROM
                    Sections
                INNER JOIN
                    Manuals ON Sections.manual_id = Manuals.manual_id
                WHERE
                    Manuals.make = ? AND
                    Manuals.model = ? AND
                    Manuals.year = ? AND
                    Manuals.active = 1
            """,
            self.Commands.GetImage: "SELECT * FROM Images WHERE manual_id = ? AND page >= ? AND page <= ?"
        }

        super().__init__(name, tables, commands)