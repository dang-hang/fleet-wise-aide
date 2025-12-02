import sqlite3
import os
import psycopg2
from dataclasses import dataclass

class DataBase:
    def __init__(self, name, tables: dict[str, str], commands: dict[str, str]):
        self.commands = commands
        self.db_url = os.getenv('DATABASE_URL')
        self.is_postgres = bool(self.db_url)

        if self.is_postgres:
            try:
                self.conn = psycopg2.connect(self.db_url)
                self.cursor = self.conn.cursor()
            except Exception as e:
                print(f"Failed to connect to Postgres: {e}")
                raise e
        else:
            # Check for the path of the database
            if "/" in name:
                raise Exception("Database not allowed to be in a different folder")
            
            self.conn: sqlite3.Connection = sqlite3.connect(name, check_same_thread=False)
            self.cursor = self.conn.cursor()

            for table in tables.keys():
                self.cursor.execute(f"CREATE TABLE IF NOT EXISTS {table} ({tables[table]});")
            
            self.conn.commit()

    def _prepare_query(self, query: str) -> str:
        if self.is_postgres:
            return query.replace('?', '%s')
        return query

    def get_tables(self) -> list[str]:
        if self.is_postgres:
            self.cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
        else:
            self.cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        return [x[0] for x in self.cursor.fetchall()]

    def query(self, command: str, *args):
        if command not in self.commands:
            raise Exception(f"Invalid query command: {command}")
        
        sql = self._prepare_query(self.commands[command])
        self.cursor.execute(sql, args)
        return self.cursor.fetchall()
    
    def commit(self, command: str | None = None, *args) -> None:
        if command:
            if command not in self.commands:
                raise Exception(f"Invalid command: {command}")
            try:
                sql = self._prepare_query(self.commands[command])
                self.cursor.execute(sql, args)
            except Exception as e:
                self.conn.rollback()
                raise Exception(f"Incapable of completing command '{command}', due to {e}")
        self.conn.commit()

    def execute_returning(self, command: str, *args):
        if command not in self.commands:
            raise Exception(f"Invalid command: {command}")
        
        sql = self._prepare_query(self.commands[command])
        try:
            self.cursor.execute(sql, args)
            result = self.cursor.fetchone()[0]
            self.conn.commit()
            return result
        except Exception as e:
            self.conn.rollback()
            raise Exception(f"Command failed: {e}")
    
    def __del__(self):
        try:
            self.conn.close()
        except Exception:
            pass


if __name__ == "__main__":
    ...