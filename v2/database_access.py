import sqlite3
import os
from dataclasses import dataclass

class DataBase:
    def __init__(self, name, tables: dict[str, str], commands: dict[str, str]):
        # Check for the path of the database
        if "/" in name:
            raise Exception("Database not allowed to be in a different folder")
        
        # Create database if missing
        if name not in os.listdir(os.curdir):
            self.conn: sqlite3.Connection = sqlite3.connect(name)
            self.cursor = self.conn.cursor()

            for table in tables.keys():
                self.cursor.execute(f"CREATE TABLE IF NOT EXISTS {table} ({tables[table]});")
            
            self.conn.commit()

            # Verify creation
            if name not in os.listdir(os.curdir):
                raise Exception("Database does not exist after creation")
        else:
            self.conn: sqlite3.Connection = sqlite3.connect(name)
            self.cursor = self.conn.cursor()

        # Store command dictionary
        self.commands = commands
        

    def get_tables(self) -> list[str]:
        self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        return [x[0] for x in self.cursor.fetchall()]

    def query(self, command: str, *args):
        if command not in self.commands:
            raise Exception(f"Invalid query command: {command}")
        self.cursor.execute(self.commands[command], args)
        return self.cursor.fetchall()
    
    def commit(self, command: str | None = None, *args) -> None:
        if command:
            if command not in self.commands:
                raise Exception(f"Invalid command: {command}")
            try:
                self.cursor.execute(self.commands[command], args)
            except Exception as e:
                raise Exception(f"Incapable of completing command '{command}', due to {e}")
        self.conn.commit()
    
    def __del__(self):
        try:
            self.conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    ...